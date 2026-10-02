import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { CardDescription, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho de bloco de dados: chip de ícone (.gr-head__chip, 34px), título
 * de cartão (h2, caixa alta por CSS), descrição e, à direita, o carimbo de
 * atualização — que desce para baixo do título no celular em vez de espremê-lo.
 */
export function CabecalhoBloco({
  id,
  titulo,
  descricao,
  icone: Icone,
  carimbo,
  className,
}: {
  /** id do <h2> (para aria-labelledby da seção). */
  id: string;
  titulo: string;
  descricao?: ReactNode;
  icone?: LucideIcon;
  carimbo?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5", className)}>
      <div className="flex min-w-0 flex-1 basis-72 items-start gap-[11px]">
        {Icone ? (
          <span
            aria-hidden="true"
            className="grid size-[34px] shrink-0 place-items-center rounded-[9px] border border-acc/34 bg-acc/12 text-acc-txt"
          >
            <Icone className="size-[18px]" />
          </span>
        ) : null}
        <div className="min-w-0">
          <CardTitle>
            <h2 id={id}>{titulo}</h2>
          </CardTitle>
          {descricao ? <CardDescription className="mt-1">{descricao}</CardDescription> : null}
        </div>
      </div>
      {carimbo ? (
        // A pílula "última leitura válida" do carimbo é longa: aqui ela pode quebrar linha em vez de vazar no celular.
        <div className="min-w-0 max-w-full [&_[data-slot=badge]]:whitespace-normal [&_[data-slot=badge]]:text-left">
          {carimbo}
        </div>
      ) : null}
    </div>
  );
}
