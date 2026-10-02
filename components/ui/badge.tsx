import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Pílula de estado no padrão GeoRescue (visual-tokens.md §6.3):
 * fundo rgba(cor, .14–.16), borda rgba(cor, .40), tinta --X-txt, caixa alta, peso 800.
 * Estado nunca só por cor: a pílula sempre leva a palavra; com `marcador`, ganha
 * também uma FORMA própria por variante (redondo, quadrado, losango…).
 * A neutra usa --gr-ink2 (não --gr-mut): sobre o fundo .12 composto nas superfícies
 * escuras, --gr-mut ficava em 3,3–4,4:1; --gr-ink2 dá 5,3–7:1 (e 7–7,9:1 no claro).
 */
const badgeVariants = cva(
  [
    "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 whitespace-nowrap",
    "rounded-full border px-2 py-[3px] text-[10.5px] font-extrabold uppercase leading-[1.25] tracking-[.06em]",
    "[&>svg]:pointer-events-none [&>svg]:size-3 [&>svg]:shrink-0",
    "transition-colors [a&]:hover:brightness-110",
  ].join(" "),
  {
    variants: {
      variant: {
        neutro: "border-linha/30 bg-linha/12 text-ink-2",
        acento: "border-acc/40 bg-acc/16 text-acc-txt",
        ok: "border-ok/40 bg-ok/14 text-ok-txt",
        alerta: "border-alerta/40 bg-alerta/14 text-alerta-txt",
        perigo: "border-perigo/40 bg-perigo/16 text-perigo-txt",
        info: "border-info/40 bg-info/16 text-info-txt",
      },
    },
    defaultVariants: {
      variant: "neutro",
    },
  },
);

type VarianteBadge = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

/** Forma do marcador por variante (2º sinal além da cor), como .acs-est no GeoRescue. */
const FORMA_MARCADOR: Record<VarianteBadge, string> = {
  neutro: "size-[7px] rounded-[1px] border-[1.5px] border-current bg-transparent",
  acento: "size-[7px] rounded-full bg-current",
  ok: "size-[7px] rounded-full bg-current",
  alerta: "size-[7px] rounded-[1px] bg-current",
  perigo: "size-[7px] rotate-45 rounded-[1px] bg-current",
  info: "size-[7px] rounded-full border-[1.5px] border-current bg-transparent",
};

function Badge({
  className,
  variant,
  asChild = false,
  marcador = false,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
    /** Mostra um marcador de forma própria antes do texto. */
    marcador?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "span";
  const v: VarianteBadge = variant ?? "neutro";

  return (
    <Comp data-slot="badge" data-variant={v} className={cn(badgeVariants({ variant: v }), className)} {...props}>
      {marcador && !asChild ? <span aria-hidden="true" className={cn("shrink-0", FORMA_MARCADOR[v])} /> : null}
      {children}
    </Comp>
  );
}

export { Badge, badgeVariants, type VarianteBadge };
