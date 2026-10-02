import { CORES_NIVEL, gravidade, type NivelRisco } from "@/lib/dominio/matrizes";
import {
  CAMADAS_RISCO,
  agregarPorArea,
  agruparPorMunicipio,
  type CamadaRisco,
  type CamadaRiscoId,
  type ItemRisco,
  type MunicipioTerritorio,
  type ResumoArea,
} from "@/lib/dominio/risco";
import type { Alerta } from "@/lib/dominio/tipos";
import { normalizarNumeroChamada } from "@/lib/sources/arcgis/campos";
import { municipioPorNome } from "@/lib/territorio/municipios";

/**
 * Regras puras do mapa de risco (docs/fase-1.md §5) que não dependem de uma
 * fonte: a camada "Alertas do CBMMG", a camada combinada (pior nível por
 * município entre as camadas) e o resumo por COB e por UEOp. Sem React, Next
 * ou server-only, como lib/dados/indicadores.ts.
 */

// ---------------------------------------------------------------------------------------------
// Camada "Alertas do CBMMG"
// ---------------------------------------------------------------------------------------------

/** Alerta sem validade informada conta como vigente por este tempo depois da emissão. */
export const HORAS_ALERTA_SEM_VALIDADE = 24;

/**
 * Vigente quando a validade não passou (`validoAte` >= agora) ou, sem validade,
 * quando foi emitido nas últimas 24 h. Bordas inclusivas.
 */
export function alertaVigente(alerta: Pick<Alerta, "emitidoEm" | "validoAte">, agora: Date): boolean {
  const t = agora.getTime();
  const fim = alerta.validoAte ? Date.parse(alerta.validoAte) : Number.NaN;
  if (!Number.isNaN(fim)) return fim >= t;
  const inicio = alerta.emitidoEm ? Date.parse(alerta.emitidoEm) : Number.NaN;
  return !Number.isNaN(inicio) && inicio <= t && t - inicio <= HORAS_ALERTA_SEM_VALIDADE * 3_600_000;
}

export interface DescartesAlertasCbmmg {
  /** Validade vencida (ou, sem validade, emitido há mais de 24 h). */
  foraDaVigencia: number;
  /** Nível fora da escala das matrizes. */
  semNivel: number;
  /** Município vazio ou não reconhecido na malha de MG. */
  semMunicipio: number;
  /** Mesmo nº de chamada, município e tipo (ex.: Survey123 e Sala): fica o mais recente. */
  repetidos: number;
}

export interface SelecaoAlertasCbmmg {
  itens: (ItemRisco & { ibge: string })[];
  descartados: DescartesAlertasCbmmg;
}

function tituloDoAlerta(alerta: Alerta, nivel: NivelRisco): string {
  return `${alerta.tipoRisco ?? "Alerta"} · ${alerta.nivel ?? CORES_NIVEL[nivel].nome}`;
}

/**
 * Alertas vigentes com nível e município reconhecidos, um item por alerta.
 * Deduplica pelo nº da chamada CAD + município + tipo de risco (docs/fase-1.md
 * §4.6), mantendo o emitido por último. Alerta sem nº de chamada não é deduplicado.
 */
export function selecionarAlertasCbmmg(alertas: readonly Alerta[], agora: Date): SelecaoAlertasCbmmg {
  const descartados: DescartesAlertasCbmmg = { foraDaVigencia: 0, semNivel: 0, semMunicipio: 0, repetidos: 0 };
  const porChave = new Map<string, { alerta: Alerta; item: ItemRisco & { ibge: string } }>();
  const semChave: (ItemRisco & { ibge: string })[] = [];

  for (const alerta of alertas) {
    if (!alertaVigente(alerta, agora)) {
      descartados.foraDaVigencia++;
      continue;
    }
    const nivel = alerta.nivelRisco;
    if (!nivel) {
      descartados.semNivel++;
      continue;
    }
    const municipio = municipioPorNome(alerta.municipio);
    if (!municipio) {
      descartados.semMunicipio++;
      continue;
    }
    const item = {
      ibge: municipio.ibge,
      nivel,
      titulo: tituloDoAlerta(alerta, nivel),
      fonte: "CBMMG",
      inicio: alerta.emitidoEm,
      fim: alerta.validoAte,
      ref: alerta.numeroChamada,
    };
    const numero = normalizarNumeroChamada(alerta.numeroChamada);
    if (!numero) {
      semChave.push(item);
      continue;
    }
    const chave = `${numero}|${municipio.ibge}|${alerta.tipoRisco ?? ""}`;
    const anterior = porChave.get(chave);
    if (anterior) {
      descartados.repetidos++;
      if ((anterior.alerta.emitidoEm ?? "") >= (alerta.emitidoEm ?? "")) continue;
    }
    porChave.set(chave, { alerta, item });
  }
  return { itens: [...[...porChave.values()].map((v) => v.item), ...semChave], descartados };
}

export const COBERTURA_ALERTAS_CBMMG =
  "Alertas emitidos pelo CBMMG ainda vigentes (validade não vencida ou, sem validade, emitidos nas últimas 24 h).";

/**
 * Camada "Alertas do CBMMG": o `nivelRisco` de cada alerta vigente, por
 * município (vale o mais grave). Recebe alertas de qualquer origem — formulário
 * Survey123 hoje, fila da Sala depois — já no tipo de domínio `Alerta`.
 */
export function camadaAlertasCbmmg(alertas: readonly Alerta[], agora: Date): CamadaRisco {
  return camadaDaSelecaoCbmmg(selecionarAlertasCbmmg(alertas, agora));
}

/** A mesma camada a partir de uma seleção já feita (para aproveitar os descartes). */
export function camadaDaSelecaoCbmmg(selecao: SelecaoAlertasCbmmg): CamadaRisco {
  return {
    id: "alertas-cbmmg",
    municipios: agruparPorMunicipio(selecao.itens),
    cobertura: COBERTURA_ALERTAS_CBMMG,
    credito: "CBMMG",
  };
}

// ---------------------------------------------------------------------------------------------
// Camada combinada e resumo por área
// ---------------------------------------------------------------------------------------------

export interface ItemRiscoCombinado extends ItemRisco {
  camada: CamadaRiscoId;
}

export interface RiscoMunicipioCombinado {
  ibge: string;
  /** Pior nível entre as camadas. */
  nivel: NivelRisco;
  /** Camadas com algum item no município, na ordem de CAMADAS_RISCO. */
  camadas: CamadaRiscoId[];
  /** Itens de todas as camadas, do mais grave ao menos grave. */
  itens: ItemRiscoCombinado[];
}

/** Junta as camadas disponíveis: pior nível por município, com os itens de todas. */
export function combinarCamadas(camadas: readonly CamadaRisco[]): RiscoMunicipioCombinado[] {
  const ordem = (id: CamadaRiscoId) => CAMADAS_RISCO.indexOf(id);
  const porIbge = new Map<string, ItemRiscoCombinado[]>();
  for (const camada of camadas) {
    for (const m of camada.municipios) {
      const lista = porIbge.get(m.ibge) ?? [];
      lista.push(...m.itens.map((item) => ({ ...item, camada: camada.id })));
      porIbge.set(m.ibge, lista);
    }
  }
  return [...porIbge.entries()]
    .map(([ibge, itens]) => {
      const ordenados = [...itens].sort(
        (a, b) => gravidade(b.nivel) - gravidade(a.nivel) || ordem(a.camada) - ordem(b.camada),
      );
      const ids = [...new Set(ordenados.map((i) => i.camada))].sort((a, b) => ordem(a) - ordem(b));
      return { ibge, nivel: ordenados[0].nivel, camadas: ids, itens: ordenados };
    })
    .sort((a, b) => a.ibge.localeCompare(b.ibge));
}

export interface AreasRisco {
  cob: ResumoArea[];
  ueop: ResumoArea[];
}

/** Resumo por COB e por UEOp (zoom do mapa), a partir do nível de cada município. */
export function areasDeRisco(
  municipios: readonly MunicipioTerritorio[],
  riscos: readonly { ibge: string; nivel: NivelRisco }[],
): AreasRisco {
  const niveis = new Map(riscos.map((r) => [r.ibge, r.nivel]));
  return { cob: agregarPorArea(municipios, niveis, "cob"), ueop: agregarPorArea(municipios, niveis, "ueop") };
}
