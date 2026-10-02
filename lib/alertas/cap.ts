import { CORES_NIVEL } from "@/lib/dominio/matrizes";
import { EVENTOS, NIVEL_PARA_SEVERIDADE, type CapMsgType, type Natureza } from "./codigos";
import type { AlertaSala } from "./dominio";

/**
 * Mensagem CAP 1.2 (OASIS) de um alerta, para a integração futura com o IDAP /
 * Defesa Civil Alerta. Puro. A mensagem fica no histórico como JSON
 * (`cap_json`): XML seria recusado pelo filtro XSS do portal.
 *
 * O que é derivado (severidade, categoria, COBRADE, status) não é gravado no
 * alerta: a mensagem enviada preserva o valor da época.
 */

/** Remetente (CAP sender): constante do backend. */
export const REMETENTE_CAP = "BR-MG-CBMMG-SALA";
export const PREFIXO_IDENTIFICADOR_CAP = `${REMETENTE_CAP}-`;

/** CAP identifier da mensagem original ("BR-MG-CBMMG-SALA-AL-20261002-0001"). */
export function identificadorCap(alertaId: string): string {
  return `${PREFIXO_IDENTIFICADOR_CAP}${alertaId}`;
}

/** Identificador de cada mensagem: Update e Cancel ganham identificadores NOVOS. */
export function identificadorMensagem(alertaId: string, tipo: CapMsgType, sequencia = 1): string {
  const base = identificadorCap(alertaId);
  if (tipo === "Alert") return base;
  return tipo === "Update" ? `${base}-U${sequencia}` : `${base}-C`;
}

const STATUS_CAP: Record<Natureza, "Actual" | "Exercise" | "Test"> = {
  REAL: "Actual",
  EXERCICIO: "Exercise",
  TESTE: "Test",
};

/** ISO com o fuso de Brasília, como o CAP pede ("2026-10-02T12:00:00-03:00"). */
export function isoBrasilia(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return `${new Date(t - 3 * 3_600_000).toISOString().slice(0, 19)}-03:00`;
}

export interface MensagemCap {
  identifier: string;
  sender: string;
  sent: string | null;
  status: "Actual" | "Exercise" | "Test";
  msgType: CapMsgType;
  scope: string;
  restriction?: string;
  references?: string;
  incidents?: string;
  info: {
    language: "pt-BR";
    category: string;
    event: string;
    eventCode?: { valueName: "COBRADE"; value: string };
    urgency: string | null;
    severity: string | null;
    certainty: string | null;
    responseType?: string;
    onset: string | null;
    expires: string | null;
    senderName: string;
    headline: string | null;
    description: string | null;
    instruction: string | null;
    parameter: { valueName: string; value: string }[];
    area: { areaDesc: string | null; geocode?: { valueName: "IBGE"; value: string } };
  };
}

/**
 * Monta a mensagem. `referencia` (mensagem original) é obrigatória em Update e
 * Cancel. `enviadoEm` é o instante desta mensagem (ISO).
 */
export function montarMensagemCap(
  alerta: AlertaSala,
  msgType: CapMsgType,
  identificador: string,
  enviadoEm: string,
  referencia?: { identificador: string; enviadoEm: string | null },
): MensagemCap {
  const evento = EVENTOS.find((e) => e.codigo === alerta.evento);
  const parametros: { valueName: string; value: string }[] = [];
  if (alerta.nivelAlerta) parametros.push({ valueName: "NIVEL_CBMMG", value: CORES_NIVEL[alerta.nivelAlerta].nome });
  if (alerta.numeroChamada) parametros.push({ valueName: "CHAMADA_CAD", value: alerta.numeroChamada });
  if (alerta.cob) parametros.push({ valueName: "COB", value: alerta.cob });
  if (alerta.ueop) parametros.push({ valueName: "UEOP", value: alerta.ueop });
  if (alerta.prazoAcao) parametros.push({ valueName: "PRAZO_ACAO_RRD", value: isoBrasilia(alerta.prazoAcao) ?? "" });

  const mensagem: MensagemCap = {
    identifier: identificador,
    sender: REMETENTE_CAP,
    sent: isoBrasilia(enviadoEm),
    status: STATUS_CAP[alerta.natureza],
    msgType,
    scope: alerta.capEscopo,
    info: {
      language: "pt-BR",
      category: evento?.categoriaCap ?? "Other",
      event: evento?.rotulo ?? "Alerta",
      urgency: alerta.capUrgencia,
      severity: alerta.nivelAlerta ? NIVEL_PARA_SEVERIDADE[alerta.nivelAlerta] : null,
      certainty: alerta.capCerteza,
      onset: isoBrasilia(alerta.inicioVigencia),
      expires: isoBrasilia(alerta.validoAte),
      senderName: "CBMMG — Sala de Situação",
      headline: alerta.titulo,
      description: alerta.descricao,
      instruction: alerta.instrucao,
      parameter: parametros,
      area: { areaDesc: alerta.areaDesc },
    },
  };
  if (alerta.capEscopo === "Restricted") mensagem.restriction = "Uso interno do CBMMG";
  if (alerta.loteId) mensagem.incidents = alerta.loteId;
  if (referencia) mensagem.references = `${REMETENTE_CAP},${referencia.identificador},${isoBrasilia(referencia.enviadoEm) ?? ""}`;
  if (evento?.cobrade) mensagem.info.eventCode = { valueName: "COBRADE", value: evento.cobrade };
  if (alerta.capResposta) mensagem.info.responseType = alerta.capResposta;
  if (alerta.codIbge) mensagem.info.area.geocode = { valueName: "IBGE", value: alerta.codIbge };
  return mensagem;
}
