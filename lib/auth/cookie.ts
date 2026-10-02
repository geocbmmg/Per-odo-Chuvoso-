/**
 * Nome e atributos do cookie de sessão da Sala.
 *
 * Produção (NODE_ENV=production, HTTPS na Vercel): `__Host-sala_sessao`,
 * HttpOnly, Secure, SameSite=Lax, Path=/, sem Domain. O prefixo `__Host-` faz
 * o navegador recusar o cookie se faltar Secure, se vier Domain ou se o Path
 * não for "/": um subdomínio ou uma página http não conseguem plantá-lo.
 *
 * Desenvolvimento (`next dev` em http://localhost): `sala_sessao`, sem Secure e
 * sem o prefixo, porque o navegador não guarda cookie Secure/`__Host-` vindo de
 * http em todos os casos. Os dois nomes nunca se misturam: em produção o nome
 * sem prefixo é ignorado.
 *
 * O cookie leva só o token assinado (lib/auth/token.ts): nada de CPF ou senha.
 */

export const NOME_COOKIE_SESSAO_SEGURO = "__Host-sala_sessao";
export const NOME_COOKIE_SESSAO_DESENVOLVIMENTO = "sala_sessao";

/**
 * Marca do modo demonstração para "Sair" valer de verdade: sem cookie de
 * sessão, o modo demonstração entra como o Operador de demonstração; depois de
 * "Sair", esta marca faz a Sala tratar o visitante como não logado até ele
 * escolher um perfil. Não carrega dado nenhum ("1") e é ignorada fora do modo
 * demonstração.
 */
export const NOME_COOKIE_SAIU_DEMONSTRACAO = "sala_demo_saiu";

/** Cookie com Secure e prefixo `__Host-`? Sim em produção (sempre HTTPS na Vercel). */
export function cookieSeguro(ambiente: string | undefined = process.env.NODE_ENV): boolean {
  return ambiente === "production";
}

export function nomeCookieSessao(seguro: boolean = cookieSeguro()): string {
  return seguro ? NOME_COOKIE_SESSAO_SEGURO : NOME_COOKIE_SESSAO_DESENVOLVIMENTO;
}

export interface AtributosCookie {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

/** Atributos do cookie de sessão. `maxAgeS` = 0 apaga. */
export function atributosCookieSessao(maxAgeS: number, seguro: boolean = cookieSeguro()): AtributosCookie {
  return { httpOnly: true, secure: seguro, sameSite: "lax", path: "/", maxAge: Math.max(0, Math.floor(maxAgeS)) };
}

/** Valor de um cookie no cabeçalho `Cookie` da requisição (sem decodificar: o token é base64url). */
export function lerCookieDoCabecalho(cabecalho: string | null | undefined, nome: string): string | undefined {
  if (!cabecalho) return undefined;
  for (const parte of cabecalho.split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim();
  }
  return undefined;
}
