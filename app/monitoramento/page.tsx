import type { Metadata } from "next";
import { Suspense } from "react";

import { AutoAtualizar } from "@/components/comum/auto-atualizar";
import { embrulhar } from "@/components/comum/resultado";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { BlocoAvisosDados, BlocoPrevisaoDados } from "@/components/monitoramento/blocos-dados";
import { EsqueletoBlocoAvisos, EsqueletoBlocoPrevisao } from "@/components/monitoramento/esqueletos";
import { BotaoAtualizar } from "@/components/status/botao-atualizar";
import { itemDaRota } from "@/lib/navegacao";
import { obterAvisosInmet } from "@/lib/sources/inmet";
import { obterPrevisaoCobs } from "@/lib/sources/open-meteo";

/*
 * Monitoramento — avisos do INMET e previsão de chuva por COB.
 * Streaming: as duas fontes começam juntas, sem await aqui; cada bloco é um
 * Server Component async no próprio <Suspense> e aparece assim que a SUA fonte
 * responde. Se uma fonte falhar sem leitura anterior (FonteIndisponivelError),
 * só aquele bloco vira o cartão "fonte indisponível".
 * Como a Visão Geral, a página se atualiza sozinha a cada 2 min com a aba
 * visível (AutoAtualizar): numa tela deixada aberta, avisos vencidos somem e
 * os programados passam a "vigente" sem ninguém clicar em Atualizar.
 */
export const dynamic = "force-dynamic";

const modulo = itemDaRota("/monitoramento");

export const metadata: Metadata = {
  title: modulo.rotulo,
  description: modulo.descricao,
};

export default function PaginaMonitoramento() {
  const agora = new Date();
  // Iniciadas aqui, em paralelo, e NÃO aguardadas: cada bloco espera só a sua.
  // (O log de erro inesperado fica em descreverFalha, no bloco que falhou.)
  const avisos = embrulhar(obterAvisosInmet(agora));
  const previsao = embrulhar(obterPrevisaoCobs(agora));

  return (
    <>
      <AutoAtualizar />
      <CabecalhoPagina
        titulo={modulo.rotulo}
        subtitulo="Avisos meteorológicos e previsão de chuva por COB"
        icone={modulo.icone}
        acoes={<BotaoAtualizar href="/monitoramento" />}
      />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <Suspense fallback={<EsqueletoBlocoAvisos />}>
          <BlocoAvisosDados resultado={avisos} />
        </Suspense>

        <Suspense fallback={<EsqueletoBlocoPrevisao />}>
          <BlocoPrevisaoDados resultado={previsao} agora={agora} />
        </Suspense>
      </div>
    </>
  );
}
