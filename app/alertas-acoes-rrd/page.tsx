import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EmConstrucao } from "@/components/layout/em-construcao";
import { itemDaRota } from "@/lib/navegacao";

const modulo = itemDaRota("/alertas-acoes-rrd");

export const metadata: Metadata = {
  title: modulo.rotulo,
  description: modulo.descricao,
};

export default function PaginaAlertasAcoesRrd() {
  return (
    <>
      <CabecalhoPagina titulo={modulo.rotulo} subtitulo={modulo.descricao} icone={modulo.icone} />
      <div className="mx-auto w-full max-w-4xl">
        <EmConstrucao
          icone={modulo.icone}
          titulo={modulo.rotulo}
          descricao="Do alerta emitido pela UEOp à ação de Redução do Risco de Desastres executada no município, com prazo e responsável à vista."
          entregas={[
            "Emissão de alertas com protocolo CAP (Common Alerting Protocol), o padrão usado pelos avisos oficiais.",
            "Fila de pendências com prazo: alertas que ainda aguardam ação RRD, ordenados pelo vencimento, por COB e BBM.",
            "Notificação pelo Telegram para quem precisa agir, no momento em que o alerta é emitido ou o prazo aperta.",
          ]}
          substitui="Aba Alertas do painel atual."
          enquantoIsso="continue emitindo alertas e registrando ações RRD pelos formulários Survey123 e pela aba Alertas do painel atual. Os totais por COB já aparecem na Visão Geral."
        />
      </div>
    </>
  );
}
