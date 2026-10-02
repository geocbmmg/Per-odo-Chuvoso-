import { formatarDataHora } from "@/lib/datas";
import type { CamadaMapaId, SituacaoOcorrencia } from "@/lib/dominio/tipos";
import { normalizarNumeroChamada } from "@/lib/sources/arcgis/campos";
import { corDoCob } from "./cores-cob";
import {
  COR_ACAO_RRD,
  COR_ALERTA,
  COR_OCORRENCIA,
  COR_OCORRENCIA_FINALIZADA,
  ROTULOS_SINGULAR,
  type FormaSimbolo,
} from "./simbologia";
import type { TemaMapa } from "./tema";

/**
 * Conteúdo dos balões (popups) como DADO — o componente monta o DOM com
 * createElement/textContent. Nenhum texto vindo das fontes vira HTML.
 */

export type TomSelo = "ok" | "alerta" | "perigo" | "neutro";

export interface CampoPopup {
  rotulo: string;
  valor: string;
}

export interface ConteudoPopup {
  /** Tipo do registro ("Alerta", "Ação RRD"…), exibido em caixa alta. */
  tipo: string;
  titulo: string;
  /** Cor do símbolo/borda do balão (cor de dado, não de tema). */
  cor: string;
  forma: FormaSimbolo | "area";
  campos: CampoPopup[];
  /** Situação destacada com palavra + cor (dois sinais). */
  selo?: { texto: string; tom: TomSelo };
  /** Observação curta no rodapé. */
  nota?: string;
}

const VAZIO = "Não informado";

function texto(valor: unknown): string | null {
  if (typeof valor === "string") {
    const t = valor.trim();
    return t ? t : null;
  }
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  return null;
}

function campo(rotulo: string, valor: unknown): CampoPopup {
  return { rotulo, valor: texto(valor) ?? VAZIO };
}

function campoData(rotulo: string, valor: unknown): CampoPopup {
  const t = texto(valor);
  return { rotulo, valor: t ? formatarDataHora(t) : VAZIO };
}

const formatoCota = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

function campoCota(valor: unknown): CampoPopup {
  return {
    rotulo: "Cota",
    valor: typeof valor === "number" && Number.isFinite(valor) ? `${formatoCota.format(valor)} m` : VAZIO,
  };
}

function juntar(...partes: Array<string | null>): string | null {
  const validas = partes.filter((p): p is string => Boolean(p));
  return validas.length ? validas.join(" — ") : null;
}

export const ROTULOS_SITUACAO: Record<SituacaoOcorrencia, string> = {
  "em-andamento": "Em andamento",
  monitoramento: "Em monitoramento",
  finalizada: "Finalizada",
  desconhecida: "Situação não informada",
};

const TOM_SITUACAO: Record<SituacaoOcorrencia, TomSelo> = {
  "em-andamento": "perigo",
  monitoramento: "alerta",
  finalizada: "neutro",
  desconhecida: "neutro",
};

export interface ContextoPopup {
  /** Nº de chamada CAD (só dígitos) com ao menos uma ação RRD; null = ações não carregadas. */
  chamadasComAcao?: ReadonlySet<string> | null;
}

/** Conjunto de nº de chamada (normalizados) que têm ação RRD. */
export function chamadasComAcaoRrd(acoes: readonly Record<string, unknown>[]): Set<string> {
  const conjunto = new Set<string>();
  for (const a of acoes) {
    const n = normalizarNumeroChamada(a.numeroChamada);
    if (n) conjunto.add(n);
  }
  return conjunto;
}

export function conteudoAlerta(props: Record<string, unknown>, contexto: ContextoPopup = {}): ConteudoPopup {
  const conteudo: ConteudoPopup = {
    tipo: ROTULOS_SINGULAR.alertas,
    titulo: juntar(texto(props.tipoRisco), texto(props.municipio)) ?? "Alerta",
    cor: COR_ALERTA,
    forma: "circulo",
    campos: [
      campo("Nº chamada CAD", props.numeroChamada),
      campo("COB", props.cob),
      campo("UEOp", props.ueop),
      campo("Município", props.municipio),
      campo("Tipo de risco", props.tipoRisco),
      campo("Nível", props.nivel),
      campoCota(props.cota),
      campoData("Emitido em", props.emitidoEm),
    ],
  };
  if (contexto.chamadasComAcao) {
    const numero = normalizarNumeroChamada(props.numeroChamada);
    if (!numero) {
      conteudo.selo = { texto: "Pendente — sem nº de chamada para vincular", tom: "alerta" };
    } else if (contexto.chamadasComAcao.has(numero)) {
      conteudo.selo = { texto: "Com ação RRD vinculada", tom: "ok" };
    } else {
      conteudo.selo = { texto: "Pendente — sem ação RRD", tom: "alerta" };
    }
  }
  return conteudo;
}

export function conteudoAcaoRrd(props: Record<string, unknown>): ConteudoPopup {
  return {
    tipo: ROTULOS_SINGULAR["acoes-rrd"],
    titulo: juntar(texto(props.municipio), texto(props.ueop)) ?? "Ação RRD",
    cor: COR_ACAO_RRD,
    forma: "circulo-pequeno",
    campos: [
      campo("Nº chamada CAD", props.numeroChamada),
      campo("COB", props.cob),
      campo("UEOp", props.ueop),
      campo("Município", props.municipio),
      campo("Ação executada", props.descricao),
      campoData("Executada em", props.executadaEm),
    ],
  };
}

function situacaoDe(valor: unknown): SituacaoOcorrencia {
  return valor === "em-andamento" || valor === "monitoramento" || valor === "finalizada" ? valor : "desconhecida";
}

export function conteudoOcorrencia(props: Record<string, unknown>): ConteudoPopup {
  const situacao = situacaoDe(props.situacao);
  const finalizada = situacao === "finalizada";
  return {
    tipo: ROTULOS_SINGULAR["ocorrencias-complexas"],
    titulo: texto(props.titulo) ?? juntar("Ocorrência complexa", texto(props.municipio)) ?? "Ocorrência complexa",
    cor: finalizada ? COR_OCORRENCIA_FINALIZADA : COR_OCORRENCIA,
    forma: finalizada ? "alvo-apagado" : "alvo",
    campos: [
      campo("Nº chamada CAD", props.numeroChamada),
      campo("COB", props.cob),
      campo("UEOp", props.ueop),
      campo("Município", props.municipio),
      campoData("Iniciada em", props.iniciadaEm),
    ],
    selo: { texto: ROTULOS_SITUACAO[situacao], tom: TOM_SITUACAO[situacao] },
  };
}

export interface ContagemCob {
  alertas: number | null;
  acoesRrd: number | null;
  ocorrencias: number | null;
}

const formatoInteiro = new Intl.NumberFormat("pt-BR");

function contagem(valor: number | null): string {
  return valor === null ? "Camada indisponível" : formatoInteiro.format(valor);
}

export function conteudoCob(cob: string, tema: TemaMapa, numeros: ContagemCob, rotuloPeriodo?: string): ConteudoPopup {
  return {
    tipo: ROTULOS_SINGULAR.cobs,
    titulo: cob,
    cor: corDoCob(cob, tema, "contorno"),
    forma: "area",
    campos: [
      { rotulo: "Alertas", valor: contagem(numeros.alertas) },
      { rotulo: "Ações RRD", valor: contagem(numeros.acoesRrd) },
      { rotulo: "Ocorrências complexas", valor: contagem(numeros.ocorrencias) },
    ],
    nota: rotuloPeriodo ? `Registros com localização no mapa · ${rotuloPeriodo}` : "Registros com localização no mapa",
  };
}

/** Balão de um ponto de qualquer camada pontual. */
export function conteudoDoPonto(
  camada: Exclude<CamadaMapaId, "cobs">,
  props: Record<string, unknown>,
  contexto: ContextoPopup = {},
): ConteudoPopup {
  switch (camada) {
    case "alertas":
      return conteudoAlerta(props, contexto);
    case "acoes-rrd":
      return conteudoAcaoRrd(props);
    case "ocorrencias-complexas":
      return conteudoOcorrencia(props);
  }
}
