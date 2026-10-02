/**
 * Medidas dos gráficos de barras horizontais: largura do eixo de categorias
 * pelo rótulo mais longo, quebra de linha quando não cabe e altura
 * proporcional ao número de barras (~36px por barra + margens).
 * Módulo puro (a medição de texto usa canvas quando há DOM, estimativa sem).
 */

export const formatoInteiro = new Intl.NumberFormat("pt-BR");
export const formatoPercentual = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

export function formatarNumero(valor: number): string {
  return formatoInteiro.format(valor);
}

/** Altura mínima de uma linha (barra + respiro). */
export const ALTURA_LINHA = 36;
/** Espessura da barra (≤ 24px, o resto da faixa é ar). */
export const ESPESSURA_BARRA = 18;
/** Espaço de superfície entre segmentos empilhados. */
export const VAO_SEGMENTOS = 2;
/** Raio da ponta de dados (a base fica reta). */
export const RAIO_PONTA = 4;
/** Altura da faixa do eixo X (ticks). */
export const ALTURA_EIXO_X = 26;
export const MARGEM_SUPERIOR = 6;
export const ALTURA_LINHA_TEXTO = 15;
export const TAMANHO_ROTULO = 12;
export const TAMANHO_VALOR = 12;
/** Distância entre o rótulo da categoria e o eixo (com ou sem amostra de cor). */
export const RECUO_ROTULO = 8;
export const RECUO_ROTULO_COM_AMOSTRA = 20;

const FONTE_PADRAO = "'Segoe UI', system-ui, -apple-system, Roboto, sans-serif";

let contexto: CanvasRenderingContext2D | null | undefined;
let familia: string | undefined;

/** Largura do texto em px na fonte do sistema (estimativa sem DOM). */
export function medirTexto(texto: string, tamanhoPx = TAMANHO_ROTULO, peso = 400): number {
  if (typeof document !== "undefined") {
    if (contexto === undefined) {
      contexto = document.createElement("canvas").getContext("2d");
      familia = getComputedStyle(document.body).fontFamily || FONTE_PADRAO;
    }
    if (contexto) {
      contexto.font = `${peso} ${tamanhoPx}px ${familia ?? FONTE_PADRAO}`;
      return Math.ceil(contexto.measureText(texto).width);
    }
  }
  return Math.ceil(texto.length * tamanhoPx * (peso >= 600 ? 0.6 : 0.56));
}

/** Quebra o rótulo em linhas de até `larguraMax` px (palavras inteiras, nunca cortadas). */
export function quebrarRotulo(texto: string, larguraMax: number, medir: (t: string) => number = medirTexto): string[] {
  const palavras = texto.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [""];
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of palavras) {
    const candidata = atual ? `${atual} ${palavra}` : palavra;
    if (!atual || medir(candidata) <= larguraMax) {
      atual = candidata;
    } else {
      linhas.push(atual);
      atual = palavra;
    }
  }
  linhas.push(atual);
  return linhas;
}

export interface LayoutBarras {
  /** Largura do eixo de categorias (px). */
  larguraEixo: number;
  /** Linhas de cada rótulo, na ordem dos dados. */
  linhasPorRotulo: string[][];
  /** Altura de cada faixa de categoria. */
  alturaLinha: number;
  /** Altura total do gráfico (inclui o eixo X). */
  altura: number;
  /** Margem à direita para o rótulo de valor no fim da maior barra. */
  margemDireita: number;
}

/** Altura do gráfico para `n` barras de uma linha de texto (estimativa do servidor). */
export function alturaEstimada(n: number): number {
  return Math.max(1, n) * ALTURA_LINHA + MARGEM_SUPERIOR + ALTURA_EIXO_X;
}

/**
 * Calcula o eixo de categorias: usa a largura natural do rótulo mais longo; se
 * passar de ~42% do gráfico, quebra em linhas (e a faixa cresce para caber).
 */
export function calcularLayoutBarras({
  rotulos,
  largura,
  comAmostra,
  maiorValor,
  medir = medirTexto,
}: {
  rotulos: readonly string[];
  largura: number;
  comAmostra: boolean;
  /** Maior valor rotulado no fim das barras (já formatado). */
  maiorValor: string;
  medir?: (texto: string, tamanhoPx?: number, peso?: number) => number;
}): LayoutBarras {
  const recuo = comAmostra ? RECUO_ROTULO_COM_AMOSTRA : RECUO_ROTULO;
  const medirRotulo = (t: string) => medir(t, TAMANHO_ROTULO, 400);
  const natural = Math.max(0, ...rotulos.map(medirRotulo)) + recuo + 4;
  const maiorPalavra = Math.max(0, ...rotulos.flatMap((r) => r.split(/\s+/)).map(medirRotulo)) + recuo + 4;
  const limite = Math.max(84, Math.round((largura || 320) * 0.42));

  let larguraEixo = natural;
  let linhasPorRotulo = rotulos.map((r) => [r]);
  if (natural > limite) {
    larguraEixo = Math.max(limite, maiorPalavra);
    linhasPorRotulo = rotulos.map((r) => quebrarRotulo(r, larguraEixo - recuo - 4, medirRotulo));
  }

  const maxLinhas = Math.max(1, ...linhasPorRotulo.map((l) => l.length));
  const alturaLinha = Math.max(ALTURA_LINHA, maxLinhas * ALTURA_LINHA_TEXTO + 12);
  const n = Math.max(1, rotulos.length);
  return {
    larguraEixo: Math.ceil(larguraEixo),
    linhasPorRotulo,
    alturaLinha,
    altura: n * alturaLinha + MARGEM_SUPERIOR + ALTURA_EIXO_X,
    margemDireita: medir(maiorValor, TAMANHO_VALOR, 600) + 14,
  };
}

/**
 * Caminho SVG de uma barra horizontal com a ponta de dados (direita)
 * arredondada e a base (esquerda) reta.
 */
export function caminhoBarra(x: number, y: number, largura: number, altura: number, raio: number): string {
  if (!(largura > 0) || !(altura > 0)) return "";
  const r = Math.max(0, Math.min(raio, largura, altura / 2));
  const xf = x + largura;
  if (r === 0) return `M${x},${y}H${xf}V${y + altura}H${x}Z`;
  return [
    `M${x},${y}`,
    `H${xf - r}`,
    `A${r},${r} 0 0 1 ${xf},${y + r}`,
    `V${y + altura - r}`,
    `A${r},${r} 0 0 1 ${xf - r},${y + altura}`,
    `H${x}`,
    "Z",
  ].join("");
}
