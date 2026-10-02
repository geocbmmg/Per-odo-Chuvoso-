import "server-only";

import { env, modoExemplo } from "@/lib/env";

import { chavePseudonimo } from "./pseudonimo";

/**
 * Configuração do login, lida só no servidor (lib/env.ts):
 * - `demonstracao` (DADOS_EXEMPLO=1): não chama o GeoRescue; os perfis
 *   fictícios assinam com SALA_SESSION_SECRET ou, sem ele, com a chave fixa
 *   abaixo — pública, por isso a sessão de demonstração carrega
 *   `demonstracao: true` e nunca vale fora deste modo (lib/auth/token.ts);
 * - `real`: GEORESCUE_BASE_URL e SALA_SESSION_SECRET presentes;
 * - `indisponivel`: falta um dos dois — o login responde 503 e nenhuma sessão
 *   é aceita sem segredo (falha fechada).
 */

/** Chave FIXA do modo demonstração. Nunca vale em produção (ver acima). */
export const SEGREDO_SESSAO_DEMONSTRACAO = "sala-situacao-sessao-de-demonstracao-nao-usar-em-producao";

interface ConfigComum {
  grupoOperador: string;
  /** URL do GeoRescue (não é segredo), para o link "Esqueci minha senha". */
  georescueUrl: string | null;
}

export type ConfigAuth =
  | (ConfigComum & { modo: "demonstracao"; segredoSessao: string; chavePseudonimo: string })
  | (ConfigComum & { modo: "real"; georescueUrl: string; segredoSessao: string; chavePseudonimo: string })
  | (ConfigComum & { modo: "indisponivel"; faltando: string[]; segredoSessao: string | null });

export function configAuth(): ConfigAuth {
  const e = env();
  const comum: ConfigComum = {
    grupoOperador: e.SALA_GRUPO_OPERADOR,
    georescueUrl: e.GEORESCUE_BASE_URL ? e.GEORESCUE_BASE_URL.replace(/\/+$/, "") : null,
  };
  if (modoExemplo()) {
    const segredoSessao = e.SALA_SESSION_SECRET ?? SEGREDO_SESSAO_DEMONSTRACAO;
    return {
      ...comum,
      modo: "demonstracao",
      segredoSessao,
      chavePseudonimo: chavePseudonimo(e.SALA_PSEUDO_SEGREDO, segredoSessao),
    };
  }
  const faltando: string[] = [];
  if (!comum.georescueUrl) faltando.push("GEORESCUE_BASE_URL");
  if (!e.SALA_SESSION_SECRET) faltando.push("SALA_SESSION_SECRET");
  if (faltando.length > 0 || !comum.georescueUrl || !e.SALA_SESSION_SECRET) {
    // Sem a URL, as sessões já emitidas continuam verificáveis (o segredo existe);
    // sem o segredo, nenhuma é.
    return { ...comum, modo: "indisponivel", faltando, segredoSessao: e.SALA_SESSION_SECRET ?? null };
  }
  return {
    ...comum,
    modo: "real",
    georescueUrl: comum.georescueUrl,
    segredoSessao: e.SALA_SESSION_SECRET,
    chavePseudonimo: chavePseudonimo(e.SALA_PSEUDO_SEGREDO, e.SALA_SESSION_SECRET),
  };
}

/** Mensagem do 503 quando o login real está desligado. */
export function mensagemLoginIndisponivel(faltando: readonly string[]): string {
  const nomes = faltando.length > 0 ? faltando.join(" e ") : "GEORESCUE_BASE_URL e SALA_SESSION_SECRET";
  return `Login indisponível: configure ${nomes} no servidor (veja .env.example).`;
}
