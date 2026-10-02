import { useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Hourglass, ShieldAlert, ShieldCheck, Siren } from "lucide-react";

import { formatarNumero } from "@/components/graficos/medidas";
import type { Indicadores } from "@/lib/dominio/tipos";
import { cn } from "@/lib/utils";

import { REGRA_PENDENCIA } from "./formatos";

type TomKpi = "acento" | "info" | "alerta" | "perigo" | "neutro";

/** Faixa lateral de 3px (.dash-kpi::before) e chip do ícone, por tom. */
const FAIXA: Record<TomKpi, string> = {
  acento: "before:bg-primary",
  info: "before:bg-info",
  alerta: "before:bg-alerta",
  perigo: "before:bg-perigo",
  neutro: "before:bg-linha/30",
};

const CHIP: Record<TomKpi, string> = {
  acento: "border-acc/33 bg-acc/15 text-acc-txt",
  info: "border-info/33 bg-info/15 text-info-txt",
  alerta: "border-alerta/33 bg-alerta/15 text-alerta-txt",
  perigo: "border-perigo/33 bg-perigo/15 text-perigo-txt",
  neutro: "border-linha/20 bg-linha/8 text-mut",
};

/**
 * Cartão de indicador no padrão .dash-kpi do GeoRescue: superfície, raio 14,
 * faixa lateral de 3px na cor do indicador, ícone em chip, micro-rótulo em
 * caixa alta e número grande tabular. A regra do indicador fica no texto de
 * apoio (visível), na dica do mouse (title) e para leitores de tela.
 */
export function CartaoKpi({
  rotulo,
  valor,
  icone: Icone,
  tom,
  complemento,
  apoio,
  regra,
}: {
  rotulo: string;
  /** Número já calculado; null = indisponível. */
  valor: number | null;
  icone: LucideIcon;
  tom: TomKpi;
  /** Texto curto ao lado do número (ex.: "· 2 em monitoramento"). */
  complemento?: ReactNode;
  /** Texto curto abaixo do número. */
  apoio?: ReactNode;
  /** Como o número é calculado (acessível). */
  regra: string;
}) {
  const idRotulo = useId();
  const idRegra = useId();
  return (
    <li className="min-w-0">
      <div
        role="group"
        aria-labelledby={idRotulo}
        aria-describedby={idRegra}
        title={regra}
        className={cn(
          "relative flex h-full min-w-0 flex-col overflow-hidden rounded-[14px] border border-border bg-superficie p-3.5 pl-4",
          "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-['']",
          FAIXA[tom],
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <h3
            id={idRotulo}
            className="min-h-6 min-w-0 text-[10.5px] font-bold uppercase leading-tight tracking-[.05em] text-mut"
          >
            {rotulo}
          </h3>
          <span
            aria-hidden="true"
            className={cn("grid size-8 shrink-0 place-items-center rounded-[9px] border", CHIP[tom])}
          >
            <Icone className="size-4" />
          </span>
        </div>
        {valor === null ? (
          <p className="mt-2 text-[1.15rem] font-bold leading-tight text-mut">Indisponível</p>
        ) : (
          <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
            <span className="numero text-[1.85rem] font-extrabold leading-none text-ink">{formatarNumero(valor)}</span>
            {complemento ? <span className="text-[12px] leading-snug text-mut">{complemento}</span> : null}
          </p>
        )}
        {apoio ? <div className="mt-1.5 text-[12px] leading-snug text-mut">{apoio}</div> : null}
        <p id={idRegra} className="sr-only">
          {regra}
        </p>
      </div>
    </li>
  );
}

/** Faixa de KPIs da Visão Geral: 2 colunas no celular, 4 no desktop. */
export function FaixaKpis({ indicadores }: { indicadores: Indicadores }) {
  const { totalAlertas, totalAcoesRrd, alertasPendentes, alertasSemNumeroChamada, ocorrenciasComplexas } = indicadores;
  const emAndamento = ocorrenciasComplexas?.["em-andamento"] ?? null;
  const emMonitoramento = ocorrenciasComplexas?.monitoramento ?? null;

  return (
    <section aria-labelledby="kpis-titulo">
      <h2 id="kpis-titulo" className="sr-only">
        Indicadores do período
      </h2>
      <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <CartaoKpi
          rotulo="Alertas emitidos"
          valor={totalAlertas}
          icone={Siren}
          tom="acento"
          apoio="no período selecionado"
          regra="Alertas registrados no formulário Emissão de Alertas com data de emissão dentro do período."
        />
        <CartaoKpi
          rotulo="Ações RRD"
          valor={totalAcoesRrd}
          icone={ShieldCheck}
          tom="info"
          apoio="executadas no período"
          regra="Ações de Redução do Risco de Desastres registradas com data de execução dentro do período."
        />
        <CartaoKpi
          rotulo="Alertas pendentes"
          valor={alertasPendentes}
          icone={Hourglass}
          tom="alerta"
          apoio={
            <>
              <span className="block">sem ação RRD vinculada</span>
              {alertasSemNumeroChamada > 0 ? (
                <span className="block font-semibold text-alerta-txt">
                  {formatarNumero(alertasSemNumeroChamada)} sem nº de chamada
                </span>
              ) : null}
            </>
          }
          regra={REGRA_PENDENCIA}
        />
        <CartaoKpi
          rotulo="Ocorrências complexas em andamento"
          valor={emAndamento}
          icone={ShieldAlert}
          tom={emAndamento === null ? "neutro" : emAndamento > 0 ? "perigo" : "neutro"}
          complemento={emMonitoramento === null ? undefined : `· ${formatarNumero(emMonitoramento)} em monitoramento`}
          apoio={emMonitoramento === null ? "camada de ocorrências indisponível" : undefined}
          regra="Ocorrências complexas com situação em andamento (contam sempre, independentemente do período); as em monitoramento aparecem no texto de apoio."
        />
      </ul>
    </section>
  );
}
