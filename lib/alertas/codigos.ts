import type { NivelRisco } from "@/lib/dominio/matrizes";

/**
 * Códigos dos domínios das camadas da Sala (scripts/arcgis/criar_camadas_sala.py).
 *
 * São a SEGUNDA CÓPIA assumida das listas do script de criação das camadas:
 * tests/alertas-feicao.test.ts lê o script e compara código e rótulo de cada
 * lista. Mudou aqui? Mude lá (e vice-versa), senão o serviço do ArcGIS recusa
 * a feição inteira (valor fora do domínio).
 *
 * Puro: sem React, Next ou server-only.
 */

export interface Opcao<C extends string> {
  readonly codigo: C;
  readonly rotulo: string;
}

function codigosDe<C extends string>(opcoes: readonly Opcao<C>[]): readonly C[] {
  return opcoes.map((o) => o.codigo);
}

/** Rótulo de um código (o próprio código quando não está na lista). */
export function rotuloDe<C extends string>(opcoes: readonly Opcao<C>[], codigo: C | null): string | null {
  if (codigo === null) return null;
  return opcoes.find((o) => o.codigo === codigo)?.rotulo ?? codigo;
}

/** O valor é um dos códigos da lista? */
export function ehCodigo<C extends string>(opcoes: readonly Opcao<C>[], valor: unknown): valor is C {
  return typeof valor === "string" && opcoes.some((o) => o.codigo === valor);
}

// ---------------------------------------------------------------------------------------------
// Alerta
// ---------------------------------------------------------------------------------------------

/**
 * Situação gravada do fluxo do alerta. PENDENTE, VENCIDO e VIGÊNCIA EXPIRADA
 * não existem aqui: são derivados na leitura (dominio.ts, estadosDerivados).
 */
export const SITUACOES = [
  { codigo: "RASCUNHO", rotulo: "Rascunho" },
  { codigo: "EMITIDO", rotulo: "Emitido" },
  { codigo: "CIENTE", rotulo: "Ciente" },
  { codigo: "EM_ACAO", rotulo: "Em ação" },
  { codigo: "ACAO_REGISTRADA", rotulo: "Ação RRD registrada" },
  { codigo: "ENCERRADO", rotulo: "Encerrado" },
  { codigo: "CANCELADO", rotulo: "Cancelado" },
] as const satisfies readonly Opcao<string>[];
export type SituacaoAlerta = (typeof SITUACOES)[number]["codigo"];
export const CODIGOS_SITUACAO = codigosDe<SituacaoAlerta>(SITUACOES);

/** Real × simulado. Só REAL entra no mapa e nos indicadores. CAP status: Actual, Exercise, Test. */
export const NATUREZAS = [
  { codigo: "REAL", rotulo: "Real" },
  { codigo: "EXERCICIO", rotulo: "Exercício/simulado" },
  { codigo: "TESTE", rotulo: "Teste" },
] as const satisfies readonly Opcao<string>[];
export type Natureza = (typeof NATUREZAS)[number]["codigo"];

/** Os mesmos rótulos do formulário Survey123 atual (gráfico por tipo e mapa por tipo). */
export const TIPOS_RISCO_SALA = [
  { codigo: "METEOROLOGICO", rotulo: "Meteorológico" },
  { codigo: "HIDROLOGICO", rotulo: "Hidrológico" },
  { codigo: "GEOLOGICO", rotulo: "Geológico" },
  // 🔔 Barragem: não existe no formulário atual (decisão pendente).
  { codigo: "TECNOLOGICO", rotulo: "Tecnológico" },
] as const satisfies readonly Opcao<string>[];
export type TipoRiscoSala = (typeof TIPOS_RISCO_SALA)[number]["codigo"];

export interface DefinicaoEvento extends Opcao<string> {
  /** Grupo (tipo de risco) do evento; null = qualquer tipo ("Outro"). */
  readonly grupo: TipoRiscoSala | null;
  /** Código COBRADE (derivado, não gravado); null quando não se aplica. */
  readonly cobrade: string | null;
  /** Categoria CAP 1.2 (Met, Geo, Infra, Other). */
  readonly categoriaCap: string;
}

/**
 * Evento (fenômeno) → grupo, COBRADE e categoria CAP. A cascata do formulário
 * é tipo de risco → evento; o servidor confere que o par é válido.
 * Confiança nos códigos COBRADE: ver o relatório de esquema (2.4.2.0.0 é média).
 */
export const EVENTOS = [
  { codigo: "CHUVA_INTENSA", rotulo: "Chuvas intensas", grupo: "METEOROLOGICO", cobrade: "1.3.2.1.4", categoriaCap: "Met" },
  { codigo: "VENDAVAL", rotulo: "Vendaval", grupo: "METEOROLOGICO", cobrade: "1.3.2.1.5", categoriaCap: "Met" },
  { codigo: "GRANIZO", rotulo: "Granizo", grupo: "METEOROLOGICO", cobrade: "1.3.2.1.3", categoriaCap: "Met" },
  { codigo: "RAIOS", rotulo: "Tempestade de raios", grupo: "METEOROLOGICO", cobrade: "1.3.2.1.2", categoriaCap: "Met" },
  { codigo: "INUNDACAO", rotulo: "Inundação", grupo: "HIDROLOGICO", cobrade: "1.2.1.0.0", categoriaCap: "Met" },
  { codigo: "ENXURRADA", rotulo: "Enxurrada", grupo: "HIDROLOGICO", cobrade: "1.2.2.0.0", categoriaCap: "Met" },
  { codigo: "ALAGAMENTO", rotulo: "Alagamento", grupo: "HIDROLOGICO", cobrade: "1.2.3.0.0", categoriaCap: "Met" },
  { codigo: "DESLIZAMENTO", rotulo: "Deslizamento / movimento de massa", grupo: "GEOLOGICO", cobrade: "1.1.3.2.1", categoriaCap: "Geo" },
  { codigo: "CORRIDA_MASSA", rotulo: "Corrida de massa (lama/detritos)", grupo: "GEOLOGICO", cobrade: "1.1.3.3.1", categoriaCap: "Geo" },
  { codigo: "QUEDA_BLOCOS", rotulo: "Queda/rolamento de blocos", grupo: "GEOLOGICO", cobrade: "1.1.3.1.1", categoriaCap: "Geo" },
  { codigo: "SOLAPAMENTO", rotulo: "Solapamento / erosão de margem fluvial", grupo: "GEOLOGICO", cobrade: "1.1.4.2.0", categoriaCap: "Geo" },
  { codigo: "BARRAGEM", rotulo: "Rompimento/colapso de barragem", grupo: "TECNOLOGICO", cobrade: "2.4.2.0.0", categoriaCap: "Infra" },
  { codigo: "OUTRO", rotulo: "Outro (descrever)", grupo: null, cobrade: null, categoriaCap: "Other" },
] as const satisfies readonly DefinicaoEvento[];
export type EventoAlerta = (typeof EVENTOS)[number]["codigo"];

/** Nível na feição (código do domínio) ↔ escala única das matrizes (lib/dominio/matrizes.ts). */
export const NIVEIS_ALERTA = [
  { codigo: "VERDE", rotulo: "Verde", nivel: "verde" },
  { codigo: "AMARELO", rotulo: "Amarelo", nivel: "amarelo" },
  { codigo: "LARANJA", rotulo: "Laranja", nivel: "laranja" },
  { codigo: "VERMELHO", rotulo: "Vermelho", nivel: "vermelho" },
  { codigo: "ROXO", rotulo: "Roxo", nivel: "roxo" },
] as const satisfies readonly (Opcao<string> & { nivel: NivelRisco })[];
export type CodigoNivelAlerta = (typeof NIVEIS_ALERTA)[number]["codigo"];

/** Severidade CAP derivada do nível (régua do INMET: Perigo Potencial = Moderate…). Não é gravada. */
export const NIVEL_PARA_SEVERIDADE: Readonly<Record<NivelRisco, "Minor" | "Moderate" | "Severe" | "Extreme">> = {
  verde: "Minor",
  amarelo: "Moderate",
  laranja: "Severe",
  vermelho: "Extreme",
  roxo: "Extreme",
};

export const ORIGENS_REGISTRO = [
  { codigo: "SALA", rotulo: "Formulário da Sala" },
  { codigo: "SURVEY123", rotulo: "Migrado do Survey123" },
  { codigo: "INTEGRACAO", rotulo: "Sugerido por integração (rascunho)" },
] as const satisfies readonly Opcao<string>[];
export type OrigemRegistro = (typeof ORIGENS_REGISTRO)[number]["codigo"];

export const FONTES_GATILHO = [
  { codigo: "INMET", rotulo: "Aviso INMET" },
  { codigo: "CEMADEN", rotulo: "Alerta CEMADEN" },
  { codigo: "SGB_SACE", rotulo: "SGB/SACE (cotas)" },
  { codigo: "ANA", rotulo: "ANA — telemetria" },
  { codigo: "PREVISAO", rotulo: "Previsão numérica (Open-Meteo/outros)" },
  { codigo: "CEDEC", rotulo: "Defesa Civil (CEDEC/COMPDEC)" },
  { codigo: "COBOM_CAD", rotulo: "Chamada/ocorrência no CAD" },
  { codigo: "UNIDADE", rotulo: "Solicitação de unidade (UEOp)" },
  { codigo: "SALA", rotulo: "Análise da Sala de Situação" },
  { codigo: "OUTRA", rotulo: "Outra" },
] as const satisfies readonly Opcao<string>[];
export type FonteGatilho = (typeof FONTES_GATILHO)[number]["codigo"];

// CAP 1.2 (OASIS): enumerações do próprio padrão.
export const CAP_MSG_TYPES = [
  { codigo: "Alert", rotulo: "Alerta" },
  { codigo: "Update", rotulo: "Atualização" },
  { codigo: "Cancel", rotulo: "Cancelamento" },
] as const satisfies readonly Opcao<string>[];
export type CapMsgType = (typeof CAP_MSG_TYPES)[number]["codigo"];

export const CAP_ESCOPOS = [
  { codigo: "Restricted", rotulo: "Restrito" },
  { codigo: "Private", rotulo: "Privado" },
  { codigo: "Public", rotulo: "Público" },
] as const satisfies readonly Opcao<string>[];
export type CapEscopo = (typeof CAP_ESCOPOS)[number]["codigo"];

export const CAP_URGENCIAS = [
  { codigo: "Immediate", rotulo: "Imediata" },
  { codigo: "Expected", rotulo: "Esperada (próxima hora)" },
  { codigo: "Future", rotulo: "Futura" },
  { codigo: "Past", rotulo: "Passada" },
  { codigo: "Unknown", rotulo: "Desconhecida" },
] as const satisfies readonly Opcao<string>[];
export type CapUrgencia = (typeof CAP_URGENCIAS)[number]["codigo"];

export const CAP_CERTEZAS = [
  { codigo: "Observed", rotulo: "Observado" },
  { codigo: "Likely", rotulo: "Provável (≥50%)" },
  { codigo: "Possible", rotulo: "Possível (<50%)" },
  { codigo: "Unlikely", rotulo: "Improvável" },
  { codigo: "Unknown", rotulo: "Desconhecida" },
] as const satisfies readonly Opcao<string>[];
export type CapCerteza = (typeof CAP_CERTEZAS)[number]["codigo"];

export const CAP_RESPOSTAS = [
  { codigo: "Prepare", rotulo: "Preparar" },
  { codigo: "Monitor", rotulo: "Monitorar" },
  { codigo: "Assess", rotulo: "Avaliar" },
  { codigo: "Avoid", rotulo: "Evitar a área" },
  { codigo: "Evacuate", rotulo: "Evacuar" },
  { codigo: "Shelter", rotulo: "Abrigar" },
  { codigo: "Execute", rotulo: "Executar plano" },
  { codigo: "AllClear", rotulo: "Fim do perigo" },
  { codigo: "None", rotulo: "Nenhuma" },
] as const satisfies readonly Opcao<string>[];
export type CapResposta = (typeof CAP_RESPOSTAS)[number]["codigo"];

// ---------------------------------------------------------------------------------------------
// Ação RRD e destinatários
// ---------------------------------------------------------------------------------------------

export const TIPOS_ACAO = [
  { codigo: "VISTORIA", rotulo: "Vistoria preventiva em área de risco" },
  { codigo: "MONITORAMENTO", rotulo: "Monitoramento de área / cota de rio" },
  { codigo: "ORIENTACAO", rotulo: "Orientação à população (porta a porta)" },
  { codigo: "DIVULGACAO", rotulo: "Divulgação (rádio, carro de som, redes)" },
  { codigo: "INTERDICAO", rotulo: "Interdição / isolamento de área" },
  { codigo: "EVACUACAO", rotulo: "Remoção / evacuação preventiva" },
  { codigo: "COMPDEC", rotulo: "Articulação com COMPDEC/Defesa Civil" },
  { codigo: "PRONTIDAO", rotulo: "Prontidão / pré-posicionamento de recursos" },
  { codigo: "APOIO_ABRIGO", rotulo: "Apoio a abrigo temporário" },
  { codigo: "SINALIZACAO", rotulo: "Sinalização" },
  { codigo: "OUTRA", rotulo: "Outra (descrever)" },
] as const satisfies readonly Opcao<string>[];
export type TipoAcao = (typeof TIPOS_ACAO)[number]["codigo"];

export const RESULTADOS_ACAO = [
  { codigo: "CONCLUIDA", rotulo: "Concluída" },
  { codigo: "PARCIAL", rotulo: "Parcial" },
  { codigo: "EM_ANDAMENTO", rotulo: "Em andamento" },
  { codigo: "NAO_REALIZADA", rotulo: "Não realizada" },
] as const satisfies readonly Opcao<string>[];
export type ResultadoAcao = (typeof RESULTADOS_ACAO)[number]["codigo"];

/** Sim/Não da feição. Vazio = NÃO RESPONDIDO (null), nunca "Não". */
export const SIM_NAO = [
  { codigo: "S", rotulo: "Sim" },
  { codigo: "N", rotulo: "Não" },
] as const satisfies readonly Opcao<string>[];

export const NIVEIS_DESTINATARIO = [
  { codigo: "COB", rotulo: "COB" },
  { codigo: "UEOP", rotulo: "BBM/Cia Ind (UEOp)" },
  { codigo: "FRACAO", rotulo: "Fração (Cia/Pel/posto)" },
] as const satisfies readonly Opcao<string>[];
export type NivelDestinatario = (typeof NIVEIS_DESTINATARIO)[number]["codigo"];

export const SITUACOES_DESTINATARIO = [
  { codigo: "AGUARDANDO", rotulo: "Aguardando ciência" },
  { codigo: "CIENTE", rotulo: "Ciente" },
  { codigo: "REDIRECIONADO", rotulo: "Redirecionado" },
] as const satisfies readonly Opcao<string>[];
export type SituacaoDestinatario = (typeof SITUACOES_DESTINATARIO)[number]["codigo"];

export const CANAIS_NOTIFICACAO = [
  { codigo: "SISTEMA", rotulo: "Tela da Sala/GeoRescue" },
  { codigo: "TELEGRAM", rotulo: "Telegram" },
  { codigo: "PUSH", rotulo: "Notificação push" },
  { codigo: "CAD", rotulo: "CAD" },
  { codigo: "TELEFONE", rotulo: "Telefone" },
  { codigo: "RADIO", rotulo: "Rádio" },
  { codigo: "EMAIL", rotulo: "E-mail" },
] as const satisfies readonly Opcao<string>[];
export type CanalNotificacao = (typeof CANAIS_NOTIFICACAO)[number]["codigo"];

/** COBs do domínio da feição (código == rótulo, como o GeoRescue grava). 🔔 CEB fora por ora. */
export const COBS_FEICAO = ["1º COB", "2º COB", "3º COB", "4º COB", "5º COB", "6º COB"] as const;

// ---------------------------------------------------------------------------------------------
// Histórico (sem domínio na camada: um log não recusa valor antigo)
// ---------------------------------------------------------------------------------------------

export const EVENTOS_HISTORICO = [
  "CRIADO",
  "EMITIDO",
  "NOTIFICADO",
  "CIENTE",
  "EM_ACAO",
  "ACAO_REGISTRADA",
  "ACAO_EDITADA",
  "ATUALIZADO",
  "PRAZO_ALTERADO",
  "ENCERRADO",
  "CANCELADO",
  /** Rascunho apagado: a linha do alerta some, a trilha fica. */
  "APAGADO",
] as const;
export type EventoHistoricoTipo = (typeof EVENTOS_HISTORICO)[number];

export const ALVOS_HISTORICO = ["ALERTA", "DESTINATARIO", "ACAO"] as const;
export type AlvoHistorico = (typeof ALVOS_HISTORICO)[number];
