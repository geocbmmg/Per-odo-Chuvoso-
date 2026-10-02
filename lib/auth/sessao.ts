import "server-only";
import { modoExemplo } from "@/lib/env";
import type { Sessao } from "./tipos";

/**
 * Sessão da requisição atual (Route Handlers e Server Components).
 *
 * CONTRATO: `obterSessao()` devolve a sessão válida ou null. A implementação
 * definitiva (cookie `__Host-sala_sessao` assinado, login federado no
 * GeoRescue) substitui o corpo desta função mantendo a assinatura.
 *
 * Provisório: no modo demonstração devolve um operador da Sala fictício; fora
 * dele, null (ninguém escreve sem login).
 */
export async function obterSessao(): Promise<Sessao | null> {
  if (!modoExemplo()) return null;
  return {
    sid: "demonstracao",
    usuarioId: "0".repeat(32),
    nome: "Operador de demonstração",
    posto: null,
    bm: null,
    papel: "operador-sala",
    papelGeoRescue: "operacional",
    cobs: [],
    escopoGlobal: true,
    grupos: ["SALA"],
    unidade: "Sala de Situação",
    expiraEm: new Date(Date.now() + 8 * 3600_000).toISOString(),
    demonstracao: true,
  };
}
