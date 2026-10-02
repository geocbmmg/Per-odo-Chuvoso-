import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EmConstrucao } from "@/components/layout/em-construcao";
import { itemDaRota } from "@/lib/navegacao";

const modulo = itemDaRota("/boletim");

export const metadata: Metadata = {
  title: modulo.rotulo,
  description: modulo.descricao,
};

export default function PaginaBoletim() {
  return (
    <>
      <CabecalhoPagina titulo={modulo.rotulo} subtitulo={modulo.descricao} icone={modulo.icone} />
      <div className="mx-auto w-full max-w-4xl">
        <EmConstrucao
          icone={modulo.icone}
          titulo="Boletim matinal"
          descricao="O retrato das últimas 24 horas no período chuvoso, montado sozinho a partir dos dados da Sala."
          entregas={[
            "Boletim matinal gerado a partir do banco de dados: página web e arquivo em PDF e DOCX.",
            "Envio automático por e-mail e Telegram às 06h, horário de Brasília.",
            "Mesmos números da Visão Geral — um só cálculo para a tela e para o documento.",
          ]}
          substitui="Boletim v1/v2 e Relatório Final da plataforma atual."
          enquantoIsso="o boletim continua sendo produzido pelo fluxo atual (Boletim v1/v2 e Relatório Final)."
        />
      </div>
    </>
  );
}
