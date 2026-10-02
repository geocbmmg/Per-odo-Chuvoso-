import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Cartão no padrão GeoRescue (visual-tokens.md §6.1):
 * - padrao   → .dash-head/.dash-tbl/.dash-chartcard (superfície translúcida, raio 14)
 * - destaque → .op-card-uni (barra de 3px no acento à esquerda)
 * - vidro    → .gr-kpi (painel .6 + blur + moldura interna de acento)
 * - modulo   → .cap-mod (sup-2, raio 16, mais respiro)
 */
const cardVariants = cva("flex flex-col gap-3.5 border text-card-foreground", {
  variants: {
    variant: {
      padrao: "rounded-[14px] border-border bg-superficie p-4",
      destaque: "rounded-[12px] border-border border-l-[3px] border-l-primary bg-superficie px-4 py-3.5",
      vidro:
        "rounded-[14px] border-linha/9 bg-painel/60 p-4 shadow-[inset_0_0_0_1px_rgba(var(--acc-rgb),.28)] backdrop-blur-[4px]",
      modulo: "rounded-[16px] border-linha/12 bg-sup-2 px-5 py-[22px]",
    },
  },
  defaultVariants: {
    variant: "padrao",
  },
});

function Card({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return <div data-slot="card" className={cn(cardVariants({ variant, className }))} {...props} />;
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min grid-rows-[auto_auto] items-start gap-1 has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className,
      )}
      {...props}
    />
  );
}

/** Título de cartão — .gr-card__title: 16px / 700 / .03em, caixa alta por CSS. */
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-[16px] font-bold uppercase leading-tight tracking-[.03em] text-ink", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-[12.5px] leading-snug text-mut", className)} {...props} />;
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("min-w-0", className)} {...props} />;
}

/** Rodapé de cartão — .dash-foot: 11px, --gr-faint, filete superior. */
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex flex-wrap items-center gap-2 border-t border-border pt-2.5 text-[11px] text-faint", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent, cardVariants };
