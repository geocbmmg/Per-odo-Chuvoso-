import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto da fila de alertas (loading.tsx e primeira leitura): contadores,
 * abas, filtros e a lista, nas MESMAS alturas do conteúdo real.
 */
export function EsqueletoFilaAlertas() {
  return (
    <div aria-hidden="true" className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-4 sm:gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[74px] rounded-[14px]" />
        ))}
      </div>
      <Skeleton className="h-12 w-full max-w-[640px] rounded-[12px]" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-full max-w-[520px] rounded-full" />
        <Skeleton className="h-8 w-full max-w-[600px] rounded-full" />
      </div>
      <EsqueletoListaAlertas />
    </div>
  );
}

export function EsqueletoListaAlertas() {
  return (
    <>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:hidden">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[178px] rounded-[14px]" />
        ))}
      </div>
      <div className="flex flex-col gap-1.5 max-xl:hidden">
        <Skeleton className="h-10 w-full rounded-[10px]" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-[58px] w-full rounded-[6px]" />
        ))}
      </div>
    </>
  );
}
