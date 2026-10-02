import { ErroAlertas } from "./erros";

/**
 * Peças HTTP de /api/alertas (fora do route.ts, que só pode exportar os
 * métodos e a configuração da rota).
 */

/** Dado recortado por usuário nunca fica em cache (CDN ou navegador). */
export const CABECALHOS_SEM_CACHE = { "Cache-Control": "no-store" } as const;

/** Tamanho máximo do corpo do POST (o maior alerta cabe com folga). */
export const MAXIMO_CORPO_BYTES = 64 * 1024;

export { origemPermitida } from "@/lib/api/origem";

/** `{ok: false, erro, motivo}` com o status do contrato; erro inesperado vira 500 sem detalhe interno. */
export function respostaDeErro(erro: unknown): Response {
  if (erro instanceof ErroAlertas) {
    const corpo: Record<string, unknown> = { ok: false, erro: erro.message, motivo: erro.motivo };
    if (erro.campos?.length) corpo.campos = erro.campos;
    if (erro.alteradoEmAtual) corpo.alteradoEmAtual = erro.alteradoEmAtual;
    return Response.json(corpo, { status: erro.status, headers: CABECALHOS_SEM_CACHE });
  }
  console.error("[api/alertas] erro inesperado", erro instanceof Error ? erro.message : erro);
  return Response.json(
    { ok: false, erro: "Erro interno ao processar o pedido.", motivo: "interno" },
    { status: 500, headers: CABECALHOS_SEM_CACHE },
  );
}
