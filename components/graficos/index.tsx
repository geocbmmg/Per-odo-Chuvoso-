"use client";

/**
 * Ponto de entrada dos gráficos para as páginas. O Recharts só roda no
 * navegador (next/dynamic com ssr: false — permitido apenas dentro de um
 * Client Component): nada de gráfico no HTML do servidor, logo nada de erro de
 * hidratação. Enquanto o chunk chega, um esqueleto ocupa a MESMA altura
 * estimada (~36px por barra + eixo), sem pulo de layout.
 * O estado vazio é decidido aqui, já no HTML do servidor.
 */

import dynamic from "next/dynamic";
import { CircleSlash } from "lucide-react";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { agruparTiposRisco, type LinhaAlertasPorCob, type LinhaAlertasPorTipo } from "./dados";
import { alturaEstimada } from "./medidas";

function EsqueletoGrafico() {
  return (
    <div className="absolute inset-0" role="status">
      <Skeleton className="size-full rounded-[10px]" />
      <span className="sr-only">Carregando gráfico</span>
    </div>
  );
}

const AlertasPorCobDinamico = dynamic(() => import("./alertas-por-cob"), {
  ssr: false,
  loading: EsqueletoGrafico,
});

const AlertasPorTipoDinamico = dynamic(() => import("./alertas-por-tipo"), {
  ssr: false,
  loading: EsqueletoGrafico,
});

function AreaGrafico({ barras, children }: { barras: number; children: ReactNode }) {
  return (
    <div className="relative w-full min-w-0" style={{ minHeight: alturaEstimada(barras) }}>
      {children}
    </div>
  );
}

/** Estado vazio explícito (palavra + ícone), no lugar do gráfico. */
export function EstadoVazioGrafico({ mensagem = "Nenhum alerta no período" }: { mensagem?: string }) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-linha/16 bg-linha/3 px-4 py-6 text-center">
      <CircleSlash aria-hidden="true" className="size-5 text-mut" />
      <p className="text-[13px] font-semibold text-ink-2">{mensagem}</p>
    </div>
  );
}

/** Barras horizontais empilhadas (com ação RRD × pendente) por COB. */
export function GraficoAlertasPorCob({ linhas }: { linhas: readonly LinhaAlertasPorCob[] }) {
  if (!linhas.some((l) => l.alertas > 0)) return <EstadoVazioGrafico />;
  return (
    <AreaGrafico barras={linhas.length}>
      <AlertasPorCobDinamico linhas={linhas} />
    </AreaGrafico>
  );
}

/** Barras horizontais de série única por tipo de risco, ordenadas desc. */
export function GraficoAlertasPorTipo({
  linhas,
  totalAlertas,
}: {
  linhas: readonly LinhaAlertasPorTipo[];
  totalAlertas: number;
}) {
  const barras = agruparTiposRisco(linhas).length;
  if (barras === 0) return <EstadoVazioGrafico />;
  return (
    <AreaGrafico barras={barras}>
      <AlertasPorTipoDinamico linhas={linhas} totalAlertas={totalAlertas} />
    </AreaGrafico>
  );
}
