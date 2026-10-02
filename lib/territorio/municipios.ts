import type { MunicipioTerritorio } from "@/lib/dominio/risco";
import dados from "./municipios-mg.json";

/**
 * Os 853 municípios de MG com o território do CBMMG e a sede municipal (IBGE).
 * Gerado por scripts/geo/gerar_territorio.py; a mesma atribuição está nas
 * propriedades de public/geo/municipios-mg.json.
 *
 * APROXIMAÇÕES (docs/fase-1.md §6):
 * - COB: mapa dos COBs do GeoRescue cruzado com a malha municipal (a camada
 *   oficial é MG_DISSOLVIDO_COB);
 * - UEOp e fração: a fração cuja cidade é a mais próxima da sede municipal,
 *   dentro do COB. Não existe ainda tabela oficial município → fração.
 */
export interface MunicipioMg extends MunicipioTerritorio {
  /** Fração mais próxima (aproximada); null quando a mais próxima é a sede da UEOp. */
  fracao: string | null;
  /** Sede municipal (IBGE). */
  lat: number;
  lon: number;
}

export const MUNICIPIOS_MG: readonly MunicipioMg[] = dados as MunicipioMg[];

function chave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const porIbge = new Map(MUNICIPIOS_MG.map((m) => [m.ibge, m]));
const porNome = new Map(MUNICIPIOS_MG.map((m) => [chave(m.nome), m]));

/** Grafias do formulário Survey123 diferentes das do IBGE (nome no formulário → nome IBGE). */
const GRAFIAS_ALTERNATIVAS: Record<string, string> = {
  "Barão do Monte Alto": "Barão de Monte Alto",
  "Dona Euzébia": "Dona Eusébia",
  "São Tomé das Letras": "São Thomé das Letras",
};
for (const [alternativa, oficial] of Object.entries(GRAFIAS_ALTERNATIVAS)) {
  const m = porNome.get(chave(oficial));
  if (m) porNome.set(chave(alternativa), m);
}

export function municipioPorIbge(ibge: unknown): MunicipioMg | null {
  if (typeof ibge === "number") return porIbge.get(String(ibge)) ?? null;
  return typeof ibge === "string" ? (porIbge.get(ibge.trim()) ?? null) : null;
}

/** Município de MG pelo nome, ignorando caixa, acento e pontuação ("Sao Joao del-Rei"). */
export function municipioPorNome(nome: unknown): MunicipioMg | null {
  if (typeof nome !== "string") return null;
  const k = chave(nome.replace(/\s*[-/(]\s*MG\)?\s*$/i, ""));
  return k ? (porNome.get(k) ?? null) : null;
}
