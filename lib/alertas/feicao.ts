import { NIVEIS_RISCO, type NivelRisco } from "@/lib/dominio/matrizes";
import { municipioPorIbge } from "@/lib/territorio/municipios";
import {
  ALVOS_HISTORICO,
  CANAIS_NOTIFICACAO,
  CAP_CERTEZAS,
  CAP_ESCOPOS,
  CAP_MSG_TYPES,
  CAP_RESPOSTAS,
  CAP_URGENCIAS,
  CODIGOS_SITUACAO,
  EVENTOS,
  EVENTOS_HISTORICO,
  FONTES_GATILHO,
  NATUREZAS,
  NIVEIS_ALERTA,
  NIVEIS_DESTINATARIO,
  ORIGENS_REGISTRO,
  RESULTADOS_ACAO,
  SITUACOES_DESTINATARIO,
  TIPOS_ACAO,
  TIPOS_RISCO_SALA,
} from "./codigos";
import type { AcaoRrdSala, AlertaSala, Destinatario, EventoHistorico } from "./dominio";

/**
 * Conversão PURA entre o domínio da fila (AlertaSala, Destinatario,
 * AcaoRrdSala, EventoHistorico) e as feições das camadas
 * SalaSituacao_AlertasRRD (scripts/arcgis/criar_camadas_sala.py).
 *
 * É a MESMA nos três armazéns (memória, Postgres e ArcGIS): o que a memória e
 * o Postgres guardam é exatamente o que o ArcGIS receberia no applyEdits.
 * - nomes de campo EXATOS do script (tests/alertas-feicao.test.ts confere);
 * - datas em epoch ms (o applyEdits só aceita isso em campo de data);
 * - "<" e ">" trocados por "menor que"/"maior que": o serviço nasce com
 *   xssPreventionInfo rejectInvalid e recusaria a feição inteira;
 * - texto cortado no tamanho do campo (o portal recusaria);
 * - sem coordenada, o ponto é a sede municipal (MUNICIPIOS_MG): a Sala conta
 *   registros sem geometria.
 */

// ---------------------------------------------------------------------------------------------
// Formato Esri
// ---------------------------------------------------------------------------------------------

export type ValorAtributo = string | number | null;
export type AtributosEsri = Record<string, ValorAtributo>;

export interface PontoEsri {
  x: number;
  y: number;
  spatialReference?: { wkid: number };
}

/** Feição de camada de ponto (alertas, ações). As tabelas usam só `attributes`. */
export interface FeicaoPontoEsri {
  attributes: AtributosEsri;
  geometry: PontoEsri | null;
}

// ---------------------------------------------------------------------------------------------
// Tabelas de campos (uma por camada)
// ---------------------------------------------------------------------------------------------

export const CAMADAS_SALA = ["Sala_Alertas", "Sala_Acoes_RRD", "Sala_Alertas_Destinatarios", "Sala_Alertas_Historico"] as const;
export type CamadaSala = (typeof CAMADAS_SALA)[number];

/** Tipo do campo na camada (esriFieldType*). */
export type TipoCampoSala = "texto" | "data" | "double" | "inteiro";

type Conversao =
  /** Código de um domínio (valor desconhecido na leitura → null, ou erro se `exigido`). */
  | { tipo: "codigo"; codigos: readonly string[]; exigido?: boolean }
  /** nivel_alerta: "LARANJA" ↔ "laranja". */
  | { tipo: "nivel" }
  /** S/N ↔ boolean; vazio = não respondido (null). */
  | { tipo: "simnao" }
  /** Lista de textos ↔ texto separado por vírgula. */
  | { tipo: "lista" };

export interface CampoSala<T> {
  /** Nome do campo na feição (exato do script). */
  nome: string;
  /** Propriedade do domínio. */
  chave: keyof T & string;
  tipo: TipoCampoSala;
  /** Tamanho do campo de texto (esriFieldTypeString length). */
  tamanho?: number;
  conversao?: Conversao;
}

// Tamanhos do script (folgados de propósito).
const T_ID = 40;
const T_PSEUDO = 64;
const T_DOMINIO = 60;
const T_COB = 30;
const T_UEOP = 80;
const T_FRACAO = 120;
const T_MUN = 120;

const codigo = (lista: readonly { codigo: string }[], exigido = false): Conversao => ({
  tipo: "codigo",
  codigos: lista.map((o) => o.codigo),
  exigido,
});

function territorio<T extends { cob: unknown; ueop: unknown; fracao: unknown; municipio: unknown; codIbge: unknown }>(): CampoSala<T>[] {
  return [
    { nome: "cob", chave: "cob" as keyof T & string, tipo: "texto", tamanho: T_COB },
    { nome: "ueop", chave: "ueop" as keyof T & string, tipo: "texto", tamanho: T_UEOP },
    { nome: "fracao", chave: "fracao" as keyof T & string, tipo: "texto", tamanho: T_FRACAO },
    { nome: "municipio", chave: "municipio" as keyof T & string, tipo: "texto", tamanho: T_MUN },
    { nome: "cod_ibge", chave: "codIbge" as keyof T & string, tipo: "texto", tamanho: 7 },
  ];
}

export const CAMPOS_ALERTA: readonly CampoSala<AlertaSala>[] = [
  { nome: "alerta_id", chave: "alertaId", tipo: "texto", tamanho: T_ID },
  { nome: "lote_id", chave: "loteId", tipo: "texto", tamanho: T_ID },
  { nome: "situacao", chave: "situacao", tipo: "texto", tamanho: 20, conversao: { tipo: "codigo", codigos: CODIGOS_SITUACAO, exigido: true } },
  { nome: "natureza", chave: "natureza", tipo: "texto", tamanho: 12, conversao: codigo(NATUREZAS, true) },
  { nome: "origem_registro", chave: "origemRegistro", tipo: "texto", tamanho: 12, conversao: codigo(ORIGENS_REGISTRO, true) },
  { nome: "fonte_gatilho", chave: "fonteGatilho", tipo: "texto", tamanho: 12, conversao: codigo(FONTES_GATILHO) },
  { nome: "fonte_ref", chave: "fonteRef", tipo: "texto", tamanho: 255 },
  { nome: "tipo_risco", chave: "tipoRisco", tipo: "texto", tamanho: 20, conversao: codigo(TIPOS_RISCO_SALA) },
  { nome: "evento", chave: "evento", tipo: "texto", tamanho: 20, conversao: codigo(EVENTOS) },
  { nome: "nivel_alerta", chave: "nivelAlerta", tipo: "texto", tamanho: 10, conversao: { tipo: "nivel" } },
  { nome: "numero_chamada", chave: "numeroChamada", tipo: "texto", tamanho: 30 },
  { nome: "mm_hora", chave: "mmHora", tipo: "double" },
  { nome: "mm_24h", chave: "mm24h", tipo: "double" },
  { nome: "bacia", chave: "bacia", tipo: "texto", tamanho: 120 },
  { nome: "rio", chave: "rio", tipo: "texto", tamanho: 120 },
  { nome: "cota", chave: "cota", tipo: "double" },
  { nome: "estacao_codigo", chave: "estacaoCodigo", tipo: "texto", tamanho: 20 },
  { nome: "indice_risco", chave: "indiceRisco", tipo: "double" },
  ...territorio<AlertaSala>(),
  { nome: "local_referencia", chave: "localReferencia", tipo: "texto", tamanho: 255 },
  { nome: "titulo", chave: "titulo", tipo: "texto", tamanho: 160 },
  { nome: "descricao", chave: "descricao", tipo: "texto", tamanho: 4000 },
  { nome: "instrucao", chave: "instrucao", tipo: "texto", tamanho: 2000 },
  { nome: "area_desc", chave: "areaDesc", tipo: "texto", tamanho: 500 },
  { nome: "cap_identifier", chave: "capIdentifier", tipo: "texto", tamanho: 120 },
  { nome: "cap_msg_type", chave: "capMsgType", tipo: "texto", tamanho: 10, conversao: codigo(CAP_MSG_TYPES) },
  { nome: "cap_escopo", chave: "capEscopo", tipo: "texto", tamanho: 12, conversao: codigo(CAP_ESCOPOS, true) },
  { nome: "cap_urgencia", chave: "capUrgencia", tipo: "texto", tamanho: 12, conversao: codigo(CAP_URGENCIAS) },
  { nome: "cap_certeza", chave: "capCerteza", tipo: "texto", tamanho: 12, conversao: codigo(CAP_CERTEZAS) },
  { nome: "cap_resposta", chave: "capResposta", tipo: "texto", tamanho: 12, conversao: codigo(CAP_RESPOSTAS) },
  { nome: "data_emissao", chave: "dataEmissao", tipo: "data" },
  { nome: "inicio_vigencia", chave: "inicioVigencia", tipo: "data" },
  { nome: "valido_ate", chave: "validoAte", tipo: "data" },
  { nome: "prazo_acao", chave: "prazoAcao", tipo: "data" },
  { nome: "encerrado_em", chave: "encerradoEm", tipo: "data" },
  { nome: "motivo_cancelamento", chave: "motivoCancelamento", tipo: "texto", tamanho: 500 },
  { nome: "id_op", chave: "idOp", tipo: "texto", tamanho: 50 },
  { nome: "criado_por_id", chave: "criadoPorId", tipo: "texto", tamanho: T_PSEUDO },
  { nome: "criado_em", chave: "criadoEm", tipo: "data" },
  { nome: "emitido_por_id", chave: "emitidoPorId", tipo: "texto", tamanho: T_PSEUDO },
  { nome: "emitido_por_dominio", chave: "emitidoPorDominio", tipo: "texto", tamanho: T_DOMINIO },
  { nome: "alterado_por_id", chave: "alteradoPorId", tipo: "texto", tamanho: T_PSEUDO },
  { nome: "alterado_em", chave: "alteradoEm", tipo: "data" },
];

export const CAMPOS_ACAO: readonly CampoSala<AcaoRrdSala>[] = [
  { nome: "acao_id", chave: "acaoId", tipo: "texto", tamanho: T_ID },
  { nome: "alerta_id", chave: "alertaId", tipo: "texto", tamanho: T_ID },
  { nome: "numero_chamada", chave: "numeroChamada", tipo: "texto", tamanho: 30 },
  { nome: "ocorrencia_cad", chave: "ocorrenciaCad", tipo: "texto", tamanho: 30 },
  { nome: "natureza", chave: "natureza", tipo: "texto", tamanho: 12, conversao: codigo(NATUREZAS, true) },
  { nome: "origem_registro", chave: "origemRegistro", tipo: "texto", tamanho: 12, conversao: codigo(ORIGENS_REGISTRO, true) },
  { nome: "tipo_risco", chave: "tipoRisco", tipo: "texto", tamanho: 20, conversao: codigo(TIPOS_RISCO_SALA) },
  { nome: "tipo_acao", chave: "tipoAcao", tipo: "texto", tamanho: 20, conversao: codigo(TIPOS_ACAO, true) },
  { nome: "resultado", chave: "resultado", tipo: "texto", tamanho: 16, conversao: codigo(RESULTADOS_ACAO, true) },
  { nome: "acao_executada", chave: "acaoExecutada", tipo: "texto", tamanho: 2000 },
  { nome: "data_acao", chave: "dataAcao", tipo: "data" },
  ...territorio<AcaoRrdSala>(),
  { nome: "local_referencia", chave: "localReferencia", tipo: "texto", tamanho: 255 },
  { nome: "pessoas_orientadas", chave: "pessoasOrientadas", tipo: "inteiro" },
  { nome: "pessoas_removidas", chave: "pessoasRemovidas", tipo: "inteiro" },
  { nome: "imoveis_vistoriados", chave: "imoveisVistoriados", tipo: "inteiro" },
  { nome: "imoveis_interditados", chave: "imoveisInterditados", tipo: "inteiro" },
  { nome: "efetivo_empregado", chave: "efetivoEmpregado", tipo: "inteiro" },
  { nome: "viaturas_empregadas", chave: "viaturasEmpregadas", tipo: "inteiro" },
  { nome: "compdec_acionada", chave: "compdecAcionada", tipo: "texto", tamanho: 1, conversao: { tipo: "simnao" } },
  { nome: "registrado_por_id", chave: "registradoPorId", tipo: "texto", tamanho: T_PSEUDO },
  { nome: "registrado_por_dominio", chave: "registradoPorDominio", tipo: "texto", tamanho: T_DOMINIO },
  { nome: "criado_em", chave: "criadoEm", tipo: "data" },
  { nome: "alterado_por_id", chave: "alteradoPorId", tipo: "texto", tamanho: T_PSEUDO },
  { nome: "alterado_em", chave: "alteradoEm", tipo: "data" },
];

export const CAMPOS_DESTINATARIO: readonly CampoSala<Destinatario>[] = [
  { nome: "alerta_id", chave: "alertaId", tipo: "texto", tamanho: T_ID },
  { nome: "dest_nivel", chave: "destNivel", tipo: "texto", tamanho: 10, conversao: codigo(NIVEIS_DESTINATARIO, true) },
  { nome: "cob", chave: "cob", tipo: "texto", tamanho: T_COB },
  { nome: "ueop", chave: "ueop", tipo: "texto", tamanho: T_UEOP },
  { nome: "fracao", chave: "fracao", tipo: "texto", tamanho: T_FRACAO },
  { nome: "principal", chave: "principal", tipo: "texto", tamanho: 1, conversao: { tipo: "simnao" } },
  { nome: "situacao_dest", chave: "situacaoDest", tipo: "texto", tamanho: 16, conversao: codigo(SITUACOES_DESTINATARIO, true) },
  { nome: "canal_notificacao", chave: "canalNotificacao", tipo: "texto", tamanho: 10, conversao: codigo(CANAIS_NOTIFICACAO) },
  { nome: "notificado_em", chave: "notificadoEm", tipo: "data" },
  { nome: "ciente_em", chave: "cienteEm", tipo: "data" },
  { nome: "ciente_por_id", chave: "cientePorId", tipo: "texto", tamanho: T_PSEUDO },
  { nome: "ciente_por_dominio", chave: "cientePorDominio", tipo: "texto", tamanho: T_DOMINIO },
  { nome: "redirecionado_para", chave: "redirecionadoPara", tipo: "texto", tamanho: 120 },
  { nome: "observacao", chave: "observacao", tipo: "texto", tamanho: 1000 },
  { nome: "criado_em", chave: "criadoEm", tipo: "data" },
  { nome: "alterado_em", chave: "alteradoEm", tipo: "data" },
];

/** Histórico SEM domínio na camada: aqui os códigos só são conferidos na leitura (desconhecido → null). */
export const CAMPOS_HISTORICO: readonly CampoSala<EventoHistorico>[] = [
  { nome: "alerta_id", chave: "alertaId", tipo: "texto", tamanho: T_ID },
  { nome: "alvo_tipo", chave: "alvoTipo", tipo: "texto", tamanho: 12, conversao: { tipo: "codigo", codigos: ALVOS_HISTORICO, exigido: true } },
  { nome: "alvo_id", chave: "alvoId", tipo: "texto", tamanho: T_ID },
  { nome: "evento", chave: "evento", tipo: "texto", tamanho: 30, conversao: { tipo: "codigo", codigos: EVENTOS_HISTORICO, exigido: true } },
  { nome: "situacao_de", chave: "situacaoDe", tipo: "texto", tamanho: 20, conversao: { tipo: "codigo", codigos: CODIGOS_SITUACAO } },
  { nome: "situacao_para", chave: "situacaoPara", tipo: "texto", tamanho: 20, conversao: { tipo: "codigo", codigos: CODIGOS_SITUACAO } },
  { nome: "quando", chave: "quando", tipo: "data" },
  { nome: "por_id", chave: "porId", tipo: "texto", tamanho: T_PSEUDO },
  { nome: "por_dominio", chave: "porDominio", tipo: "texto", tamanho: T_DOMINIO },
  { nome: "cap_identifier", chave: "capIdentifier", tipo: "texto", tamanho: 120 },
  { nome: "cap_msg_type", chave: "capMsgType", tipo: "texto", tamanho: 10, conversao: codigo(CAP_MSG_TYPES) },
  { nome: "cap_json", chave: "capJson", tipo: "texto", tamanho: 20000 },
  { nome: "campos_alterados", chave: "camposAlterados", tipo: "texto", tamanho: 1000, conversao: { tipo: "lista" } },
  { nome: "detalhe", chave: "detalhe", tipo: "texto", tamanho: 2000 },
];

/** Descrição de um campo sem a ligação com o domínio (conferências, esquema do Postgres). */
export interface DescricaoCampoSala {
  nome: string;
  tipo: TipoCampoSala;
  tamanho?: number;
}

const CAMPOS_POR_CAMADA: Record<CamadaSala, readonly DescricaoCampoSala[]> = {
  Sala_Alertas: CAMPOS_ALERTA,
  Sala_Acoes_RRD: CAMPOS_ACAO,
  Sala_Alertas_Destinatarios: CAMPOS_DESTINATARIO,
  Sala_Alertas_Historico: CAMPOS_HISTORICO,
};

/** Campos de uma camada, para conferências (testes, /status). */
export function camposDaCamada(camada: CamadaSala): readonly DescricaoCampoSala[] {
  return CAMPOS_POR_CAMADA[camada];
}

/** Tamanho de um campo de texto (limite da validação de entrada). */
export function tamanhoTexto(camada: CamadaSala, campo: string): number {
  const def = CAMPOS_POR_CAMADA[camada].find((c) => c.nome === campo);
  if (!def || def.tipo !== "texto" || def.tamanho === undefined) {
    throw new Error(`Campo de texto desconhecido: ${camada}.${campo}`);
  }
  return def.tamanho;
}

// ---------------------------------------------------------------------------------------------
// Conversões de valor
// ---------------------------------------------------------------------------------------------

/**
 * Proteção XSS do portal (rejectInvalid): "<" e ">" fazem o serviço recusar a
 * feição inteira. "< 50 mm" vira "menor que 50 mm"; "<=" e ">=" viram
 * "menor ou igual a"/"maior ou igual a". "≤"/"≥" passam (não são "<"/">").
 */
export function textoSeguro(texto: string): string {
  return texto
    .replace(/ ?<= ?/g, " menor ou igual a ")
    .replace(/ ?>= ?/g, " maior ou igual a ")
    .replace(/ ?< ?/g, " menor que ")
    .replace(/ ?> ?/g, " maior que ")
    .trim();
}

function paraEpoch(iso: unknown): number | null {
  if (typeof iso !== "string" || !iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

function deEpoch(valor: unknown): string | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return new Date(valor).toISOString();
  // Alguns clientes devolvem data como texto ISO; aceita na leitura.
  if (typeof valor === "string" && valor) {
    const t = Date.parse(valor);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  return null;
}

function numeroOuNulo(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "string" && valor.trim()) {
    const n = Number(valor.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function textoOuNulo(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const t = String(valor);
  return t === "" ? null : t;
}

const NIVEL_PARA_CODIGO = Object.fromEntries(NIVEIS_ALERTA.map((n) => [n.nivel, n.codigo])) as Record<NivelRisco, string>;
const CODIGO_PARA_NIVEL = new Map<string, NivelRisco>(NIVEIS_ALERTA.map((n) => [n.codigo, n.nivel]));

export class ErroFeicao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroFeicao";
  }
}

function escreverValor<T>(campo: CampoSala<T>, valor: unknown): ValorAtributo {
  if (valor === null || valor === undefined) return null;
  switch (campo.tipo) {
    case "data":
      return paraEpoch(valor);
    case "double":
      return numeroOuNulo(valor);
    case "inteiro": {
      const n = numeroOuNulo(valor);
      return n === null ? null : Math.round(n);
    }
    case "texto": {
      let texto: string;
      if (campo.conversao?.tipo === "nivel") {
        texto = NIVEL_PARA_CODIGO[valor as NivelRisco] ?? "";
      } else if (campo.conversao?.tipo === "simnao") {
        texto = valor === true ? "S" : valor === false ? "N" : "";
      } else if (campo.conversao?.tipo === "lista") {
        texto = (valor as readonly string[]).join(",");
      } else {
        texto = String(valor);
      }
      texto = textoSeguro(texto);
      if (campo.tamanho !== undefined && texto.length > campo.tamanho) texto = texto.slice(0, campo.tamanho);
      return texto === "" ? null : texto;
    }
  }
}

function lerValor<T>(campo: CampoSala<T>, valor: unknown): unknown {
  switch (campo.tipo) {
    case "data":
      return deEpoch(valor);
    case "double":
    case "inteiro":
      return numeroOuNulo(valor);
    case "texto": {
      const texto = textoOuNulo(valor);
      const conv = campo.conversao;
      if (!conv) return texto;
      switch (conv.tipo) {
        case "nivel":
          return texto ? (CODIGO_PARA_NIVEL.get(texto.toUpperCase()) ?? null) : null;
        case "simnao":
          return texto === "S" ? true : texto === "N" ? false : null;
        case "lista":
          return texto ? texto.split(",").map((s) => s.trim()).filter(Boolean) : [];
        case "codigo":
          if (texto !== null && conv.codigos.includes(texto)) return texto;
          if (conv.exigido) {
            throw new ErroFeicao(`Valor fora do domínio em ${campo.nome}: ${JSON.stringify(valor)}`);
          }
          return null;
      }
    }
  }
}

function paraAtributos<T>(campos: readonly CampoSala<T>[], objeto: T, objectid: number | null): AtributosEsri {
  const atributos: AtributosEsri = {};
  if (objectid !== null) atributos.objectid = objectid;
  for (const campo of campos) atributos[campo.nome] = escreverValor(campo, objeto[campo.chave]);
  return atributos;
}

function deAtributos<T>(campos: readonly CampoSala<T>[], atributos: Record<string, unknown>): T {
  const objeto: Record<string, unknown> = { objectid: numeroOuNulo(atributos.objectid ?? atributos.OBJECTID) };
  for (const campo of campos) objeto[campo.chave] = lerValor(campo, atributos[campo.nome]);
  return objeto as T;
}

// ---------------------------------------------------------------------------------------------
// Ponto: coordenada informada ou sede municipal
// ---------------------------------------------------------------------------------------------

function coordenadaValida(lon: unknown, lat: unknown): boolean {
  return typeof lon === "number" && typeof lat === "number" && Number.isFinite(lon) && Number.isFinite(lat);
}

/** Ponto informado ou, sem ele, a sede do município (IBGE); null se nem isso. */
export function pontoDoRegistro(r: { longitude: number | null; latitude: number | null; codIbge: string | null }): PontoEsri | null {
  if (coordenadaValida(r.longitude, r.latitude)) {
    return { x: r.longitude as number, y: r.latitude as number, spatialReference: { wkid: 4326 } };
  }
  const sede = municipioPorIbge(r.codIbge);
  return sede ? { x: sede.lon, y: sede.lat, spatialReference: { wkid: 4326 } } : null;
}

function coordenadasDoPonto(geometria: unknown): { longitude: number | null; latitude: number | null } {
  if (geometria && typeof geometria === "object") {
    const { x, y } = geometria as { x?: unknown; y?: unknown };
    if (coordenadaValida(x, y)) return { longitude: x as number, latitude: y as number };
  }
  return { longitude: null, latitude: null };
}

// ---------------------------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------------------------

export function alertaParaFeicao(alerta: AlertaSala): FeicaoPontoEsri {
  return { attributes: paraAtributos(CAMPOS_ALERTA, alerta, alerta.objectid), geometry: pontoDoRegistro(alerta) };
}

export function feicaoParaAlerta(feicao: { attributes: Record<string, unknown>; geometry?: unknown }): AlertaSala {
  const base = deAtributos(CAMPOS_ALERTA, feicao.attributes);
  if (!base.alertaId) throw new ErroFeicao("Alerta sem alerta_id.");
  return { ...base, ...coordenadasDoPonto(feicao.geometry) };
}

export function acaoParaFeicao(acao: AcaoRrdSala): FeicaoPontoEsri {
  return { attributes: paraAtributos(CAMPOS_ACAO, acao, acao.objectid), geometry: pontoDoRegistro(acao) };
}

export function feicaoParaAcao(feicao: { attributes: Record<string, unknown>; geometry?: unknown }): AcaoRrdSala {
  const base = deAtributos(CAMPOS_ACAO, feicao.attributes);
  if (!base.acaoId) throw new ErroFeicao("Ação sem acao_id.");
  return { ...base, ...coordenadasDoPonto(feicao.geometry) };
}

export function destinatarioParaAtributos(destinatario: Destinatario): AtributosEsri {
  return paraAtributos(CAMPOS_DESTINATARIO, destinatario, destinatario.objectid);
}

export function atributosParaDestinatario(atributos: Record<string, unknown>): Destinatario {
  const d = deAtributos(CAMPOS_DESTINATARIO, atributos);
  return { ...d, principal: d.principal === true };
}

export function eventoParaAtributos(evento: EventoHistorico): AtributosEsri {
  return paraAtributos(CAMPOS_HISTORICO, evento, evento.objectid);
}

export function atributosParaEvento(atributos: Record<string, unknown>): EventoHistorico {
  const e = deAtributos(CAMPOS_HISTORICO, atributos);
  return { ...e, quando: e.quando ?? new Date(0).toISOString(), camposAlterados: e.camposAlterados ?? [] };
}

/** Os níveis da feição cobrem a escala das matrizes, na mesma ordem (conferido em teste). */
export const NIVEIS_FEICAO_NA_ORDEM = NIVEIS_RISCO.map((n) => NIVEL_PARA_CODIGO[n]);
