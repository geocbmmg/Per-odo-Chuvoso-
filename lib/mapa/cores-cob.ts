import type { ExpressionSpecification } from "maplibre-gl";
import { SEM_COB } from "@/lib/dominio/tipos";
import type { TemaMapa } from "./tema";

/**
 * Cores dos 6 COBs — "cor é dado, identifica o comando" (GeoRescue,
 * Index.html 2657-2662; contornos do claro em 44259-44264). O preenchimento
 * é igual nos dois temas; só o contorno muda para manter contraste.
 */

export interface CorCob {
  cob: string;
  preenchimento: string;
  contorno: Record<TemaMapa, string>;
}

export const CORES_COB: readonly CorCob[] = [
  { cob: "1º COB", preenchimento: "#F1C23C", contorno: { escuro: "#F6D06A", claro: "#9B7A18" } },
  { cob: "2º COB", preenchimento: "#5FA07A", contorno: { escuro: "#7FC59A", claro: "#3E6E52" } },
  { cob: "3º COB", preenchimento: "#4E86C4", contorno: { escuro: "#74A6E0", claro: "#2F5A88" } },
  { cob: "4º COB", preenchimento: "#D08A3E", contorno: { escuro: "#EAA85A", claro: "#8E5C25" } },
  { cob: "5º COB", preenchimento: "#9AA0AC", contorno: { escuro: "#C2C8D2", claro: "#646A76" } },
  { cob: "6º COB", preenchimento: "#C05F58", contorno: { escuro: "#E07E76", claro: "#863E39" } },
];

/** Cinza do GeoRescue para COB desconhecido ou "Sem COB". */
export const COR_COB_DESCONHECIDO = "#5A6371";

export type PapelCorCob = "preenchimento" | "contorno";

const POR_ROTULO = new Map(CORES_COB.map((c) => [c.cob, c]));

/** Cor de um COB pelo rótulo canônico ("1º COB" … "6º COB"); cinza para os demais. */
export function corDoCob(rotulo: string | null | undefined, tema: TemaMapa, papel: PapelCorCob): string {
  const cor = rotulo && rotulo !== SEM_COB ? POR_ROTULO.get(rotulo) : undefined;
  if (!cor) return COR_COB_DESCONHECIDO;
  return papel === "preenchimento" ? cor.preenchimento : cor.contorno[tema];
}

/**
 * Expressão "match" do MapLibre sobre a propriedade `cob` (rótulo canônico).
 * Qualquer outro valor (incluindo "Sem COB", null ou ausente) cai no cinza.
 */
export function expressaoCorCob(tema: TemaMapa, papel: PapelCorCob): ExpressionSpecification {
  const cor = (c: CorCob) => (papel === "preenchimento" ? c.preenchimento : c.contorno[tema]);
  const [primeiro, ...demais] = CORES_COB;
  return [
    "match",
    ["get", "cob"],
    primeiro.cob,
    cor(primeiro),
    ...demais.flatMap((c) => [c.cob, cor(c)]),
    COR_COB_DESCONHECIDO,
  ];
}
