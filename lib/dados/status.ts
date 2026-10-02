import "server-only";
import { modoExemplo, variaveisInvalidas } from "@/lib/env";
import { LISTA_FONTES } from "@/lib/fontes/catalogo";
import { statusDaFonte } from "@/lib/fontes/leituras";
import type { FonteId, StatusFonte } from "@/lib/fontes/tipos";
import { CAMADAS_ARCGIS, obterCamada, type CamadaArcgisId, type OrigemCamada } from "@/lib/sources/arcgis";
import type { Diagnostico } from "@/lib/sources/arcgis/normalizar";
import { obterAvisosInmet } from "@/lib/sources/inmet";
import { obterPrevisaoCobs } from "@/lib/sources/open-meteo";

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

export interface PainelStatus {
  geradoEm: string;
  modoExemplo: boolean;
  /** Variáveis de ambiente ignoradas por formato inválido (só os nomes). */
  variaveisInvalidas: string[];
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
  if (fonte === "open-meteo-previsao") await obterPrevisaoCobs();
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
    fontes,
    resumo,
  };
}
