import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface ColunaTabela {
  titulo: string;
  /** Números: alinhados à direita, tabular. */
  numerica?: boolean;
}

/**
 * Alternativa acessível de um gráfico: tabela com os mesmos valores, dentro de
 * um <details> "Ver tabela" (fechado por padrão; funciona sem JavaScript e é
 * lido normalmente por leitores de tela e na impressão).
 */
export function TabelaAlternativa({
  colunas,
  linhas,
  legenda,
  className,
}: {
  colunas: readonly ColunaTabela[];
  linhas: readonly { chave: string; celulas: readonly ReactNode[] }[];
  /** Legenda da tabela (rodapé .dash-foot). */
  legenda?: ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("group", className)}>
      <summary
        className={cn(
          "relative alvo-toque inline-flex cursor-pointer list-none items-center gap-1.5 rounded-[8px] px-1 py-1",
          "text-[12.5px] font-semibold text-ink-2 hover:text-acc-txt [&::-webkit-details-marker]:hidden",
        )}
      >
        <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
        <span className="group-open:hidden">Ver tabela</span>
        <span className="hidden group-open:inline">Ocultar tabela</span>
      </summary>
      <div className="mt-2">
        <Table containerClassName={legenda ? "rounded-b-none" : undefined}>
          <TableHeader>
            <TableRow>
              {colunas.map((coluna) => (
                <TableHead key={coluna.titulo} className={coluna.numerica ? "text-right" : undefined}>
                  {coluna.titulo}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((linha) => (
              <TableRow key={linha.chave}>
                {linha.celulas.map((celula, i) => (
                  <TableCell
                    key={i}
                    className={colunas[i]?.numerica ? "text-right tabular-nums" : "font-semibold text-ink"}
                  >
                    {celula}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {legenda ? (
          <p className="rounded-b-[14px] border border-t-0 border-border bg-superficie px-3.5 py-2 text-[11px] leading-snug text-mut">
            {legenda}
          </p>
        ) : null}
      </div>
    </details>
  );
}
