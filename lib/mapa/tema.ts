/**
 * Tema do mapa. A interface segue os tokens do GeoRescue (tema escuro por
 * padrão); aqui ficam só as cores que o MapLibre precisa como valores
 * literais, porque o canvas WebGL não lê variáveis CSS.
 */

export type TemaMapa = "escuro" | "claro";

export const TEMA_PADRAO: TemaMapa = "escuro";

/**
 * Interpreta o tema vindo do next-themes ("dark"/"light"), do atributo
 * `data-tema` do GeoRescue ("escuro"/"claro") ou de uma classe. Usa o primeiro
 * candidato reconhecido; sem nenhum, o padrão da casa é o escuro.
 */
export function resolverTemaMapa(...candidatos: Array<string | null | undefined>): TemaMapa {
  for (const candidato of candidatos) {
    const valor = candidato?.trim().toLowerCase();
    if (valor === "escuro" || valor === "dark") return "escuro";
    if (valor === "claro" || valor === "light") return "claro";
  }
  return TEMA_PADRAO;
}

export interface PaletaMapa {
  /** --gr-bg: fundo do canvas, visível quando os tiles do mapa base falham. */
  fundo: string;
  /** Contorno de MG (linha). */
  contornoMg: string;
  opacidadeContornoMg: number;
  larguraContornoMg: number;
  /** Véu que escurece tudo o que fica fora de MG. */
  mascara: string;
  opacidadeMascara: number;
  /** Preenchimento dos COBs (normal e com o COB selecionado). */
  opacidadeCob: number;
  opacidadeCobSelecionado: number;
  larguraContornoCob: number;
  /** Contorno dos símbolos pontuais. */
  contornoPonto: string;
}

export const PALETAS_MAPA: Record<TemaMapa, PaletaMapa> = {
  escuro: {
    fundo: "#0A0E14",
    contornoMg: "#FFFFFF",
    opacidadeContornoMg: 0.85,
    larguraContornoMg: 1.4,
    mascara: "#0A0E14",
    opacidadeMascara: 0.55,
    opacidadeCob: 0.16,
    opacidadeCobSelecionado: 0.38,
    larguraContornoCob: 1.8,
    contornoPonto: "#0A0E14",
  },
  claro: {
    fundo: "#F2F4F7",
    contornoMg: "#10151C",
    opacidadeContornoMg: 0.85,
    larguraContornoMg: 1.4,
    mascara: "#0A0E14",
    opacidadeMascara: 0.35,
    opacidadeCob: 0.5,
    opacidadeCobSelecionado: 0.68,
    larguraContornoCob: 1.8,
    contornoPonto: "#0A0E14",
  },
};
