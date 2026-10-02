import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Tabela no padrão .dash-tbl do GeoRescue (visual-tokens.md §6.5).
 * O contêiner rola na horizontal (como .dash-tscroll), então a página nunca rola de lado.
 * Cabeçalho fixo (sticky) dentro do contêiner, zebra .02 e hover em acento .08.
 */
function Table({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<"table"> & { containerClassName?: string }) {
  return (
    <div
      data-slot="table-container"
      className={cn(
        "rolagem-fina relative w-full overflow-x-auto rounded-[14px] border border-border bg-superficie",
        containerClassName,
      )}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom border-collapse text-[12.8px] leading-snug", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn(className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child_td]:border-b-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t border-border bg-linha/3 font-semibold text-ink [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "transition-colors even:bg-[var(--zebra)] hover:bg-acc/8 data-[state=selected]:bg-acc/12",
        className,
      )}
      {...props}
    />
  );
}

/** th — 10px / 700 / .09em, caixa alta, --gr-faint, filete inferior em acento .34. */
function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      scope="col"
      className={cn(
        "sticky top-0 z-[1] whitespace-nowrap border-b border-acc/34 bg-fundo/95 px-3 py-2.5 text-left align-middle",
        "text-[10px] font-bold uppercase tracking-[.09em] text-faint",
        "[&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "border-b border-linha/5 px-3 py-2.5 align-middle text-ink-2 tabular-nums [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

/** Legenda no rodapé da tabela — .dash-foot: 11px, --gr-faint, alinhada à direita. */
function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("caption-bottom border-t border-border px-3.5 py-2 text-right text-[11px] text-faint", className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
