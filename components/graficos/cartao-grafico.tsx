import { useId, type ReactNode } from "react";

import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { LegendaSeries } from "./legenda-series";
import { CLASSE_VARIAVEIS_SERIES, type SerieId } from "./paleta";

/**
 * Cartão de gráfico (.dash-chartcard): título 15px caixa alta, descrição,
 * carimbo de atualização, legenda (2+ séries), o gráfico e a tabela
 * alternativa. Define as variáveis de cor das séries para tudo o que contém.
 */
export function CartaoGrafico({
  titulo,
  descricao,
  carimbo,
  legenda,
  tabela,
  children,
  className,
}: {
  titulo: string;
  descricao?: ReactNode;
  /** <CarimboAtualizacao …/> do bloco. */
  carimbo?: ReactNode;
  legenda?: readonly { serie: SerieId; rotulo: string; descricao?: string }[];
  /** <TabelaAlternativa …/>. */
  tabela?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const idTitulo = useId();
  return (
    <section
      aria-labelledby={idTitulo}
      className={cn(cardVariants({ variant: "padrao" }), CLASSE_VARIAVEIS_SERIES, "min-w-0 gap-3", className)}
    >
      <header className="flex flex-col gap-1">
        <h2 id={idTitulo} className="text-[15px] font-bold uppercase leading-tight tracking-[.03em] text-ink">
          {titulo}
        </h2>
        {descricao ? <p className="text-[12.5px] leading-snug text-mut">{descricao}</p> : null}
        {carimbo ? <div className="mt-0.5">{carimbo}</div> : null}
      </header>
      {legenda && legenda.length >= 2 ? <LegendaSeries itens={legenda} /> : null}
      <div className="min-w-0">{children}</div>
      {tabela}
    </section>
  );
}
