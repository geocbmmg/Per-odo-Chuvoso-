import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { PAPEIS_SALA, type Sessao } from "./tipos";

/**
 * Sessão própria da Sala, assinada com HMAC-SHA256 (docs/fase-1.md §3.2).
 *
 * Formato compacto, no mesmo espírito do token do GeoRescue (sem cabeçalho
 * JWT): `base64url(JSON da carga).base64url(HMAC-SHA256(chave, primeiro segmento))`.
 * - A chave de assinatura é DERIVADA do SALA_SESSION_SECRET com rótulo próprio,
 *   para que o mesmo segredo nunca assine duas coisas diferentes.
 * - A carga carrega `typ: "sala-sessao"` e `v: 1`: um token de outro tipo
 *   assinado com o mesmo segredo não vira sessão (o defeito do token de campo
 *   no GeoRescue, seção 3.4).
 * - `exp` é obrigatório e a sessão dura no máximo 8 h.
 * - Segredo ausente ou com menos de 32 caracteres: não assina (erro) e não
 *   verifica (null) — falha fechada; `hmac("", …)` seria forjável por qualquer um.
 * - A verificação compara a assinatura em tempo constante (timingSafeEqual) e
 *   só então lê a carga, que ainda passa por um esquema zod.
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

const ROTULO_CHAVE = "sala-situacao/sessao/v1";
const TIPO = "sala-sessao";

const texto = (max: number) => z.string().max(max);

const esquemaCarga = z
  .object({
    typ: z.literal(TIPO),
    v: z.literal(1),
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

function chaveAssinatura(segredo: string): Buffer {
  return createHmac("sha256", segredo).update(ROTULO_CHAVE).digest();
}

function assinatura(segmento: string, segredo: string): Buffer {
  return createHmac("sha256", chaveAssinatura(segredo)).update(segmento).digest();
}

export class ErroSegredoSessao extends Error {
  constructor() {
    super("SALA_SESSION_SECRET ausente ou curto: a Sala não assina sessão sem segredo.");
    this.name = "ErroSegredoSessao";
  }
}

/**
 * Assina a sessão. `expiraEm` define o `exp`; ela precisa estar no futuro e a
 * no máximo 8 h de `agoraMs` (quem chama já limitou ao `exp` do GeoRescue).
 */
export function assinarSessao(sessao: Sessao, segredo: string | null | undefined, agoraMs: number = Date.now()): string {
  if (!segredoValido(segredo)) throw new ErroSegredoSessao();
  const iat = Math.floor(agoraMs / 1000);
  const exp = Math.floor(new Date(sessao.expiraEm).getTime() / 1000);
  if (!Number.isFinite(exp) || exp <= iat) throw new Error("Sessão sem validade futura.");
  if (exp - iat > DURACAO_MAXIMA_SESSAO_S) throw new Error("Sessão com validade acima de 8 h.");

  const carga: CargaSessao = esquemaCarga.parse({
    typ: TIPO,
    v: 1,
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
  const segmento = Buffer.from(JSON.stringify(carga), "utf8").toString("base64url");
  return `${segmento}.${assinatura(segmento, segredo).toString("base64url")}`;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export interface OpcoesVerificacao {
  agoraMs?: number;
  /**
   * A sessão tem de ser (true) ou não ser (false) de demonstração. Uma sessão
   * de demonstração nunca vale fora do modo demonstração, e vice-versa.
   */
  demonstracao: boolean;
}

/** Sessão do token, ou null se a assinatura, o formato, o tipo ou a validade não conferirem. */
export function verificarSessao(
  token: string | null | undefined,
  segredo: string | null | undefined,
  opcoes: OpcoesVerificacao,
): Sessao | null {
  if (!segredoValido(segredo)) return null;
  if (typeof token !== "string" || token.length === 0 || token.length > TAMANHO_MAXIMO_TOKEN) return null;
  const partes = token.split(".");
  if (partes.length !== 2) return null;
  const [segmento, assinado] = partes;
  if (!BASE64URL.test(segmento) || !BASE64URL.test(assinado)) return null;

  // Compara o TEXTO base64url (forma canônica): decodificar antes aceitaria
  // variações do último caractere que dão os mesmos bytes.
  const recebida = Buffer.from(assinado, "utf8");
  const esperada = Buffer.from(assinatura(segmento, segredo).toString("base64url"), "utf8");
  if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) return null;

  let carga: CargaSessao;
  try {
    const resultado = esquemaCarga.safeParse(JSON.parse(Buffer.from(segmento, "base64url").toString("utf8")));
    if (!resultado.success) return null;
    carga = resultado.data;
  } catch {
    return null;
  }

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
