import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EmConstrucao } from "@/components/layout/em-construcao";
import { itemDaRota } from "@/lib/navegacao";

const modulo = itemDaRota("/ocorrencias-complexas");

export const metadata: Metadata = {
  title: modulo.rotulo,
  description: modulo.descricao,
};

export default function PaginaOcorrenciasComplexas() {
  return (
    <>
      <CabecalhoPagina titulo={modulo.rotulo} subtitulo={modulo.descricao} icone={modulo.icone} />
      <div className="mx-auto w-full max-w-4xl">
        <EmConstrucao
          icone={modulo.icone}
          titulo={modulo.rotulo}
          descricao="Cada ocorrência complexa registrada na estrutura do Sistema de Comando de Incidentes, do anúncio ao encerramento."
          entregas={[
            "Estrutura SCI completa: resumo, objetivos (SCI-201), ações, comandante do incidente, dia de operação e recursos.",
            "Linha do tempo da ocorrência, com cada atualização datada.",
            "Exportação do formulário SCI-201 pronto para o posto de comando.",
          ]}
          substitui="Abas Ocorrências Complexas e Histórico do painel atual."
          enquantoIsso="anuncie e atualize ocorrências complexas pelo formulário Survey123 e consulte as abas Ocorrências Complexas e Histórico do painel atual. As ocorrências em andamento já aparecem no mapa da Visão Geral."
        />
      </div>
    </>
  );
}
