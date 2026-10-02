import { alturaEstimada } from "@/components/graficos/medidas";
import { cardVariants } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * Esqueletos dos blocos da Visão Geral, com a MESMA altura aproximada do bloco
 * pronto (sem pulo de layout quando o dado chega por streaming). Usados como
 * fallback de cada <Suspense> em app/page.tsx e montados juntos em
 * app/loading.tsx. Decorativos (aria-hidden): o anúncio "carregando" fica num
 * único role="status" por bloco, para o leitor de tela não repetir.
 */

function Carregando({ rotulo }: { rotulo: string }) {
  return (
    <span role="status" className="sr-only">
      {`Carregando ${rotulo}…`}
    </span>
  );
}

/** Carimbo "Atualizado às…" do cabeçalho. */
export function EsqueletoCarimbo({ className }: { className?: string }) {
  return <Skeleton className={cn("h-4 w-52 max-w-full rounded-full", className)} />;
}

/** Faixa de 4 KPIs (2 colunas no celular). */
export function EsqueletoKpis() {
  return (
    <div className="min-w-0">
      <Carregando rotulo="indicadores do período" />
      <div aria-hidden="true" className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col rounded-[14px] border border-border bg-superficie p-3.5 pl-4">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="mt-1 h-3 w-24 max-w-[70%]" />
              <Skeleton className="size-8 shrink-0 rounded-[9px]" />
            </div>
            <Skeleton className="mt-2 h-[30px] w-16" />
            <Skeleton className="mt-1.5 h-4 w-28 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Cartão "Avisos INMET para MG" (contagem por severidade + 2 avisos + botão). */
export function EsqueletoAvisosInmet({ className }: { className?: string }) {
  return (
    <div className={cn(cardVariants({ variant: "padrao" }), "min-w-0 gap-3", className)}>
      <Carregando rotulo="avisos do INMET" />
      <div aria-hidden="true" className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-56 max-w-full" />
        <Skeleton className="mt-0.5 h-3.5 w-48 max-w-full" />
      </div>
      <div aria-hidden="true" className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[62px] rounded-[10px]" />
        ))}
      </div>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-[112px] rounded-[10px]" />
        <Skeleton className="h-[112px] rounded-[10px]" />
      </div>
      <div aria-hidden="true" className="mt-auto border-t border-border pt-3">
        <Skeleton className="h-8 w-40 rounded-[8px]" />
      </div>
    </div>
  );
}

/** Um cartão de gráfico: título, descrição, carimbo, legenda, área do gráfico e "Ver tabela". */
function EsqueletoCartaoGrafico() {
  return (
    <div aria-hidden="true" className={cn(cardVariants({ variant: "padrao" }), "min-w-0 gap-3")}>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-full max-w-80" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="mt-0.5 h-3.5 w-48 max-w-full" />
      </div>
      <Skeleton className="h-3.5 w-56 max-w-full" />
      {/* Mesma altura reservada pelos gráficos para 6 barras (um por COB). */}
      <Skeleton className="w-full rounded-[10px]" style={{ height: alturaEstimada(6) }} />
      <Skeleton className="h-6 w-28" />
    </div>
  );
}

/** Os dois gráficos lado a lado (empilhados abaixo de lg). */
export function EsqueletoGraficos() {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
      <Carregando rotulo="gráficos de alertas" />
      <EsqueletoCartaoGrafico />
      <EsqueletoCartaoGrafico />
    </div>
  );
}

/** "Resumo por COB": título + carimbo, tabela de 6 COBs + "Sem COB" + total, rodapé. */
export function EsqueletoResumoCob() {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <Carregando rotulo="resumo por COB" />
      <div aria-hidden="true" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <Skeleton className="h-4 w-36" />
        <EsqueletoCarimbo />
      </div>
      <div aria-hidden="true" className="overflow-hidden rounded-[14px] border border-border bg-superficie">
        <div className="flex h-[34px] items-center gap-6 border-b border-acc/34 px-3">
          <Skeleton className="h-2.5 w-12" />
          <Skeleton className="ml-auto h-2.5 w-14" />
          <Skeleton className="h-2.5 w-14 max-sm:hidden" />
          <Skeleton className="h-2.5 w-14 max-sm:hidden" />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex h-[39px] items-center gap-6 border-b border-linha/5 px-3 last:border-b-0">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="ml-auto h-3 w-8" />
            <Skeleton className="h-3 w-8 max-sm:hidden" />
            <Skeleton className="h-3 w-8 max-sm:hidden" />
          </div>
        ))}
        <div className="flex flex-col gap-1.5 border-t border-border px-3.5 py-2.5">
          <Skeleton className="h-2.5 w-64 max-w-full" />
          <Skeleton className="h-2.5 w-full max-w-[520px]" />
        </div>
      </div>
    </div>
  );
}
