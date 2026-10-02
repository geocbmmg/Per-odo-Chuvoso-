import { buscarJson, type OpcoesBusca } from "@/lib/fontes/http";

/**
 * Cliente REST do ArcGIS Enterprise — SOMENTE LEITURA.
 *
 * Só monta URLs de metadados (`.../FeatureServer/layers?f=json` e
 * `.../FeatureServer/<n>?f=json`) e de consulta (`.../FeatureServer/<n>/query`).
 * Não existe função para applyEdits, addFeatures, updateFeatures ou
 * deleteFeatures, e os montadores de URL recusam qualquer caminho que não seja
 * um FeatureServer ou uma camada dele.
 */

export type TipoCampoEsri =
  | "esriFieldTypeOID"
  | "esriFieldTypeGlobalID"
  | "esriFieldTypeGUID"
  | "esriFieldTypeString"
  | "esriFieldTypeInteger"
  | "esriFieldTypeSmallInteger"
  | "esriFieldTypeBigInteger"
  | "esriFieldTypeDouble"
  | "esriFieldTypeSingle"
  | "esriFieldTypeDate"
  | "esriFieldTypeDateOnly"
  | "esriFieldTypeTimeOnly"
  | "esriFieldTypeTimestampOffset"
  | "esriFieldTypeGeometry"
  | "esriFieldTypeBlob"
  | "esriFieldTypeRaster"
  | "esriFieldTypeXML";

export interface DominioCodificado {
  type: "codedValue";
  name?: string;
  codedValues: { name: string; code: string | number }[];
}

export interface CampoEsri {
  name: string;
  type: TipoCampoEsri | string;
  alias?: string;
  domain?: DominioCodificado | { type: string } | null;
}

export interface GeometriaEsriPonto {
  x: number;
  y: number;
}

export interface GeometriaEsriPoligono {
  rings: number[][][];
}

export type GeometriaEsri = GeometriaEsriPonto | GeometriaEsriPoligono | Record<string, unknown>;

export interface FeicaoEsri {
  attributes: Record<string, unknown>;
  geometry?: GeometriaEsri | null;
}

export interface RespostaConsultaEsri {
  objectIdFieldName?: string;
  geometryType?: string;
  spatialReference?: { wkid?: number; latestWkid?: number };
  fields?: CampoEsri[];
  features: FeicaoEsri[];
  exceededTransferLimit?: boolean;
}

export interface MetadadosCamadaEsri {
  id: number;
  name: string;
  /** "Feature Layer" ou "Table" (as repetições do Survey123 costumam ser tabelas). */
  type: string;
  geometryType?: string | null;
  fields: CampoEsri[];
  maxRecordCount?: number;
  objectIdField?: string;
  editingInfo?: { lastEditDate?: number };
  advancedQueryCapabilities?: { supportsPagination?: boolean };
}

interface ErroEsri {
  error: { code?: number; message?: string; details?: string[] };
}

export class ErroArcGIS extends Error {
  constructor(
    mensagem: string,
    public readonly codigo?: number,
  ) {
    super(mensagem);
    this.name = "ErroArcGIS";
  }
}

function ehErroEsri(valor: unknown): valor is ErroEsri {
  return typeof valor === "object" && valor !== null && "error" in valor;
}

/** O ArcGIS devolve erros com HTTP 200 e corpo {"error": {...}}. */
function verificarErro(corpo: unknown): void {
  if (ehErroEsri(corpo)) {
    const { code, message, details } = corpo.error;
    const detalhe = details?.filter(Boolean).join("; ");
    throw new ErroArcGIS(
      `ArcGIS ${code ?? ""}: ${message ?? "erro desconhecido"}${detalhe ? ` (${detalhe})` : ""}`.replace(
        "ArcGIS : ",
        "ArcGIS: ",
      ),
      code,
    );
  }
}

/**
 * URL de um FeatureServer: `<base>/<servico>/FeatureServer`.
 * `servico` é só o nome (ex.: "MG_DISSOLVIDO_COB"), sem barras.
 */
export function montarUrlServico(base: string, servico: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(servico)) {
    throw new ErroArcGIS(`Nome de serviço inválido: ${servico}`);
  }
  return `${base.replace(/\/+$/, "")}/${servico}/FeatureServer`;
}

/** URL de uma camada: `<base>/<servico>/FeatureServer/<camada>`. */
export function montarUrlCamada(base: string, servico: string, camada: number): string {
  if (!Number.isInteger(camada) || camada < 0) {
    throw new ErroArcGIS(`Índice de camada inválido: ${camada}`);
  }
  return `${montarUrlServico(base, servico)}/${camada}`;
}

export interface ParametrosConsulta {
  where?: string;
  outFields?: string[] | "*";
  returnGeometry?: boolean;
  orderByFields?: string;
  /** Simplificação de geometria em graus (outSR 4326), útil para polígonos grandes. */
  maxAllowableOffset?: number;
  geometryPrecision?: number;
}

export function montarUrlConsulta(
  urlCamada: string,
  parametros: ParametrosConsulta,
  pagina?: { offset: number; tamanho: number },
): string {
  const busca = new URLSearchParams({
    where: parametros.where ?? "1=1",
    outFields: parametros.outFields === undefined || parametros.outFields === "*"
      ? "*"
      : parametros.outFields.join(","),
    returnGeometry: String(parametros.returnGeometry ?? true),
    outSR: "4326",
    f: "json",
  });
  if (parametros.orderByFields) busca.set("orderByFields", parametros.orderByFields);
  if (parametros.maxAllowableOffset !== undefined) {
    busca.set("maxAllowableOffset", String(parametros.maxAllowableOffset));
  }
  if (parametros.geometryPrecision !== undefined) {
    busca.set("geometryPrecision", String(parametros.geometryPrecision));
  }
  if (pagina) {
    busca.set("resultOffset", String(pagina.offset));
    busca.set("resultRecordCount", String(pagina.tamanho));
  }
  return `${urlCamada}/query?${busca.toString()}`;
}

/** Camadas e tabelas de um FeatureServer, cada uma com a lista completa de campos. */
export interface CamadasServicoEsri {
  layers: MetadadosCamadaEsri[];
  tables: MetadadosCamadaEsri[];
}

/**
 * Lê `<FeatureServer>/layers?f=json`: todas as camadas e tabelas do serviço,
 * com campos e domínios, numa só chamada. É o que permite escolher a camada
 * certa do formulário (ver deteccao.ts) e achar a tabela de repetição.
 */
export async function lerCamadasServico(
  urlServico: string,
  opcoes: OpcoesBusca = {},
): Promise<CamadasServicoEsri> {
  const corpo = await buscarJson<unknown>(`${urlServico}/layers?f=json`, opcoes);
  verificarErro(corpo);
  const resposta = corpo as Partial<CamadasServicoEsri>;
  const validas = (lista: unknown): MetadadosCamadaEsri[] =>
    Array.isArray(lista)
      ? lista.filter(
          (c): c is MetadadosCamadaEsri =>
            typeof c === "object" && c !== null && Number.isInteger((c as MetadadosCamadaEsri).id) &&
            Array.isArray((c as MetadadosCamadaEsri).fields),
        )
      : [];
  const camadas = { layers: validas(resposta.layers), tables: validas(resposta.tables) };
  if (camadas.layers.length + camadas.tables.length === 0) {
    throw new ErroArcGIS("Serviço sem camadas ou tabelas com lista de campos");
  }
  return camadas;
}

/**
 * Consulta todas as feições, paginando por resultOffset enquanto o servidor
 * sinalizar exceededTransferLimit. `limite` protege contra camadas enormes.
 */
export async function consultarTodas(
  urlCamada: string,
  parametros: ParametrosConsulta = {},
  opcoes: OpcoesBusca & { tamanhoPagina?: number; limite?: number } = {},
): Promise<RespostaConsultaEsri> {
  const tamanho = opcoes.tamanhoPagina ?? 1000;
  const limite = opcoes.limite ?? 20000;
  const acumuladas: FeicaoEsri[] = [];
  let primeira: RespostaConsultaEsri | null = null;
  let offset = 0;

  for (;;) {
    const corpo = await buscarJson<unknown>(
      montarUrlConsulta(urlCamada, parametros, { offset, tamanho }),
      opcoes,
    );
    verificarErro(corpo);
    const resposta = corpo as RespostaConsultaEsri;
    if (!Array.isArray(resposta.features)) {
      throw new ErroArcGIS("Resposta de consulta sem lista de feições");
    }
    primeira ??= resposta;
    acumuladas.push(...resposta.features);
    offset += resposta.features.length;

    const continua = resposta.exceededTransferLimit === true && resposta.features.length > 0;
    if (!continua) break;
    if (acumuladas.length >= limite) {
      throw new ErroArcGIS(`Consulta excedeu o limite de ${limite} feições`);
    }
  }

  return { ...primeira, features: acumuladas, exceededTransferLimit: false };
}
