import { SEM_COB, type RotuloCob } from "@/lib/dominio/tipos";

/**
 * Organização territorial do CBMMG: COB → BBM/UEOp → fração → município.
 * Nesta fase só o nível COB é normalizado; os demais níveis vêm como texto das fontes.
 */

export interface NivelTerritorial {
  cob: RotuloCob | null;
  /** Batalhão / Unidade de Execução Operacional (ex.: "1º BBM", "5ª Cia Ind"). */
  ueop: string | null;
  /** Companhia / pelotão / posto (fração). */
  fracao: string | null;
  municipio: string | null;
}

const NUMERO_POR_EXTENSO: Record<string, number> = {
  primeiro: 1,
  segundo: 2,
  terceiro: 3,
  quarto: 4,
  quinto: 5,
  sexto: 6,
  setimo: 7,
  oitavo: 8,
  nono: 9,
};

/**
 * Converte as variações encontradas nos dados ("1º COB", "1 COB", "1°COB",
 * "COB 1", "cob1", "1_cob", "1º Comando Operacional de Bombeiros") para o
 * rótulo canônico "1º COB". Retorna null quando não reconhece.
 */
export function normalizarRotuloCob(valor: unknown): RotuloCob | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/comando operacional de bombeiros/g, "cob")
    .trim();
  if (!texto) return null;

  const padroes = [
    /(?:^|[^a-z0-9])(\d{1,2})\s*[ºo°ª.]?\s*[_-]?\s*cob(?![a-z])/, // "1º cob", "1_cob", "1cob"
    /(?:^|[^a-z0-9])cob\s*[_-]?\s*(\d{1,2})(?!\d)/, // "cob 1", "cob_1", "cob1"
  ];
  for (const padrao of padroes) {
    const m = texto.match(padrao);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 20) return `${n}º COB`;
    }
  }

  const extenso = texto.match(/(primeiro|segundo|terceiro|quarto|quinto|sexto|setimo|oitavo|nono)\s+cob/);
  if (extenso) return `${NUMERO_POR_EXTENSO[extenso[1]]}º COB`;

  return null;
}

/** Rótulo para agregação: COB canônico ou "Sem COB". */
export function cobOuSemCob(valor: unknown): RotuloCob {
  return normalizarRotuloCob(valor) ?? SEM_COB;
}

/** Ordena rótulos de COB numericamente, com "Sem COB" (e desconhecidos) ao final. */
export function compararCobs(a: RotuloCob, b: RotuloCob): number {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  const va = Number.isNaN(na) ? Number.POSITIVE_INFINITY : na;
  const vb = Number.isNaN(nb) ? Number.POSITIVE_INFINITY : nb;
  return va - vb || a.localeCompare(b, "pt-BR");
}
