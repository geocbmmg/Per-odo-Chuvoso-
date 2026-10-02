import { cn } from "@/lib/utils";

import { CLASSE_AMOSTRA_SERIE, type SerieId } from "./paleta";

/**
 * Legenda de gráficos com 2+ séries (nenhuma para série única: o título nomeia).
 * Amostra retangular como a marca (barra), texto em tinta — nunca na cor da série.
 * As cores vêm das variáveis CSS do contêiner (CLASSE_VARIAVEIS_SERIES).
 */
export function LegendaSeries({
  itens,
  className,
}: {
  itens: readonly { serie: SerieId; rotulo: string; descricao?: string }[];
  className?: string;
}) {
  return (
    <ul aria-label="Legenda do gráfico" className={cn("flex flex-wrap gap-x-4 gap-y-1.5", className)}>
      {itens.map((item) => (
        <li key={item.serie} className="inline-flex items-center gap-1.5 text-[12px] leading-tight text-ink-2">
          <span
            aria-hidden="true"
            className={cn("h-2.5 w-3.5 shrink-0 rounded-[3px]", CLASSE_AMOSTRA_SERIE[item.serie])}
          />
          <span className="font-semibold">{item.rotulo}</span>
          {item.descricao ? <span className="text-mut">{item.descricao}</span> : null}
        </li>
      ))}
    </ul>
  );
}
