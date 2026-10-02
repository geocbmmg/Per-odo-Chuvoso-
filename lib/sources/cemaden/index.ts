import "server-only";
import { env } from "@/lib/env";
import { buscarJson } from "@/lib/fontes/http";
import { obterLeituraServidor } from "@/lib/fontes/armazem-servidor";
import type { Leitura } from "@/lib/fontes/tipos";
import { ALERTAS_CEMADEN_EXEMPLO, REFERENCIA_CEMADEN_EXEMPLO } from "@/lib/sources/exemplos/cemaden";
import { deslocamentoAte, deslocarIso } from "@/lib/sources/exemplos/deslocar";
import {
  ORIGEM_PAINEL_CEMADEN,
  URL_ALERTAS_CEMADEN,
  interpretarAlertasCemaden,
  type AlertasCemaden,
} from "./parser";

export type { AlertaCemaden, AlertasCemaden, CamadaCemaden } from "./parser";
export { camadasCemaden } from "./parser";

/** Exemplo no formato bruto, pelo mesmo parser da produção, com as datas trazidas para `agora`. */
function exemplo(agora: Date): AlertasCemaden {
  const delta = deslocamentoAte(REFERENCIA_CEMADEN_EXEMPLO, agora);
  const dados = interpretarAlertasCemaden(ALERTAS_CEMADEN_EXEMPLO);
  return {
    ...dados,
    atualizadoNaFonte: deslocarIso(dados.atualizadoNaFonte, delta),
    alertas: dados.alertas.map((a) => ({
      ...a,
      criadoEm: deslocarIso(a.criadoEm, delta),
      atualizadoEm: deslocarIso(a.atualizadoEm, delta),
    })),
  };
}

/**
 * Alertas abertos do CEMADEN em MG (camadas Geológico e Hidrológico), com
 * cache de 10 min e última leitura válida. O endpoint não é documentado: a
 * resposta é validada na carga e, se o formato mudar, a Sala mostra a última
 * leitura válida ou "fonte indisponível". Somente leitura.
 */
export async function obterAlertasCemaden(agora: Date = new Date()): Promise<Leitura<AlertasCemaden>> {
  return obterLeituraServidor(
    "cemaden-alertas",
    "wsAlertas2",
    async () =>
      interpretarAlertasCemaden(
        await buscarJson<unknown>(URL_ALERTAS_CEMADEN, {
          timeoutMs: env().FONTES_TIMEOUT_MS,
          // O painel não envia CORS e é lido só no servidor; Origin/Referer como os do próprio painel.
          cabecalhos: {
            Accept: "application/json",
            Origin: ORIGEM_PAINEL_CEMADEN,
            Referer: `${ORIGEM_PAINEL_CEMADEN}/`,
          },
        }),
      ),
    { exemplo: () => exemplo(agora) },
  );
}
