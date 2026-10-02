import "server-only";
import { z } from "zod";

import { ErroAutenticacao } from "./erros";

/**
 * Cliente do login do GeoRescue, de SERVIDOR para SERVIDOR (docs/fase-1.md §3.2).
 *
 * `POST <GEORESCUE_BASE_URL>/api/login` com `{usuario, senha}` — o formato do
 * `webapp/api/login.py` (origin/homolog): `usuario` é o CPF ou, para o
 * administrador de emergência, o nome de usuário. Resposta de sucesso:
 *
 *   {ok: true, usuario, nome, cpf (mascarado), bm, unidade, papel, dominios,
 *    escopo_global, troca_senha, token, expira_em_horas: 8}
 *
 * O administrador de emergência vem sem `cpf`, `bm` e `unidade`, com
 * `papel: "administrador"`. Recusas vêm como `{ok: false, erro}` com 401 (senha
 * errada, conta bloqueada/suspensa…), 500 (GeoRescue sem configuração) ou 502
 * (cadastro ilegível).
 *
 * Do `token` do GeoRescue (`base64url(JSON).HMAC`) a Sala lê SÓ a carga, sem
 * verificar a assinatura — ela não tem (nem deve ter) o segredo do GeoRescue.
 * Isso só é aceitável porque o token acabou de chegar por TLS, direto do
 * GeoRescue, na resposta ao próprio login; ele nunca vem do navegador. Lê-se
 * `sub` (CPF, só para o pseudônimo), `gr_dgrupo` (grupos), `gr_pg` (posto),
 * `gr_situacao`, `gr_optotal` e `exp` — e o token é descartado.
 *
 * Erros: mensagens genéricas em pt-BR, fixas desta casa (o texto do GeoRescue
 * só escolhe qual delas). Nunca se registra CPF, senha ou corpo da resposta.
 */

export const TIMEOUT_GEORESCUE_MS = 15_000;
const MAXIMO_RESPOSTA_CARACTERES = 64 * 1024;
const USER_AGENT = "SalaSituacao-CBMMG/0.1 (login federado)";

/** O que a Sala aproveita do login (o token já foi lido e descartado). */
export interface LoginGeoRescue {
  /** Nome para exibir (nunca o CPF: o `usuario` da resposta pode ser o CPF quando falta o nome). */
  nome: string;
  bm: string | null;
  unidade: string | null;
  /** Chave do papel no GeoRescue (minúscula). */
  papel: string;
  /** Domínios territoriais, como vieram (código ou nome). */
  dominios: string[];
  /** Domínios de grupo (`gr_dgrupo`). */
  grupos: string[];
  /** Posto/graduação (`gr_pg`). */
  posto: string | null;
  /** `gr_situacao` (null quando o token não traz). */
  situacao: string | null;
  /** `gr_optotal`: exceção do CEB já derivada pelo GeoRescue. */
  operacoesTotal: boolean;
  trocaSenha: boolean;
  /** CPF (11 dígitos) do `sub`, SÓ para calcular o pseudônimo; null no administrador. */
  cpf: string | null;
  /** Usuário do administrador de emergência (sem CPF); null para os demais. */
  administrador: string | null;
  /** Fim da sessão do GeoRescue (epoch ms): a da Sala não pode passar dele. */
  expiraEmMs: number;
}

const texto = z.string().max(500);

const esquemaResposta = z.object({
  ok: z.literal(true),
  usuario: texto,
  nome: texto.optional(),
  cpf: texto.optional(),
  bm: z.union([texto, z.number()]).nullish(),
  unidade: texto.nullish(),
  papel: z.string().min(1).max(40),
  dominios: z.array(texto).max(100),
  escopo_global: z.boolean(),
  troca_senha: z.boolean(),
  token: z.string().min(10).max(16_384),
  expira_em_horas: z.number().positive().max(24).optional(),
});

const esquemaCargaToken = z.object({
  /** Token de outro tipo (o de campo tem `typ: "campo"`) nunca é sessão de mesa. */
  typ: z.unknown().optional(),
  iss: z.string().optional(),
  sub: z.string().max(40).optional(),
  exp: z.number().int().positive(),
  gr_pg: z.string().max(60).optional(),
  gr_dgrupo: z.array(texto).max(100).optional(),
  gr_situacao: z.string().max(30).optional(),
  gr_optotal: z.boolean().optional(),
  gr_troca: z.boolean().optional(),
});

export type CargaTokenGeoRescue = z.infer<typeof esquemaCargaToken>;

function erroContrato(): ErroAutenticacao {
  return new ErroAutenticacao(
    502,
    "contrato",
    "O GeoRescue respondeu num formato inesperado. Tente de novo mais tarde ou avise o suporte da Sala.",
  );
}

function erroIndisponivel(): ErroAutenticacao {
  return new ErroAutenticacao(502, "georescue", "Não foi possível falar com o GeoRescue agora. Tente de novo em instantes.");
}

/**
 * URL do `/api/login` a partir da base (mantém um eventual caminho da base).
 * Só https — http apenas para um GeoRescue local (localhost) em desenvolvimento.
 */
export function urlLoginGeoRescue(base: string): string {
  let url: URL;
  try {
    url = new URL("api/login", base.endsWith("/") ? base : `${base}/`);
  } catch {
    throw new ErroAutenticacao(503, "indisponivel", "Login indisponível: GEORESCUE_BASE_URL inválida.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new ErroAutenticacao(503, "indisponivel", "Login indisponível: GEORESCUE_BASE_URL precisa usar https.");
  }
  return url.toString();
}

/** Carga (JSON) do token do GeoRescue, sem verificar assinatura — ver o cabeçalho do módulo. */
export function lerCargaTokenGeoRescue(token: string): CargaTokenGeoRescue | null {
  const segmento = token.split(".")[0] ?? "";
  if (!/^[A-Za-z0-9_-]{2,16384}$/.test(segmento)) return null;
  try {
    const resultado = esquemaCargaToken.safeParse(JSON.parse(Buffer.from(segmento, "base64url").toString("utf8")));
    return resultado.success ? resultado.data : null;
  } catch {
    return null;
  }
}

function semAcento(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Recusa do GeoRescue → mensagem FIXA da Sala. O texto de lá só escolhe a
 * mensagem; nunca é repassado (pode mudar, e não controlamos o que diz).
 */
export function erroDaRecusa(mensagemGeoRescue: unknown): ErroAutenticacao {
  const t = typeof mensagemGeoRescue === "string" ? semAcento(mensagemGeoRescue) : "";
  const conta = (mensagem: string) => new ErroAutenticacao(403, "conta", mensagem);
  if (t.includes("bloquead")) return conta("Conta bloqueada no GeoRescue. Procure o administrador do GeoRescue.");
  if (t.includes("suspens")) return conta("Conta suspensa no GeoRescue. Procure o administrador do GeoRescue.");
  if (t.includes("prazo")) return conta("O prazo do seu acesso ao GeoRescue venceu. Procure o administrador do GeoRescue.");
  if (t.includes("restrito")) {
    return conta("Acesso restrito para a sua unidade de lotação. Procure o administrador do GeoRescue.");
  }
  if (t.includes("sem papel")) {
    return conta("Sua conta no GeoRescue está sem papel definido. Procure o administrador do GeoRescue.");
  }
  if (t.includes("nao foi possivel")) {
    return new ErroAutenticacao(
      502,
      "georescue",
      "O GeoRescue não conseguiu consultar o cadastro agora. Tente de novo em instantes.",
    );
  }
  return new ErroAutenticacao(401, "credenciais", "CPF ou senha inválidos.");
}

/** 11 dígitos seguidos ou no molde 000.000.000-00: nunca exibir nem guardar. */
const PARECE_CPF = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/;

function comoTexto(valor: string | number | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  const t = String(valor).trim();
  return t ? t : null;
}

/**
 * Interpreta a resposta do `/api/login` (PURO: status + texto do corpo).
 * Sucesso → LoginGeoRescue; qualquer outra coisa → ErroAutenticacao.
 */
export function interpretarRespostaLogin(status: number, corpoTexto: string, agoraMs: number = Date.now()): LoginGeoRescue {
  if (corpoTexto.length > MAXIMO_RESPOSTA_CARACTERES) throw erroContrato();
  let corpo: unknown = null;
  try {
    corpo = JSON.parse(corpoTexto);
  } catch {
    corpo = null;
  }
  const objeto = corpo !== null && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : null;

  if (status === 200 && objeto?.ok === true) {
    const resposta = esquemaResposta.safeParse(objeto);
    if (!resposta.success) throw erroContrato();
    const dados = resposta.data;
    const carga = lerCargaTokenGeoRescue(dados.token);
    if (!carga || carga.typ !== undefined) throw erroContrato();

    const papel = dados.papel.trim().toLowerCase();
    const sub = (carga.sub ?? "").replace(/\D/g, "");
    const cpf = sub.length === 11 ? sub : null;
    // Só o administrador de emergência entra sem CPF (e ele precisa do usuário).
    if (!cpf && (papel !== "administrador" || !dados.usuario.trim())) throw erroContrato();

    let expiraEmMs = carga.exp * 1000;
    if (dados.expira_em_horas !== undefined) expiraEmMs = Math.min(expiraEmMs, agoraMs + dados.expira_em_horas * 3_600_000);
    if (expiraEmMs <= agoraMs) throw erroContrato();

    const administrador = papel === "administrador" ? dados.usuario.trim() || null : null;
    // `usuario` do GeoRescue é "nome ou CPF": fora do administrador, nunca vira nome.
    const nomeInformado = (dados.nome ?? "").trim() || administrador || "";
    const nome = nomeInformado && !PARECE_CPF.test(nomeInformado) ? nomeInformado : "Usuário do GeoRescue";

    return {
      nome,
      bm: comoTexto(dados.bm),
      unidade: comoTexto(dados.unidade),
      papel,
      dominios: dados.dominios.map((d) => d.trim()).filter(Boolean),
      grupos: (carga.gr_dgrupo ?? []).map((g) => g.trim()).filter(Boolean),
      posto: comoTexto(carga.gr_pg),
      situacao: comoTexto(carga.gr_situacao),
      operacoesTotal: carga.gr_optotal === true,
      trocaSenha: dados.troca_senha || carga.gr_troca === true,
      cpf,
      administrador,
      expiraEmMs,
    };
  }

  if (status === 401 || status === 403 || (status === 200 && objeto?.ok === false)) {
    throw erroDaRecusa(objeto?.erro);
  }
  if (status >= 500 || status === 429) throw erroIndisponivel();
  throw erroContrato();
}

export interface OpcoesLoginGeoRescue {
  baseUrl: string;
  timeoutMs?: number;
  /** Injeção para testes. */
  fetch?: typeof fetch;
  agoraMs?: number;
}

/**
 * Faz o login no GeoRescue. `usuario` é o CPF (só dígitos) ou o usuário do
 * administrador de emergência; a senha segue só no corpo do POST, por TLS.
 */
export async function entrarNoGeoRescue(
  credenciais: { usuario: string; senha: string },
  opcoes: OpcoesLoginGeoRescue,
): Promise<LoginGeoRescue> {
  const url = urlLoginGeoRescue(opcoes.baseUrl);
  const timeoutMs = opcoes.timeoutMs ?? TIMEOUT_GEORESCUE_MS;
  const buscar = opcoes.fetch ?? fetch;
  let status: number;
  let corpoTexto: string;
  try {
    const resposta = await buscar(url, {
      method: "POST",
      cache: "no-store",
      // Redirecionamento repetiria a senha para outro endereço: recusa.
      redirect: "error",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify({ usuario: credenciais.usuario, senha: credenciais.senha }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    status = resposta.status;
    corpoTexto = await resposta.text();
  } catch (erro) {
    if (erro instanceof DOMException && (erro.name === "TimeoutError" || erro.name === "AbortError")) {
      console.warn(`[auth] o GeoRescue não respondeu em ${Math.round(timeoutMs / 1000)} s`);
      throw new ErroAutenticacao(504, "tempo", "O GeoRescue não respondeu a tempo. Tente de novo em instantes.");
    }
    // Só o tipo do erro: a mensagem de rede pode citar a URL, nunca o corpo.
    console.warn("[auth] falha de rede ao chamar o login do GeoRescue", erro instanceof Error ? erro.name : typeof erro);
    throw erroIndisponivel();
  }
  try {
    return interpretarRespostaLogin(status, corpoTexto, opcoes.agoraMs ?? Date.now());
  } catch (erro) {
    if (erro instanceof ErroAutenticacao && erro.status >= 500) {
      console.warn(`[auth] login do GeoRescue: HTTP ${status} → ${erro.motivo}`);
    }
    throw erro;
  }
}
