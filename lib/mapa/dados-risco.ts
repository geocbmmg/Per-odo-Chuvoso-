import type { Feature, MultiPolygon, Polygon } from "geojson";
import { JANELAS_MAPA, type ColecaoPoligonos, type RespostaChuvaMapa, type RespostaRiscoMapa } from "./risco";
import { CAMADAS_RISCO } from "@/lib/dominio/risco";

/**
 * Leitura no NAVEGADOR dos dados do mapa de risco: GET /api/chuva, GET
 * /api/risco e as malhas estáticas de public/geo. As rotas da API já fazem o
 * cache e a última leitura válida no servidor; aqui só se confere o formato
 * (uma resposta estranha vira "fonte indisponível", nunca um mapa quebrado).
 */

export const URL_API_CHUVA = "/api/chuva";
export const URL_API_RISCO = "/api/risco";
export const URL_MALHA_MUNICIPIOS = "/geo/municipios-mg.json";
export const URL_MALHA_UEOPS = "/geo/ueops-mg.json";

/** A série da chuva fica 3 h em cache na fonte; as janelas andam a cada hora cheia. */
export const INTERVALO_CHUVA_MS = 10 * 60 * 1000;
/** INMET e CEMADEN ficam 10 min em cache no servidor. */
export const INTERVALO_RISCO_MS = 5 * 60 * 1000;

export class ErroDadosMapa extends Error {
  constructor(
    mensagem: string,
    public readonly status: number | null = null,
  ) {
    super(mensagem);
    this.name = "ErroDadosMapa";
  }
}

function objeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function areasValidas(valor: unknown): boolean {
  return objeto(valor) && Array.isArray(valor.cob) && Array.isArray(valor.ueop);
}

function metaValida(valor: unknown): boolean {
  return objeto(valor) && typeof valor.atualizadoEm === "string" && typeof valor.origem === "string";
}

/** Confere o corpo de GET /api/chuva. */
export function interpretarRespostaChuva(corpo: unknown): RespostaChuvaMapa {
  const ok =
    objeto(corpo) &&
    metaValida(corpo.meta) &&
    Array.isArray(corpo.municipios) &&
    objeto(corpo.areas) &&
    JANELAS_MAPA.every((j) => areasValidas((corpo.areas as Record<string, unknown>)[j])) &&
    objeto(corpo.ranking) &&
    Array.isArray(corpo.ranking.acumulado24h) &&
    Array.isArray(corpo.ranking.pior24hEm72h);
  if (!ok) throw new ErroDadosMapa("Resposta da chuva prevista em formato inesperado.");
  return corpo as unknown as RespostaChuvaMapa;
}

/** Confere o corpo de GET /api/risco (cada camada pode vir indisponível). */
export function interpretarRespostaRisco(corpo: unknown): RespostaRiscoMapa {
  const ok =
    objeto(corpo) &&
    objeto(corpo.camadas) &&
    CAMADAS_RISCO.every((id) => {
      const camada = (corpo.camadas as Record<string, unknown>)[id];
      if (!objeto(camada)) return false;
      if (camada.camada === null) return true;
      return objeto(camada.camada) && Array.isArray(camada.camada.municipios) && areasValidas(camada.areas);
    }) &&
    objeto(corpo.combinado) &&
    Array.isArray(corpo.combinado.municipios) &&
    areasValidas(corpo.combinado.areas) &&
    Array.isArray(corpo.combinado.indisponiveis);
  if (!ok) throw new ErroDadosMapa("Resposta do mapa de risco em formato inesperado.");
  return corpo as unknown as RespostaRiscoMapa;
}

function poligonal(f: unknown): f is Feature<Polygon | MultiPolygon, Record<string, unknown>> {
  if (!objeto(f) || f.type !== "Feature" || !objeto(f.geometry)) return false;
  const tipo = f.geometry.type;
  return (tipo === "Polygon" || tipo === "MultiPolygon") && Array.isArray(f.geometry.coordinates);
}

/**
 * Confere uma malha de polígonos (municípios, UEOp ou COBs) e mantém só as
 * feições com a propriedade que identifica a área (`ibge`, `chave`, `cob`).
 */
export function interpretarMalha(corpo: unknown, propriedade: string): ColecaoPoligonos {
  if (!objeto(corpo) || corpo.type !== "FeatureCollection" || !Array.isArray(corpo.features)) {
    throw new ErroDadosMapa("Malha do mapa em formato inesperado.");
  }
  const features = (corpo.features as unknown[]).filter(
    (f): f is Feature<Polygon | MultiPolygon, Record<string, unknown>> =>
      poligonal(f) && typeof (f.properties ?? {})[propriedade] === "string",
  );
  return { type: "FeatureCollection", features };
}

/** Mensagem amigável de uma resposta não-OK (a rota manda { erro } no 503). */
export function mensagemDeFalhaMapa(status: number, corpo: unknown): string {
  if (objeto(corpo) && typeof corpo.erro === "string" && corpo.erro.trim()) return corpo.erro.trim();
  if (status === 503) return "Fonte indisponível no momento.";
  return `Falha ao carregar os dados (HTTP ${status}).`;
}

type Buscar = (entrada: string, init?: RequestInit) => Promise<Response>;

export interface OpcoesCarga {
  signal?: AbortSignal;
  buscar?: Buscar;
  /** "force-cache" para os arquivos estáticos (malhas). */
  cache?: RequestCache;
}

function ehAbortamento(erro: unknown): boolean {
  return erro instanceof DOMException && erro.name === "AbortError";
}

/** Busca e interpreta um JSON. Respeita o AbortSignal; lança ErroDadosMapa em falha. */
export async function carregarJsonMapa<T>(
  url: string,
  interpretar: (corpo: unknown) => T,
  opcoes: OpcoesCarga = {},
): Promise<T> {
  const buscar = opcoes.buscar ?? ((entrada, init) => fetch(entrada, init));
  let resposta: Response;
  try {
    resposta = await buscar(url, {
      signal: opcoes.signal,
      headers: { Accept: "application/json" },
      cache: opcoes.cache ?? "no-store",
    });
  } catch (erro) {
    if (ehAbortamento(erro)) throw erro;
    throw new ErroDadosMapa("Sem conexão com o servidor.");
  }
  let corpo: unknown = null;
  try {
    corpo = await resposta.json();
  } catch (erro) {
    if (ehAbortamento(erro)) throw erro;
  }
  if (!resposta.ok) throw new ErroDadosMapa(mensagemDeFalhaMapa(resposta.status, corpo), resposta.status);
  return interpretar(corpo);
}
