import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from "geojson";
import type {
  ColorSpecification,
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from "maplibre-gl";
import { formatarData, formatarHora } from "@/lib/datas";
import type { ChuvaMunicipio, JanelaChuva } from "@/lib/dominio/chuva";
import {
  CLASSES_GEOLOGICAS,
  CORES_NIVEL,
  descreverFaixa,
  gravidade,
  MATRIZ_CHUVA,
  MATRIZ_GEOLOGICA,
  MATRIZ_HIDROLOGICA,
  NIVEIS_HIDROLOGICOS,
  NIVEIS_RISCO,
  type Faixa,
  type NivelRisco,
} from "@/lib/dominio/matrizes";
import {
  CAMADAS_RISCO,
  ROTULOS_CAMADA_RISCO,
  type CamadaRiscoId,
  type ItemRisco,
  type MunicipioTerritorio,
  type ResumoArea,
} from "@/lib/dominio/risco";
import type { OrigemLeitura } from "@/lib/fontes/tipos";
import { NIVEL_DO_ALERTA_CEMADEN } from "@/lib/sources/cemaden/parser";
import { NIVEL_DA_SEVERIDADE_INMET } from "@/lib/sources/inmet/parser-ativos";
import { camadasBase, CATALOGO_BASES, fontesBase, type BaseMapaId } from "./bases";
import { COLECAO_VAZIA, FONTE_CONTORNO_MG, FONTE_MASCARA } from "./camadas";
import { pontoDeRotulo } from "./geometria";
import { criarMascaraMg } from "./mascara";
import type { CampoPopup } from "./popups";
import { PALETAS_MAPA, type TemaMapa } from "./tema";

/**
 * Mapa de risco e chuva no modelo do GeoRisk (docs/fase-1.md §5 e §6), em
 * TypeScript puro (sem DOM nem MapLibre em tempo de execução): seleção da
 * camada pela URL, zoom pela hierarquia do CBMMG (COB → UEOp → município),
 * expressões de estilo, legenda gerada das matrizes e conteúdo dos balões.
 *
 * Uma pintura por vez: o coroplético de duas camadas sobrepostas não se lê.
 * O nível de cada área vem pronto da API (`areas.cob`, `areas.ueop`); aqui só
 * se escolhe qual mostrar conforme o zoom.
 */

// ---------------------------------------------------------------------------------------------
// Seleção (camada pintada, janela da chuva, nível de área) — fica na URL
// ---------------------------------------------------------------------------------------------

/** O que pinta os municípios: a chuva prevista, uma camada de risco ou a combinada. */
export const PINTURAS_RISCO = ["chuva", ...CAMADAS_RISCO, "combinado"] as const;
export type PinturaRisco = (typeof PINTURAS_RISCO)[number];

export const ROTULOS_PINTURA: Record<PinturaRisco, string> = {
  chuva: "Chuva prevista",
  meteorologico: `${ROTULOS_CAMADA_RISCO.meteorologico} (INMET)`,
  geologico: `${ROTULOS_CAMADA_RISCO.geologico} (Cemaden)`,
  hidrologico: `${ROTULOS_CAMADA_RISCO.hidrologico} (Cemaden)`,
  "alertas-cbmmg": ROTULOS_CAMADA_RISCO["alertas-cbmmg"],
  combinado: "Maior risco (combinado)",
};

export const JANELAS_MAPA: readonly JanelaChuva[] = ["24h", "72h"];

export const ROTULOS_JANELA: Record<JanelaChuva, string> = {
  "24h": "Próximas 24 h",
  "72h": "Próximas 72 h",
};

/** Hierarquia do CBMMG exibida no mapa. */
export const NIVEIS_AREA = ["cob", "ueop", "municipio"] as const;
export type NivelArea = (typeof NIVEIS_AREA)[number];

/** "auto" segue o zoom; os demais fixam o nível (acessibilidade: não depender do zoom). */
export const ESCOLHAS_NIVEL = ["auto", ...NIVEIS_AREA] as const;
export type EscolhaNivel = (typeof ESCOLHAS_NIVEL)[number];

export const ROTULOS_NIVEL_AREA: Record<NivelArea, string> = {
  cob: "COB",
  ueop: "UEOp",
  municipio: "Município",
};

export const ROTULOS_ESCOLHA_NIVEL: Record<EscolhaNivel, string> = {
  auto: "Automático",
  ...ROTULOS_NIVEL_AREA,
};

export interface SelecaoMapaRisco {
  pintura: PinturaRisco;
  janela: JanelaChuva;
  nivel: EscolhaNivel;
}

export const SELECAO_PADRAO: SelecaoMapaRisco = { pintura: "chuva", janela: "24h", nivel: "auto" };

/** Nomes dos parâmetros na URL: /risco?camada=geologico&janela=72h&nivel=ueop */
export const PARAMETROS_URL_RISCO = { pintura: "camada", janela: "janela", nivel: "nivel" } as const;

/** searchParams da página (objeto) ou URLSearchParams do navegador. */
export type ParametrosBusca = URLSearchParams | Readonly<Record<string, string | string[] | undefined>>;

function lerParametro(params: ParametrosBusca, nome: string): string | null {
  const bruto = params instanceof URLSearchParams ? params.get(nome) : params[nome];
  const valor = Array.isArray(bruto) ? bruto[0] : bruto;
  return typeof valor === "string" ? valor.trim().toLowerCase() : null;
}

function escolher<T extends string>(valor: string | null, opcoes: readonly T[], padrao: T): T {
  return valor !== null && (opcoes as readonly string[]).includes(valor) ? (valor as T) : padrao;
}

/** Seleção a partir da URL; valor ausente ou desconhecido cai no padrão (chuva, 24 h, automático). */
export function lerSelecaoDaUrl(params: ParametrosBusca): SelecaoMapaRisco {
  return {
    pintura: escolher(lerParametro(params, PARAMETROS_URL_RISCO.pintura), PINTURAS_RISCO, SELECAO_PADRAO.pintura),
    janela: escolher(lerParametro(params, PARAMETROS_URL_RISCO.janela), JANELAS_MAPA, SELECAO_PADRAO.janela),
    nivel: escolher(lerParametro(params, PARAMETROS_URL_RISCO.nivel), ESCOLHAS_NIVEL, SELECAO_PADRAO.nivel),
  };
}

export function mesmaSelecao(a: SelecaoMapaRisco, b: SelecaoMapaRisco): boolean {
  return a.pintura === b.pintura && a.janela === b.janela && a.nivel === b.nivel;
}

/**
 * Query string da seleção, preservando os outros parâmetros da URL atual. Os
 * valores padrão saem da URL (link curto); a janela só vale para a chuva.
 */
export function buscaDaSelecao(selecao: SelecaoMapaRisco, atual: string | URLSearchParams = ""): string {
  const params = new URLSearchParams(atual);
  const definir = (nome: string, valor: string, padrao: string) => {
    if (valor === padrao) params.delete(nome);
    else params.set(nome, valor);
  };
  definir(PARAMETROS_URL_RISCO.pintura, selecao.pintura, SELECAO_PADRAO.pintura);
  definir(
    PARAMETROS_URL_RISCO.janela,
    selecao.pintura === "chuva" ? selecao.janela : SELECAO_PADRAO.janela,
    SELECAO_PADRAO.janela,
  );
  definir(PARAMETROS_URL_RISCO.nivel, selecao.nivel, SELECAO_PADRAO.nivel);
  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

// ---------------------------------------------------------------------------------------------
// Zoom pela hierarquia do CBMMG
// ---------------------------------------------------------------------------------------------

/*
 * Limiares INTEIROS de propósito. O preenchimento usa uma expressão composta
 * (zoom + propriedade da feição), que o MapLibre avalia no zoom do TILE: a
 * fonte GeoJSON gera tiles em floor(zoom), então um limiar 6,4 só valeria a
 * partir do zoom 7 — e o indicador "Exibindo" ficaria fora de sincronia.
 *
 * MG inteiro cabe em ~z5,5 num notebook (mapa de ~760 × 620 px) e em ~z4,6 no
 * celular: um "+" leva ao nível da UEOp e outro ao dos municípios.
 */

/** A partir deste zoom o mapa mostra a UEOp (abaixo: o COB). */
export const ZOOM_AREA_UEOP = 6;
/** A partir deste zoom o mapa mostra cada município. */
export const ZOOM_AREA_MUNICIPIO = 7;
/** Nomes dos municípios (marcadores HTML) a partir deste zoom. */
export const ZOOM_ROTULOS_MUNICIPIO = 8;
/** Zoom ao localizar um município pela lista. */
export const ZOOM_VER_MUNICIPIO = 9;

export function nivelDoZoom(zoom: number): NivelArea {
  if (zoom >= ZOOM_AREA_MUNICIPIO) return "municipio";
  if (zoom >= ZOOM_AREA_UEOP) return "ueop";
  return "cob";
}

export function nivelEfetivo(escolha: EscolhaNivel, zoom: number): NivelArea {
  return escolha === "auto" ? nivelDoZoom(zoom) : escolha;
}

// ---------------------------------------------------------------------------------------------
// Dados da pintura (o que o mapa, a legenda e as listas consomem)
// ---------------------------------------------------------------------------------------------

/** Item de risco num município; na combinada, com a camada de origem. */
export interface ItemMapaRisco extends ItemRisco {
  camada?: CamadaRiscoId;
}

export interface MetaPintura {
  atualizadoEm: string;
  origem: OrigemLeitura;
  erro?: string;
}

export interface DadosPintura {
  pintura: PinturaRisco;
  janela: JanelaChuva;
  /** Nível por município (código IBGE). Ausente = sem dado / sem alerta. */
  niveis: ReadonlyMap<string, NivelRisco>;
  /** Resumo por COB e por COB · UEOp, como a API entrega (ResumoArea). */
  areas: { cob: readonly ResumoArea[]; ueop: readonly ResumoArea[] };
  /** Chuva de cada município (só na pintura "chuva"). */
  chuva: ReadonlyMap<string, ChuvaMunicipio> | null;
  /** Itens de cada município (camadas de risco e combinada). */
  itens: ReadonlyMap<string, readonly ItemMapaRisco[]> | null;
  meta: MetaPintura | null;
  /** Crédito exigido pela(s) fonte(s). */
  credito: string;
  /** O que "sem cor" significa nesta camada. */
  cobertura: string;
  /** Observação extra (ex.: camadas fora da combinação). */
  nota: string | null;
}

/** Leitura no navegador de uma rota da API (último dado válido + último erro). */
export interface LeituraCliente<T> {
  dados: T | null;
  erro: string | null;
  carregando: boolean;
}

export type EstadoPintura =
  | { estado: "carregando" }
  | { estado: "indisponivel"; motivo: string; fonte: string }
  | { estado: "ok"; dados: DadosPintura };

/** Formato de GET /api/chuva usado pelo mapa (lib/dados/chuva.ts). */
export interface RespostaChuvaMapa {
  meta: MetaPintura & { fonte?: string };
  credito: string;
  inicioJanela: string;
  modelo: string;
  municipios: ChuvaMunicipio[];
  areas: Record<JanelaChuva, { cob: ResumoArea[]; ueop: ResumoArea[] }>;
  ranking: { acumulado24h: ItemRankingMapa[]; pior24hEm72h: ItemRankingMapa[] };
}

export interface ItemRankingMapa extends ChuvaMunicipio {
  nome: string;
  cob: string;
  ueop: string;
  nivel: NivelRisco | null;
}

/** Formato de GET /api/risco usado pelo mapa (lib/dados/risco.ts). */
export interface RespostaRiscoMapa {
  geradoEm: string;
  camadas: Record<
    CamadaRiscoId,
    {
      id: CamadaRiscoId;
      rotulo: string;
      camada: {
        id: CamadaRiscoId;
        municipios: { ibge: string; nivel: NivelRisco; itens: ItemRisco[] }[];
        cobertura: string;
        credito: string;
      } | null;
      meta: (MetaPintura & { fontes: string[] }) | null;
      erro: string | null;
      areas: { cob: ResumoArea[]; ueop: ResumoArea[] } | null;
    }
  >;
  combinado: {
    municipios: { ibge: string; nivel: NivelRisco; camadas: CamadaRiscoId[]; itens: ItemMapaRisco[] }[];
    areas: { cob: ResumoArea[]; ueop: ResumoArea[] };
    camadas: CamadaRiscoId[];
    indisponiveis: CamadaRiscoId[];
  };
  meta: MetaPintura | null;
}

export const COBERTURA_CHUVA =
  "Previsão no ponto da sede de cada município (célula de ~9 km do modelo). Sem cor: previsão indisponível no município.";

const FONTE_CHUVA = "Open-Meteo — Chuva nos municípios";
const FONTE_RISCO = "Mapa de risco (INMET, Cemaden e CBMMG)";

/** Só os campos do carimbo (a API manda também `fonte`/`fontes`). */
function metaDoCarimbo(meta: MetaPintura | null | undefined): MetaPintura | null {
  if (!meta || typeof meta.atualizadoEm !== "string") return null;
  const { atualizadoEm, origem, erro } = meta;
  return erro ? { atualizadoEm, origem, erro } : { atualizadoEm, origem };
}

/** Junta créditos repetidos ("Alertas: Cemaden/MCTI" aparece em duas camadas). */
function creditosUnicos(creditos: readonly string[]): string {
  return [...new Set(creditos.filter(Boolean))].join(" · ");
}

function dadosDaChuva(chuva: RespostaChuvaMapa, janela: JanelaChuva): DadosPintura {
  const niveis = new Map<string, NivelRisco>();
  const porIbge = new Map<string, ChuvaMunicipio>();
  for (const m of chuva.municipios) {
    porIbge.set(m.ibge, m);
    const nivel = janela === "24h" ? m.nivel24h : m.nivel72h;
    if (nivel) niveis.set(m.ibge, nivel);
  }
  return {
    pintura: "chuva",
    janela,
    niveis,
    areas: chuva.areas[janela],
    chuva: porIbge,
    itens: null,
    meta: metaDoCarimbo(chuva.meta),
    credito: chuva.credito,
    cobertura: COBERTURA_CHUVA,
    nota:
      janela === "72h"
        ? "Próximas 72 h: maior chuva em 1 h e pior acumulado em 24 h consecutivas dentro das 72 h (a matriz é de 24 h)."
        : null,
  };
}

function dadosDaCamada(risco: RespostaRiscoMapa, id: CamadaRiscoId): DadosPintura | null {
  const camada = risco.camadas[id];
  if (!camada?.camada || !camada.areas) return null;
  const niveis = new Map<string, NivelRisco>();
  const itens = new Map<string, readonly ItemMapaRisco[]>();
  for (const m of camada.camada.municipios) {
    niveis.set(m.ibge, m.nivel);
    itens.set(m.ibge, m.itens);
  }
  return {
    pintura: id,
    janela: SELECAO_PADRAO.janela,
    niveis,
    areas: camada.areas,
    chuva: null,
    itens,
    meta: metaDoCarimbo(camada.meta),
    credito: camada.camada.credito,
    cobertura: camada.camada.cobertura,
    nota: null,
  };
}

export const COBERTURA_COMBINADO =
  "Pior nível entre as camadas Meteorológico, Geológico, Hidrológico e Alertas do CBMMG. Sem cor: nenhuma camada tem alerta no município, o que não quer dizer sem risco.";

function dadosDaCombinada(risco: RespostaRiscoMapa): DadosPintura {
  const niveis = new Map<string, NivelRisco>();
  const itens = new Map<string, readonly ItemMapaRisco[]>();
  for (const m of risco.combinado.municipios) {
    niveis.set(m.ibge, m.nivel);
    itens.set(m.ibge, m.itens);
  }
  const fora = risco.combinado.indisponiveis.map((id) => ROTULOS_CAMADA_RISCO[id]);
  return {
    pintura: "combinado",
    janela: SELECAO_PADRAO.janela,
    niveis,
    areas: risco.combinado.areas,
    chuva: null,
    itens,
    meta: metaDoCarimbo(risco.meta),
    credito: creditosUnicos(risco.combinado.camadas.map((id) => risco.camadas[id]?.camada?.credito ?? "")),
    cobertura: COBERTURA_COMBINADO,
    nota: fora.length
      ? `Combinação incompleta: ${fora.join(", ")} ${fora.length === 1 ? "está indisponível" : "estão indisponíveis"} e ${fora.length === 1 ? "ficou" : "ficaram"} de fora.`
      : null,
  };
}

/**
 * Dados da pintura escolhida a partir das duas leituras do navegador
 * (/api/chuva e /api/risco). Uma camada fora do ar fica "indisponível" sem
 * afetar as outras.
 */
export function dadosDaPintura(
  selecao: Pick<SelecaoMapaRisco, "pintura" | "janela">,
  chuva: LeituraCliente<RespostaChuvaMapa>,
  risco: LeituraCliente<RespostaRiscoMapa>,
): EstadoPintura {
  if (selecao.pintura === "chuva") {
    if (chuva.dados) return { estado: "ok", dados: dadosDaChuva(chuva.dados, selecao.janela) };
    if (chuva.erro) return { estado: "indisponivel", motivo: chuva.erro, fonte: FONTE_CHUVA };
    return { estado: "carregando" };
  }
  if (!risco.dados) {
    if (risco.erro) return { estado: "indisponivel", motivo: risco.erro, fonte: FONTE_RISCO };
    return { estado: "carregando" };
  }
  if (selecao.pintura === "combinado") return { estado: "ok", dados: dadosDaCombinada(risco.dados) };
  const dados = dadosDaCamada(risco.dados, selecao.pintura);
  if (dados) return { estado: "ok", dados };
  return {
    estado: "indisponivel",
    motivo: risco.dados.camadas[selecao.pintura]?.erro ?? "Fonte indisponível.",
    fonte: ROTULOS_PINTURA[selecao.pintura],
  };
}

/** Camadas de risco sem leitura válida (para marcar no seletor). */
export function camadasIndisponiveis(risco: RespostaRiscoMapa | null): Set<PinturaRisco> {
  const fora = new Set<PinturaRisco>();
  if (!risco) return fora;
  for (const id of CAMADAS_RISCO) if (!risco.camadas[id]?.camada) fora.add(id);
  return fora;
}

// ---------------------------------------------------------------------------------------------
// Nomes dos níveis e legenda (gerados das matrizes e das tabelas de conversão)
// ---------------------------------------------------------------------------------------------

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "perigo-potencial" → "Perigo potencial" (rótulo do INMET). */
function rotuloSeveridadeInmet(id: string): string {
  return capitalizar(id.replace(/-/g, " "));
}

/** Níveis que cada fonte de alerta usa, com o nome que a própria fonte dá. */
function niveisDaConversao(tabela: Iterable<[string, NivelRisco]>): Map<NivelRisco, string[]> {
  const mapa = new Map<NivelRisco, string[]>();
  for (const [rotulo, nivel] of tabela) mapa.set(nivel, [...(mapa.get(nivel) ?? []), rotulo]);
  return mapa;
}

const NIVEIS_INMET = niveisDaConversao(
  Object.entries(NIVEL_DA_SEVERIDADE_INMET).map(([id, nivel]): [string, NivelRisco] => [
    rotuloSeveridadeInmet(id),
    nivel,
  ]),
);

const NIVEIS_CEMADEN = niveisDaConversao(
  Object.values(NIVEL_DO_ALERTA_CEMADEN).map((v): [string, NivelRisco] => [v.rotulo, v.nivel]),
);

function ordenarNiveis(niveis: Iterable<NivelRisco>): NivelRisco[] {
  return [...new Set(niveis)].sort((a, b) => gravidade(a) - gravidade(b));
}

/** Níveis que a camada pode pintar (os da conversão da fonte; a chuva e as do CBMMG, a escala toda). */
export function niveisDaPintura(pintura: PinturaRisco): readonly NivelRisco[] {
  switch (pintura) {
    case "meteorologico":
      return ordenarNiveis(NIVEIS_INMET.keys());
    case "geologico":
    case "hidrologico":
      return ordenarNiveis(NIVEIS_CEMADEN.keys());
    default:
      return NIVEIS_RISCO;
  }
}

function juntarNomes(nomes: readonly string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** Nome do nível na matriz da camada: "Perigo" (chuva), "Muito alto" (geológico), "Atenção"… */
export function nomeDoNivel(pintura: PinturaRisco, nivel: NivelRisco): string | null {
  switch (pintura) {
    case "chuva":
    case "alertas-cbmmg":
      // Os alertas do CBMMG usam os nomes da matriz de chuva ("Laranja (Perigo)").
      return MATRIZ_CHUVA[nivel].alerta;
    case "meteorologico":
      return NIVEIS_INMET.get(nivel)?.join(" / ") ?? null;
    case "geologico": {
      // Classes da matriz geológica com a cor da escala (o "Baixo" tem tom próprio).
      const nomes = CLASSES_GEOLOGICAS.map((c) => MATRIZ_GEOLOGICA[c])
        .filter((c) => c.nivel === nivel && c.cor.fundo === CORES_NIVEL[nivel].fundo)
        .map((c) => c.rotulo);
      return nomes.length ? juntarNomes(nomes.map((n, i) => (i === 0 ? n : n.toLowerCase()))) : null;
    }
    case "hidrologico": {
      const nomes = NIVEIS_HIDROLOGICOS.map((n) => MATRIZ_HIDROLOGICA[n])
        .filter((n) => n.nivel === nivel)
        .map((n) => n.rotulo);
      return nomes.length ? juntarNomes(nomes) : null;
    }
    case "combinado":
      return null;
  }
}

/** Piso da faixa sem o teto: "> 6 mm/h", "≥ 60 mm em 24 h". */
function piso(faixa: Faixa, unidade: string): string {
  return descreverFaixa({ ...faixa, max: null }, unidade);
}

/** Critério resumido do nível na camada (gerado das matrizes, nunca digitado). */
export function criterioDoNivel(pintura: PinturaRisco, nivel: NivelRisco): string | null {
  switch (pintura) {
    case "chuva": {
      const linha = MATRIZ_CHUVA[nivel];
      // Verde: os dois critérios abaixo do amarelo. Demais: basta um (a matriz usa "ou").
      if (nivel === "verde") {
        return `${descreverFaixa(linha.mmHora, "mm/h")} e ${descreverFaixa(linha.mm24h, "mm em 24 h")}`;
      }
      return `${piso(linha.mmHora, "mm/h")} ou ${piso(linha.mm24h, "mm em 24 h")}`;
    }
    case "meteorologico": {
      const nomes = NIVEIS_INMET.get(nivel);
      return nomes ? `Aviso ${nomes.map((n) => `“${n}”`).join(" ou ")} do INMET` : null;
    }
    case "geologico":
    case "hidrologico": {
      const nomes = NIVEIS_CEMADEN.get(nivel);
      return nomes ? `Alerta ${nomes.map((n) => `“${n}”`).join(" ou ")} do Cemaden` : null;
    }
    case "alertas-cbmmg":
      return nivel === "verde" ? null : "Nível informado no alerta emitido";
    case "combinado":
      return null;
  }
}

/** O que a ausência de cor quer dizer, em uma ou duas palavras. */
export function rotuloSemDado(pintura: PinturaRisco): string {
  return pintura === "chuva" ? "Sem dado" : "Sem alerta";
}

/** "Laranja · Perigo", "Vermelho · Muito alto", "Laranja" (combinada), "Sem alerta". */
export function rotuloDoNivel(pintura: PinturaRisco, nivel: NivelRisco | null): string {
  if (!nivel) return rotuloSemDado(pintura);
  const nome = nomeDoNivel(pintura, nivel);
  return nome ? `${CORES_NIVEL[nivel].nome} · ${nome}` : CORES_NIVEL[nivel].nome;
}

export interface ItemLegendaRisco {
  nivel: NivelRisco;
  /** Preenchimento e tinta do nível (CORES_NIVEL; iguais nos dois temas). */
  cor: string;
  tinta: string;
  /** "Amarelo" */
  nomeCor: string;
  /** Nome na matriz da camada ("Alerta", "Moderado", "Atenção"…). */
  nome: string | null;
  /** "> 6 mm/h ou ≥ 60 mm em 24 h" */
  criterio: string | null;
}

export interface LegendaRisco {
  titulo: string;
  itens: ItemLegendaRisco[];
  semDado: string;
}

/**
 * Legenda da camada: um item por nível que ela pode pintar (mais qualquer
 * nível presente nos dados que fuja da conversão esperada), do menos ao mais
 * grave, sempre com cor + palavra.
 */
export function legendaDaPintura(
  pintura: PinturaRisco,
  janela: JanelaChuva,
  presentes: Iterable<NivelRisco> = [],
): LegendaRisco {
  const niveis = ordenarNiveis([...niveisDaPintura(pintura), ...presentes]);
  return {
    titulo:
      pintura === "chuva"
        ? `${ROTULOS_PINTURA.chuva} · ${ROTULOS_JANELA[janela].toLowerCase()}`
        : ROTULOS_PINTURA[pintura],
    itens: niveis.map((nivel) => ({
      nivel,
      cor: CORES_NIVEL[nivel].fundo,
      tinta: CORES_NIVEL[nivel].tinta,
      nomeCor: CORES_NIVEL[nivel].nome,
      nome: nomeDoNivel(pintura, nivel),
      criterio: criterioDoNivel(pintura, nivel),
    })),
    semDado: rotuloSemDado(pintura),
  };
}

// ---------------------------------------------------------------------------------------------
// Expressões de estilo
// ---------------------------------------------------------------------------------------------

/** Sem dado: sem preenchimento (o contorno continua). */
export const COR_SEM_DADO = "rgba(0, 0, 0, 0)";

/** Entrada do "match" em cada nível: a chave da área a partir das propriedades da malha. */
export const ENTRADA_AREA: Record<NivelArea, ExpressionSpecification> = {
  cob: ["get", "cob"],
  ueop: ["concat", ["get", "cob"], " · ", ["get", "ueop"]],
  municipio: ["get", "ibge"],
};

/** Mesma chave da ENTRADA_AREA, em JavaScript (cliques e testes). */
export function chaveDaArea(nivel: NivelArea, props: { ibge?: unknown; cob?: unknown; ueop?: unknown }): string {
  const texto = (v: unknown) => (typeof v === "string" ? v : "");
  if (nivel === "cob") return texto(props.cob);
  if (nivel === "ueop") return `${texto(props.cob)} · ${texto(props.ueop)}`;
  return texto(props.ibge);
}

/** Nível de cada área (COB, COB · UEOp) ou município (IBGE). */
export function niveisPorChave(dados: DadosPintura, nivel: NivelArea): Map<string, NivelRisco> {
  if (nivel === "municipio") return new Map(dados.niveis);
  const mapa = new Map<string, NivelRisco>();
  for (const area of dados.areas[nivel]) if (area.nivel) mapa.set(area.chave, area.nivel);
  return mapa;
}

/**
 * "match" agrupado por nível: ["match", entrada, [chaves verdes], "#88C485", …, sem dado].
 * Sem nenhuma chave com nível, devolve só a cor de "sem dado".
 */
export function expressaoCorPorChave(
  niveis: ReadonlyMap<string, NivelRisco>,
  entrada: ExpressionSpecification,
): ExpressionSpecification | string {
  const ramos: (string | string[])[] = [];
  for (const nivel of NIVEIS_RISCO) {
    const chaves = [...niveis].filter(([, n]) => n === nivel).map(([chave]) => chave);
    if (chaves.length === 0) continue;
    ramos.push(chaves.sort(), CORES_NIVEL[nivel].fundo);
  }
  if (ramos.length === 0) return COR_SEM_DADO;
  return ["match", entrada, ...ramos, COR_SEM_DADO] as unknown as ExpressionSpecification;
}

export function expressaoCorDoNivel(dados: DadosPintura | null, nivel: NivelArea): ExpressionSpecification | string {
  if (!dados) return COR_SEM_DADO;
  return expressaoCorPorChave(niveisPorChave(dados, nivel), ENTRADA_AREA[nivel]);
}

/**
 * Valor que muda com o nível de área: com o nível fixo, o valor dele; no
 * automático, ["step", ["zoom"], cob, 6, ueop, 7, município].
 */
export function valorPorNivel<T extends string | number | ExpressionSpecification>(
  escolha: EscolhaNivel,
  valores: Record<NivelArea, T>,
): T | ExpressionSpecification {
  if (escolha !== "auto") return valores[escolha];
  return [
    "step",
    ["zoom"],
    valores.cob,
    ZOOM_AREA_UEOP,
    valores.ueop,
    ZOOM_AREA_MUNICIPIO,
    valores.municipio,
  ] as unknown as ExpressionSpecification;
}

/** Cor do preenchimento: "step" com ["zoom"] no topo e um "match" por nível de área. */
export function expressaoCorRisco(
  dados: DadosPintura | null,
  escolha: EscolhaNivel,
): DataDrivenPropertyValueSpecification<ColorSpecification> {
  const porNivel = {
    cob: expressaoCorDoNivel(dados, "cob"),
    ueop: expressaoCorDoNivel(dados, "ueop"),
    municipio: expressaoCorDoNivel(dados, "municipio"),
  };
  if (escolha !== "auto") return porNivel[escolha] as DataDrivenPropertyValueSpecification<ColorSpecification>;
  return valorPorNivel(escolha, porNivel) as DataDrivenPropertyValueSpecification<ColorSpecification>;
}

// ---------------------------------------------------------------------------------------------
// Estilo completo do mapa de risco
// ---------------------------------------------------------------------------------------------

export const FONTES_RISCO = {
  municipios: "risco-municipios",
  ueops: "risco-ueops",
  cobs: "risco-cobs",
} as const;

/** Propriedade que vira o id da feição (feature-state de destaque). */
export const ID_FEICAO_RISCO = { municipios: "ibge", ueops: "chave", cobs: "cob" } as const;

export const ID_CAMADAS_RISCO = {
  preenchimento: "risco-preenchimento",
  contornoMunicipio: "risco-municipio-contorno",
  contornoUeopFundo: "risco-ueop-contorno-fundo",
  contornoUeop: "risco-ueop-contorno",
  contornoCobFundo: "risco-cob-contorno-fundo",
  contornoCob: "risco-cob-contorno",
  destaqueMunicipio: "risco-municipio-destaque",
  destaqueUeop: "risco-ueop-destaque",
  destaqueCob: "risco-cob-destaque",
} as const;

/** Fonte e camada de destaque de cada nível de área. */
export const DESTAQUE_POR_NIVEL: Record<NivelArea, { fonte: string; camada: string }> = {
  cob: { fonte: FONTES_RISCO.cobs, camada: ID_CAMADAS_RISCO.destaqueCob },
  ueop: { fonte: FONTES_RISCO.ueops, camada: ID_CAMADAS_RISCO.destaqueUeop },
  municipio: { fonte: FONTES_RISCO.municipios, camada: ID_CAMADAS_RISCO.destaqueMunicipio },
};

export interface PaletaRisco {
  /** Contornos (COB, UEOp, município) e destaque. */
  linha: string;
  /** "Casco" sob a linha, para ela aparecer sobre qualquer cor e sobre o satélite. */
  casco: string;
  opacidadePreenchimento: number;
}

/**
 * Contornos neutros (tinta do tema), não as cores dos COBs: aqui a cor é o
 * nível de risco, e um contorno amarelo do 1º COB seria lido como "amarelo".
 */
export const PALETAS_RISCO: Record<TemaMapa, PaletaRisco> = {
  // No escuro o fundo é quase preto: abaixo de ~0,75 o amarelo vira oliva.
  escuro: { linha: "#FFFFFF", casco: "#0A0E14", opacidadePreenchimento: 0.78 },
  claro: { linha: "#10151C", casco: "#FFFFFF", opacidadePreenchimento: 0.72 },
};

export type ColecaoPoligonos = FeatureCollection<Polygon | MultiPolygon, Record<string, unknown>>;

export interface OpcoesEstiloRisco {
  base: BaseMapaId;
  tema: TemaMapa;
  /** Contorno de MG (public/geo/mg-outline.json); null enquanto carrega. */
  contornoMg: Feature<Polygon | MultiPolygon> | null;
  /** Malha dos 853 municípios (public/geo/municipios-mg.json). */
  municipios: ColecaoPoligonos | null;
  /** Áreas aproximadas das UEOp (public/geo/ueops-mg.json). */
  ueops: ColecaoPoligonos | null;
  /** Limites oficiais dos COBs (/api/arcgis/cobs). */
  cobs: ColecaoPoligonos | null;
  dados: DadosPintura | null;
  escolha: EscolhaNivel;
  reduzirMovimento?: boolean;
}

const OPACIDADE_CONTORNO_MUNICIPAL: Record<NivelArea, number> = { cob: 0, ueop: 0.16, municipio: 0.55 };

/**
 * Contorno dos municípios: no automático, só nos níveis UEOp (bem fraco) e
 * município. Com o nível fixado, some aos poucos ao afastar (no Estado
 * inteiro, 853 contornos virariam uma mancha).
 */
export function opacidadeContornoMunicipal(escolha: EscolhaNivel): number | ExpressionSpecification {
  if (escolha === "auto") return valorPorNivel("auto", OPACIDADE_CONTORNO_MUNICIPAL);
  const valor = OPACIDADE_CONTORNO_MUNICIPAL[escolha];
  if (valor === 0) return 0;
  return ["interpolate", ["linear"], ["zoom"], 5, valor * 0.35, ZOOM_AREA_MUNICIPIO + 0.5, valor];
}

const cacheMascara = new WeakMap<object, Feature<MultiPolygon>>();

function mascaraDe(contorno: Feature<Polygon | MultiPolygon> | null): FeatureCollection | Feature<MultiPolygon> {
  if (!contorno) return COLECAO_VAZIA;
  let mascara = cacheMascara.get(contorno);
  if (!mascara) {
    mascara = criarMascaraMg(contorno);
    cacheMascara.set(contorno, mascara);
  }
  return mascara;
}

const DESTACADO: ExpressionSpecification = [
  "any",
  ["boolean", ["feature-state", "hover"], false],
  ["boolean", ["feature-state", "selecionado"], false],
];

function linhaDestaque(id: string, fonte: string, cor: string, largura: number): LayerSpecification {
  return {
    id,
    type: "line",
    source: fonte,
    layout: { "line-join": "round" },
    paint: {
      "line-color": cor,
      "line-width": ["case", DESTACADO, largura, 0],
    },
  };
}

/**
 * Estilo completo (version 8, sem glyphs nem sprite), aplicado com
 * setStyle(estilo, { diff: true }): trocar a camada, a janela ou o nível só
 * muda as propriedades de pintura; a malha não é reenviada.
 */
export function montarEstiloRisco(opcoes: OpcoesEstiloRisco): StyleSpecification {
  const { base, tema, dados, escolha, reduzirMovimento = false } = opcoes;
  const paleta = PALETAS_MAPA[tema];
  const risco = PALETAS_RISCO[tema];

  const sources: Record<string, SourceSpecification> = {
    ...fontesBase(base),
    [FONTE_MASCARA]: { type: "geojson", data: mascaraDe(opcoes.contornoMg) },
    [FONTE_CONTORNO_MG]: { type: "geojson", data: opcoes.contornoMg ?? COLECAO_VAZIA },
    [FONTES_RISCO.municipios]: {
      type: "geojson",
      data: opcoes.municipios ?? COLECAO_VAZIA,
      promoteId: ID_FEICAO_RISCO.municipios,
      attribution: "Malha municipal: IBGE",
      // A malha já vem simplificada com a topologia preservada. Simplificar de
      // novo, polígono a polígono, abriria frestas entre municípios vizinhos.
      tolerance: 0,
    },
    [FONTES_RISCO.ueops]: { type: "geojson", data: opcoes.ueops ?? COLECAO_VAZIA, promoteId: ID_FEICAO_RISCO.ueops },
    [FONTES_RISCO.cobs]: {
      type: "geojson",
      data: opcoes.cobs ?? COLECAO_VAZIA,
      promoteId: ID_FEICAO_RISCO.cobs,
      attribution: "Dados: CBMMG",
    },
  };

  const layers: LayerSpecification[] = [
    ...camadasBase(base, tema, { reduzirMovimento }),
    {
      id: "mg-mascara",
      type: "fill",
      source: FONTE_MASCARA,
      paint: { "fill-color": paleta.mascara, "fill-opacity": paleta.opacidadeMascara, "fill-antialias": false },
    },
    {
      id: ID_CAMADAS_RISCO.preenchimento,
      type: "fill",
      source: FONTES_RISCO.municipios,
      paint: {
        "fill-color": expressaoCorRisco(dados, escolha),
        "fill-opacity": risco.opacidadePreenchimento,
        // Sem antialias, municípios vizinhos da mesma cor se fundem sem costura.
        "fill-antialias": false,
      },
    },
    {
      id: ID_CAMADAS_RISCO.contornoMunicipio,
      type: "line",
      source: FONTES_RISCO.municipios,
      layout: { "line-join": "round" },
      paint: {
        "line-color": risco.linha,
        "line-width": valorPorNivel(escolha, { cob: 0, ueop: 0.4, municipio: 0.7 }),
        "line-opacity": opacidadeContornoMunicipal(escolha),
      },
    },
    {
      id: ID_CAMADAS_RISCO.contornoUeopFundo,
      type: "line",
      source: FONTES_RISCO.ueops,
      layout: { "line-join": "round" },
      paint: {
        "line-color": risco.casco,
        "line-width": valorPorNivel(escolha, { cob: 0, ueop: 3.6, municipio: 2.6 }),
        "line-opacity": 0.45,
      },
    },
    {
      id: ID_CAMADAS_RISCO.contornoUeop,
      type: "line",
      source: FONTES_RISCO.ueops,
      layout: { "line-join": "round" },
      paint: {
        "line-color": risco.linha,
        "line-width": valorPorNivel(escolha, { cob: 0, ueop: 1.5, municipio: 1.1 }),
        "line-opacity": valorPorNivel(escolha, { cob: 0, ueop: 0.85, municipio: 0.6 }),
        "line-dasharray": [3, 1.5],
      },
    },
    {
      id: ID_CAMADAS_RISCO.contornoCobFundo,
      type: "line",
      source: FONTES_RISCO.cobs,
      layout: { "line-join": "round" },
      paint: {
        "line-color": risco.casco,
        "line-width": valorPorNivel(escolha, { cob: 4.6, ueop: 4.2, municipio: 3.8 }),
        "line-opacity": 0.5,
      },
    },
    {
      id: ID_CAMADAS_RISCO.contornoCob,
      type: "line",
      source: FONTES_RISCO.cobs,
      layout: { "line-join": "round" },
      paint: {
        "line-color": risco.linha,
        "line-width": valorPorNivel(escolha, { cob: 2.2, ueop: 2, municipio: 1.8 }),
        "line-opacity": 0.95,
      },
    },
    {
      id: "mg-contorno",
      type: "line",
      source: FONTE_CONTORNO_MG,
      layout: { "line-join": "round" },
      paint: {
        "line-color": paleta.contornoMg,
        "line-width": paleta.larguraContornoMg,
        "line-opacity": paleta.opacidadeContornoMg,
      },
    },
    linhaDestaque(ID_CAMADAS_RISCO.destaqueMunicipio, FONTES_RISCO.municipios, risco.linha, 3),
    linhaDestaque(ID_CAMADAS_RISCO.destaqueUeop, FONTES_RISCO.ueops, risco.linha, 4),
    linhaDestaque(ID_CAMADAS_RISCO.destaqueCob, FONTES_RISCO.cobs, risco.linha, 4.5),
  ];

  return {
    version: 8,
    name: `Sala de Situação · Mapa de risco · ${CATALOGO_BASES[base].rotulo}`,
    sources,
    layers,
  };
}

// ---------------------------------------------------------------------------------------------
// Conteúdo dos balões (dado; o componente monta o DOM com textContent)
// ---------------------------------------------------------------------------------------------

/** Município com o território do CBMMG (lib/territorio/municipios.ts). */
export interface MunicipioMapa extends MunicipioTerritorio {
  fracao: string | null;
}

export interface ContagemBalao {
  nivel: NivelRisco | null;
  rotulo: string;
  quantidade: number;
}

export interface ItemBalao {
  nivel: NivelRisco;
  rotuloNivel: string;
  titulo: string;
  fonte: string;
  /** "02/10/2026 12:00 até 03/10/2026 14:00" (horário de Brasília). */
  vigencia: string;
  /** Camada de origem (só na combinada). */
  camada: string | null;
  /** "Meteorológico · INMET", "Alertas do CBMMG", "Cemaden/MCTI". */
  origem: string;
}

export interface ConteudoBalaoRisco {
  /** "COB", "UEOp", "Município" (caixa alta no balão). */
  tipo: string;
  titulo: string;
  /** Território do município: "1º COB · 2º BBM · 2ª Cia/1º Pel (Ubá)". */
  subtitulo: string | null;
  nivel: NivelRisco | null;
  /** "Laranja · Perigo" */
  rotuloNivel: string;
  campos: CampoPopup[];
  /** Quantos municípios em cada nível (balão de área). */
  contagem: ContagemBalao[];
  /** Municípios da área (balão de área); null no de município. */
  totalMunicipios: number | null;
  /** Itens de risco (balão de município nas camadas de risco). */
  itens: ItemBalao[];
  nota: string | null;
  /** Botão "Aproximar" no balão de área. */
  aproximar: { nivel: Exclude<NivelArea, "municipio">; chave: string; rotulo: string } | null;
}

const formatoMm = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const formatoInteiro = new Intl.NumberFormat("pt-BR");

function mm(valor: number | null | undefined, unidade: string): string {
  return typeof valor === "number" && Number.isFinite(valor) ? `${formatoMm.format(valor)} ${unidade}` : "Sem dado";
}

function plural(n: number, um: string, varios: string): string {
  return `${formatoInteiro.format(n)} ${n === 1 ? um : varios}`;
}

/** "02/10 14:30" no horário de Brasília (o ano sobra num aviso de poucos dias). */
function dataHoraCurta(iso: string): string {
  return `${formatarData(iso).slice(0, 5)} ${formatarHora(iso)}`;
}

/** Vigência de um item em horário de Brasília: "02/10 12:00 até 03/10 14:00". */
export function textoVigencia(inicio: string | null, fim: string | null): string {
  if (inicio && fim) return `${dataHoraCurta(inicio)} até ${dataHoraCurta(fim)}`;
  if (fim) return `até ${dataHoraCurta(fim)}`;
  if (inicio) return `desde ${dataHoraCurta(inicio)}`;
  return "Vigência não informada";
}

function nomeDaArea(nivel: Exclude<NivelArea, "municipio">, area: Pick<ResumoArea, "cob" | "ueop">): string {
  return nivel === "cob" ? area.cob : `${area.ueop ?? ""} · ${area.cob}`;
}

const NOTA_UEOP = "Área aproximada: cada município vai para a fração mais próxima dentro do COB.";

/**
 * Balão de uma área (zoom de COB ou de UEOp): pior nível, quantos municípios
 * em cada nível, pior município e, na chuva, o maior acumulado previsto.
 */
export function conteudoBalaoArea(
  dados: DadosPintura,
  nivel: Exclude<NivelArea, "municipio">,
  chave: string,
  territorio: readonly MunicipioTerritorio[] = [],
): ConteudoBalaoRisco | null {
  const area = dados.areas[nivel].find((a) => a.chave === chave);
  if (!area) return null;
  const pintura = dados.pintura;

  const contagem: ContagemBalao[] = [];
  for (const n of [...NIVEIS_RISCO].reverse()) {
    if (area.contagem[n] > 0)
      contagem.push({ nivel: n, rotulo: rotuloDoNivel(pintura, n), quantidade: area.contagem[n] });
  }
  const comNivel = NIVEIS_RISCO.reduce((soma, n) => soma + area.contagem[n], 0);
  if (area.totalMunicipios > comNivel) {
    contagem.push({ nivel: null, rotulo: rotuloSemDado(pintura), quantidade: area.totalMunicipios - comNivel });
  }

  const campos: CampoPopup[] = [];
  // "Pior município" só faz sentido acima do verde.
  if (area.piorMunicipio && area.nivel && gravidade(area.nivel) > 0) {
    campos.push({ rotulo: "Pior município", valor: area.piorMunicipio.nome });
  }
  if (dados.chuva && territorio.length) {
    const campo = dados.janela === "24h" ? "acumulado24h" : "pior24hEm72h";
    let maior: { nome: string; valor: number } | null = null;
    for (const m of territorio) {
      if (chaveDaArea(nivel, m) !== chave) continue;
      const valor = dados.chuva.get(m.ibge)?.[campo];
      if (typeof valor === "number" && (!maior || valor > maior.valor)) maior = { nome: m.nome, valor };
    }
    if (maior) {
      campos.push({
        rotulo: dados.janela === "24h" ? "Maior acumulado em 24 h" : "Pior 24 h em 72 h",
        valor: `${maior.nome} — ${mm(maior.valor, "mm")}`,
      });
    }
  }

  return {
    tipo: nivel === "cob" ? "COB" : "UEOp",
    titulo: nomeDaArea(nivel, area),
    subtitulo: null,
    nivel: area.nivel,
    rotuloNivel: rotuloDoNivel(pintura, area.nivel),
    campos,
    contagem,
    totalMunicipios: area.totalMunicipios,
    itens: [],
    nota: nivel === "ueop" ? NOTA_UEOP : null,
    aproximar: { nivel, chave, rotulo: `Aproximar em ${nivel === "cob" ? area.cob : area.ueop}` },
  };
}

/** Camada e fonte do item, sem repetir ("Alertas do CBMMG · CBMMG" → "Alertas do CBMMG"). */
function origemDoItem(item: ItemMapaRisco): string {
  const camada = item.camada ? ROTULOS_CAMADA_RISCO[item.camada] : null;
  if (!camada) return item.fonte;
  return camada.includes(item.fonte) ? camada : `${camada} · ${item.fonte}`;
}

/**
 * Balão de um município: território do CBMMG, nível e, na chuva, maior mm/h e
 * acumulados; nas camadas de risco, a lista de itens com fonte, título e
 * vigência em horário de Brasília.
 */
export function conteudoBalaoMunicipio(dados: DadosPintura | null, municipio: MunicipioMapa): ConteudoBalaoRisco {
  const pintura = dados?.pintura ?? "chuva";
  const nivel = dados?.niveis.get(municipio.ibge) ?? null;
  const campos: CampoPopup[] = [];

  let itens: ItemBalao[] = [];
  let nota: string | null = null;

  if (dados?.chuva) {
    const chuva = dados.chuva.get(municipio.ibge);
    if (dados.janela === "24h") {
      campos.push(
        { rotulo: "Maior chuva em 1 h", valor: mm(chuva?.maxHora24h, "mm/h") },
        { rotulo: "Acumulado em 24 h", valor: mm(chuva?.acumulado24h, "mm") },
        { rotulo: "Acumulado em 72 h", valor: mm(chuva?.acumulado72h, "mm") },
      );
    } else {
      campos.push(
        { rotulo: "Maior chuva em 1 h", valor: mm(chuva?.maxHora72h, "mm/h") },
        { rotulo: "Pior 24 h em 72 h", valor: mm(chuva?.pior24hEm72h, "mm") },
        { rotulo: "Acumulado em 24 h", valor: mm(chuva?.acumulado24h, "mm") },
        { rotulo: "Acumulado em 72 h", valor: mm(chuva?.acumulado72h, "mm") },
      );
    }
  } else if (dados?.itens) {
    itens = (dados.itens.get(municipio.ibge) ?? []).map((item) => ({
      nivel: item.nivel,
      rotuloNivel: rotuloDoNivel(item.camada ?? pintura, item.nivel),
      titulo: item.titulo,
      fonte: item.fonte,
      vigencia: textoVigencia(item.inicio, item.fim),
      camada: item.camada ? ROTULOS_CAMADA_RISCO[item.camada] : null,
      origem: origemDoItem(item),
    }));
    if (itens.length === 0) nota = dados.cobertura;
  }

  return {
    tipo: "Município",
    titulo: municipio.nome,
    subtitulo: [municipio.cob, municipio.ueop, municipio.fracao].filter(Boolean).join(" · "),
    nivel,
    rotuloNivel: dados ? rotuloDoNivel(pintura, nivel) : "Carregando",
    campos,
    contagem: [],
    totalMunicipios: null,
    itens,
    nota,
    aproximar: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Listas e tabela (alternativa textual ao mapa)
// ---------------------------------------------------------------------------------------------

export interface LinhaListaRisco {
  ibge: string;
  nome: string;
  cob: string;
  ueop: string;
  nivel: NivelRisco | null;
  rotuloNivel: string;
  /** Valor em destaque: "105,7 mm" (chuva) ou o item mais grave (risco). */
  destaque: string;
  /** Linha secundária: "2 itens · Meteorológico, Geológico". */
  detalhe: string | null;
}

/** "Municípios com mais chuva prevista": o ranking da API na janela escolhida. */
export function listaRankingChuva(chuva: RespostaChuvaMapa, janela: JanelaChuva): LinhaListaRisco[] {
  const ranking = janela === "24h" ? chuva.ranking.acumulado24h : chuva.ranking.pior24hEm72h;
  return ranking.map((item) => ({
    ibge: item.ibge,
    nome: item.nome,
    cob: item.cob,
    ueop: item.ueop,
    nivel: item.nivel,
    rotuloNivel: rotuloDoNivel("chuva", item.nivel),
    destaque: mm(janela === "24h" ? item.acumulado24h : item.pior24hEm72h, "mm"),
    detalhe: `Maior chuva em 1 h: ${mm(janela === "24h" ? item.maxHora24h : item.maxHora72h, "mm/h")}`,
  }));
}

/** "Municípios em risco": do mais grave ao menos grave, depois por nome. */
export function listaMunicipiosEmRisco(
  dados: DadosPintura,
  territorio: (ibge: string) => MunicipioTerritorio | null,
): LinhaListaRisco[] {
  const ordenados = [...dados.niveis]
    .map(([ibge, nivel]) => ({ ibge, nivel, m: territorio(ibge) }))
    .filter((x): x is { ibge: string; nivel: NivelRisco; m: MunicipioTerritorio } => x.m !== null)
    .sort((a, b) => gravidade(b.nivel) - gravidade(a.nivel) || a.m.nome.localeCompare(b.m.nome, "pt-BR"));
  return ordenados.map(({ ibge, nivel, m }) => {
    const itens = dados.itens?.get(ibge) ?? [];
    const camadas = [...new Set(itens.map((i) => (i.camada ? ROTULOS_CAMADA_RISCO[i.camada] : null)).filter(Boolean))];
    return {
      ibge,
      nome: m.nome,
      cob: m.cob,
      ueop: m.ueop,
      nivel,
      rotuloNivel: rotuloDoNivel(dados.pintura, nivel),
      destaque: itens[0]?.titulo ?? rotuloDoNivel(dados.pintura, nivel),
      detalhe:
        itens.length > 1 || camadas.length
          ? [itens.length > 1 ? plural(itens.length, "item", "itens") : null, camadas.join(", ") || null]
              .filter(Boolean)
              .join(" · ")
          : null,
    };
  });
}

export interface LinhaResumoCob {
  cob: string;
  nivel: NivelRisco | null;
  rotuloNivel: string;
  /** Quantidade por nível, na ordem de `niveis` da tabela. */
  quantidades: number[];
  semDado: number;
  total: number;
}

export interface ResumoCobTabela {
  niveis: NivelRisco[];
  linhas: LinhaResumoCob[];
  semDado: string;
}

/** Tabela "Resumo por COB": quantos municípios em cada nível da camada. */
export function resumoPorCob(dados: DadosPintura): ResumoCobTabela {
  const presentes = dados.areas.cob.flatMap((a) => NIVEIS_RISCO.filter((n) => a.contagem[n] > 0));
  const niveis = ordenarNiveis([...niveisDaPintura(dados.pintura), ...presentes]);
  return {
    niveis,
    semDado: rotuloSemDado(dados.pintura),
    linhas: dados.areas.cob.map((area) => {
      const comNivel = NIVEIS_RISCO.reduce((soma, n) => soma + area.contagem[n], 0);
      return {
        cob: area.cob,
        nivel: area.nivel,
        rotuloNivel: rotuloDoNivel(dados.pintura, area.nivel),
        quantidades: niveis.map((n) => area.contagem[n]),
        semDado: area.totalMunicipios - comNivel,
        total: area.totalMunicipios,
      };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// Geometria auxiliar: rótulos e envelopes para "aproximar"
// ---------------------------------------------------------------------------------------------

/** [oeste, sul, leste, norte] */
export type Envelope = [number, number, number, number];

function estenderEnvelope(env: Envelope | null, ponto: Position): Envelope {
  const [x, y] = ponto;
  if (!env) return [x, y, x, y];
  return [Math.min(env[0], x), Math.min(env[1], y), Math.max(env[2], x), Math.max(env[3], y)];
}

export function envelopeDaGeometria(geometria: Geometry | null | undefined): Envelope | null {
  if (!geometria) return null;
  let env: Envelope | null = null;
  const poligonos =
    geometria.type === "Polygon"
      ? [geometria.coordinates]
      : geometria.type === "MultiPolygon"
        ? geometria.coordinates
        : [];
  for (const aneis of poligonos) for (const ponto of aneis[0] ?? []) env = estenderEnvelope(env, ponto);
  return env;
}

export function juntarEnvelopes(a: Envelope | null, b: Envelope | null): Envelope | null {
  if (!a) return b;
  if (!b) return a;
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/** Envelope de cada município, UEOp e COB, a partir da malha municipal. */
export interface IndiceMalha {
  municipio: Map<string, Envelope>;
  ueop: Map<string, Envelope>;
  cob: Map<string, Envelope>;
}

export function indexarMalha(colecao: ColecaoPoligonos | null): IndiceMalha {
  const indice: IndiceMalha = { municipio: new Map(), ueop: new Map(), cob: new Map() };
  for (const f of colecao?.features ?? []) {
    const env = envelopeDaGeometria(f.geometry);
    const props = f.properties ?? {};
    if (!env) continue;
    for (const nivel of NIVEIS_AREA) {
      const chave = chaveDaArea(nivel, props);
      if (!chave || chave === " · ") continue;
      indice[nivel].set(chave, juntarEnvelopes(indice[nivel].get(chave) ?? null, env)!);
    }
  }
  return indice;
}

export interface RotuloArea {
  nivelArea: Exclude<NivelArea, "municipio">;
  chave: string;
  /** "1º COB", "2º BBM" */
  texto: string;
  nivel: NivelRisco | null;
  rotuloNivel: string;
  ponto: [number, number];
}

/**
 * Rótulos das áreas no ponto interno de cada polígono (COB oficial ou UEOp
 * aproximada), com o nível da pintura atual.
 */
export function rotulosDasAreas(
  colecao: ColecaoPoligonos | null,
  nivelArea: Exclude<NivelArea, "municipio">,
  dados: DadosPintura | null,
): RotuloArea[] {
  const niveis = dados ? niveisPorChave(dados, nivelArea) : new Map<string, NivelRisco>();
  const rotulos: RotuloArea[] = [];
  for (const f of colecao?.features ?? []) {
    const props = f.properties ?? {};
    const chave = nivelArea === "cob" ? chaveDaArea("cob", props) : typeof props.chave === "string" ? props.chave : "";
    const texto = nivelArea === "cob" ? chave : typeof props.ueop === "string" ? props.ueop : chave;
    const ponto = pontoDeRotulo(f.geometry);
    if (!chave || !ponto) continue;
    const nivel = niveis.get(chave) ?? null;
    rotulos.push({
      nivelArea,
      chave,
      texto,
      nivel,
      rotuloNivel: dados ? rotuloDoNivel(dados.pintura, nivel) : "",
      ponto,
    });
  }
  return rotulos;
}

/**
 * Reserva para os rótulos dos COBs quando os limites oficiais não carregam:
 * a média das sedes municipais de cada COB.
 */
export function rotulosCobPelasSedes(
  territorio: readonly (MunicipioTerritorio & { lat: number; lon: number })[],
  dados: DadosPintura | null,
): RotuloArea[] {
  const somas = new Map<string, { lon: number; lat: number; n: number }>();
  for (const m of territorio) {
    const s = somas.get(m.cob) ?? { lon: 0, lat: 0, n: 0 };
    somas.set(m.cob, { lon: s.lon + m.lon, lat: s.lat + m.lat, n: s.n + 1 });
  }
  const niveis = dados ? niveisPorChave(dados, "cob") : new Map<string, NivelRisco>();
  return [...somas]
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true }))
    .map(([cob, s]) => {
      const nivel = niveis.get(cob) ?? null;
      return {
        nivelArea: "cob" as const,
        chave: cob,
        texto: cob,
        nivel,
        rotuloNivel: dados ? rotuloDoNivel(dados.pintura, nivel) : "",
        ponto: [s.lon / s.n, s.lat / s.n] as [number, number],
      };
    });
}

export interface CaixaTela {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

/** As duas caixas se tocam (com `folga` px de separação mínima)? */
function caixasSeTocam(a: CaixaTela, b: CaixaTela, folga: number): boolean {
  return (
    a.x - folga < b.x + b.largura &&
    a.x + a.largura + folga > b.x &&
    a.y - folga < b.y + b.altura &&
    a.y + a.altura + folga > b.y
  );
}

/**
 * Escolhe rótulos que não se sobrepõem, na ordem de prioridade recebida
 * (gulosa). `folga` em px separa as caixas. Para níveis com muitos rótulos
 * (UEOp, município): quem encosta num aceito fica de fora.
 */
export function rotulosSemSobreposicao<T>(
  candidatos: readonly (T & { caixa: CaixaTela })[],
  folga = 2,
): (T & { caixa: CaixaTela })[] {
  const aceitos: (T & { caixa: CaixaTela })[] = [];
  for (const c of candidatos) {
    if (!aceitos.some((a) => caixasSeTocam(c.caixa, a.caixa, folga))) aceitos.push(c);
  }
  return aceitos;
}

/**
 * Rótulos que NUNCA somem (nível COB: são só seis, e o padrão visual §7 proíbe
 * identificar o COB só pela cor). Na ordem de prioridade recebida, quem encosta
 * num já aceito é empurrado na vertical — primeiro para longe do rótulo em que
 * encostou, cada vez mais longe; depois para o lado oposto — até `tentativas`
 * posições (uma altura de caixa + folga por passo). Sem lugar livre, fica no
 * ponto original: visível, ainda que encostando. Todos os candidatos voltam,
 * com o `deslocamento` [dx, dy] em px a aplicar ao marcador.
 */
export function rotulosDeslocados<T>(
  candidatos: readonly (T & { caixa: CaixaTela })[],
  folga = 2,
  tentativas = 4,
): (T & { caixa: CaixaTela; deslocamento: [number, number] })[] {
  const aceitos: (T & { caixa: CaixaTela; deslocamento: [number, number] })[] = [];
  const paraLonge = Math.ceil(tentativas / 2);
  for (const c of candidatos) {
    const original = c.caixa;
    const colisor = aceitos.find((a) => caixasSeTocam(original, a.caixa, folga));
    if (!colisor) {
      aceitos.push({ ...c, deslocamento: [0, 0] });
      continue;
    }
    const centro = original.y + original.altura / 2;
    const centroColisor = colisor.caixa.y + colisor.caixa.altura / 2;
    // Para baixo se este rótulo já está abaixo (ou na altura) do outro; senão para cima.
    const sentido = centro >= centroColisor ? 1 : -1;
    const passo = original.altura + folga;
    let escolhido: { caixa: CaixaTela; deslocamento: [number, number] } | null = null;
    for (let i = 1; i <= tentativas && !escolhido; i++) {
      const dy = i <= paraLonge ? sentido * i * passo : -sentido * (i - paraLonge) * passo;
      const caixa = { ...original, y: original.y + dy };
      if (!aceitos.some((a) => caixasSeTocam(caixa, a.caixa, folga))) escolhido = { caixa, deslocamento: [0, dy] };
    }
    aceitos.push({ ...c, ...(escolhido ?? { caixa: original, deslocamento: [0, 0] as [number, number] }) });
  }
  return aceitos;
}
