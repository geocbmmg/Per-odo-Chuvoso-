import { createHmac } from "node:crypto";
import type { Sessao } from "@/lib/auth/tipos";

/**
 * Autoria por pseudônimo (LGPD). Nenhum campo gravado guarda CPF, nome ou nº
 * BM: quem emitiu, alterou, deu ciência ou registrou ação é o HMAC-SHA256 do
 * identificador do usuário na sessão, com SALA_PSEUDO_SEGREDO, em 32 hex.
 *
 * O `usuarioId` da sessão já é um pseudônimo (lib/auth/tipos.ts); passar de
 * novo pelo HMAC aqui é defesa em profundidade: mesmo que a sessão traga outro
 * identificador por engano, o que chega à feição nunca é reversível sem o
 * segredo. Quem tem o segredo e a tabela de contas reidentifica (auditoria).
 */

/** Chave FIXA do modo demonstração (DADOS_EXEMPLO=1). Nunca vale em produção. */
export const SEGREDO_PSEUDONIMO_DEMONSTRACAO = "sala-situacao-chave-de-demonstracao-nao-usar-em-producao";

export function pseudonimo(identificador: string, segredo: string): string {
  return createHmac("sha256", segredo).update(`sala-alertas:${identificador}`).digest("hex").slice(0, 32);
}

/** Pseudônimo de quem está na sessão. */
export function pseudonimoDaSessao(sessao: Pick<Sessao, "usuarioId">, segredo: string): string {
  return pseudonimo(sessao.usuarioId, segredo);
}

/**
 * Domínio/grupo do GeoRescue que respondeu pela ação (`*_por_dominio`): o
 * grupo para a Sala, os COBs para as unidades. Não é dado pessoal.
 */
export function dominioDaSessao(sessao: Pick<Sessao, "papel" | "grupos" | "cobs" | "escopoGlobal">): string | null {
  let dominio: string | null;
  if (sessao.papel === "admin") dominio = "ADMINISTRADOR";
  else if (sessao.papel === "operador-sala" && sessao.grupos.length > 0) dominio = sessao.grupos.join(",");
  else if (sessao.cobs.length > 0) dominio = sessao.cobs.join(",");
  else dominio = sessao.escopoGlobal ? "ESTADO" : null;
  return dominio ? dominio.slice(0, 60) : null;
}
