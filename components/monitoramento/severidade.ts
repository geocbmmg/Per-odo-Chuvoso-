import type { SeveridadeInmet } from "@/lib/dominio/tipos";

/**
 * Severidades do INMET como COR-DADO (não seguem o tema: a cor identifica o
 * nível oficial, igual ao mapa de avisos do INMET). Sempre acompanhadas do
 * NOME do nível e de um medidor de 1 a 3 barras — nunca só a cor.
 * O texto nunca é pintado nessas cores: a cor fica na faixa, no chip do ícone
 * e na amostra; a palavra usa os tokens de texto da interface.
 */
export interface EstiloSeveridade {
  rotulo: string;
  /** Cor oficial do nível no INMET. */
  cor: string;
  /** Tinta legível SOBRE a cor (ícone dentro do chip). */
  tinta: string;
  /** 1 = Perigo potencial · 2 = Perigo · 3 = Grande perigo · 0 = não informada. */
  nivel: 0 | 1 | 2 | 3;
}

export const ESTILO_SEVERIDADE: Record<SeveridadeInmet, EstiloSeveridade> = {
  "perigo-potencial": { rotulo: "Perigo potencial", cor: "#FFFE00", tinta: "#1A1A1A", nivel: 1 },
  perigo: { rotulo: "Perigo", cor: "#F96602", tinta: "#1A1A1A", nivel: 2 },
  "grande-perigo": { rotulo: "Grande perigo", cor: "#F80703", tinta: "#FFFFFF", nivel: 3 },
  desconhecida: { rotulo: "Severidade não informada", cor: "#9AA0AC", tinta: "#1A1A1A", nivel: 0 },
};

/** Ordem do mais grave ao menos grave (mesma do feed já filtrado). */
export const ORDEM_SEVERIDADES: readonly SeveridadeInmet[] = [
  "grande-perigo",
  "perigo",
  "perigo-potencial",
  "desconhecida",
];

/**
 * Limiares diários do INMET para chuvas intensas, aplicados ao acumulado
 * PREVISTO nas próximas 24 h. É uma leitura indicativa da previsão numérica,
 * não um aviso oficial.
 *   - ≥ 30 mm  → Perigo potencial
 *   - ≥ 50 mm  → Perigo
 *   - > 100 mm → Grande perigo
 *   - < 30 mm  → sem destaque
 */
export const LIMIARES_CHUVA_24H = {
  perigoPotencial: 30,
  perigo: 50,
  grandePerigo: 100,
} as const;

export function classificarChuva24h(mm: number | null): Exclude<SeveridadeInmet, "desconhecida"> | null {
  if (mm === null || !Number.isFinite(mm)) return null;
  if (mm > LIMIARES_CHUVA_24H.grandePerigo) return "grande-perigo";
  if (mm >= LIMIARES_CHUVA_24H.perigo) return "perigo";
  if (mm >= LIMIARES_CHUVA_24H.perigoPotencial) return "perigo-potencial";
  return null;
}
