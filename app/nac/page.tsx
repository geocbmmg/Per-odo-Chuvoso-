import type { Metadata } from "next";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EmConstrucao } from "@/components/layout/em-construcao";
import { itemDaRota } from "@/lib/navegacao";

const modulo = itemDaRota("/nac");

export const metadata: Metadata = {
  title: "NAC — Núcleos de Atenção às Chuvas",
  description: modulo.descricao,
};

export default function PaginaNac() {
  return (
    <>
      <CabecalhoPagina
        titulo="NAC"
        subtitulo="Núcleos de Atenção às Chuvas — anúncio operacional diário por COB e BBM."
        icone={modulo.icone}
      />
      <div className="mx-auto w-full max-w-4xl">
        <EmConstrucao
          icone={modulo.icone}
          titulo="Núcleos de Atenção às Chuvas"
          descricao="O efetivo de prontidão para as chuvas, dia a dia, em cada Comando Operacional e Batalhão."
          entregas={[
            "Anúncio diário dos Núcleos de Atenção às Chuvas por COB e BBM.",
            "Efetivo diário × efetivo total de cada núcleo, com o quadro consolidado do estado.",
            "Check-in pelo celular: o militar confirma a prontidão no próprio aparelho, sem formulário à parte.",
          ]}
          substitui="Aba NAC do painel atual."
          enquantoIsso="o anúncio operacional diário segue pelo formulário Survey123 e pela aba NAC do painel atual."
        />
      </div>
    </>
  );
}
