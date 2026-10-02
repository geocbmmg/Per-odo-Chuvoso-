import "server-only";
import { env } from "@/lib/env";
import { buscarJson } from "@/lib/fontes/http";
import { obterLeituraServidor } from "@/lib/fontes/armazem-servidor";
import type { Leitura } from "@/lib/fontes/tipos";
import { deslocarIso } from "@/lib/sources/exemplos/deslocar";
import { AVISOS_ATIVOS_INMET_EXEMPLO, REFERENCIA_INMET_ATIVOS_EXEMPLO } from "@/lib/sources/exemplos/inmet-ativos";
import {
  URL_AVISOS_ATIVOS_INMET,
  interpretarAvisosAtivosInmet,
  selecionarAvisosRisco,
  type AvisosInmetAtivos,
  type AvisosInmetRisco,
} from "./parser-ativos";

export type { AvisoInmetRisco, AvisosInmetRisco } from "./parser-ativos";
export { camadaMeteorologica } from "./parser-ativos";

const HORA_MS = 3_600_000;

/**
 * Exemplo no formato bruto, pelo mesmo parser da produção. As datas são
 * deslocadas em HORAS inteiras para o instante de referência do arquivo virar
 * `agora`: o aviso "futuro" continua começando ~10 h depois, e os horários
 * continuam redondos.
 */
function exemplo(agora: Date): AvisosInmetAtivos {
  const delta =
    Math.round((agora.getTime() - new Date(REFERENCIA_INMET_ATIVOS_EXEMPLO).getTime()) / HORA_MS) * HORA_MS;
  const dados = interpretarAvisosAtivosInmet(AVISOS_ATIVOS_INMET_EXEMPLO);
  return {
    ...dados,
    avisos: dados.avisos.map((a) => ({ ...a, inicio: deslocarIso(a.inicio, delta), fim: deslocarIso(a.fim, delta) })),
  };
}

/**
 * Avisos do INMET por município para a camada Meteorológico: só MG, eventos do
 * período chuvoso, vigentes ou começando nas próximas 24 h. A resposta já
 * interpretada (só MG) fica em cache (10 min); o filtro de evento e de janela é
 * aplicado a cada chamada, para um aviso sair do mapa assim que vencer.
 */
export async function obterAvisosInmetMunicipios(agora: Date = new Date()): Promise<Leitura<AvisosInmetRisco>> {
  const leitura = await obterLeituraServidor(
    "inmet-municipios",
    "ativos",
    async () =>
      // Interpretado já na carga: resposta inválida nunca vira "última leitura válida".
      interpretarAvisosAtivosInmet(
        await buscarJson<unknown>(URL_AVISOS_ATIVOS_INMET, {
          timeoutMs: env().FONTES_TIMEOUT_MS,
          cabecalhos: { Accept: "application/json" },
        }),
      ),
    { exemplo: () => exemplo(agora) },
  );
  return { ...leitura, dados: selecionarAvisosRisco(leitura.dados, agora) };
}
