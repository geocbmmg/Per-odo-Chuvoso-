import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";

import { PAPEIS_SALA, type Sessao } from "./tipos";

/**
 * Sessão própria da Sala, CIFRADA E AUTENTICADA com AES-256-GCM (docs/fase-1.md §3.2).
 *
 * O cookie é opaco: `base64url(iv).base64url(cifrado).base64url(tag)`. Quem
 * tem o cookie (um proxy que registra cabeçalhos, um backup do navegador) não
 * lê nome, posto, nº BM nem unidade — só o servidor, com o segredo. O GCM
 * também autentica: qualquer byte alterado invalida a sessão.
 * - A chave é DERIVADA do SALA_SESSION_SECRET com rótulo próprio, para que o
 *   mesmo segredo nunca sirva a duas coisas diferentes.
 * - A carga leva `typ: "sala-sessao"` e `v: 2`, e o tipo também entra como
 *   dado associado (AAD): um token de outro tipo feito com o mesmo segredo não
 *   vira sessão (o defeito do token de campo no GeoRescue, seção 3.4).
 * - `exp` é obrigatório e a sessão dura no máximo 8 h.
 * - Segredo ausente ou com menos de 32 caracteres: não cifra (erro) e não
 *   decifra (null) — falha fechada.
 * - A carga decifrada ainda passa por um esquema zod.
 *
 * NUNCA o CPF: o usuário é o pseudônimo `usuarioId` (lib/auth/pseudonimo.ts).
 * PURO (node:crypto + zod): sem Next, sem variável de ambiente.
 */

export const TAMANHO_MINIMO_SEGREDO = 32;
/** Duração máxima de uma sessão (a mesma do token do GeoRescue). */
export const DURACAO_MAXIMA_SESSAO_S = 8 * 3600;
/** Folga para relógios levemente adiantados entre instâncias. */
const FOLGA_RELOGIO_S = 60;
/** Teto do tamanho do cookie lido (o token real tem bem menos de 1 KB). */
const TAMANHO_MAXIMO_TOKEN = 4096;

const ROTULO_CHAVE = "sala-situacao/sessao/cifra/v2";
const TIPO = "sala-sessao";
const VERSAO = 2;
const TAMANHO_IV = 12;
const TAMANHO_TAG = 16;

const texto = (max: number) => z.string().max(max);

const esquemaCarga = z
  .object({
    typ: z.literal(TIPO),
    v: z.literal(VERSAO),
    sid: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    usuarioId: z.string().regex(/^[0-9a-f]{32}$/),
    nome: texto(200),
    posto: texto(60).nullable(),
    bm: texto(30).nullable(),
    papel: z.enum(PAPEIS_SALA),
    papelGeoRescue: texto(40),
    cobs: z.array(texto(40)).max(20),
    escopoGlobal: z.boolean(),
    grupos: z.array(texto(60)).max(40),
    unidade: texto(200).nullable(),
    demonstracao: z.boolean(),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
  })
  .strict();

type CargaSessao = z.infer<typeof esquemaCarga>;

function segredoValido(segredo: string | null | undefined): segredo is string {
  return typeof segredo === "string" && segredo.length >= TAMANHO_MINIMO_SEGREDO;
}

/** Chave AES-256 derivada do segredo (32 bytes). */
function chaveCifra(segredo: string): Buffer {
  return createHmac("sha256", segredo).update(ROTULO_CHAVE).digest();
}

export class ErroSegredoSessao extends Error {
  constructor() {
    super("SALA_SESSION_SECRET ausente ou curto: a Sala não emite sessão sem segredo.");
    this.name = "ErroSegredoSessao";
  }
}

/**
 * Cifra uma carga qualquer no formato do token. Exportada para os testes
 * provarem que o esquema é conferido depois de decifrar; o código da Sala usa
 * `assinarSessao`.
 */
export function cifrarCarga(carga: unknown, segredo: string | null | undefined): string {
  if (!segredoValido(segredo)) throw new ErroSegredoSessao();
  const iv = randomBytes(TAMANHO_IV);
  const cifra = createCipheriv("aes-256-gcm", chaveCifra(segredo), iv);
  cifra.setAAD(Buffer.from(TIPO, "utf8"));
  const cifrado = Buffer.concat([cifra.update(JSON.stringify(carga), "utf8"), cifra.final()]);
  const tag = cifra.getAuthTag();
  return `${iv.toString("base64url")}.${cifrado.toString("base64url")}.${tag.toString("base64url")}`;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Decifra e devolve a carga (JSON) ou null se o token não for íntegro. */
export function decifrarCarga(token: string | null | undefined, segredo: string | null | undefined): unknown | null {
  if (!segredoValido(segredo)) return null;
  if (typeof token !== "string" || token.length === 0 || token.length > TAMANHO_MAXIMO_TOKEN) return null;
  const partes = token.split(".");
  if (partes.length !== 3 || !partes.every((p) => p.length > 0 && BASE64URL.test(p))) return null;
  const [iv, cifrado, tag] = partes.map((p) => Buffer.from(p, "base64url"));
  if (iv.length !== TAMANHO_IV || tag.length !== TAMANHO_TAG || cifrado.length === 0) return null;
  try {
    const decifra = createDecipheriv("aes-256-gcm", chaveCifra(segredo), iv);
    decifra.setAAD(Buffer.from(TIPO, "utf8"));
    decifra.setAuthTag(tag);
    const texto = Buffer.concat([decifra.update(cifrado), decifra.final()]).toString("utf8");
    return JSON.parse(texto) as unknown;
  } catch {
    return null;
  }
}

/**
 * Emite o token da sessão. `expiraEm` define o `exp`; ela precisa estar no
 * futuro e a no máximo 8 h de `agoraMs` (quem chama já limitou ao `exp` do
 * GeoRescue). O nome segue "assinar" porque o token continua autenticado.
 */
export function assinarSessao(sessao: Sessao, segredo: string | null | undefined, agoraMs: number = Date.now()): string {
  if (!segredoValido(segredo)) throw new ErroSegredoSessao();
  const iat = Math.floor(agoraMs / 1000);
  const exp = Math.floor(new Date(sessao.expiraEm).getTime() / 1000);
  if (!Number.isFinite(exp) || exp <= iat) throw new Error("Sessão sem validade futura.");
  if (exp - iat > DURACAO_MAXIMA_SESSAO_S) throw new Error("Sessão com validade acima de 8 h.");

  const carga: CargaSessao = esquemaCarga.parse({
    typ: TIPO,
    v: VERSAO,
    sid: sessao.sid,
    usuarioId: sessao.usuarioId,
    nome: sessao.nome,
    posto: sessao.posto,
    bm: sessao.bm,
    papel: sessao.papel,
    papelGeoRescue: sessao.papelGeoRescue,
    cobs: sessao.cobs,
    escopoGlobal: sessao.escopoGlobal,
    grupos: sessao.grupos,
    unidade: sessao.unidade,
    demonstracao: sessao.demonstracao,
    iat,
    exp,
  });
  return cifrarCarga(carga, segredo);
}

export interface OpcoesVerificacao {
  agoraMs?: number;
  /**
   * A sessão tem de ser (true) ou não ser (false) de demonstração. Uma sessão
   * de demonstração nunca vale fora do modo demonstração, e vice-versa.
   */
  demonstracao: boolean;
}

/** Sessão do token, ou null se a integridade, o formato, o tipo ou a validade não conferirem. */
export function verificarSessao(
  token: string | null | undefined,
  segredo: string | null | undefined,
  opcoes: OpcoesVerificacao,
): Sessao | null {
  const bruto = decifrarCarga(token, segredo);
  if (bruto === null) return null;
  const resultado = esquemaCarga.safeParse(bruto);
  if (!resultado.success) return null;
  const carga = resultado.data;

  const agora = Math.floor((opcoes.agoraMs ?? Date.now()) / 1000);
  if (carga.exp <= agora) return null;
  if (carga.iat > agora + FOLGA_RELOGIO_S) return null;
  if (carga.exp - carga.iat > DURACAO_MAXIMA_SESSAO_S) return null;
  if (carga.demonstracao !== opcoes.demonstracao) return null;

  return {
    sid: carga.sid,
    usuarioId: carga.usuarioId,
    nome: carga.nome,
    posto: carga.posto,
    bm: carga.bm,
    papel: carga.papel,
    papelGeoRescue: carga.papelGeoRescue,
    cobs: carga.cobs,
    escopoGlobal: carga.escopoGlobal,
    grupos: carga.grupos,
    unidade: carga.unidade,
    expiraEm: new Date(carga.exp * 1000).toISOString(),
    demonstracao: carga.demonstracao,
  };
}

/** Segundos de vida restantes da sessão (para o Max-Age do cookie). */
export function segundosAteExpirar(sessao: Pick<Sessao, "expiraEm">, agoraMs: number = Date.now()): number {
  return Math.max(0, Math.floor((new Date(sessao.expiraEm).getTime() - agoraMs) / 1000));
}
