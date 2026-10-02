import { createHmac } from "node:crypto";

/**
 * Pseudônimo do usuário na sessão (LGPD): o CPF entra no HMAC e é descartado;
 * a sessão, o cookie, os logs e as feições só conhecem o resultado (32 hex).
 *
 * Chave: SALA_PSEUDO_SEGREDO. Sem ela, uma chave DERIVADA do
 * SALA_SESSION_SECRET com rótulo próprio (nunca o segredo da sessão cru, para
 * que a mesma chave não sirva a dois propósitos). Com a chave derivada, trocar
 * o segredo da sessão muda os pseudônimos — por isso o SALA_PSEUDO_SEGREDO é o
 * recomendado em produção (é também o que a fila de alertas exige para gravar).
 */

const ROTULO_CHAVE_DERIVADA = "sala-situacao/pseudonimo-usuario/v1";

/** Chave do pseudônimo: o segredo próprio ou uma derivação rotulada do segredo da sessão. */
export function chavePseudonimo(segredoPseudonimo: string | undefined, segredoSessao: string): string {
  if (segredoPseudonimo) return segredoPseudonimo;
  return createHmac("sha256", segredoSessao).update(ROTULO_CHAVE_DERIVADA).digest("hex");
}

/**
 * Identificador estável da conta, antes do HMAC: `cpf:<11 dígitos>` para quem
 * entra por CPF; `adm:<usuário>` para o administrador de emergência do
 * GeoRescue (que não tem CPF); `demo:<perfil>` no modo demonstração.
 */
export function identificadorDaConta(conta: { cpf: string } | { administrador: string } | { demonstracao: string }): string {
  if ("cpf" in conta) return `cpf:${conta.cpf.replace(/\D/g, "")}`;
  if ("administrador" in conta) return `adm:${conta.administrador.trim().toLowerCase()}`;
  return `demo:${conta.demonstracao}`;
}

/** HMAC-SHA256 do identificador com a chave, em 32 hex (128 bits). */
export function pseudonimoUsuario(identificador: string, chave: string): string {
  return createHmac("sha256", chave).update(`sala-usuario:${identificador}`).digest("hex").slice(0, 32);
}
