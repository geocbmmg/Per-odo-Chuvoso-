import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * Esqueletos do Mapa de Risco, com a MESMA altura aproximada dos blocos
 * prontos (sem pulo de layout). Decorativos (aria-hidden): o anúncio
 * "carregando" fica num único role="status".
 */

/** Área do mapa (barra de nível + mapa + legenda). */
export function EsqueletoMapaRisco({ altura, className }: { altura: string; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-border bg-sup-1", className)}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-56 max-w-[50%] rounded-full" />
      </div>
      <div className={cn("grid place-content-center justify-items-center gap-3 bg-gr-bg", altura)}>
        <span className="mapa-giro" />
        <span className="mapa-carregando__texto">Carregando mapa</span>
      </div>
    </div>
  );
}

/** Lista de municípios ao lado do mapa. */
export function EsqueletoListaRisco({ linhas = 8 }: { linhas?: number }) {
  return (
    <div
      aria-hidden="true"
      className="flex min-w-0 flex-col divide-y divide-linha/8 rounded-[12px] border border-border"
    >
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="h-3.5 w-5" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-40 max-w-full" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Página inteira (app/risco/loading.tsx). */
export function EsqueletoPainelRisco({ altura }: { altura: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-5">
      <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          <EsqueletoMapaRisco altura={altura} />
        </div>
        <div className="min-w-0 rounded-[14px] border border-border bg-superficie p-4 xl:col-span-4">
          <Skeleton className="mb-3 h-4 w-56 max-w-full" />
          <EsqueletoListaRisco />
        </div>
      </div>
    </div>
  );
}
