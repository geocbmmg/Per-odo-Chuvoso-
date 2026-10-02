import "server-only";
import { NextResponse } from "next/server";

import { origemPermitida } from "@/lib/api/origem";

import { atributosCookieSessao, cookieSeguro, NOME_COOKIE_SAIU_DEMONSTRACAO, nomeCookieSessao } from "./cookie";
import { ErroAutenticacao } from "./erros";
import { assinarSessao, segundosAteExpirar } from "./token";
import { sessaoPublica, type Sessao } from "./tipos";

/**
 * Peças HTTP de /api/auth/* (fora dos route.ts, que só podem exportar os
 * métodos e a configuração da rota). Toda resposta é `no-store`: sessão é
 * dado por usuário e nunca pode ficar em CDN.
 */

export const CABECALHOS_SEM_CACHE = { "Cache-Control": "no-store" } as const;

/** Corpo máximo do POST de login (CPF + senha cabem com folga). */
const MAXIMO_CORPO_BYTES = 4 * 1024;

/** CSRF: só a própria Sala (mesma regra de /api/alertas). */
export function exigirMesmaOrigem(request: Request): void {
  if (!origemPermitida(request)) {
    throw new ErroAutenticacao(403, "origem", "Origem da requisição não permitida.");
  }
}

/**
 * IP do cliente para o limite de tentativas. Na Vercel, `x-vercel-forwarded-for`
 * e `x-real-ip` são escritos pela borda (o cliente não os forja); o primeiro
 * item do `x-forwarded-for` fica como reserva para outros proxies.
 */
export function ipDaRequisicao(request: Request): string {
  const h = request.headers;
  const candidato =
    h.get("x-vercel-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "";
  const ip = candidato.trim().slice(0, 64);
  return ip || "desconhecido";
}

/** Corpo JSON (objeto) do pedido, com teto de tamanho. */
export async function lerCorpoJson(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    throw new ErroAutenticacao(400, "formato", "Envie o pedido como JSON (Content-Type: application/json).");
  }
  const texto = await request.text();
  if (new TextEncoder().encode(texto).length > MAXIMO_CORPO_BYTES) {
    throw new ErroAutenticacao(400, "formato", "Pedido grande demais.");
  }
  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    throw new ErroAutenticacao(400, "formato", "JSON inválido.");
  }
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw new ErroAutenticacao(400, "formato", "O pedido deve ser um objeto JSON.");
  }
  return corpo as Record<string, unknown>;
}

/**
 * `{ok: true, sessao}` com o cookie assinado. Apaga a marca de "saiu" do modo
 * demonstração. O corpo leva a SessaoPublica (sem sid, sem CPF).
 */
export function respostaComSessao(sessao: Sessao, segredo: string, agoraMs: number = Date.now()): NextResponse {
  const token = assinarSessao(sessao, segredo, agoraMs);
  const resposta = NextResponse.json({ ok: true, sessao: sessaoPublica(sessao) }, { headers: CABECALHOS_SEM_CACHE });
  resposta.cookies.set(nomeCookieSessao(), token, atributosCookieSessao(segundosAteExpirar(sessao, agoraMs)));
  resposta.cookies.set(NOME_COOKIE_SAIU_DEMONSTRACAO, "", { ...atributosCookieSessao(0), maxAge: 0 });
  return resposta;
}

/** Apaga o cookie de sessão (mesmo nome, Path e Secure, para o navegador aceitar). */
export function apagarCookieSessao(resposta: NextResponse, opcoes: { marcarSaidaDemonstracao: boolean }): void {
  resposta.cookies.set(nomeCookieSessao(), "", atributosCookieSessao(0));
  if (opcoes.marcarSaidaDemonstracao) {
    // Sem Max-Age: dura até o navegador fechar.
    resposta.cookies.set(NOME_COOKIE_SAIU_DEMONSTRACAO, "1", {
      httpOnly: true,
      secure: cookieSeguro(),
      sameSite: "lax",
      path: "/",
    });
  }
}

/** `{ok: false, erro, motivo}` com o status; erro inesperado vira 500 sem detalhe interno. */
export function respostaDeErroAuth(erro: unknown): Response {
  if (erro instanceof ErroAutenticacao) {
    const cabecalhos: Record<string, string> = { ...CABECALHOS_SEM_CACHE };
    if (erro.status === 429 && erro.tentarEmS) cabecalhos["Retry-After"] = String(erro.tentarEmS);
    if (erro.status === 503) cabecalhos["Retry-After"] = "300";
    return Response.json({ ok: false, erro: erro.message, motivo: erro.motivo }, { status: erro.status, headers: cabecalhos });
  }
  // Só o nome do erro: a mensagem poderia trazer dado do pedido.
  console.error("[api/auth] erro inesperado", erro instanceof Error ? erro.name : typeof erro);
  return Response.json(
    { ok: false, erro: "Erro interno ao processar o pedido.", motivo: "interno" },
    { status: 500, headers: CABECALHOS_SEM_CACHE },
  );
}
