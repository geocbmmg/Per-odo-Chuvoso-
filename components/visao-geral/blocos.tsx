import { descreverFalhaFonte, FonteIndisponivel } from "@/components/comum/fonte-indisponivel";
import type { Resultado } from "@/components/comum/resultado";
import { GraficoAlertasPorCob, GraficoAlertasPorTipo } from "@/components/graficos";
import { CartaoGrafico } from "@/components/graficos/cartao-grafico";
import { agruparTiposRisco, alertasAtendidos, SERIES_ALERTAS_POR_COB } from "@/components/graficos/dados";
import { formatarNumero, formatoPercentual } from "@/components/graficos/medidas";
import { TabelaAlternativa } from "@/components/graficos/tabela-alternativa";
import { CarimboAtualizacao } from "@/components/layout/carimbo-atualizacao";
import type { IndicadoresComMeta } from "@/lib/dados/visao-geral";
import type { Leitura } from "@/lib/fontes/tipos";
import { CATALOGO_FONTES } from "@/lib/fontes/catalogo";
import type { AvisoInmetVigente } from "@/lib/sources/inmet";

import { ResumoAvisosInmet } from "./avisos-inmet";
import { REGRA_PENDENCIA } from "./formatos";
import { FaixaKpis } from "./kpis";
import { TabelaResumoCob } from "./tabela-cobs";

/*
 * Blocos de dados da Visão Geral como Server Components async: cada um espera
 * só a promessa da SUA fonte (já iniciada pela página) e fica dentro do próprio
 * <Suspense>, então a fonte mais lenta não segura a página inteira (streaming).
 * As promessas vêm de embrulhar(): nunca rejeitam; a falha vira o cartão
 * "fonte indisponível" do bloco (ou some, nos blocos que dependem do mesmo dado).
 */

export const FONTE_INDICADORES = "Alertas, ações RRD e ocorrências (ArcGIS CBMMG)";

type PromessaIndicadores = Promise<Resultado<IndicadoresComMeta>>;

function CarimboDosIndicadores({ meta }: { meta: IndicadoresComMeta["meta"] }) {
  return (
    <CarimboAtualizacao atualizadoEm={meta.atualizadoEm} origem={meta.origem} erro={meta.erro} fonte={FONTE_INDICADORES} />
  );
}

/** Carimbo dos indicadores no cabeçalho da página (nada, se a fonte falhou: o bloco de KPIs explica). */
export async function CarimboIndicadores({ resultado }: { resultado: PromessaIndicadores }) {
  const r = await resultado;
  return r.ok ? <CarimboDosIndicadores meta={r.valor.meta} /> : null;
}

/** Faixa de KPIs, ou o cartão "fonte indisponível" no lugar dela. */
export async function BlocoKpis({ resultado }: { resultado: PromessaIndicadores }) {
  const r = await resultado;
  if (r.ok) return <FaixaKpis indicadores={r.valor.indicadores} />;
  return <FonteIndisponivel titulo="Indicadores do período" {...descreverFalhaFonte(r.motivo, FONTE_INDICADORES)} />;
}

/** Resumo dos avisos do INMET, ou o cartão "fonte indisponível". */
export async function BlocoAvisosInmet({
  resultado,
  className,
}: {
  resultado: Promise<Resultado<Leitura<AvisoInmetVigente[]>>>;
  className?: string;
}) {
  const r = await resultado;
  if (r.ok) return <ResumoAvisosInmet leitura={r.valor} className={className} />;
  return (
    <FonteIndisponivel
      titulo="Avisos INMET para MG"
      {...descreverFalhaFonte(r.motivo, CATALOGO_FONTES["inmet-avisos"].nome)}
    />
  );
}

/** "Alertas por COB" e "Alertas por tipo de risco". Some se os indicadores falharam (o bloco de KPIs explica). */
export async function BlocoGraficos({
  resultado,
  descricaoPeriodo,
}: {
  resultado: PromessaIndicadores;
  descricaoPeriodo: string;
}) {
  const r = await resultado;
  if (!r.ok) return null;
  const { indicadores, meta } = r.valor;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
      <CartaoGrafico
        titulo="Alertas por COB"
        descricao="Alertas emitidos no período, divididos entre os que já têm ação RRD e os pendentes. Total no fim de cada barra."
        carimbo={<CarimboDosIndicadores meta={meta} />}
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
        carimbo={<CarimboDosIndicadores meta={meta} />}
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
  );
}

/** "Resumo por COB". Some se os indicadores falharam (o bloco de KPIs explica). */
export async function BlocoResumoCob({ resultado }: { resultado: PromessaIndicadores }) {
  const r = await resultado;
  if (!r.ok) return null;

  return (
    <section aria-labelledby="resumo-cob-titulo" className="flex min-w-0 flex-col gap-2.5">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 id="resumo-cob-titulo" className="text-[15px] font-bold uppercase leading-tight tracking-[.03em] text-ink">
          Resumo por COB
        </h2>
        <CarimboDosIndicadores meta={r.valor.meta} />
      </header>
      <TabelaResumoCob indicadores={r.valor.indicadores} />
    </section>
  );
}
