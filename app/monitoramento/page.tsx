import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EmConstrucao } from "@/components/layout/em-construcao";
import { itemDaRota } from "@/lib/navegacao";

/* PROVISÓRIO: a página definitiva do Monitoramento substitui este placeholder. */
const modulo = itemDaRota("/monitoramento");

export const metadata: Metadata = {
  title: modulo.rotulo,
  description: modulo.descricao,
};

export default function PaginaMonitoramento() {
  return (
    <>
      <CabecalhoPagina titulo={modulo.rotulo} subtitulo={modulo.descricao} icone={modulo.icone} />
      <div className="mx-auto w-full max-w-4xl">
        <EmConstrucao
          icone={modulo.icone}
          titulo={modulo.rotulo}
          fase="Em implementação"
          entregas={[
            "Avisos meteorológicos vigentes do INMET para Minas Gerais, com severidade e municípios atingidos.",
            "Previsão de chuva acumulada em 24 h e 72 h nas sedes dos seis COBs (Open-Meteo).",
          ]}
          substitui="Aba Risco Meteorológico do painel atual."
        />
      </div>
    </>
  );
}
