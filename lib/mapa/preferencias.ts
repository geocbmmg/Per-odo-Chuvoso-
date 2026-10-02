import { BASE_PADRAO, ehBaseMapa, type BaseMapaId } from "./bases";

/**
 * Preferência do mapa base no localStorage (como `grsc_cen_base` no
 * GeoRescue). Qualquer falha de armazenamento (modo privado, cota, bloqueio)
 * cai no padrão sem quebrar a tela.
 */

export const CHAVE_BASE_MAPA = "sala-situacao:mapa-base";

type ArmazenamentoLeitura = Pick<Storage, "getItem">;
type ArmazenamentoEscrita = Pick<Storage, "setItem">;

/** localStorage, se existir e estiver acessível. */
export function armazenamentoLocal(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function lerBaseSalva(armazenamento: ArmazenamentoLeitura | null | undefined): BaseMapaId {
  if (!armazenamento) return BASE_PADRAO;
  try {
    const valor = armazenamento.getItem(CHAVE_BASE_MAPA);
    return ehBaseMapa(valor) ? valor : BASE_PADRAO;
  } catch {
    return BASE_PADRAO;
  }
}

/** Grava a preferência; devolve false se não foi possível. */
export function salvarBase(armazenamento: ArmazenamentoEscrita | null | undefined, base: BaseMapaId): boolean {
  if (!armazenamento) return false;
  try {
    armazenamento.setItem(CHAVE_BASE_MAPA, base);
    return true;
  } catch {
    return false;
  }
}
