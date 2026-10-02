/**
 * POST às rotas /api/auth/* a partir do navegador (mesma origem: o cookie
 * HttpOnly vai e volta sozinho; o JavaScript nunca o lê).
 */

export type ResultadoAuth = { ok: true } | { ok: false; erro: string; motivo: string | null };

const ERRO_CONEXAO = "Não foi possível falar com a Sala agora. Confira a conexão e tente de novo.";

export async function enviarAuth(caminho: "/api/auth/login" | "/api/auth/logout", corpo?: unknown): Promise<ResultadoAuth> {
  let resposta: Response;
  try {
    resposta = await fetch(caminho, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(corpo ?? {}),
    });
  } catch {
    return { ok: false, erro: ERRO_CONEXAO, motivo: null };
  }
  let dados: { ok?: unknown; erro?: unknown; motivo?: unknown } = {};
  try {
    dados = (await resposta.json()) as typeof dados;
  } catch {
    // Corpo vazio ou HTML de erro do proxy: cai na mensagem genérica.
  }
  if (resposta.ok && dados.ok === true) return { ok: true };
  return {
    ok: false,
    erro: typeof dados.erro === "string" && dados.erro ? dados.erro : `Não foi possível concluir agora (HTTP ${resposta.status}).`,
    motivo: typeof dados.motivo === "string" ? dados.motivo : null,
  };
}
