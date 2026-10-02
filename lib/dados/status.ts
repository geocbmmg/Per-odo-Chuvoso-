import "server-only";
import { env, modoExemplo, TAMANHO_MINIMO_CRON_SECRET, variaveisInvalidas } from "@/lib/env";
import { LISTA_FONTES } from "@/lib/fontes/catalogo";
import { statusDaFonte } from "@/lib/fontes/leituras";
import type { FonteId, StatusFonte } from "@/lib/fontes/tipos";
import { CAMADAS_ARCGIS, obterCamada, type CamadaArcgisId, type OrigemCamada } from "@/lib/sources/arcgis";
import type { Diagnostico } from "@/lib/sources/arcgis/normalizar";
import { obterAlertasCemaden } from "@/lib/sources/cemaden";
import { obterAvisosInmet } from "@/lib/sources/inmet";
import { obterAvisosInmetMunicipios } from "@/lib/sources/inmet/ativos";
import { obterPrevisaoCobs } from "@/lib/sources/open-meteo";
import { obterSeriesChuvaMunicipios } from "@/lib/sources/open-meteo/municipios";

/**
 * Estado de cada fonte de dados para a página /status.
 *
 * Antes de classificar, consulta (através do cache) cada fonte implementada:
 * assim o estado reflete uma tentativa real, e não só o que esta instância
 * serverless já tinha visto. Fontes em cache não são reconsultadas.
 */

export interface DiagnosticoCamada extends Diagnostico {
  camada: string;
  nomeNoServidor: string | null;
  /** Camada/tabela do serviço efetivamente lida (null em leituras antigas guardadas). */
  origem: OrigemCamada | null;
}

export interface StatusFonteDetalhado extends StatusFonte {
  diagnostico?: DiagnosticoCamada;
}

/** O que está configurado no servidor: só sim/não e nomes de modo, nunca valores. */
export interface ConfiguracaoStatus {
  armazemLeituras: "memoria" | "postgres";
  alertasArmazem: "memoria" | "postgres" | "arcgis";
  bancoConfigurado: boolean;
  /** SALA_PSEUDO_SEGREDO presente (a fila só grava com ele). */
  pseudonimoConfigurado: boolean;
  /** GEORESCUE_BASE_URL e SALA_SESSION_SECRET presentes (login real ligado). */
  loginConfigurado: boolean;
  grupoOperador: string;
  cronProtegido: boolean;
}

export function configuracaoStatus(): ConfiguracaoStatus {
  const e = env();
  return {
    armazemLeituras: e.ARMAZEM_LEITURAS,
    alertasArmazem: e.ALERTAS_ARMAZEM,
    bancoConfigurado: Boolean(e.DATABASE_URL),
    pseudonimoConfigurado: Boolean(e.SALA_PSEUDO_SEGREDO),
    loginConfigurado: Boolean(e.GEORESCUE_BASE_URL && e.SALA_SESSION_SECRET),
    grupoOperador: e.SALA_GRUPO_OPERADOR,
    // A mesma regra de /api/ingest: segredo curto bloqueia os jobs (não protege).
    cronProtegido: Boolean(e.CRON_SECRET && e.CRON_SECRET.length >= TAMANHO_MINIMO_CRON_SECRET),
  };
}

export interface PainelStatus {
  geradoEm: string;
  modoExemplo: boolean;
  /** Variáveis de ambiente ignoradas por formato inválido (só os nomes). */
  variaveisInvalidas: string[];
  configuracao: ConfiguracaoStatus;
  fontes: StatusFonteDetalhado[];
  resumo: Record<StatusFonte["estado"], number>;
}

const CAMADA_POR_FONTE = Object.fromEntries(
  Object.values(CAMADAS_ARCGIS).map((c) => [c.fonte, c.id]),
) as Partial<Record<FonteId, CamadaArcgisId>>;

async function sondar(fonte: FonteId): Promise<DiagnosticoCamada | undefined> {
  const camada = CAMADA_POR_FONTE[fonte];
  if (camada) {
    const leitura = await obterCamada(camada);
    return {
      camada: CAMADAS_ARCGIS[camada].nome,
      nomeNoServidor: leitura.dados.nomeNoServidor,
      origem: leitura.dados.origem ?? null,
      ...leitura.dados.diagnostico,
    };
  }
  if (fonte === "inmet-avisos") await obterAvisosInmet();
  if (fonte === "inmet-municipios") await obterAvisosInmetMunicipios();
  if (fonte === "cemaden-alertas") await obterAlertasCemaden();
  if (fonte === "open-meteo-previsao") await obterPrevisaoCobs();
  if (fonte === "open-meteo-municipios") await obterSeriesChuvaMunicipios();
  return undefined;
}

export async function obterPainelStatus(): Promise<PainelStatus> {
  const exemplo = modoExemplo();
  const implementadas = LISTA_FONTES.filter((f) => f.implementada);

  const diagnosticos = new Map<FonteId, DiagnosticoCamada | undefined>();
  await Promise.all(
    implementadas.map(async (f) => {
      try {
        diagnosticos.set(f.id, await sondar(f.id));
      } catch {
        // A falha já fica registrada em statusDaFonte (ultimoErro).
        diagnosticos.set(f.id, undefined);
      }
    }),
  );

  const agora = new Date();
  const fontes: StatusFonteDetalhado[] = LISTA_FONTES.map((definicao) => {
    const status = statusDaFonte(definicao.id, { modoExemplo: exemplo, agora });
    const diagnostico = diagnosticos.get(definicao.id);
    return diagnostico ? { ...status, diagnostico } : status;
  });

  const resumo: PainelStatus["resumo"] = {
    ok: 0,
    atrasada: 0,
    "fora-do-ar": 0,
    "nao-implementada": 0,
    exemplo: 0,
    desconhecida: 0,
  };
  for (const f of fontes) resumo[f.estado]++;

  return {
    geradoEm: agora.toISOString(),
    modoExemplo: exemplo,
    variaveisInvalidas: variaveisInvalidas(),
    configuracao: configuracaoStatus(),
    fontes,
    resumo,
  };
}
