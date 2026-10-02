import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Esqueleto do CabecalhoPagina (mesma sangria, gradiente e alturas), para os
 * loading.tsx. `faixa`: a linha extra abaixo do título (ex.: seletor de
 * período); `acoes`: o espaço à direita (ex.: botão Atualizar).
 */
export function EsqueletoCabecalhoPagina({
  faixa = false,
  acoes = false,
  className,
}: {
  faixa?: boolean;
  acoes?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "mx-[calc(var(--pagina-pad,0px)*-1)] mt-[calc(var(--pagina-pad,0px)*-1)] mb-6 border-b border-linha/12 bg-linear-to-b from-sup-1 to-gr-bg px-[calc(var(--pagina-pad,0px)+2px)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3 py-5 max-md:py-4">
        <div className="flex min-w-0 flex-1 basis-72 items-center gap-3.5">
          <Skeleton className="size-[46px] shrink-0 rounded-[12px] max-md:size-10" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-40 max-w-full" />
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </div>
        </div>
        {acoes ? <Skeleton className="h-9 w-32 rounded-[9px]" /> : null}
      </div>
      {faixa ? (
        <div className="pb-3">
          <Skeleton className="h-11 w-full max-w-[560px] rounded-[12px] sm:h-9 sm:rounded-full" />
        </div>
      ) : null}
    </div>
  );
}
