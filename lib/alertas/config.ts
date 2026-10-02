import "server-only";
import { obterBanco } from "@/lib/db/cliente";
import type { Alerta } from "@/lib/dominio/tipos";
import { env, modoExemplo } from "@/lib/env";
import { FonteIndisponivelError, type Leitura } from "@/lib/fontes/tipos";
import { criarRepositorioArcgis } from "./arcgis";
import { SEGREDO_PSEUDONIMO_DEMONSTRACAO } from "./autoria";
import { SITUACOES_PENDENTES } from "./dominio";
import { ErroAlertas } from "./erros";
import { conteudoExemplo } from "./exemplos";
import { alertasDaSalaParaMapa } from "./mapa-risco";
import { criarRepositorioMemoria, type RepositorioMemoria } from "./memoria";
import { criarRepositorioPostgres } from "./postgres";
import type { RepositorioAlertas } from "./repositorio";

/**
 * Qual armazém a fila usa (ALERTAS_ARMAZEM) e o segredo da autoria
 * (SALA_PSEUDO_SEGREDO). Só servidor.
 *
 * - DADOS_EXEMPLO=1: SEMPRE memória semeada com os exemplos (a sessão também é
 *   de demonstração; nada vai para o banco).
 * - memoria: só fora de produção (desenvolvimento e testes). Em produção
 *   perderia alertas num cold start, então é recusado (503).
 * - postgres: tabelas sala_* (lib/db/schema.ts), no mesmo formato da feição.
 * - arcgis: lê as camadas SalaSituacao_AlertasRRD; ESCRITA DESLIGADA nesta fase.
 */

interface EstadoAlertas {
  exemplo: RepositorioMemoria | null;
  memoria: RepositorioMemoria | null;
}

const CHAVE_GLOBAL = Symbol.for("sala-situacao.alertas");
type GlobalComAlertas = typeof globalThis & { [CHAVE_GLOBAL]?: EstadoAlertas };

function estado(): EstadoAlertas {
  const g = globalThis as GlobalComAlertas;
  g[CHAVE_GLOBAL] ??= { exemplo: null, memoria: null };
  return g[CHAVE_GLOBAL];
}

export function obterRepositorioAlertas(agora: Date = new Date()): RepositorioAlertas {
  const e = estado();
  if (modoExemplo()) {
    // Semeado uma vez por instância, relativo ao primeiro acesso.
    e.exemplo ??= criarRepositorioMemoria(conteudoExemplo(agora));
    return e.exemplo;
  }
  const { ALERTAS_ARMAZEM, ARCGIS_SERVICES_URL, FONTES_TIMEOUT_MS } = env();
  switch (ALERTAS_ARMAZEM) {
    case "postgres": {
      const banco = obterBanco();
      if (!banco) {
        throw new ErroAlertas(503, "armazem_nao_configurado", "ALERTAS_ARMAZEM=postgres exige DATABASE_URL no servidor.");
      }
      return criarRepositorioPostgres(banco);
    }
    case "arcgis":
      return criarRepositorioArcgis({ baseServicos: ARCGIS_SERVICES_URL, timeoutMs: FONTES_TIMEOUT_MS });
    case "memoria":
      if (process.env.NODE_ENV === "production") {
        throw new ErroAlertas(
          503,
          "armazem_nao_configurado",
          "Armazenamento da fila de alertas não configurado: em produção use ALERTAS_ARMAZEM=postgres (a memória perde os alertas).",
        );
      }
      e.memoria ??= criarRepositorioMemoria();
      return e.memoria;
  }
}

/** Segredo do pseudônimo: o configurado; no modo exemplo, a chave fixa de demonstração; senão null. */
export function segredoPseudonimo(): string | null {
  return env().SALA_PSEUDO_SEGREDO ?? (modoExemplo() ? SEGREDO_PSEUDONIMO_DEMONSTRACAO : null);
}

/** A fila da Sala alimenta o mapa de risco? (exemplo, ou armazém persistente configurado) */
export function filaDaSalaNoMapa(): boolean {
  return modoExemplo() || env().ALERTAS_ARMAZEM !== "memoria";
}

/**
 * Alertas pendentes e reais da fila, no tipo `Alerta`, para a camada
 * "Alertas do CBMMG". A fila é dado do usuário: sem cache (lida a cada vez).
 * Usa a FonteId do formulário de emissão (o mesmo dado, outro canal) até a
 * Sala ganhar uma FonteId própria no catálogo.
 */
export async function alertasDaSalaParaRisco(agora: Date): Promise<Leitura<Alerta[]>> {
  try {
    const { alertas } = await obterRepositorioAlertas(agora).listar(
      { cobs: null, incluirRascunhos: false, situacoes: SITUACOES_PENDENTES },
      5000,
    );
    return {
      fonte: "arcgis-alertas",
      dados: alertasDaSalaParaMapa(alertas),
      atualizadoEm: agora.toISOString(),
      origem: modoExemplo() ? "exemplo" : "ao-vivo",
    };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    throw new FonteIndisponivelError("arcgis-alertas", `fila da Sala: ${motivo}`);
  }
}

/** Só para testes: descarta os armazéns em memória (o exemplo é semeado de novo). */
export function reiniciarAlertas(): void {
  const e = estado();
  e.exemplo = null;
  e.memoria = null;
}
