import "server-only";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";

import { configAuth } from "./config";
import { lerCookieDoCabecalho, NOME_COOKIE_SAIU_DEMONSTRACAO, nomeCookieSessao } from "./cookie";
import { sessaoDemonstracao } from "./demonstracao";
import { verificarSessao } from "./token";
import type { Sessao } from "./tipos";

/**
 * Sessão da requisição atual (Route Handlers e Server Components).
 *
 * CONTRATO: `obterSessao()` devolve a sessão válida ou null. Lê o cookie
 * `__Host-sala_sessao` (em desenvolvimento, `sala_sessao` — lib/auth/cookie.ts),
 * confere a assinatura e a validade (lib/auth/token.ts) e devolve a Sessao.
 * Cookie ausente, adulterado, vencido ou sem SALA_SESSION_SECRET → null.
 *
 * Modo demonstração (DADOS_EXEMPLO=1): vale a sessão do perfil escolhido em
 * /entrar; SEM cookie, devolve o "Operador de demonstração" (sid
 * "demonstracao"), como a implementação provisória, para a fila e as telas já
 * existentes continuarem funcionando sem login. Depois de "Sair", a marca
 * `sala_demo_saiu` faz o visitante ser tratado como não logado.
 */

export type OrigemSessao = "cookie" | "demonstracao-implicita";

export interface SessaoComOrigem {
  sessao: Sessao;
  origem: OrigemSessao;
}

/** sid da sessão implícita do modo demonstração (sem cookie). */
export const SID_DEMONSTRACAO_IMPLICITA = "demonstracao";

/**
 * Decide a sessão a partir de uma função que lê cookies pelo nome. Usada com
 * o `cookies()` do Next e com o cabeçalho `Cookie` de um Request.
 */
export function sessaoDosCookies(
  lerCookie: (nome: string) => string | undefined,
  agoraMs: number = Date.now(),
): SessaoComOrigem | null {
  const config = configAuth();
  const demonstracao = config.modo === "demonstracao";
  const token = lerCookie(nomeCookieSessao());
  if (token) {
    const sessao = verificarSessao(token, config.segredoSessao, { agoraMs, demonstracao });
    if (sessao) return { sessao, origem: "cookie" };
  }
  if (config.modo !== "demonstracao") return null;
  if (lerCookie(NOME_COOKIE_SAIU_DEMONSTRACAO)) return null;
  return {
    sessao: sessaoDemonstracao("operador-sala", {
      sid: SID_DEMONSTRACAO_IMPLICITA,
      chavePseudonimo: config.chavePseudonimo,
      grupoOperador: config.grupoOperador,
      agoraMs,
    }),
    origem: "demonstracao-implicita",
  };
}

/** Sessão a partir do cabeçalho `Cookie` de um Request (rotas e testes). */
export function obterSessaoDaRequisicao(request: Request): SessaoComOrigem | null {
  const cabecalho = request.headers.get("cookie");
  return sessaoDosCookies((nome) => lerCookieDoCabecalho(cabecalho, nome));
}

/**
 * Lê os cookies da requisição pelo `cookies()` do Next. Fora de uma requisição
 * (testes, scripts) não há cookie: trata como ausente. Os erros de controle do
 * Next (pré-renderização, redirect) são relançados.
 */
async function lerCookiesDaRequisicao(): Promise<((nome: string) => string | undefined) | null> {
  try {
    const loja = await cookies();
    return (nome) => loja.get(nome)?.value;
  } catch (erro) {
    unstable_rethrow(erro);
    if (erro instanceof Error && erro.message.includes("outside a request scope")) return null;
    throw erro;
  }
}

/** Sessão e de onde ela veio (o chip do cabeçalho distingue a demonstração implícita). */
export async function obterSessaoComOrigem(): Promise<SessaoComOrigem | null> {
  const ler = await lerCookiesDaRequisicao();
  return sessaoDosCookies(ler ?? (() => undefined));
}

export async function obterSessao(): Promise<Sessao | null> {
  return (await obterSessaoComOrigem())?.sessao ?? null;
}
