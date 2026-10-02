import type { Feature, FeatureCollection, Geometry } from "geojson";
import { dentroDoPeriodo } from "@/lib/dominio/periodo";
import { CAMADAS_MAPA, SEM_COB, type CamadaMapaId, type Periodo } from "@/lib/dominio/tipos";
import type { FonteId, OrigemLeitura } from "@/lib/fontes/tipos";

/**
 * Leitura das camadas do mapa no NAVEGADOR: GET /api/arcgis/{camada}.
 *
 * Contrato da rota: 200 com um GeoJSON FeatureCollection (properties no
 * formato de lib/dominio/tipos.ts) mais o membro estrangeiro "meta"; em
 * falha total, 503 com { erro, fonte }.
 */

export interface MetaCamada {
  fonte: FonteId;
  /** ISO 8601 (UTC) da leitura válida. */
  atualizadoEm: string;
  origem: OrigemLeitura;
  erro?: string;
  /** Nome da camada no catálogo (ex.: "Emissão de Alertas"). */
  camada?: string;
}

export type ColecaoMapa = FeatureCollection<Geometry, Record<string, unknown>>;

export interface DadosCamada {
  /** Só as feições com geometria válida (o que vai para o mapa). */
  colecao: ColecaoMapa;
  /** Todas as feições recebidas, inclusive sem localização (para contagens). */
  propriedades: Record<string, unknown>[];
  /** Feições sem geometria utilizável (não aparecem no mapa, mas contam). */
  semLocalizacao: number;
  meta: MetaCamada | null;
}

export class ErroCamada extends Error {
  constructor(
    public readonly camada: CamadaMapaId,
    mensagem: string,
    public readonly status: number | null = null,
  ) {
    super(mensagem);
    this.name = "ErroCamada";
  }
}

export function ehCamadaMapa(valor: unknown): valor is CamadaMapaId {
  return typeof valor === "string" && (CAMADAS_MAPA as readonly string[]).includes(valor);
}

export function urlCamada(camada: CamadaMapaId): string {
  return `/api/arcgis/${encodeURIComponent(camada)}`;
}

function objeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function numeroFinito(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor);
}

function posicaoValida(valor: unknown): boolean {
  return (
    Array.isArray(valor) &&
    valor.length >= 2 &&
    numeroFinito(valor[0]) &&
    numeroFinito(valor[1]) &&
    Math.abs(valor[0]) <= 180 &&
    Math.abs(valor[1]) <= 90
  );
}

function anelValido(valor: unknown): boolean {
  return Array.isArray(valor) && valor.length >= 4 && valor.every(posicaoValida);
}

function poligonoValido(valor: unknown): boolean {
  return Array.isArray(valor) && valor.length >= 1 && valor.every(anelValido);
}

/** Geometria que o mapa sabe desenhar: Point para pontos; Polygon/MultiPolygon para os COBs. */
export function geometriaValida(geometria: unknown, camada: CamadaMapaId): geometria is Geometry {
  if (!objeto(geometria)) return false;
  const { type, coordinates } = geometria;
  if (camada === "cobs") {
    if (type === "Polygon") return poligonoValido(coordinates);
    if (type === "MultiPolygon") return Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every(poligonoValido);
    return false;
  }
  if (type !== "Point" || !posicaoValida(coordinates)) return false;
  // Survey123 grava 0,0 quando o ponto não foi informado.
  const [x, y] = coordinates as number[];
  return !(x === 0 && y === 0);
}

function lerMeta(valor: unknown): MetaCamada | null {
  if (!objeto(valor)) return null;
  const { fonte, atualizadoEm, origem, erro, camada } = valor;
  if (typeof fonte !== "string" || typeof atualizadoEm !== "string" || typeof origem !== "string") return null;
  const meta: MetaCamada = {
    fonte: fonte as FonteId,
    atualizadoEm,
    origem: origem as OrigemLeitura,
  };
  if (typeof erro === "string" && erro) meta.erro = erro;
  if (typeof camada === "string" && camada) meta.camada = camada;
  return meta;
}

/**
 * Valida o corpo de /api/arcgis/{camada}. Feições sem geometria válida ficam
 * fora do mapa e são contadas em `semLocalizacao`. Lança ErroCamada se o
 * corpo não for um FeatureCollection.
 */
export function interpretarRespostaCamada(camada: CamadaMapaId, corpo: unknown): DadosCamada {
  if (!objeto(corpo) || corpo.type !== "FeatureCollection" || !Array.isArray(corpo.features)) {
    throw new ErroCamada(camada, "Resposta da camada em formato inesperado.");
  }
  const validas: Feature<Geometry, Record<string, unknown>>[] = [];
  const propriedades: Record<string, unknown>[] = [];
  let semLocalizacao = 0;
  for (const feicao of corpo.features as unknown[]) {
    if (!objeto(feicao) || feicao.type !== "Feature") continue;
    const props = objeto(feicao.properties) ? feicao.properties : {};
    propriedades.push(props);
    if (!geometriaValida(feicao.geometry, camada)) {
      semLocalizacao++;
      continue;
    }
    const nova: Feature<Geometry, Record<string, unknown>> = {
      type: "Feature",
      geometry: feicao.geometry,
      properties: props,
    };
    if (typeof feicao.id === "string" || typeof feicao.id === "number") nova.id = feicao.id;
    validas.push(nova);
  }
  return {
    colecao: { type: "FeatureCollection", features: validas },
    propriedades,
    semLocalizacao,
    meta: lerMeta(corpo.meta),
  };
}

/** Mensagem de erro amigável a partir de uma resposta não-OK da rota. */
export function mensagemDeFalha(status: number, corpo: unknown): string {
  if (objeto(corpo) && typeof corpo.erro === "string" && corpo.erro.trim()) return corpo.erro.trim();
  if (status === 503) return "Fonte indisponível no momento.";
  if (status === 404) return "Camada não encontrada.";
  return `Falha ao carregar a camada (HTTP ${status}).`;
}

type Buscar = (entrada: string, init?: RequestInit) => Promise<Response>;

/** Busca e interpreta uma camada. Respeita o AbortSignal; lança ErroCamada em falha. */
export async function carregarCamada(
  camada: CamadaMapaId,
  opcoes: { signal?: AbortSignal; buscar?: Buscar } = {},
): Promise<DadosCamada> {
  const buscar = opcoes.buscar ?? ((entrada, init) => fetch(entrada, init));
  let resposta: Response;
  try {
    resposta = await buscar(urlCamada(camada), {
      signal: opcoes.signal,
      headers: { Accept: "application/geo+json, application/json" },
      cache: "no-store",
    });
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === "AbortError") throw erro;
    throw new ErroCamada(camada, "Sem conexão com o servidor.");
  }
  let corpo: unknown = null;
  try {
    corpo = await resposta.json();
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === "AbortError") throw erro;
    corpo = null;
  }
  if (!resposta.ok) throw new ErroCamada(camada, mensagemDeFalha(resposta.status, corpo), resposta.status);
  return interpretarRespostaCamada(camada, corpo);
}

// ── Filtro por período (mesma regra de lib/dados/indicadores.ts) ────────────

export type IntervaloPeriodo = Pick<Periodo, "inicio" | "fim">;

/** Campo de data de cada camada pontual (período, lista de registros). */
export const CAMPO_DATA_DA_CAMADA: Partial<Record<CamadaMapaId, string>> = {
  alertas: "emitidoEm",
  "acoes-rrd": "executadaEm",
  "ocorrencias-complexas": "iniciadaEm",
};

function textoOuNull(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null;
}

/**
 * O registro entra no período? Alertas e ações RRD pela data; ocorrências em
 * andamento/monitoramento contam sempre, finalizadas só no período. COBs sempre.
 */
export function registroNoPeriodo(
  camada: CamadaMapaId,
  props: Record<string, unknown>,
  periodo: IntervaloPeriodo | null | undefined,
): boolean {
  if (!periodo || (!periodo.inicio && !periodo.fim)) return true;
  const campo = CAMPO_DATA_DA_CAMADA[camada];
  if (!campo) return true;
  const alvo = { id: "atual" as const, rotulo: "", inicio: periodo.inicio, fim: periodo.fim };
  if (camada === "ocorrencias-complexas" && props.situacao !== "finalizada") return true;
  return dentroDoPeriodo(textoOuNull(props[campo]), alvo);
}

/** Aplica o período aos dados de uma camada (mapa e contagens). */
export function filtrarPorPeriodo(
  camada: CamadaMapaId,
  dados: DadosCamada,
  periodo: IntervaloPeriodo | null | undefined,
): DadosCamada {
  if (!periodo || (!periodo.inicio && !periodo.fim) || !CAMPO_DATA_DA_CAMADA[camada]) return dados;
  const features = dados.colecao.features.filter((f) => registroNoPeriodo(camada, f.properties ?? {}, periodo));
  const propriedades = dados.propriedades.filter((p) => registroNoPeriodo(camada, p, periodo));
  return {
    ...dados,
    colecao: { type: "FeatureCollection", features },
    propriedades,
    semLocalizacao: propriedades.length - features.length,
  };
}

/** Quantidade de registros por COB (para o balão do COB). Sem COB → "Sem COB". */
export function contarPorCob(propriedades: readonly Record<string, unknown>[]): Map<string, number> {
  const contagem = new Map<string, number>();
  for (const p of propriedades) {
    const cob = typeof p.cob === "string" && p.cob ? p.cob : SEM_COB;
    contagem.set(cob, (contagem.get(cob) ?? 0) + 1);
  }
  return contagem;
}
