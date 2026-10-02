import "server-only";
import { metaDaLeitura, type MetaLeitura } from "@/lib/api/respostas";
import { nivelNaJanela, type ChuvaMunicipio, type JanelaChuva } from "@/lib/dominio/chuva";
import type { NivelRisco } from "@/lib/dominio/matrizes";
import { agregarPorArea, type ResumoArea } from "@/lib/dominio/risco";
import { CATALOGO_FONTES } from "@/lib/fontes/catalogo";
import { obterSeriesChuvaMunicipios } from "@/lib/sources/open-meteo/municipios";
import { resumirCacheChuva, type CacheChuvaMunicipios } from "@/lib/sources/open-meteo/parser-municipios";
import { MUNICIPIOS_MG, type MunicipioMg } from "@/lib/territorio/municipios";

/**
 * Chuva prevista por município no modelo do GeoRisk (docs/fase-1.md §6): as
 * 853 sedes classificadas pela matriz de chuva nas janelas de 24 h e 72 h, o
 * resumo por COB e por UEOp (zoom do mapa) e o ranking dos municípios.
 *
 * A série da Open-Meteo fica em cache por 3 h; as janelas são recalculadas a
 * cada chamada a partir de `agora`.
 */

export const JANELAS_CHUVA: readonly JanelaChuva[] = ["24h", "72h"];

/** Quantos municípios entram em cada ranking. */
export const TAMANHO_RANKING = 15;

export interface AreasChuva {
  /** Uma linha por COB. */
  cob: ResumoArea[];
  /** Uma linha por COB · UEOp (área aproximada, ver lib/territorio/municipios.ts). */
  ueop: ResumoArea[];
}

export interface ItemRankingChuva extends ChuvaMunicipio {
  nome: string;
  cob: string;
  ueop: string;
  /** Nível na janela do ranking (24 h para `acumulado24h`, 72 h para `pior24hEm72h`). */
  nivel: NivelRisco | null;
}

export interface RankingChuva {
  /** Maior acumulado nas próximas 24 h. */
  acumulado24h: ItemRankingChuva[];
  /** Maior acumulado em 24 h consecutivas dentro das próximas 72 h. */
  pior24hEm72h: ItemRankingChuva[];
}

export interface PainelChuva {
  /** ISO (UTC) da hora cheia corrente: as janelas cobrem [inicioJanela, inicioJanela + 24 h / 72 h]. */
  inicioJanela: string;
  /** Modelo da Open-Meteo (ex.: "best_match"). */
  modelo: string;
  /** Os 853 municípios, na ordem de MUNICIPIOS_MG. */
  municipios: ChuvaMunicipio[];
  areas: Record<JanelaChuva, AreasChuva>;
  ranking: RankingChuva;
}

export interface ChuvaMunicipiosComMeta extends PainelChuva {
  meta: MetaLeitura;
  /** Atribuição exigida pela fonte. */
  credito: string;
}

function ranking(
  chuvas: readonly ChuvaMunicipio[],
  porIbge: ReadonlyMap<string, MunicipioMg>,
  campo: "acumulado24h" | "pior24hEm72h",
  janela: JanelaChuva,
): ItemRankingChuva[] {
  return chuvas
    .filter((c) => (c[campo] ?? 0) > 0 && porIbge.has(c.ibge))
    .map((c) => {
      const m = porIbge.get(c.ibge)!;
      return { ...c, nome: m.nome, cob: m.cob, ueop: m.ueop, nivel: nivelNaJanela(c, janela) };
    })
    .sort((a, b) => b[campo]! - a[campo]! || a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, TAMANHO_RANKING);
}

/** Monta o painel a partir do cache compacto. Puro (exportado para os testes). */
export function montarPainelChuva(
  cache: CacheChuvaMunicipios,
  agora: Date,
  municipios: readonly MunicipioMg[] = MUNICIPIOS_MG,
): PainelChuva {
  const resumo = resumirCacheChuva(
    cache,
    municipios.map((m) => m.ibge),
    agora,
  );
  const porIbge = new Map(municipios.map((m) => [m.ibge, m]));

  const areas = Object.fromEntries(
    JANELAS_CHUVA.map((janela) => {
      const niveis = new Map<string, NivelRisco>();
      for (const c of resumo.municipios) {
        const nivel = nivelNaJanela(c, janela);
        if (nivel) niveis.set(c.ibge, nivel);
      }
      return [janela, { cob: agregarPorArea(municipios, niveis, "cob"), ueop: agregarPorArea(municipios, niveis, "ueop") }];
    }),
  ) as Record<JanelaChuva, AreasChuva>;

  return {
    inicioJanela: resumo.inicioJanela,
    modelo: resumo.modelo,
    municipios: resumo.municipios,
    areas,
    ranking: {
      acumulado24h: ranking(resumo.municipios, porIbge, "acumulado24h", "24h"),
      pior24hEm72h: ranking(resumo.municipios, porIbge, "pior24hEm72h", "72h"),
    },
  };
}

/**
 * Chuva prevista nos 853 municípios, com o carimbo da leitura. Lança
 * FonteIndisponivelError quando a Open-Meteo falha e não há leitura válida.
 */
export async function obterChuvaMunicipios(agora: Date = new Date()): Promise<ChuvaMunicipiosComMeta> {
  const leitura = await obterSeriesChuvaMunicipios(agora);
  return {
    meta: metaDaLeitura(leitura),
    credito: CATALOGO_FONTES["open-meteo-municipios"].credito,
    ...montarPainelChuva(leitura.dados, agora),
  };
}
