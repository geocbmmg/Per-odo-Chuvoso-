import type { Feature, MultiPolygon, Point, Polygon } from "geojson";
import type {
  AcaoRrd,
  Alerta,
  FeicoesAcoesRrd,
  FeicoesAlertas,
  FeicoesCobs,
  FeicoesOcorrencias,
  LimiteCob,
  OcorrenciaComplexa,
  SituacaoOcorrencia,
} from "@/lib/dominio/tipos";
import { normalizarRotuloCob } from "@/lib/territorio";
import {
  comoDataIso,
  comoNumero,
  comoTexto,
  lerAtributo,
  resolverCampos,
  resumoResolucao,
  type MapaCampos,
} from "./campos";
import {
  CANDIDATOS_ACAO_RRD,
  CANDIDATOS_ALERTA,
  CANDIDATOS_COB,
  CANDIDATOS_OCORRENCIA,
} from "./camadas";
import type { CampoEsri, FeicaoEsri } from "./cliente";
import { poligonoEsriParaGeoJSON, pontoEsriParaGeoJSON } from "./geometria";

/**
 * Converte feições Esri em GeoJSON com atributos de domínio. Só os atributos
 * mapeados são copiados: qualquer outro campo do formulário (nome do militar,
 * nº BM, telefone, observações) é descartado aqui — nunca chega ao navegador.
 */

export interface Diagnostico {
  /** Atributo lógico → nome do campo resolvido (null = não encontrado). */
  campos: Record<string, string | null>;
  totalFeicoes: number;
  semGeometria: number;
}

export interface Normalizado<C> {
  feicoes: C;
  diagnostico: Diagnostico;
}

function idDaFeicao(atributos: Record<string, unknown>, campoId: string | undefined, indice: number): string {
  const candidatos = [campoId, "objectid", "OBJECTID", "globalid", "GlobalID", "FID"];
  for (const chave of candidatos) {
    if (chave && atributos[chave] !== undefined && atributos[chave] !== null) return String(atributos[chave]);
  }
  return `f${indice}`;
}

function texto<K extends string>(attrs: Record<string, unknown>, mapa: MapaCampos<K>, chave: K): string | null {
  return comoTexto(lerAtributo(attrs, mapa[chave]));
}

function data<K extends string>(attrs: Record<string, unknown>, mapa: MapaCampos<K>, chave: K): string | null {
  return comoDataIso(lerAtributo(attrs, mapa[chave]));
}

function campoIdDe(campos: CampoEsri[]): string | undefined {
  return campos.find((c) => c.type === "esriFieldTypeOID")?.name;
}

function normalizarPontos<P, K extends string>(
  campos: CampoEsri[],
  feicoes: FeicaoEsri[],
  candidatos: Record<K, readonly string[]>,
  construir: (attrs: Record<string, unknown>, mapa: MapaCampos<K>, id: string) => P,
): Normalizado<{ type: "FeatureCollection"; features: Feature<Point | null, P>[] }> {
  const mapa = resolverCampos(campos, candidatos);
  const campoId = campoIdDe(campos);
  let semGeometria = 0;
  const features = feicoes.map((f, i): Feature<Point | null, P> => {
    const attrs = f.attributes ?? {};
    const geometry = pontoEsriParaGeoJSON(f.geometry);
    if (!geometry) semGeometria++;
    const id = idDaFeicao(attrs, campoId, i);
    return { type: "Feature", id, geometry, properties: construir(attrs, mapa, id) };
  });
  return {
    feicoes: { type: "FeatureCollection", features },
    diagnostico: { campos: resumoResolucao(mapa), totalFeicoes: feicoes.length, semGeometria },
  };
}

export function normalizarAlertas(campos: CampoEsri[], feicoes: FeicaoEsri[]): Normalizado<FeicoesAlertas> {
  return normalizarPontos(campos, feicoes, CANDIDATOS_ALERTA, (attrs, mapa, id): Alerta => ({
    id,
    numeroChamada: texto(attrs, mapa, "numeroChamada"),
    cob: normalizarRotuloCob(lerAtributo(attrs, mapa.cob)),
    ueop: texto(attrs, mapa, "ueop"),
    municipio: texto(attrs, mapa, "municipio"),
    tipoRisco: texto(attrs, mapa, "tipoRisco"),
    nivel: texto(attrs, mapa, "nivel"),
    cota: comoNumero(lerAtributo(attrs, mapa.cota)),
    emitidoEm: data(attrs, mapa, "emitidoEm"),
  }));
}

export function normalizarAcoesRrd(campos: CampoEsri[], feicoes: FeicaoEsri[]): Normalizado<FeicoesAcoesRrd> {
  return normalizarPontos(campos, feicoes, CANDIDATOS_ACAO_RRD, (attrs, mapa, id): AcaoRrd => ({
    id,
    numeroChamada: texto(attrs, mapa, "numeroChamada"),
    cob: normalizarRotuloCob(lerAtributo(attrs, mapa.cob)),
    ueop: texto(attrs, mapa, "ueop"),
    municipio: texto(attrs, mapa, "municipio"),
    descricao: texto(attrs, mapa, "descricao"),
    executadaEm: data(attrs, mapa, "executadaEm"),
  }));
}

/** Classifica a situação a partir do texto livre/domínio do formulário. */
export function classificarSituacao(valor: string | null): SituacaoOcorrencia {
  if (!valor) return "desconhecida";
  const t = valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/finaliz|encerrad|conclu|extint/.test(t)) return "finalizada";
  if (/monitor/.test(t)) return "monitoramento";
  if (/andamento|ativa|em curso|aberta/.test(t)) return "em-andamento";
  return "desconhecida";
}

export function normalizarOcorrencias(
  campos: CampoEsri[],
  feicoes: FeicaoEsri[],
): Normalizado<FeicoesOcorrencias> {
  return normalizarPontos(campos, feicoes, CANDIDATOS_OCORRENCIA, (attrs, mapa, id): OcorrenciaComplexa => ({
    id,
    numeroChamada: texto(attrs, mapa, "numeroChamada"),
    titulo: texto(attrs, mapa, "titulo"),
    situacao: classificarSituacao(texto(attrs, mapa, "situacao")),
    cob: normalizarRotuloCob(lerAtributo(attrs, mapa.cob)),
    ueop: texto(attrs, mapa, "ueop"),
    municipio: texto(attrs, mapa, "municipio"),
    iniciadaEm: data(attrs, mapa, "iniciadaEm"),
  }));
}

export function normalizarCobs(campos: CampoEsri[], feicoes: FeicaoEsri[]): Normalizado<FeicoesCobs> {
  const mapa = resolverCampos(campos, CANDIDATOS_COB);
  const campoId = campoIdDe(campos);
  const features: Feature<Polygon | MultiPolygon, LimiteCob>[] = [];
  let semGeometria = 0;
  feicoes.forEach((f, i) => {
    const attrs = f.attributes ?? {};
    const geometry = poligonoEsriParaGeoJSON(f.geometry);
    if (!geometry) {
      semGeometria++;
      return;
    }
    const bruto = lerAtributo(attrs, mapa.cob);
    const cob = normalizarRotuloCob(bruto) ?? comoTexto(bruto) ?? `COB ${i + 1}`;
    features.push({ type: "Feature", id: idDaFeicao(attrs, campoId, i), geometry, properties: { cob } });
  });
  return {
    feicoes: { type: "FeatureCollection", features },
    diagnostico: { campos: resumoResolucao(mapa), totalFeicoes: feicoes.length, semGeometria },
  };
}
