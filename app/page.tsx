import type { Metadata } from "next";

import { AutoAtualizar } from "@/components/comum/auto-atualizar";
import { descreverFalhaFonte, FonteIndisponivel } from "@/components/comum/fonte-indisponivel";
import { SeletorPeriodo } from "@/components/comum/seletor-periodo";
import { CartaoGrafico } from "@/components/graficos/cartao-grafico";
import { agruparTiposRisco, alertasAtendidos, SERIES_ALERTAS_POR_COB } from "@/components/graficos/dados";
import { GraficoAlertasPorCob, GraficoAlertasPorTipo } from "@/components/graficos";
import { formatarNumero, formatoPercentual } from "@/components/graficos/medidas";
import { TabelaAlternativa } from "@/components/graficos/tabela-alternativa";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { CarimboAtualizacao } from "@/components/layout/carimbo-atualizacao";
import { ResumoAvisosInmet } from "@/components/visao-geral/avisos-inmet";
import { descreverPeriodo, REGRA_PENDENCIA } from "@/components/visao-geral/formatos";
import { FaixaKpis } from "@/components/visao-geral/kpis";
import { MapaVisaoGeral } from "@/components/visao-geral/mapa-visao-geral";
import { TabelaResumoCob } from "@/components/visao-geral/tabela-cobs";
import { obterIndicadores, type IndicadoresComMeta } from "@/lib/dados/visao-geral";
import { ehPeriodoId, periodoChuvoso, type PeriodoId } from "@/lib/dominio/periodo";
import { CATALOGO_FONTES } from "@/lib/fontes/catalogo";
import { FonteIndisponivelError } from "@/lib/fontes/tipos";
import { itemDaRota } from "@/lib/navegacao";
import { obterAvisosInmet } from "@/lib/sources/inmet";

/*
 * Visão Geral: indicadores do período chuvoso, mapa de MG, avisos do INMET,
 * gráficos e resumo por COB. Dados por requisição (sem cache de página); cada
 * bloco é independente — uma fonte fora do ar vira um cartão "fonte
 * indisponível" e o resto da página continua. A página se atualiza sozinha a
 * cada 2 min com a aba visível (AutoAtualizar) e o mapa a cada 5 min.
 */
export const dynamic = "force-dynamic";

const modulo = itemDaRota("/");

export const metadata: Metadata = {
  title: modulo.rotulo,
  description: modulo.descricao,
};

const FONTE_INDICADORES = "Alertas, ações RRD e ocorrências (ArcGIS CBMMG)";

function lerPeriodo(valor: string | string[] | undefined): PeriodoId {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  return ehPeriodoId(bruto) ? bruto : "atual";
}

function registrarFalha(bloco: string, motivo: unknown) {
  if (!(motivo instanceof FonteIndisponivelError)) {
    console.error(`[visao-geral] falha inesperada em ${bloco}`, motivo);
  }
}

function CarimboIndicadores({ meta }: { meta: IndicadoresComMeta["meta"] }) {
  return (
    <CarimboAtualizacao
      atualizadoEm={meta.atualizadoEm}
      origem={meta.origem}
      erro={meta.erro}
      fonte={FONTE_INDICADORES}
    />
  );
}

export default async function PaginaVisaoGeral({ searchParams }: PageProps<"/">) {
  const periodoId = lerPeriodo((await searchParams).periodo);
  const agora = new Date();
  const periodo = periodoChuvoso(periodoId, agora);

  const [resultadoIndicadores, resultadoAvisos] = await Promise.allSettled([
    obterIndicadores(periodoId, agora),
    obterAvisosInmet(agora),
  ]);

  if (resultadoIndicadores.status === "rejected") registrarFalha("indicadores", resultadoIndicadores.reason);
  if (resultadoAvisos.status === "rejected") registrarFalha("avisos INMET", resultadoAvisos.reason);

  const dadosIndicadores = resultadoIndicadores.status === "fulfilled" ? resultadoIndicadores.value : null;
  const indicadores = dadosIndicadores?.indicadores ?? null;
  const descricaoPeriodo = descreverPeriodo(periodo);

  return (
    <>
      <AutoAtualizar />
      <CabecalhoPagina
        titulo={modulo.rotulo}
        icone={modulo.icone}
        subtitulo={descricaoPeriodo}
        acoes={dadosIndicadores ? <CarimboIndicadores meta={dadosIndicadores.meta} /> : null}
      >
        <SeletorPeriodo atual={periodoId} agora={agora} />
      </CabecalhoPagina>

      <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-5">
        {/* KPIs */}
        {dadosIndicadores && indicadores ? (
          <FaixaKpis indicadores={indicadores} />
        ) : (
          <FonteIndisponivel
            titulo="Indicadores do período"
            {...descreverFalhaFonte(
              resultadoIndicadores.status === "rejected" ? resultadoIndicadores.reason : null,
              FONTE_INDICADORES,
            )}
          />
        )}

        {/* Mapa + avisos do INMET */}
        <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-12">
          <div className="min-w-0 xl:col-span-8">
            <MapaVisaoGeral periodo={{ inicio: periodo.inicio, fim: periodo.fim, rotulo: periodo.rotulo }} />
          </div>
          <div className="min-w-0 xl:col-span-4">
            {resultadoAvisos.status === "fulfilled" ? (
              <ResumoAvisosInmet leitura={resultadoAvisos.value} className="h-full" />
            ) : (
              <FonteIndisponivel
                titulo="Avisos INMET para MG"
                {...descreverFalhaFonte(resultadoAvisos.reason, CATALOGO_FONTES["inmet-avisos"].nome)}
              />
            )}
          </div>
        </div>

        {dadosIndicadores && indicadores ? (
          <>
            {/* Gráficos */}
            <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
              <CartaoGrafico
                titulo="Alertas por COB"
                descricao="Alertas emitidos no período, divididos entre os que já têm ação RRD e os pendentes. Total no fim de cada barra."
                carimbo={<CarimboIndicadores meta={dadosIndicadores.meta} />}
                legenda={SERIES_ALERTAS_POR_COB.map((s) => ({ serie: s.serie, rotulo: s.rotulo }))}
                tabela={
                  indicadores.totalAlertas > 0 ? (
                    <TabelaAlternativa
                      colunas={[
                        { titulo: "COB" },
                        { titulo: "Com ação RRD", numerica: true },
                        { titulo: "Pendentes", numerica: true },
                        { titulo: "Alertas", numerica: true },
                        { titulo: "Ações RRD", numerica: true },
                      ]}
                      linhas={indicadores.porCob.map((l) => ({
                        chave: l.cob,
                        celulas: [
                          l.cob,
                          formatarNumero(alertasAtendidos(l)),
                          formatarNumero(l.pendentes),
                          formatarNumero(l.alertas),
                          formatarNumero(l.acoesRrd),
                        ],
                      }))}
                      legenda={REGRA_PENDENCIA}
                    />
                  ) : null
                }
              >
                <GraficoAlertasPorCob linhas={indicadores.porCob} />
              </CartaoGrafico>

              <CartaoGrafico
                titulo="Alertas por tipo de risco"
                descricao={
                  agruparTiposRisco(indicadores.porTipoRisco).length < indicadores.porTipoRisco.length
                    ? "Alertas emitidos no período, do tipo mais frequente ao menos frequente. Os tipos menos frequentes estão somados em “Outros”; a tabela lista todos."
                    : "Alertas emitidos no período, do tipo mais frequente ao menos frequente."
                }
                carimbo={<CarimboIndicadores meta={dadosIndicadores.meta} />}
                tabela={
                  indicadores.totalAlertas > 0 ? (
                    <TabelaAlternativa
                      colunas={[
                        { titulo: "Tipo de risco" },
                        { titulo: "Alertas", numerica: true },
                        { titulo: "% do total", numerica: true },
                      ]}
                      linhas={indicadores.porTipoRisco.map((l) => ({
                        chave: l.tipo,
                        celulas: [
                          l.tipo,
                          formatarNumero(l.total),
                          formatoPercentual.format(l.total / indicadores.totalAlertas),
                        ],
                      }))}
                      legenda={descricaoPeriodo}
                    />
                  ) : null
                }
              >
                <GraficoAlertasPorTipo linhas={indicadores.porTipoRisco} totalAlertas={indicadores.totalAlertas} />
              </CartaoGrafico>
            </div>

            {/* Resumo por COB */}
            <section aria-labelledby="resumo-cob-titulo" className="flex min-w-0 flex-col gap-2.5">
              <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <h2
                  id="resumo-cob-titulo"
                  className="text-[15px] font-bold uppercase leading-tight tracking-[.03em] text-ink"
                >
                  Resumo por COB
                </h2>
                <CarimboIndicadores meta={dadosIndicadores.meta} />
              </header>
              <TabelaResumoCob indicadores={indicadores} />
            </section>
          </>
        ) : null}
      </div>
    </>
  );
}
