import type { Metadata } from "next";
import { Suspense } from "react";

import { AutoAtualizar } from "@/components/comum/auto-atualizar";
import { embrulhar } from "@/components/comum/resultado";
import { SeletorPeriodo } from "@/components/comum/seletor-periodo";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import {
  BlocoAvisosInmet,
  BlocoGraficos,
  BlocoKpis,
  BlocoResumoCob,
  CarimboIndicadores,
} from "@/components/visao-geral/blocos";
import {
  EsqueletoAvisosInmet,
  EsqueletoCarimbo,
  EsqueletoGraficos,
  EsqueletoKpis,
  EsqueletoResumoCob,
} from "@/components/visao-geral/esqueletos";
import { descreverPeriodo } from "@/components/visao-geral/formatos";
import { MapaVisaoGeral } from "@/components/visao-geral/mapa-visao-geral";
import { obterIndicadores } from "@/lib/dados/visao-geral";
import { ehPeriodoId, periodoChuvoso, type PeriodoId } from "@/lib/dominio/periodo";
import { FonteIndisponivelError } from "@/lib/fontes/tipos";
import { itemDaRota } from "@/lib/navegacao";
import { obterAvisosInmet } from "@/lib/sources/inmet";

/*
 * Visão Geral: indicadores do período chuvoso, mapa de MG, avisos do INMET,
 * gráficos e resumo por COB. Dados por requisição (sem cache de página).
 * Streaming: as fontes começam juntas, sem await aqui; cada bloco é um Server
 * Component async no próprio <Suspense> (esqueleto de mesma altura) e aparece
 * assim que a SUA fonte responde — um INMET lento não segura os indicadores do
 * ArcGIS. Uma fonte fora do ar vira o cartão "fonte indisponível" só do bloco.
 * A página se atualiza sozinha a cada 2 min com a aba visível (AutoAtualizar;
 * na atualização os blocos mantêm a leitura anterior na tela até a nova
 * chegar) e o mapa a cada 5 min.
 */
export const dynamic = "force-dynamic";

const modulo = itemDaRota("/");

export const metadata: Metadata = {
  title: modulo.rotulo,
  description: modulo.descricao,
};

function lerPeriodo(valor: string | string[] | undefined): PeriodoId {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  return ehPeriodoId(bruto) ? bruto : "atual";
}

function registrarFalha(bloco: string) {
  return (motivo: unknown) => {
    if (!(motivo instanceof FonteIndisponivelError)) {
      console.error(`[visao-geral] falha inesperada em ${bloco}`, motivo);
    }
  };
}

export default async function PaginaVisaoGeral({ searchParams }: PageProps<"/">) {
  const periodoId = lerPeriodo((await searchParams).periodo);
  const agora = new Date();
  const periodo = periodoChuvoso(periodoId, agora);
  const descricaoPeriodo = descreverPeriodo(periodo);

  // Iniciadas aqui, em paralelo, e NÃO aguardadas: cada bloco espera só a sua.
  const indicadores = embrulhar(obterIndicadores(periodoId, agora), registrarFalha("indicadores"));
  const avisos = embrulhar(obterAvisosInmet(agora), registrarFalha("avisos INMET"));

  return (
    <>
      <AutoAtualizar />
      <CabecalhoPagina
        titulo={modulo.rotulo}
        icone={modulo.icone}
        subtitulo={descricaoPeriodo}
        acoes={
          <Suspense fallback={<EsqueletoCarimbo />}>
            <CarimboIndicadores resultado={indicadores} />
          </Suspense>
        }
      >
        <SeletorPeriodo atual={periodoId} agora={agora} />
      </CabecalhoPagina>

      <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-5">
        <Suspense fallback={<EsqueletoKpis />}>
          <BlocoKpis resultado={indicadores} />
        </Suspense>

        {/* Mapa (busca as próprias camadas no navegador) + avisos do INMET */}
        <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-12">
          <div className="min-w-0 xl:col-span-8">
            <MapaVisaoGeral periodo={{ inicio: periodo.inicio, fim: periodo.fim, rotulo: periodo.rotulo }} />
          </div>
          <div className="min-w-0 xl:col-span-4">
            <Suspense fallback={<EsqueletoAvisosInmet className="h-full" />}>
              <BlocoAvisosInmet resultado={avisos} className="h-full" />
            </Suspense>
          </div>
        </div>

        <Suspense fallback={<EsqueletoGraficos />}>
          <BlocoGraficos resultado={indicadores} descricaoPeriodo={descricaoPeriodo} />
        </Suspense>

        <Suspense fallback={<EsqueletoResumoCob />}>
          <BlocoResumoCob resultado={indicadores} />
        </Suspense>
      </div>
    </>
  );
}
