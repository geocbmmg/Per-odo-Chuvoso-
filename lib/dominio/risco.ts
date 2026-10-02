import { gravidade, maisGrave, NIVEIS_RISCO, type NivelRisco } from "./matrizes";

/**
 * Risco por município: contrato comum das camadas do mapa de risco e da chuva
 * prevista. Toda fonte (INMET, CEMADEN, alertas do CBMMG, previsão de chuva)
 * vira uma lista de municípios (código IBGE de 7 dígitos) com um nível na
 * escala única das matrizes (verde … roxo). A agregação por COB e por UEOp é
 * a mesma para todas.
 *
 * Puro: sem React, Next ou server-only (regra de negócio portável para o
 * GeoRescue).
 */

/** Camadas do mapa de risco, uma por tipo (decisão da equipe: camadas no mesmo mapa). */
export const CAMADAS_RISCO = ["meteorologico", "geologico", "hidrologico", "alertas-cbmmg"] as const;
export type CamadaRiscoId = (typeof CAMADAS_RISCO)[number];

export const ROTULOS_CAMADA_RISCO: Record<CamadaRiscoId, string> = {
  meteorologico: "Meteorológico",
  geologico: "Geológico",
  hidrologico: "Hidrológico",
  "alertas-cbmmg": "Alertas do CBMMG",
};

/** Um motivo de risco num município: um aviso do INMET, um alerta do CEMADEN, um alerta do CBMMG. */
export interface ItemRisco {
  nivel: NivelRisco;
  /** Texto curto para balão e lista: "Chuvas Intensas · Perigo". */
  titulo: string;
  /** Crédito da fonte: "INMET", "Cemaden/MCTI", "CBMMG". */
  fonte: string;
  /** ISO (UTC) do início e do fim da vigência, quando a fonte informa. */
  inicio: string | null;
  fim: string | null;
  /** Identificador na fonte (nº do aviso, cod_alerta, nº da chamada). */
  ref: string | null;
}

export interface RiscoMunicipio {
  /** Código IBGE de 7 dígitos. */
  ibge: string;
  /** Pior nível entre os itens. */
  nivel: NivelRisco;
  itens: ItemRisco[];
}

export interface CamadaRisco {
  id: CamadaRiscoId;
  /** Só os municípios com algum item. Ausente NÃO significa "sem risco" (ver `cobertura`). */
  municipios: RiscoMunicipio[];
  /** O que a ausência de item significa nesta fonte (exibido na legenda). */
  cobertura: string;
  /** Crédito exigido pela fonte. */
  credito: string;
}

/** Junta itens soltos (um por aviso × município) em municípios com o pior nível. */
export function agruparPorMunicipio(itens: readonly (ItemRisco & { ibge: string })[]): RiscoMunicipio[] {
  const porIbge = new Map<string, ItemRisco[]>();
  for (const { ibge, ...item } of itens) {
    if (!/^\d{7}$/.test(ibge)) continue;
    const lista = porIbge.get(ibge) ?? [];
    lista.push(item);
    porIbge.set(ibge, lista);
  }
  return [...porIbge.entries()]
    .map(([ibge, lista]) => {
      const ordenados = [...lista].sort((a, b) => gravidade(b.nivel) - gravidade(a.nivel));
      return { ibge, nivel: ordenados[0].nivel, itens: ordenados };
    })
    .sort((a, b) => a.ibge.localeCompare(b.ibge));
}

// ---------------------------------------------------------------------------------------------
// Agregação pela hierarquia do CBMMG (zoom do mapa: Estado → COB → UEOp → município)
// ---------------------------------------------------------------------------------------------

/** Município com o território do CBMMG (ver lib/territorio/municipios.ts). */
export interface MunicipioTerritorio {
  ibge: string;
  nome: string;
  cob: string;
  ueop: string;
}

export type ContagemNiveis = Record<NivelRisco, number>;

export interface ResumoArea {
  /** Rótulo da área: "1º COB" ou "1º COB · 2º BBM". */
  chave: string;
  cob: string;
  ueop: string | null;
  /** Pior nível entre os municípios da área; null se nenhum tem nível. */
  nivel: NivelRisco | null;
  /** Quantos municípios em cada nível. */
  contagem: ContagemNiveis;
  /** Municípios da área (com ou sem nível). */
  totalMunicipios: number;
  /** Município de pior nível (o primeiro em ordem alfabética, em empate). */
  piorMunicipio: { ibge: string; nome: string } | null;
}

function contagemVazia(): ContagemNiveis {
  return Object.fromEntries(NIVEIS_RISCO.map((n) => [n, 0])) as ContagemNiveis;
}

/**
 * Agrega níveis por município em áreas (COB ou COB + UEOp). Municípios sem
 * nível entram no total, mas não na contagem.
 */
const COLLATOR = new Intl.Collator("pt-BR", { numeric: true });

export function agregarPorArea(
  municipios: readonly MunicipioTerritorio[],
  niveis: ReadonlyMap<string, NivelRisco>,
  nivelDeArea: "cob" | "ueop",
): ResumoArea[] {
  const areas = new Map<string, ResumoArea>();
  const ordenados = [...municipios].sort((a, b) => COLLATOR.compare(a.nome, b.nome));
  for (const m of ordenados) {
    const chave = nivelDeArea === "cob" ? m.cob : `${m.cob} · ${m.ueop}`;
    let area = areas.get(chave);
    if (!area) {
      area = {
        chave,
        cob: m.cob,
        ueop: nivelDeArea === "cob" ? null : m.ueop,
        nivel: null,
        contagem: contagemVazia(),
        totalMunicipios: 0,
        piorMunicipio: null,
      };
      areas.set(chave, area);
    }
    area.totalMunicipios++;
    const nivel = niveis.get(m.ibge);
    if (!nivel) continue;
    area.contagem[nivel]++;
    if (area.nivel === null || gravidade(nivel) > gravidade(area.nivel)) {
      area.piorMunicipio = { ibge: m.ibge, nome: m.nome };
    }
    area.nivel = maisGrave(area.nivel, nivel);
  }
  return [...areas.values()].sort((a, b) => COLLATOR.compare(a.chave, b.chave));
}
