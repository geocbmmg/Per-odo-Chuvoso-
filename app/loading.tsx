import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto de carregamento (Visão Geral). Como fica na raiz de app/, também
 * aparece ao navegar para uma página sem loading próprio — por isso o desenho é
 * genérico: cabeçalho, faixa de indicadores e blocos. Pulsa só sem
 * prefers-reduced-motion (o Skeleton para sozinho).
 */
export default function Carregando() {
  return (
    <div role="status" aria-live="polite" className="min-w-0">
      <span className="sr-only">Carregando dados da página…</span>

      {/* Cabeçalho da página (mesma sangria do CabecalhoPagina) */}
      <div className="mx-[calc(var(--pagina-pad,0px)*-1)] mt-[calc(var(--pagina-pad,0px)*-1)] mb-6 border-b border-linha/12 bg-linear-to-b from-sup-1 to-gr-bg px-[calc(var(--pagina-pad,0px)+2px)]">
        <div className="flex items-center gap-3.5 py-5 max-md:py-4">
          <Skeleton className="size-[46px] shrink-0 rounded-[12px] max-md:size-10" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-40 max-w-full" />
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </div>
        </div>
        <div className="pb-3">
          <Skeleton className="h-11 w-full max-w-[560px] rounded-[12px] sm:h-9 sm:rounded-full" />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5" aria-hidden="true">
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-[14px] border border-border bg-superficie p-3.5">
              <div className="flex items-start justify-between gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="size-8 rounded-[9px]" />
              </div>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-28 max-w-full" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <div className="flex flex-col gap-2.5 xl:col-span-8">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-[60svh] min-h-[340px] w-full rounded-[14px] md:h-[560px] md:min-h-0" />
          </div>
          <div className="rounded-[14px] border border-border bg-superficie p-4 xl:col-span-4">
            <Skeleton className="h-4 w-44" />
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Skeleton className="h-16 rounded-[10px]" />
              <Skeleton className="h-16 rounded-[10px]" />
              <Skeleton className="h-16 rounded-[10px]" />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Skeleton className="h-24 rounded-[10px]" />
              <Skeleton className="h-24 rounded-[10px]" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-[14px] border border-border bg-superficie p-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64 max-w-full" />
              <Skeleton className="h-[248px] w-full rounded-[10px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
