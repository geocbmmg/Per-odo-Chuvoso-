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
import { NIVEIS_RISCO, nivelDoCodigoSurvey, type NivelRisco } from "@/lib/dominio/matrizes";
import { normalizarRotuloCob } from "@/lib/territorio";
import { buscarFracao, nomeMunicipio } from "@/lib/territorio/fracoes";
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
  CANDIDATOS_ACAO_RRD_REPETICAO,
  CANDIDATOS_ALERTA,
  CANDIDATOS_COB,
  CANDIDATOS_OCORRENCIA,
} from "./camadas";
import type { CampoEsri, FeicaoEsri } from "./cliente";
import { normalizarGuid } from "./deteccao";
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
  /** Tabela de repetição lida junto (ações da RRD). */
  repeticao?: {
    campos: Record<string, string | null>;
    totalRegistros: number;
    /** Registros ligados a algum registro principal. */
    vinculados: number;
  };
}

/** Registros de uma tabela de repetição e o campo que os liga ao registro principal. */
export interface Repeticao {
  campos: CampoEsri[];
  feicoes: FeicaoEsri[];
  campoPai: CampoEsri;
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

/**
 * Território de um registro. O formulário grava a fração completa no campo
 * "ueop" (ex.: código "1_BBM_2CIA_1PEL_Ouro_Preto_1_COB", rótulo
 * "1 BBM/2CIA/1PEL (Ouro Preto)"): pela tabela oficial ela é decomposta em
 * UEOp e fração, e completa o COB quando ele falta. Município em código do
 * formulário ("Acucena") vira o nome ("Açucena").
 */
function territorio<K extends string>(
  attrs: Record<string, unknown>,
  mapa: MapaCampos<K | "cob" | "ueop" | "fracao" | "municipio">,
): { cob: string | null; ueop: string | null; fracao: string | null; municipio: string | null } {
  const ueopBruta = lerAtributo(attrs, mapa.ueop);
  const fracaoOficial = buscarFracao(ueopBruta) ?? buscarFracao(attrs[mapa.ueop?.name ?? ""]);
  // O alias "Fração Responsável" do campo ueop também casa com os candidatos
  // de fração: nesse caso a fração sai da decomposição oficial, não do campo.
  const mesmoCampo = !!mapa.fracao && mapa.fracao.name === mapa.ueop?.name;
  const fracaoCampo = mesmoCampo ? null : comoTexto(lerAtributo(attrs, mapa.fracao));
  const cob = normalizarRotuloCob(lerAtributo(attrs, mapa.cob)) ?? fracaoOficial?.cob ?? null;
  return {
    cob,
    ueop: fracaoOficial?.ueop ?? comoTexto(ueopBruta),
    fracao: fracaoOficial?.fracao ?? fracaoCampo,
    municipio: nomeMunicipio(comoTexto(lerAtributo(attrs, mapa.municipio))),
  };
}

/**
 * Nível na escala única das matrizes: pelo código/rótulo do formulário
 * ("Laranja (Alto)", "Vermelho_Inundacao") ou pela cor no início do texto.
 */
export function nivelRiscoDoTexto(valor: string | null): NivelRisco | null {
  if (!valor) return null;
  const pelaMatriz = nivelDoCodigoSurvey(valor);
  if (pelaMatriz) return pelaMatriz;
  const cor = valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/^[a-z]+/)?.[0];
  return NIVEIS_RISCO.find((n) => n === cor) ?? null;
}

export function normalizarAlertas(campos: CampoEsri[], feicoes: FeicaoEsri[]): Normalizado<FeicoesAlertas> {
  return normalizarPontos(campos, feicoes, CANDIDATOS_ALERTA, (attrs, mapa, id): Alerta => {
    // Um campo de nível por tipo de risco no formulário: vale o primeiro preenchido.
    const nivel =
      texto(attrs, mapa, "nivel") ?? texto(attrs, mapa, "nivelHidrologico") ?? texto(attrs, mapa, "nivelGeologico");
    return {
      id,
      numeroChamada: texto(attrs, mapa, "numeroChamada"),
      ...territorio(attrs, mapa),
      tipoRisco: classificarTipoRisco(texto(attrs, mapa, "tipoRisco")),
      nivel,
      nivelRisco: nivelRiscoDoTexto(nivel),
      chuvaMmHora: comoNumero(lerAtributo(attrs, mapa.chuvaMmHora)),
      chuva24hMm: comoNumero(lerAtributo(attrs, mapa.chuva24hMm)),
      bacia: texto(attrs, mapa, "bacia"),
      rio: texto(attrs, mapa, "rio"),
      cota: comoNumero(lerAtributo(attrs, mapa.cota)),
      indiceRisco: comoNumero(lerAtributo(attrs, mapa.indiceRisco)),
      emitidoEm: data(attrs, mapa, "emitidoEm"),
      validoAte: data(attrs, mapa, "validoAte"),
    };
  });
}

/** Ações e nº REDS da repetição, agrupados pelo GlobalID do registro principal. */
function agruparRepeticao(repeticao: Repeticao) {
  const mapa = resolverCampos(repeticao.campos, CANDIDATOS_ACAO_RRD_REPETICAO);
  const porPai = new Map<string, { acoes: string[]; reds: string[] }>();
  for (const f of repeticao.feicoes) {
    const attrs = f.attributes ?? {};
    const pai = normalizarGuid(attrs[repeticao.campoPai.name]);
    if (!pai) continue;
    const grupo = porPai.get(pai) ?? { acoes: [], reds: [] };
    const acao = texto(attrs, mapa, "descricao");
    const reds = texto(attrs, mapa, "reds");
    if (acao) grupo.acoes.push(acao);
    if (reds && !grupo.reds.includes(reds)) grupo.reds.push(reds);
    porPai.set(pai, grupo);
  }
  return { mapa, porPai };
}

/**
 * Ações RRD. No formulário real cada ação é uma linha da repetição "Ações"
 * (tabela filha); sem repetição, vale o campo de descrição da própria camada.
 */
export function normalizarAcoesRrd(
  campos: CampoEsri[],
  feicoes: FeicaoEsri[],
  repeticao?: Repeticao,
): Normalizado<FeicoesAcoesRrd> {
  const filhos = repeticao ? agruparRepeticao(repeticao) : null;
  const campoGlobal = campos.find((c) => c.type === "esriFieldTypeGlobalID")?.name ?? "globalid";
  const vinculados = new Set<string>();
  const resultado = normalizarPontos(campos, feicoes, CANDIDATOS_ACAO_RRD, (attrs, mapa, id): AcaoRrd => {
    const pai = normalizarGuid(attrs[campoGlobal]);
    const grupo = pai ? filhos?.porPai.get(pai) : undefined;
    if (pai && grupo) vinculados.add(pai);
    const propria = texto(attrs, mapa, "descricao");
    const acoes = grupo?.acoes.length ? grupo.acoes : propria ? [propria] : [];
    return {
      id,
      numeroChamada: texto(attrs, mapa, "numeroChamada"),
      ...territorio(attrs, mapa),
      descricao: acoes.length ? acoes.join("; ") : null,
      acoes,
      reds: grupo?.reds ?? [],
      executadaEm: data(attrs, mapa, "executadaEm"),
    };
  });
  if (repeticao && filhos) {
    let ligados = 0;
    for (const f of repeticao.feicoes) {
      const pai = normalizarGuid(f.attributes?.[repeticao.campoPai.name]);
      if (pai && vinculados.has(pai)) ligados++;
    }
    // A descrição vem da repetição: não acusar "não encontrado" na camada principal.
    if (resultado.diagnostico.campos.descricao === null && filhos.mapa.descricao) {
      delete resultado.diagnostico.campos.descricao;
    }
    resultado.diagnostico.repeticao = {
      campos: { ...resumoResolucao(filhos.mapa), ligacao: repeticao.campoPai.name },
      totalRegistros: repeticao.feicoes.length,
      vinculados: ligados,
    };
  }
  return resultado;
}

/**
 * Tipo de risco canônico. Os rótulos do formulário real têm erros de digitação
 * ("Metereológico (Chuva)", "Hidrológico (Inuncação)"); o mapa de risco e os
 * gráficos agrupam pelas três categorias. Texto não reconhecido fica como veio.
 */
export function classificarTipoRisco(valor: string | null): string | null {
  if (!valor) return null;
  const t = valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/meteor|metereo|chuva|tempestade|vendaval|granizo/.test(t)) return "Meteorológico";
  if (/hidrol|inund|enchent|alag|cheia/.test(t)) return "Hidrológico";
  if (/geol|desliz|escorreg|movimento de massa|solapamento/.test(t)) return "Geológico";
  return valor;
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
    ...territorio(attrs, mapa),
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
