import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Cabeçalho de página — .cap-pagehead do GeoRescue (Index.html:3724-3746; visual-shell.md §1.4):
 * gradiente sup-1 → fundo, chip de ícone de 46px no acento, título 20px / 700 / .02em
 * em CAIXA ALTA (por CSS), subtítulo 13px em --gr-mut e um espaço à direita para
 * ações e carimbo de atualização.
 *
 * Por padrão "sangra" até as bordas da área de conteúdo (desfaz o padding de
 * .sala-pagina). Use `sangria={false}` fora do topo da página.
 */
export function CabecalhoPagina({
  titulo,
  subtitulo,
  icone: Icone,
  acoes,
  children,
  sangria = true,
  className,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  icone?: LucideIcon;
  /** Ações e carimbo, à direita (quebram para baixo no celular). */
  acoes?: ReactNode;
  /** Conteúdo extra abaixo do título (ex.: sub-abas). */
  children?: ReactNode;
  sangria?: boolean;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "border-b border-linha/12 bg-linear-to-b from-sup-1 to-gr-bg",
        sangria
          ? "mx-[calc(var(--pagina-pad,0px)*-1)] mt-[calc(var(--pagina-pad,0px)*-1)] mb-6 px-[calc(var(--pagina-pad,0px)+2px)]"
          : "mb-5 rounded-[14px] border px-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3 py-5 max-md:py-4">
        <div className="flex min-w-0 flex-1 basis-72 items-center gap-3.5">
          {Icone ? (
            <span
              aria-hidden="true"
              className="grid size-[46px] shrink-0 place-items-center rounded-[12px] border border-acc/34 bg-acc/12 text-acc-txt shadow-halo max-md:size-10 max-md:rounded-[10px]"
            >
              <Icone className="size-[22px] max-md:size-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h1 className="text-[20px] font-bold uppercase leading-[1.12] tracking-[.02em] text-ink-forte max-md:text-[17px]">
              {titulo}
            </h1>
            {subtitulo ? <p className="mt-1 text-[13px] leading-snug text-mut">{subtitulo}</p> : null}
          </div>
        </div>
        {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
      </div>
      {children ? <div className="pb-3">{children}</div> : null}
    </header>
  );
}
