import "server-only";
import type { AvisoInmet } from "@/lib/dominio/tipos";
import { env, modoExemplo } from "@/lib/env";
import { buscarTexto } from "@/lib/fontes/http";
import { obterLeitura } from "@/lib/fontes/leituras";
import type { Leitura } from "@/lib/fontes/tipos";
import { deslocamentoEmDiasAte, deslocarIso } from "@/lib/sources/exemplos/deslocar";
import { REFERENCIA_RSS_INMET_EXEMPLO, RSS_INMET_EXEMPLO } from "@/lib/sources/exemplos/inmet-avisos";
import {
  URL_AVISOS_INMET,
  filtrarAvisosMg,
  interpretarRssInmet,
  vigenciaDoAviso,
  type AvisoInmetBruto,
  type VigenciaAviso,
} from "./parser";

export type { VigenciaAviso } from "./parser";
export { MESORREGIOES_MG, mesorregioesMg } from "./parser";

export interface AvisoInmetVigente extends AvisoInmet {
  vigencia: Exclude<VigenciaAviso, "expirado">;
}

function exemplo(): AvisoInmetBruto[] {
  // Em dias inteiros: os avisos mantêm os horários do arquivo (ex.: 08:30–23:59).
  const delta = deslocamentoEmDiasAte(REFERENCIA_RSS_INMET_EXEMPLO);
  return interpretarRssInmet(RSS_INMET_EXEMPLO).map((a) => ({
    ...a,
    inicio: deslocarIso(a.inicio, delta),
    fim: deslocarIso(a.fim, delta),
  }));
}

/**
 * Avisos do INMET que afetam MG e ainda não expiraram. O feed bruto fica em
 * cache (10 min); o filtro de vigência é aplicado a cada chamada, para que
 * um aviso saia da tela assim que vencer, mesmo com o cache válido.
 */
export async function obterAvisosInmet(agora: Date = new Date()): Promise<Leitura<AvisoInmetVigente[]>> {
  const leitura = await obterLeitura(
    "inmet-avisos",
    "rss",
    async () => interpretarRssInmet(await buscarTexto(URL_AVISOS_INMET, { timeoutMs: env().FONTES_TIMEOUT_MS })),
    { modoExemplo: modoExemplo(), exemplo },
  );
  const avisos = filtrarAvisosMg(leitura.dados, agora).map((a) => ({
    ...a,
    vigencia: vigenciaDoAviso(a, agora) as AvisoInmetVigente["vigencia"],
  }));
  return { ...leitura, dados: avisos };
}
