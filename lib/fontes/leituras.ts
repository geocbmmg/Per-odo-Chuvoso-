import { CATALOGO_FONTES } from "./catalogo";
import {
  FonteIndisponivelError,
  type EstadoFonte,
  type FonteId,
  type Leitura,
  type StatusFonte,
} from "./tipos";

/**
 * Cache de leituras com fallback para a última leitura válida.
 *
 * Fluxo de `obterLeitura`:
 *   1. modo exemplo → devolve os dados de exemplo (origem "exemplo");
 *   2. leitura guardada com idade < ttl → devolve do armazém (origem "cache");
 *   3. consulta a fonte (requisições simultâneas para a mesma chave são unificadas);
 *      sucesso → grava e devolve (origem "ao-vivo");
 *   4. falha → devolve a última leitura válida (origem "ultima-valida") ou,
 *      se não houver, lança FonteIndisponivelError.
 *
 * Nesta fase o armazém é a memória da instância. A interface `ArmazemLeituras`
 * permite trocar por Postgres (Fase 1) sem mudar quem consome.
 */

export interface LeituraGuardada {
  dados: unknown;
  atualizadoEm: string;
}

export interface ArmazemLeituras {
  ler(chave: string): LeituraGuardada | undefined;
  gravar(chave: string, leitura: LeituraGuardada): void;
}

interface RegistroFonte {
  ultimaTentativaEm: string | null;
  ultimoSucessoEm: string | null;
  ultimoErro: string | null;
  latenciaMs: number | null;
  /** Leitura válida mais recente entre todas as chaves desta fonte. */
  atualizadoEm: string | null;
}

interface EstadoGlobal {
  armazem: ArmazemLeituras;
  registros: Map<FonteId, RegistroFonte>;
  emAndamento: Map<string, Promise<LeituraGuardada>>;
  /** Última falha por chave: evita esperar o timeout da fonte a cada requisição. */
  falhas: Map<string, { em: number; erro: string }>;
}

/** Armazém em memória (por instância serverless). */
export function criarArmazemMemoria(): ArmazemLeituras {
  const mapa = new Map<string, LeituraGuardada>();
  return {
    ler: (chave) => mapa.get(chave),
    gravar: (chave, leitura) => {
      mapa.set(chave, leitura);
    },
  };
}

// Guardado em globalThis para sobreviver ao hot reload e ser único por processo.
const CHAVE_GLOBAL = Symbol.for("sala-situacao.leituras");
type GlobalComEstado = typeof globalThis & { [CHAVE_GLOBAL]?: EstadoGlobal };

function estadoGlobal(): EstadoGlobal {
  const g = globalThis as GlobalComEstado;
  g[CHAVE_GLOBAL] ??= {
    armazem: criarArmazemMemoria(),
    registros: new Map(),
    emAndamento: new Map(),
    falhas: new Map(),
  };
  return g[CHAVE_GLOBAL];
}

/** Troca o armazém (testes ou, futuramente, Postgres). */
export function definirArmazem(armazem: ArmazemLeituras): void {
  estadoGlobal().armazem = armazem;
}

/** Zera armazém, registros e requisições em andamento (uso em testes). */
export function reiniciarLeituras(): void {
  const estado = estadoGlobal();
  estado.armazem = criarArmazemMemoria();
  estado.registros.clear();
  estado.emAndamento.clear();
  estado.falhas.clear();
}

function registro(fonte: FonteId): RegistroFonte {
  const { registros } = estadoGlobal();
  let r = registros.get(fonte);
  if (!r) {
    r = {
      ultimaTentativaEm: null,
      ultimoSucessoEm: null,
      ultimoErro: null,
      latenciaMs: null,
      atualizadoEm: null,
    };
    registros.set(fonte, r);
  }
  return r;
}

function mensagemDeErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  return String(erro);
}

export interface OpcoesLeitura<T> {
  /** Sobrescreve o ttl do catálogo. */
  ttlSegundos?: number;
  /**
   * Após uma falha, por quanto tempo não consultar a fonte de novo (responde
   * direto com a última leitura válida). Padrão: min(ttl, 60 s).
   */
  esperaAposFalhaSegundos?: number;
  /** Dados devolvidos quando DADOS_EXEMPLO=1. */
  exemplo?: () => T;
  /** Indica se o modo exemplo está ativo (injetado para manter este módulo sem dependência de env). */
  modoExemplo?: boolean;
  /** Relógio injetável (testes). */
  agora?: () => Date;
}

export async function obterLeitura<T>(
  fonte: FonteId,
  chave: string,
  carregar: () => Promise<T>,
  opcoes: OpcoesLeitura<T> = {},
): Promise<Leitura<T>> {
  const agora = opcoes.agora ?? (() => new Date());
  const definicao = CATALOGO_FONTES[fonte];
  const ttlMs = (opcoes.ttlSegundos ?? definicao.ttlSegundos) * 1000;
  const chaveCompleta = `${fonte}:${chave}`;
  const estado = estadoGlobal();

  if (opcoes.modoExemplo && opcoes.exemplo) {
    const instante = agora().toISOString();
    // Registra a "leitura" para /status mostrar o carimbo também no modo exemplo.
    const r = registro(fonte);
    r.ultimaTentativaEm = instante;
    r.ultimoSucessoEm = instante;
    r.atualizadoEm = instante;
    r.ultimoErro = null;
    r.latenciaMs = 0;
    return { fonte, dados: opcoes.exemplo(), atualizadoEm: instante, origem: "exemplo" };
  }

  const guardada = estado.armazem.ler(chaveCompleta);
  if (guardada && agora().getTime() - new Date(guardada.atualizadoEm).getTime() < ttlMs) {
    return { fonte, dados: guardada.dados as T, atualizadoEm: guardada.atualizadoEm, origem: "cache" };
  }

  const esperaMs =
    (opcoes.esperaAposFalhaSegundos ?? Math.min(ttlMs / 1000, 60)) * 1000;
  const falha = estado.falhas.get(chaveCompleta);
  if (falha && agora().getTime() - falha.em < esperaMs) {
    if (guardada) {
      return {
        fonte,
        dados: guardada.dados as T,
        atualizadoEm: guardada.atualizadoEm,
        origem: "ultima-valida",
        erro: falha.erro,
      };
    }
    throw new FonteIndisponivelError(fonte, falha.erro);
  }

  let promessa = estado.emAndamento.get(chaveCompleta);
  const iniciouAgora = !promessa;
  if (!promessa) {
    promessa = executarCarga(fonte, chaveCompleta, carregar, agora);
    estado.emAndamento.set(chaveCompleta, promessa);
  }

  try {
    const nova = await promessa;
    estado.falhas.delete(chaveCompleta);
    return { fonte, dados: nova.dados as T, atualizadoEm: nova.atualizadoEm, origem: "ao-vivo" };
  } catch (erro) {
    estado.falhas.set(chaveCompleta, { em: agora().getTime(), erro: mensagemDeErro(erro) });
    const ultima = estado.armazem.ler(chaveCompleta);
    if (ultima) {
      return {
        fonte,
        dados: ultima.dados as T,
        atualizadoEm: ultima.atualizadoEm,
        origem: "ultima-valida",
        erro: mensagemDeErro(erro),
      };
    }
    throw new FonteIndisponivelError(fonte, mensagemDeErro(erro));
  } finally {
    if (iniciouAgora) estado.emAndamento.delete(chaveCompleta);
  }
}

async function executarCarga<T>(
  fonte: FonteId,
  chaveCompleta: string,
  carregar: () => Promise<T>,
  agora: () => Date,
): Promise<LeituraGuardada> {
  const r = registro(fonte);
  const inicio = agora();
  r.ultimaTentativaEm = inicio.toISOString();
  try {
    const dados = await carregar();
    const fim = agora();
    const leitura: LeituraGuardada = { dados, atualizadoEm: fim.toISOString() };
    estadoGlobal().armazem.gravar(chaveCompleta, leitura);
    r.ultimoSucessoEm = leitura.atualizadoEm;
    r.atualizadoEm = leitura.atualizadoEm;
    r.ultimoErro = null;
    r.latenciaMs = fim.getTime() - inicio.getTime();
    return leitura;
  } catch (erro) {
    r.ultimoErro = mensagemDeErro(erro);
    r.latenciaMs = agora().getTime() - inicio.getTime();
    throw erro;
  }
}

/**
 * Classifica o estado de uma fonte a partir do registro desta instância.
 * Regras (documentadas no README):
 *   - stub → "nao-implementada"; modo exemplo → "exemplo";
 *   - sem tentativa → "desconhecida";
 *   - sem leitura válida, ou leitura mais velha que limiteForaDoAr → "fora-do-ar";
 *   - última tentativa falhou, ou leitura mais velha que a tolerância → "atrasada";
 *   - caso contrário → "ok".
 */
export function statusDaFonte(
  fonte: FonteId,
  opcoes: { modoExemplo?: boolean; agora?: Date } = {},
): StatusFonte {
  const definicao = CATALOGO_FONTES[fonte];
  const r = estadoGlobal().registros.get(fonte);
  const agora = opcoes.agora ?? new Date();

  const base = {
    definicao,
    atualizadoEm: r?.atualizadoEm ?? null,
    ultimaTentativaEm: r?.ultimaTentativaEm ?? null,
    ultimoSucessoEm: r?.ultimoSucessoEm ?? null,
    ultimoErro: r?.ultimoErro ?? null,
    latenciaMs: r?.latenciaMs ?? null,
  };

  let estadoFonte: EstadoFonte;
  if (!definicao.implementada) {
    estadoFonte = "nao-implementada";
  } else if (opcoes.modoExemplo) {
    estadoFonte = "exemplo";
  } else if (!r || !r.ultimaTentativaEm) {
    estadoFonte = "desconhecida";
  } else if (!r.atualizadoEm) {
    estadoFonte = "fora-do-ar";
  } else {
    const idadeSeg = (agora.getTime() - new Date(r.atualizadoEm).getTime()) / 1000;
    if (idadeSeg > definicao.limiteForaDoArSegundos) estadoFonte = "fora-do-ar";
    else if (r.ultimoErro || idadeSeg > definicao.toleranciaSegundos) estadoFonte = "atrasada";
    else estadoFonte = "ok";
  }

  return { ...base, estado: estadoFonte };
}
