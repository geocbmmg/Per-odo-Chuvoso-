import { z } from "zod";
import {
  CORES_NIVEL,
  MATRIZ_HIDROLOGICA,
  NIVEIS_HIDROLOGICOS,
  NIVEIS_RISCO,
  classificarChuvaDetalhada,
  classificarIndiceGeologico,
  MATRIZ_GEOLOGICA,
  type NivelHidrologico,
  type NivelRisco,
} from "@/lib/dominio/matrizes";
import { buscarFracao, FRACOES_CBMMG, type FracaoCbmmg } from "@/lib/territorio/fracoes";
import { municipioPorIbge, municipioPorNome } from "@/lib/territorio/municipios";
import {
  CAP_CERTEZAS,
  CAP_ESCOPOS,
  CAP_RESPOSTAS,
  CAP_URGENCIAS,
  COBS_FEICAO,
  EVENTOS,
  FONTES_GATILHO,
  NATUREZAS,
  RESULTADOS_ACAO,
  TIPOS_ACAO,
  TIPOS_RISCO_SALA,
  type AlvoHistorico,
  type CanalNotificacao,
  type CapCerteza,
  type CapEscopo,
  type CapMsgType,
  type CapResposta,
  type CapUrgencia,
  type EventoAlerta,
  type EventoHistoricoTipo,
  type FonteGatilho,
  type Natureza,
  type NivelDestinatario,
  type OrigemRegistro,
  type ResultadoAcao,
  type SituacaoAlerta,
  type SituacaoDestinatario,
  type TipoAcao,
  type TipoRiscoSala,
} from "./codigos";
import { tamanhoTexto } from "./feicao";

/**
 * Domínio da emissão e da fila de alertas da Sala (docs/fase-1.md §4).
 *
 * Tipos, máquina de estados, estados derivados, validação por ação (zod),
 * sugestão de nível pela matriz oficial e coerência do território. Puro: sem
 * React, Next, server-only nem relógio implícito (o "agora" é sempre
 * parâmetro). A conversão para a feição do ArcGIS fica em feicao.ts.
 *
 * Datas na API e no domínio: ISO 8601 em UTC. Na feição: epoch em ms.
 */

// ---------------------------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------------------------

/** Um alerta da Sala: uma linha de Sala_Alertas (um município × uma unidade principal). */
export interface AlertaSala {
  /** OBJECTID da linha no armazém; null antes de gravar. */
  objectid: number | null;
  /** "AL-AAAAMMDD-NNNN", gerado pelo servidor (sequencial por dia de Brasília). */
  alertaId: string;
  /** Lote de emissão (CAP incidents): alertas do mesmo evento em vários municípios. */
  loteId: string | null;
  situacao: SituacaoAlerta;
  natureza: Natureza;
  origemRegistro: OrigemRegistro;
  fonteGatilho: FonteGatilho | null;
  fonteRef: string | null;
  tipoRisco: TipoRiscoSala | null;
  evento: EventoAlerta | null;
  /** Escala única das matrizes (lib/dominio/matrizes.ts). */
  nivelAlerta: NivelRisco | null;
  numeroChamada: string | null;
  /** Meteorológico. */
  mmHora: number | null;
  mm24h: number | null;
  /** Hidrológico: cota em CENTÍMETROS, como no formulário atual. */
  bacia: string | null;
  rio: string | null;
  cota: number | null;
  estacaoCodigo: string | null;
  /** Geológico: índice GeoRisk/CEMADEN. */
  indiceRisco: number | null;
  /** Território: COB e UEOp saem da fração (lista oficial de 96); município pelo IBGE. */
  cob: string | null;
  ueop: string | null;
  /** Fração abaixo da UEOp ("2ª Cia/1º Pel (Ouro Preto)"); null quando é a sede da UEOp/COB. */
  fracao: string | null;
  municipio: string | null;
  codIbge: string | null;
  localReferencia: string | null;
  /** Conteúdo (CAP info). */
  titulo: string | null;
  descricao: string | null;
  instrucao: string | null;
  areaDesc: string | null;
  /** CAP: o que não é derivável de outro campo. */
  capIdentifier: string | null;
  capMsgType: CapMsgType | null;
  capEscopo: CapEscopo;
  capUrgencia: CapUrgencia | null;
  capCerteza: CapCerteza | null;
  capResposta: CapResposta | null;
  /** Tempos (ISO UTC). */
  dataEmissao: string | null;
  inicioVigencia: string | null;
  validoAte: string | null;
  prazoAcao: string | null;
  encerradoEm: string | null;
  motivoCancelamento: string | null;
  /** Operação no GeoRescue (opcional). */
  idOp: string | null;
  /** Rastro preenchido PELO SERVIDOR: pseudônimos (HMAC), nunca CPF, nome ou nº BM. */
  criadoPorId: string | null;
  criadoEm: string | null;
  emitidoPorId: string | null;
  emitidoPorDominio: string | null;
  alteradoPorId: string | null;
  /** Também é a versão do registro (concorrência otimista). */
  alteradoEm: string | null;
  /** Ponto (WGS84). Sem clique no mapa, a sede municipal (feicao.ts). */
  longitude: number | null;
  latitude: number | null;
}

/** Unidade notificada de um alerta (Sala_Alertas_Destinatarios): notificação e ciência. */
export interface Destinatario {
  objectid: number | null;
  alertaId: string;
  destNivel: NivelDestinatario;
  cob: string | null;
  ueop: string | null;
  fracao: string | null;
  /** Responsável pela ação RRD. */
  principal: boolean;
  situacaoDest: SituacaoDestinatario;
  canalNotificacao: CanalNotificacao | null;
  notificadoEm: string | null;
  cienteEm: string | null;
  cientePorId: string | null;
  cientePorDominio: string | null;
  redirecionadoPara: string | null;
  observacao: string | null;
  criadoEm: string | null;
  alteradoEm: string | null;
}

/** Ação de Redução do Risco de Desastres executada (Sala_Acoes_RRD). */
export interface AcaoRrdSala {
  objectid: number | null;
  /** "AC-AAAAMMDD-NNNN", gerado pelo servidor. */
  acaoId: string;
  alertaId: string | null;
  /** Copiado do alerta PELO SERVIDOR (vínculo legado alerta → ação → ocorrência). */
  numeroChamada: string | null;
  ocorrenciaCad: string | null;
  natureza: Natureza;
  origemRegistro: OrigemRegistro;
  tipoRisco: TipoRiscoSala | null;
  tipoAcao: TipoAcao;
  resultado: ResultadoAcao;
  acaoExecutada: string | null;
  dataAcao: string | null;
  cob: string | null;
  ueop: string | null;
  fracao: string | null;
  municipio: string | null;
  codIbge: string | null;
  localReferencia: string | null;
  pessoasOrientadas: number | null;
  pessoasRemovidas: number | null;
  imoveisVistoriados: number | null;
  imoveisInterditados: number | null;
  efetivoEmpregado: number | null;
  viaturasEmpregadas: number | null;
  /** null = não respondido (nunca "não"). */
  compdecAcionada: boolean | null;
  registradoPorId: string | null;
  registradoPorDominio: string | null;
  criadoEm: string | null;
  alteradoPorId: string | null;
  alteradoEm: string | null;
  longitude: number | null;
  latitude: number | null;
}

/** Linha da trilha de auditoria (Sala_Alertas_Historico): só acrescenta. */
export interface EventoHistorico {
  objectid: number | null;
  alertaId: string;
  alvoTipo: AlvoHistorico;
  alvoId: string | null;
  evento: EventoHistoricoTipo;
  situacaoDe: SituacaoAlerta | null;
  situacaoPara: SituacaoAlerta | null;
  quando: string;
  porId: string | null;
  porDominio: string | null;
  capIdentifier: string | null;
  capMsgType: CapMsgType | null;
  /** Mensagem CAP como foi enviada, em JSON (XML seria recusado pelo filtro XSS do portal). */
  capJson: string | null;
  camposAlterados: string[];
  /** Antes → depois, sem dado pessoal. */
  detalhe: string | null;
}

/** Problema de validação de um campo. */
export interface Problema {
  campo: string;
  mensagem: string;
}

// ---------------------------------------------------------------------------------------------
// Máquina de estados
// ---------------------------------------------------------------------------------------------

/** Passos do fluxo. `iniciar_acao`/`concluir_acao` vêm do registro de uma ação RRD. */
export type PassoFluxo = "emitir" | "ciencia" | "iniciar_acao" | "concluir_acao" | "encerrar" | "cancelar";

export interface Transicao {
  readonly de: SituacaoAlerta;
  readonly passo: PassoFluxo;
  readonly para: SituacaoAlerta;
}

/**
 * Tabela EXPLÍCITA de transições (docs/fase-1.md §4.1). O que não está aqui é
 * recusado (409). Rascunho não se cancela: apaga-se (podeApagar). Encerrar
 * exige ação registrada; sem ação, o caminho é cancelar com motivo.
 */
export const TRANSICOES: readonly Transicao[] = [
  { de: "RASCUNHO", passo: "emitir", para: "EMITIDO" },
  { de: "EMITIDO", passo: "ciencia", para: "CIENTE" },
  { de: "CIENTE", passo: "iniciar_acao", para: "EM_ACAO" },
  { de: "CIENTE", passo: "concluir_acao", para: "ACAO_REGISTRADA" },
  { de: "EM_ACAO", passo: "concluir_acao", para: "ACAO_REGISTRADA" },
  { de: "ACAO_REGISTRADA", passo: "encerrar", para: "ENCERRADO" },
  { de: "EMITIDO", passo: "cancelar", para: "CANCELADO" },
  { de: "CIENTE", passo: "cancelar", para: "CANCELADO" },
  { de: "EM_ACAO", passo: "cancelar", para: "CANCELADO" },
  { de: "ACAO_REGISTRADA", passo: "cancelar", para: "CANCELADO" },
];

/** Situação de destino do passo, ou null se a transição não existe. */
export function transicao(de: SituacaoAlerta, passo: PassoFluxo): SituacaoAlerta | null {
  return TRANSICOES.find((t) => t.de === de && t.passo === passo)?.para ?? null;
}

export const SITUACOES_FINAIS: readonly SituacaoAlerta[] = ["ENCERRADO", "CANCELADO"];
/** Pendente = aguardando a unidade (derivado na leitura, nunca gravado). */
export const SITUACOES_PENDENTES: readonly SituacaoAlerta[] = ["EMITIDO", "CIENTE", "EM_ACAO"];
/** Emitido e ainda não final: aceita ciência, ação RRD e atualização (CAP Update). */
export const SITUACOES_EM_CURSO: readonly SituacaoAlerta[] = ["EMITIDO", "CIENTE", "EM_ACAO", "ACAO_REGISTRADA"];

export function ehFinal(situacao: SituacaoAlerta): boolean {
  return SITUACOES_FINAIS.includes(situacao);
}

/** Só o rascunho pode ser apagado; depois de emitido, só se cancela. */
export function podeApagar(situacao: SituacaoAlerta): boolean {
  return situacao === "RASCUNHO";
}

/** Edição: rascunho (livre) ou em curso (CAP Update, território travado). */
export function podeEditar(situacao: SituacaoAlerta): boolean {
  return situacao === "RASCUNHO" || SITUACOES_EM_CURSO.includes(situacao);
}

export function aceitaCienciaOuAcao(situacao: SituacaoAlerta): boolean {
  return SITUACOES_EM_CURSO.includes(situacao);
}

/**
 * Passos que o registro de uma ação RRD provoca a partir da situação atual:
 * registrar ação sem ciência dá a ciência implícita (EMITIDO → CIENTE); "em
 * andamento" leva a EM_AÇÃO; "concluída"/"parcial" a AÇÃO_REGISTRADA; "não
 * realizada" só registra (o alerta segue pendente). Nunca regride.
 */
export function passosDoRegistroDeAcao(situacao: SituacaoAlerta, resultado: ResultadoAcao): PassoFluxo[] {
  const passos: PassoFluxo[] = [];
  let atual = situacao;
  if (atual === "EMITIDO") {
    passos.push("ciencia");
    atual = "CIENTE";
  }
  const desejado: PassoFluxo | null =
    resultado === "EM_ANDAMENTO" ? "iniciar_acao" : resultado === "NAO_REALIZADA" ? null : "concluir_acao";
  if (desejado && transicao(atual, desejado)) passos.push(desejado);
  return passos;
}

/** Aplica os passos em sequência; lança se algum não existir na tabela. */
export function aplicarPassos(situacao: SituacaoAlerta, passos: readonly PassoFluxo[]): SituacaoAlerta {
  let atual = situacao;
  for (const passo of passos) {
    const proxima = transicao(atual, passo);
    if (!proxima) throw new Error(`Transição inexistente: ${atual} --${passo}-->`);
    atual = proxima;
  }
  return atual;
}

// ---------------------------------------------------------------------------------------------
// Estados derivados (calculados na leitura, nunca gravados)
// ---------------------------------------------------------------------------------------------

export interface EstadosDerivados {
  /** EMITIDO, CIENTE ou EM_AÇÃO. */
  pendente: boolean;
  /** Pendente com o prazo da ação RRD já passado. */
  vencido: boolean;
  /** Passou do "válido até". */
  vigenciaExpirada: boolean;
}

function instante(iso: string | null): number {
  return iso ? Date.parse(iso) : Number.NaN;
}

export function estadosDerivados(
  alerta: Pick<AlertaSala, "situacao" | "prazoAcao" | "validoAte">,
  agora: Date,
): EstadosDerivados {
  const t = agora.getTime();
  const pendente = SITUACOES_PENDENTES.includes(alerta.situacao);
  const prazo = instante(alerta.prazoAcao);
  const validade = instante(alerta.validoAte);
  return {
    pendente,
    vencido: pendente && !Number.isNaN(prazo) && t > prazo,
    vigenciaExpirada: !Number.isNaN(validade) && t > validade,
  };
}

// ---------------------------------------------------------------------------------------------
// Prazo da ação RRD e sugestão de nível
// ---------------------------------------------------------------------------------------------

/**
 * Prazo padrão da ação RRD por nível, em horas (o operador pode mudar).
 * 🔔 PROPOSTA A CONFIRMAR pela 3ª Seção do EMBM (docs/fase-1.md §9, item 4).
 * Igual a PRAZO_PADRAO_HORAS do script das camadas (conferido em teste).
 */
export const PRAZO_PADRAO_HORAS: Readonly<Record<NivelRisco, number>> = {
  verde: 24,
  amarelo: 12,
  laranja: 6,
  vermelho: 2,
  roxo: 2,
};

/** Prazo padrão (ISO) a partir da emissão. */
export function prazoPadrao(nivel: NivelRisco, emissao: Date): string {
  return new Date(emissao.getTime() + PRAZO_PADRAO_HORAS[nivel] * 3_600_000).toISOString();
}

/** Cotas de referência de uma estação (cm), para a sugestão hidrológica. */
export interface CotasReferencia {
  atencao?: number | null;
  alerta?: number | null;
  inundacao?: number | null;
}

export interface ValoresNivel {
  mmHora?: number | null;
  mm24h?: number | null;
  indiceRisco?: number | null;
  cota?: number | null;
  cotasReferencia?: CotasReferencia | null;
  /** Nível do SACE já informado pela fonte (normal, atencao, alerta, inundacao). */
  nivelHidrologico?: NivelHidrologico | null;
}

export interface SugestaoNivel {
  /** null quando a matriz não decide (sem dado, tipo sem matriz): o operador escolhe. */
  nivel: NivelRisco | null;
  /** Por que esse nível (para mostrar ao operador). */
  fundamento: string;
}

const FORMATO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

function nomeNivel(nivel: NivelRisco | null): string {
  return nivel ? CORES_NIVEL[nivel].nome.toLowerCase() : "sem nível";
}

function numeroValido(valor: number | null | undefined): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0;
}

/** Nível hidrológico pela cota frente às cotas de referência da estação (bordas inclusivas). */
export function nivelHidrologicoPelaCota(cota: number, ref: CotasReferencia): NivelHidrologico | null {
  const limites: [NivelHidrologico, number | null | undefined][] = [
    ["inundacao", ref.inundacao],
    ["alerta", ref.alerta],
    ["atencao", ref.atencao],
  ];
  if (!limites.some(([, v]) => numeroValido(v))) return null;
  for (const [nivel, limite] of limites) {
    if (numeroValido(limite) && cota >= limite) return nivel;
  }
  return "normal";
}

/**
 * Nível sugerido pela matriz oficial (docs/metricas-risco.md). É SÓ sugestão:
 * o operador confirma ou ajusta, e a emissão grava o que ele escolheu.
 * - Meteorológico: classificarChuva (o mais grave entre mm/h e mm em 24 h);
 * - Geológico: índice GeoRisk (nivelDoIndiceGeologico);
 * - Hidrológico: nível do SACE informado ou cota frente às cotas de referência
 *   da estação (não há limiar numérico global: cada estação tem as suas);
 * - Tecnológico: sem matriz.
 */
export function sugerirNivel(tipo: TipoRiscoSala, valores: ValoresNivel): SugestaoNivel {
  switch (tipo) {
    case "METEOROLOGICO": {
      const c = classificarChuvaDetalhada({ mmHoraMax: valores.mmHora, mm24h: valores.mm24h });
      if (!c.nivel) return { nivel: null, fundamento: "Informe mm/h ou mm em 24 h para a matriz de chuva sugerir o nível." };
      const partes: string[] = [];
      if (numeroValido(valores.mmHora)) partes.push(`${FORMATO.format(valores.mmHora)} mm/h → ${nomeNivel(c.porHora)}`);
      if (numeroValido(valores.mm24h)) partes.push(`${FORMATO.format(valores.mm24h)} mm em 24 h → ${nomeNivel(c.por24h)}`);
      return { nivel: c.nivel, fundamento: `Matriz de chuva (vale o critério mais grave): ${partes.join("; ")}.` };
    }
    case "GEOLOGICO": {
      const classe = classificarIndiceGeologico(valores.indiceRisco);
      if (!classe || !numeroValido(valores.indiceRisco)) {
        return { nivel: null, fundamento: "Informe o índice de risco (GeoRisk/CEMADEN) para a matriz geológica sugerir o nível." };
      }
      const linha = MATRIZ_GEOLOGICA[classe];
      return {
        nivel: linha.nivel,
        fundamento: `Matriz geológica: índice ${FORMATO.format(valores.indiceRisco)} → ${linha.rotulo} (${nomeNivel(linha.nivel)}).`,
      };
    }
    case "HIDROLOGICO": {
      let nivelHidro = valores.nivelHidrologico ?? null;
      let origem = "nível informado pela estação";
      if (!nivelHidro && numeroValido(valores.cota) && valores.cotasReferencia) {
        nivelHidro = nivelHidrologicoPelaCota(valores.cota, valores.cotasReferencia);
        origem = `cota de ${FORMATO.format(valores.cota)} cm frente às cotas de referência da estação`;
      }
      if (!nivelHidro || !NIVEIS_HIDROLOGICOS.includes(nivelHidro)) {
        return {
          nivel: null,
          fundamento:
            "A matriz hidrológica não tem limiar numérico global: cada estação do SACE tem as próprias cotas. Sem as cotas de referência, o operador define o nível.",
        };
      }
      const linha = MATRIZ_HIDROLOGICA[nivelHidro];
      return { nivel: linha.nivel, fundamento: `Matriz hidrológica: ${origem} → ${linha.rotulo} (${nomeNivel(linha.nivel)}).` };
    }
    case "TECNOLOGICO":
      return { nivel: null, fundamento: "Não há matriz para risco tecnológico: o operador define o nível." };
  }
}

// ---------------------------------------------------------------------------------------------
// Território: COB → UEOp → fração → município
// ---------------------------------------------------------------------------------------------

export interface TerritorioAlerta {
  cob: string | null;
  ueop: string | null;
  fracao: string | null;
  municipio: string | null;
  codIbge: string | null;
}

/** Nível do destinatário que uma entrada da lista oficial representa. */
export function nivelDaFracao(f: FracaoCbmmg): NivelDestinatario {
  if (f.ueop === f.cob) return "COB";
  return f.fracao ? "FRACAO" : "UEOP";
}

/** Entrada da lista oficial a partir do território gravado (para a tela preselecionar a fração). */
export function fracaoDoTerritorio(
  t: Pick<AlertaSala, "cob" | "ueop" | "fracao">,
): FracaoCbmmg | null {
  return FRACOES_CBMMG.find((f) => f.cob === t.cob && f.ueop === t.ueop && f.fracao === (t.fracao ?? null)) ?? null;
}

export interface ResultadoTerritorio {
  /** O que foi resolvido (no rascunho pode ser parcial). */
  territorio: TerritorioAlerta;
  /** A fração resolvida (para o destinatário principal). */
  fracaoOficial: FracaoCbmmg | null;
  erros: Problema[];
  /** Não bloqueiam: a atribuição município → COB é aproximada. */
  avisos: string[];
}

/**
 * Resolve e confere o território: a fração precisa existir na lista oficial
 * (código ou rótulo do formulário; dela saem COB e UEOp) e o município em MG
 * (IBGE ou nome). Se o município for de outro COB pela tabela APROXIMADA, só
 * avisa. `exigir` = falta de fração/município é erro (emissão); no rascunho,
 * o que vier é resolvido e o resto fica vazio.
 */
export function resolverTerritorio(
  entrada: { fracao: string | null; codIbge: string | null; municipio: string | null },
  exigir = true,
): ResultadoTerritorio {
  const erros: Problema[] = [];
  const avisos: string[] = [];
  const fracao = entrada.fracao ? buscarFracao(entrada.fracao) : null;
  if (!entrada.fracao) {
    if (exigir) erros.push({ campo: "fracao", mensagem: "Escolha a fração responsável." });
  } else if (!fracao) {
    erros.push({ campo: "fracao", mensagem: "Fração fora da lista oficial do CBMMG (96 frações)." });
  }

  const porIbge = entrada.codIbge ? municipioPorIbge(entrada.codIbge) : null;
  const porNome = entrada.municipio ? municipioPorNome(entrada.municipio) : null;
  const municipio = porIbge ?? porNome;
  if (!entrada.codIbge && !entrada.municipio) {
    if (exigir) erros.push({ campo: "codIbge", mensagem: "Escolha o município." });
  } else if (!municipio || (entrada.codIbge && !porIbge)) {
    erros.push({ campo: "codIbge", mensagem: "Município não encontrado em Minas Gerais." });
  } else if (porIbge && porNome && porIbge.ibge !== porNome.ibge) {
    erros.push({ campo: "municipio", mensagem: "Nome do município e código IBGE não conferem." });
  }

  if (fracao && municipio && municipio.cob !== fracao.cob) {
    avisos.push(
      `${municipio.nome} aparece no ${municipio.cob} pela tabela aproximada município → COB, mas a fração escolhida é do ${fracao.cob}. Confira antes de emitir.`,
    );
  }
  return {
    territorio: {
      cob: fracao?.cob ?? null,
      ueop: fracao?.ueop ?? null,
      fracao: fracao?.fracao ?? null,
      municipio: municipio?.nome ?? null,
      codIbge: municipio?.ibge ?? null,
    },
    fracaoOficial: fracao,
    erros,
    avisos,
  };
}

/** Área do CAP quando o operador não escreve: "Ouro Preto/MG — Bairro X". */
export function areaPadrao(municipio: string, localReferencia: string | null): string {
  return localReferencia ? `${municipio}/MG — ${localReferencia}` : `${municipio}/MG`;
}

// ---------------------------------------------------------------------------------------------
// Validação de entrada (zod), por ação
// ---------------------------------------------------------------------------------------------

/**
 * 🔔 Nº da chamada CAD obrigatório na emissão, como no formulário atual
 * (decisão pendente, docs/fase-1.md §9 item 3: a Sala pode virar a origem).
 */
export const NUMERO_CHAMADA_OBRIGATORIO = true;

function codigos<C extends string>(lista: readonly { codigo: C }[]): [C, ...C[]] {
  return lista.map((o) => o.codigo) as [C, ...C[]];
}

/** Remove caracteres de controle (menos quebra de linha e tabulação) e espaços nas pontas. */
function limparTexto(texto: string): string {
  return texto.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

/** Texto opcional: "" vira null; limite = tamanho do campo na feição. */
function texto(camada: Parameters<typeof tamanhoTexto>[0], campo: string) {
  const max = tamanhoTexto(camada, campo);
  return z
    .string({ error: "Texto esperado." })
    .transform(limparTexto)
    .pipe(z.string().max(max, { error: `No máximo ${max} caracteres.` }))
    .transform((s) => (s === "" ? null : s))
    .nullable()
    .optional();
}

const numeroNaoNegativo = (max: number) =>
  z
    .number({ error: "Número esperado." })
    .finite({ error: "Número esperado." })
    .min(0, { error: "Não pode ser negativo." })
    .max(max, { error: `No máximo ${max}.` })
    .nullable()
    .optional();

const inteiroNaoNegativo = z
  .number({ error: "Número inteiro esperado." })
  .int({ error: "Número inteiro esperado." })
  .min(0, { error: "Não pode ser negativo." })
  .max(1_000_000, { error: "Valor alto demais." })
  .nullable()
  .optional();

/** Data ISO 8601 com fuso; normalizada para UTC. */
const dataIso = z
  .iso.datetime({ offset: true, error: "Data/hora ISO 8601 com fuso esperada." })
  .transform((s) => new Date(s).toISOString())
  .nullable()
  .optional();

/** Versão lida pelo cliente (concorrência otimista). */
const versao = z.iso.datetime({ offset: true, error: "alteradoEm (versão lida) inválido." });

const enumeracao = <C extends string>(lista: readonly { codigo: C }[], rotulo: string) =>
  z.enum(codigos(lista), { error: `${rotulo} fora da lista.` });

/** "AL-AAAAMMDD-NNNN". */
export const PADRAO_ALERTA_ID = /^AL-\d{8}-\d{4,6}$/;
const alertaId = z.string({ error: "alertaId esperado." }).regex(PADRAO_ALERTA_ID, { error: "alertaId inválido." });

const destinatarioAdicional = z
  .object({
    /** Fração/UEOp/COB da lista oficial (código ou rótulo do formulário)… */
    fracao: z.string().trim().max(120).optional(),
    /** …ou só o COB (destinatário de nível COB). */
    cob: z.enum(COBS_FEICAO, { error: "COB fora da lista." }).optional(),
  })
  .refine((d) => !!d.fracao || !!d.cob, { error: "Informe a fração ou o COB do destinatário." });

/** Campos que o operador edita (salvar/emitir). undefined = não mexe; null = limpa. */
export const esquemaCamposAlerta = z.object({
  natureza: enumeracao(NATUREZAS, "Natureza").optional(),
  fonteGatilho: enumeracao(FONTES_GATILHO, "Fonte").nullable().optional(),
  fonteRef: texto("Sala_Alertas", "fonte_ref"),
  tipoRisco: enumeracao(TIPOS_RISCO_SALA, "Tipo de risco").nullable().optional(),
  evento: enumeracao(EVENTOS, "Evento").nullable().optional(),
  nivelAlerta: z.enum(NIVEIS_RISCO, { error: "Nível fora da escala (verde … roxo)." }).nullable().optional(),
  numeroChamada: texto("Sala_Alertas", "numero_chamada"),
  mmHora: numeroNaoNegativo(1000),
  mm24h: numeroNaoNegativo(5000),
  bacia: texto("Sala_Alertas", "bacia"),
  rio: texto("Sala_Alertas", "rio"),
  cota: numeroNaoNegativo(100_000),
  estacaoCodigo: texto("Sala_Alertas", "estacao_codigo"),
  indiceRisco: numeroNaoNegativo(100),
  /** Código ou rótulo da lista oficial de frações; COB e UEOp saem dela. */
  fracao: texto("Sala_Alertas", "fracao"),
  codIbge: z
    .string()
    .regex(/^31\d{5}$/, { error: "Código IBGE de MG com 7 dígitos (31…)." })
    .nullable()
    .optional(),
  /** Alternativa ao código IBGE (o servidor resolve e grava o nome oficial). */
  municipio: texto("Sala_Alertas", "municipio"),
  localReferencia: texto("Sala_Alertas", "local_referencia"),
  titulo: texto("Sala_Alertas", "titulo"),
  descricao: texto("Sala_Alertas", "descricao"),
  instrucao: texto("Sala_Alertas", "instrucao"),
  areaDesc: texto("Sala_Alertas", "area_desc"),
  capUrgencia: enumeracao(CAP_URGENCIAS, "Urgência CAP").nullable().optional(),
  capCerteza: enumeracao(CAP_CERTEZAS, "Certeza CAP").nullable().optional(),
  capResposta: enumeracao(CAP_RESPOSTAS, "Resposta CAP").nullable().optional(),
  capEscopo: enumeracao(CAP_ESCOPOS, "Escopo CAP").optional(),
  inicioVigencia: dataIso,
  validoAte: dataIso,
  prazoAcao: dataIso,
  idOp: texto("Sala_Alertas", "id_op"),
  longitude: z.number().min(-51.5).max(-39.5, { error: "Longitude fora de MG." }).nullable().optional(),
  latitude: z.number().min(-23.5).max(-14, { error: "Latitude fora de MG." }).nullable().optional(),
  /** Unidades notificadas além da principal (a principal sai da fração do alerta). Só no rascunho. */
  destinatarios: z.array(destinatarioAdicional).max(20, { error: "No máximo 20 destinatários." }).optional(),
  /** Entra no mesmo lote (CAP incidents) de outro alerta. Só na criação. */
  mesmoLoteDe: alertaId.optional(),
});
export type CamposAlerta = z.infer<typeof esquemaCamposAlerta>;

const esquemaAcaoRrd = z.object({
  tipoAcao: enumeracao(TIPOS_ACAO, "Tipo de ação"),
  resultado: enumeracao(RESULTADOS_ACAO, "Resultado"),
  acaoExecutada: z
    .string({ error: "Descreva a ação executada." })
    .transform(limparTexto)
    .pipe(
      z
        .string()
        .min(3, { error: "Descreva a ação executada." })
        .max(tamanhoTexto("Sala_Acoes_RRD", "acao_executada"), { error: "Descrição longa demais." }),
    ),
  /** Quando foi feita; padrão = agora. */
  dataAcao: dataIso,
  ocorrenciaCad: texto("Sala_Acoes_RRD", "ocorrencia_cad"),
  localReferencia: texto("Sala_Acoes_RRD", "local_referencia"),
  pessoasOrientadas: inteiroNaoNegativo,
  pessoasRemovidas: inteiroNaoNegativo,
  imoveisVistoriados: inteiroNaoNegativo,
  imoveisInterditados: inteiroNaoNegativo,
  efetivoEmpregado: inteiroNaoNegativo,
  viaturasEmpregadas: inteiroNaoNegativo,
  compdecAcionada: z.boolean().nullable().optional(),
  longitude: z.number().min(-51.5).max(-39.5, { error: "Longitude fora de MG." }).nullable().optional(),
  latitude: z.number().min(-23.5).max(-14, { error: "Latitude fora de MG." }).nullable().optional(),
});

/**
 * Pedido de POST /api/alertas, por ação (contrato do módulo INSARAG do
 * GeoRescue: `{acao, ...}`). `alteradoEm` é a versão lida pelo cliente.
 */
export const esquemaPedido = z.discriminatedUnion(
  "acao",
  [
    esquemaCamposAlerta.extend({
      acao: z.literal("salvar"),
      alertaId: alertaId.optional(),
      alteradoEm: versao.optional(),
    }),
    esquemaCamposAlerta.extend({
      acao: z.literal("emitir"),
      alertaId: alertaId.optional(),
      alteradoEm: versao.optional(),
    }),
    z.object({
      acao: z.literal("ciencia"),
      alertaId,
      alteradoEm: versao.optional(),
      /** OBJECTID do destinatário; sem ele, vale a unidade da sessão. */
      destinatario: z.number().int().positive().optional(),
      observacao: texto("Sala_Alertas_Destinatarios", "observacao"),
    }),
    esquemaAcaoRrd.extend({
      acao: z.literal("registrar_acao"),
      alertaId,
      alteradoEm: versao.optional(),
    }),
    z.object({ acao: z.literal("encerrar"), alertaId, alteradoEm: versao }),
    z.object({
      acao: z.literal("cancelar"),
      alertaId,
      alteradoEm: versao,
      motivo: z
        .string({ error: "Informe o motivo do cancelamento." })
        .transform(limparTexto)
        .pipe(
          z
            .string()
            .min(5, { error: "Informe o motivo do cancelamento." })
            .max(tamanhoTexto("Sala_Alertas", "motivo_cancelamento"), { error: "Motivo longo demais." }),
        ),
    }),
    z.object({ acao: z.literal("apagar"), alertaId, alteradoEm: versao }),
  ],
  { error: "Ação desconhecida (salvar, emitir, ciencia, registrar_acao, encerrar, cancelar ou apagar)." },
);
export type Pedido = z.infer<typeof esquemaPedido>;
export type AcaoPedido = Pedido["acao"];

/** Problemas de um erro do zod, campo a campo. */
export function problemasDoZod(erro: z.ZodError): Problema[] {
  return erro.issues.map((i) => ({ campo: i.path.map(String).join(".") || "pedido", mensagem: i.message }));
}

// ---------------------------------------------------------------------------------------------
// Validação da emissão (campos "E" do esquema), sobre o alerta já completo
// ---------------------------------------------------------------------------------------------

const ROTULOS_CAMPOS: Record<string, string> = {
  fonteGatilho: "Fonte que motivou o alerta",
  tipoRisco: "Tipo de risco",
  evento: "Evento",
  nivelAlerta: "Nível do alerta",
  numeroChamada: "Nº da chamada CAD",
  cob: "COB",
  ueop: "UEOp",
  municipio: "Município",
  codIbge: "Código IBGE",
  titulo: "Título",
  descricao: "Descrição",
  instrucao: "Ação RRD esperada",
  areaDesc: "Área afetada",
  capUrgencia: "Urgência",
  capCerteza: "Certeza",
  inicioVigencia: "Início da vigência",
  validoAte: "Válido até",
  prazoAcao: "Prazo da ação RRD",
  dataEmissao: "Data de emissão",
  capIdentifier: "Identificador CAP",
};

function obrigatorio(campo: string) {
  const rotulo = ROTULOS_CAMPOS[campo] ?? campo;
  return {
    error: (iss: { input?: unknown }) =>
      iss.input === null || iss.input === undefined || iss.input === ""
        ? `${rotulo}: obrigatório para emitir.`
        : `${rotulo}: valor inválido.`,
  };
}

const textoObrigatorio = (campo: string) => z.string(obrigatorio(campo)).min(1, obrigatorio(campo));
const dataObrigatoria = (campo: string) => z.iso.datetime({ ...obrigatorio(campo), offset: true });

/** Campos exigidos para emitir (o esquema marca "E"). */
const esquemaEmissao = z.object({
  fonteGatilho: z.enum(codigos(FONTES_GATILHO), obrigatorio("fonteGatilho")),
  tipoRisco: z.enum(codigos(TIPOS_RISCO_SALA), obrigatorio("tipoRisco")),
  evento: z.enum(codigos(EVENTOS), obrigatorio("evento")),
  nivelAlerta: z.enum(NIVEIS_RISCO, obrigatorio("nivelAlerta")),
  numeroChamada: NUMERO_CHAMADA_OBRIGATORIO
    ? textoObrigatorio("numeroChamada")
    : z.string().nullable(),
  cob: textoObrigatorio("cob"),
  ueop: textoObrigatorio("ueop"),
  municipio: textoObrigatorio("municipio"),
  codIbge: z.string(obrigatorio("codIbge")).regex(/^31\d{5}$/, obrigatorio("codIbge")),
  titulo: textoObrigatorio("titulo"),
  descricao: textoObrigatorio("descricao"),
  instrucao: textoObrigatorio("instrucao"),
  areaDesc: textoObrigatorio("areaDesc"),
  capIdentifier: textoObrigatorio("capIdentifier"),
  capUrgencia: z.enum(codigos(CAP_URGENCIAS), obrigatorio("capUrgencia")),
  capCerteza: z.enum(codigos(CAP_CERTEZAS), obrigatorio("capCerteza")),
  dataEmissao: dataObrigatoria("dataEmissao"),
  inicioVigencia: dataObrigatoria("inicioVigencia"),
  validoAte: dataObrigatoria("validoAte"),
  prazoAcao: dataObrigatoria("prazoAcao"),
});

/**
 * O alerta pode ser emitido (ou, já emitido, continuar válido depois de uma
 * atualização)? Confere os campos "E", os campos do tipo de risco, a cascata
 * tipo → evento e a ordem das datas. `agora` só vale para a emissão
 * (`exigirFuturo`): uma atualização posterior não reprova validade já vencida.
 */
export function validarEmissao(alerta: AlertaSala, agora: Date, exigirFuturo = true): Problema[] {
  const resultado = esquemaEmissao.safeParse(alerta);
  const problemas: Problema[] = resultado.success ? [] : problemasDoZod(resultado.error);

  const tipo = alerta.tipoRisco;
  if (tipo === "METEOROLOGICO" && alerta.mmHora === null && alerta.mm24h === null) {
    problemas.push({ campo: "mmHora", mensagem: "Meteorológico: informe mm/h ou mm em 24 h." });
  }
  if (tipo === "HIDROLOGICO") {
    if (!alerta.bacia) problemas.push({ campo: "bacia", mensagem: "Hidrológico: informe a bacia." });
    if (!alerta.rio) problemas.push({ campo: "rio", mensagem: "Hidrológico: informe o rio." });
    if (alerta.cota === null) problemas.push({ campo: "cota", mensagem: "Hidrológico: informe a cota do rio (cm)." });
  }
  if (tipo === "GEOLOGICO" && alerta.indiceRisco === null) {
    problemas.push({ campo: "indiceRisco", mensagem: "Geológico: informe o índice de risco." });
  }
  if (tipo && alerta.evento) {
    const evento = EVENTOS.find((e) => e.codigo === alerta.evento);
    if (evento && evento.grupo !== null && evento.grupo !== tipo) {
      problemas.push({ campo: "evento", mensagem: `O evento "${evento.rotulo}" não é do tipo de risco escolhido.` });
    }
  }
  if (alerta.evento === "OUTRO" && !alerta.descricao) {
    problemas.push({ campo: "descricao", mensagem: "Evento \"Outro\": descreva o fenômeno." });
  }

  const inicio = instante(alerta.inicioVigencia);
  const validade = instante(alerta.validoAte);
  const emissao = instante(alerta.dataEmissao);
  const prazo = instante(alerta.prazoAcao);
  if (!Number.isNaN(inicio) && !Number.isNaN(validade) && validade <= inicio) {
    problemas.push({ campo: "validoAte", mensagem: "\"Válido até\" precisa ser depois do início da vigência." });
  }
  if (!Number.isNaN(emissao) && !Number.isNaN(prazo) && prazo <= emissao) {
    problemas.push({ campo: "prazoAcao", mensagem: "O prazo da ação RRD precisa ser depois da emissão." });
  }
  if (exigirFuturo && !Number.isNaN(validade) && validade <= agora.getTime()) {
    problemas.push({ campo: "validoAte", mensagem: "\"Válido até\" já passou." });
  }
  return problemas;
}

// ---------------------------------------------------------------------------------------------
// Fábricas
// ---------------------------------------------------------------------------------------------

/** Alerta vazio (rascunho sem nada preenchido). */
export function alertaVazio(alertaId: string): AlertaSala {
  return {
    objectid: null,
    alertaId,
    loteId: null,
    situacao: "RASCUNHO",
    natureza: "REAL",
    origemRegistro: "SALA",
    fonteGatilho: null,
    fonteRef: null,
    tipoRisco: null,
    evento: null,
    nivelAlerta: null,
    numeroChamada: null,
    mmHora: null,
    mm24h: null,
    bacia: null,
    rio: null,
    cota: null,
    estacaoCodigo: null,
    indiceRisco: null,
    cob: null,
    ueop: null,
    fracao: null,
    municipio: null,
    codIbge: null,
    localReferencia: null,
    titulo: null,
    descricao: null,
    instrucao: null,
    areaDesc: null,
    capIdentifier: null,
    capMsgType: null,
    capEscopo: "Restricted",
    capUrgencia: null,
    capCerteza: null,
    capResposta: null,
    dataEmissao: null,
    inicioVigencia: null,
    validoAte: null,
    prazoAcao: null,
    encerradoEm: null,
    motivoCancelamento: null,
    idOp: null,
    criadoPorId: null,
    criadoEm: null,
    emitidoPorId: null,
    emitidoPorDominio: null,
    alteradoPorId: null,
    alteradoEm: null,
    longitude: null,
    latitude: null,
  };
}

/** Campos do alerta que o operador edita diretamente (o resto é do servidor). */
export const CAMPOS_EDITAVEIS = [
  "natureza",
  "fonteGatilho",
  "fonteRef",
  "tipoRisco",
  "evento",
  "nivelAlerta",
  "numeroChamada",
  "mmHora",
  "mm24h",
  "bacia",
  "rio",
  "cota",
  "estacaoCodigo",
  "indiceRisco",
  "localReferencia",
  "titulo",
  "descricao",
  "instrucao",
  "areaDesc",
  "capUrgencia",
  "capCerteza",
  "capResposta",
  "capEscopo",
  "inicioVigencia",
  "validoAte",
  "prazoAcao",
  "idOp",
  "longitude",
  "latitude",
] as const satisfies readonly (keyof AlertaSala & keyof CamposAlerta)[];

/** Depois de emitido, o território e a natureza não mudam: cancela-se e emite-se outro. */
export const CAMPOS_TRAVADOS_APOS_EMISSAO = ["natureza", "fracao", "codIbge", "municipio", "destinatarios"] as const;

/** Copia para o alerta os campos editáveis presentes no pedido (undefined = não mexe). */
export function aplicarCampos(alerta: AlertaSala, campos: CamposAlerta): AlertaSala {
  const novo: AlertaSala = { ...alerta };
  const destino = novo as unknown as Record<string, unknown>;
  for (const campo of CAMPOS_EDITAVEIS) {
    const valor = campos[campo];
    if (valor !== undefined) destino[campo] = valor;
  }
  return novo;
}

/** Nomes (do domínio) dos campos que mudaram entre duas versões. */
export function camposAlterados<T extends object>(antes: T, depois: T, ignorar: readonly (keyof T)[] = []): string[] {
  const chaves = Object.keys(depois) as (keyof T)[];
  return chaves
    .filter((k) => !ignorar.includes(k) && JSON.stringify(antes[k]) !== JSON.stringify(depois[k]))
    .map(String);
}

function destinatarioBase(alertaId: string): Destinatario {
  return {
    objectid: null,
    alertaId,
    destNivel: "COB",
    cob: null,
    ueop: null,
    fracao: null,
    principal: false,
    situacaoDest: "AGUARDANDO",
    canalNotificacao: null,
    notificadoEm: null,
    cienteEm: null,
    cientePorId: null,
    cientePorDominio: null,
    redirecionadoPara: null,
    observacao: null,
    criadoEm: null,
    alteradoEm: null,
  };
}

/** Destinatário a partir de uma entrada da lista oficial (COB, sede de UEOp ou fração). */
export function destinatarioDaFracao(alertaId: string, f: FracaoCbmmg, principal: boolean): Destinatario {
  const nivel = nivelDaFracao(f);
  return {
    ...destinatarioBase(alertaId),
    destNivel: nivel,
    cob: f.cob,
    ueop: nivel === "COB" ? null : f.ueop,
    fracao: nivel === "FRACAO" ? f.fracao : null,
    principal,
  };
}

/** Destinatário de nível COB (ex.: o COB acompanha o alerta de uma UEOp). */
export function destinatarioDoCob(alertaId: string, cob: string): Destinatario {
  return { ...destinatarioBase(alertaId), destNivel: "COB", cob };
}

/** Mesma unidade (COB, UEOp e fração)? */
export function mesmaUnidade(a: Pick<Destinatario, "cob" | "ueop" | "fracao">, b: Pick<Destinatario, "cob" | "ueop" | "fracao">): boolean {
  return a.cob === b.cob && a.ueop === b.ueop && a.fracao === b.fracao;
}

/** "1BBM (BELO HORIZONTE)", "5CIA IND (SETE LAGOAS)" → "1º BBM", "5ª Cia Ind" (formato da lista oficial). */
export function ueopDaUnidade(unidade: string | null): string | null {
  if (!unidade) return null;
  const t = unidade.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const bbm = t.match(/(?:^|[^0-9])(\d{1,2})\s*[ºO°]?\s*BBM/);
  if (bbm) return `${Number(bbm[1])}º BBM`;
  const cia = t.match(/(?:^|[^0-9])(\d{1,2})\s*[ªA]?\s*CIA\s*IND/);
  if (cia) return `${Number(cia[1])}ª Cia Ind`;
  return null;
}
