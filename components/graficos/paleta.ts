/**
 * Paleta dos gráficos da Sala de Situação — validada pelo script de
 * daltonismo/contraste da skill dataviz (escuro sobre --gr-bg #0A0E14, claro
 * sobre --gr-bg #F2F4F7). Use exatamente estes valores.
 *
 * - atendido ("Com ação RRD"): azul      · escuro #3B9EDB · claro #1F6FA8
 * - pendente ("Pendente"):     laranja   · escuro #D9692A · claro #B4561F
 * - única (série única):       acento ouro · escuro #F1C23C · claro #7A5800
 *
 * As cores dos COBs (--cob-1..6) NÃO servem para séries: falham no teste de
 * daltonismo (6º × 2º, ΔE 5,5). COB é sempre identificado por texto.
 *
 * As cores chegam ao SVG como variáveis CSS (fill="var(--serie-…)"), definidas
 * por CSS no contêiner do gráfico: trocam junto com o tema, sem JavaScript e
 * sem piscar. O padrão (sem data-tema) é o escuro, como os tokens de :root.
 */
export const PALETA_SERIES = {
  atendido: { escuro: "#3B9EDB", claro: "#1F6FA8", variavel: "--serie-atendido" },
  pendente: { escuro: "#D9692A", claro: "#B4561F", variavel: "--serie-pendente" },
  unica: { escuro: "#F1C23C", claro: "#7A5800", variavel: "--serie-unica" },
} as const;

export type SerieId = keyof typeof PALETA_SERIES;

/** Valor `fill`/`stroke` de uma série no SVG. */
export function corSerie(serie: SerieId): string {
  return `var(${PALETA_SERIES[serie].variavel})`;
}

/**
 * Classes que definem as variáveis das séries. Aplique no elemento que envolve
 * o gráfico E a legenda (a legenda é renderizada no servidor).
 * (Literais para o Tailwind encontrar; valores iguais a PALETA_SERIES.)
 */
export const CLASSE_VARIAVEIS_SERIES = [
  "[--serie-atendido:#3B9EDB] [--serie-pendente:#D9692A] [--serie-unica:#F1C23C]",
  "[[data-tema=claro]_&]:[--serie-atendido:#1F6FA8]",
  "[[data-tema=claro]_&]:[--serie-pendente:#B4561F]",
  "[[data-tema=claro]_&]:[--serie-unica:#7A5800]",
].join(" ");

/** Amostra de cor (quadrado da legenda) de cada série. */
export const CLASSE_AMOSTRA_SERIE: Record<SerieId, string> = {
  atendido: "bg-(--serie-atendido)",
  pendente: "bg-(--serie-pendente)",
  unica: "bg-(--serie-unica)",
};

/** Grade e eixos recessivos (tokens do tema). */
export const COR_GRADE = "rgba(var(--linha-rgb), .09)";
export const COR_EIXO = "rgba(var(--linha-rgb), .18)";
export const COR_CURSOR = "rgba(var(--linha-rgb), .05)";
/** Texto do gráfico: nunca na cor da série. */
export const COR_TEXTO_ROTULO = "var(--gr-ink2)";
export const COR_TEXTO_VALOR = "var(--gr-ink)";
export const COR_TEXTO_EIXO = "var(--gr-mut)";
