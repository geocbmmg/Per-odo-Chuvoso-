import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Botões no padrão GeoRescue (visual-tokens.md §6.4):
 * - default      → .btn-acc      (acento cheio, brilho no hover)
 * - outline      → .btn-acc-out  (contorno acento; enche no hover)
 * - secondary    → .cfg-abrir    (neutro; "neutro" é sinônimo)
 * - ghost        → .cfg-mini / ícone sem moldura
 * - destructive  → fundo --perigo com tinta branca
 * - link         → texto em acento
 * Alturas: default 36px · sm 30px · lg 40px · icon 36px. Em telas de toque o
 * alvo é ampliado para 44px sem mudar o desenho (utilitário alvo-toque).
 */
const buttonVariants = cva(
  [
    "relative alvo-toque inline-flex shrink-0 items-center justify-center gap-[7px] whitespace-nowrap",
    "rounded-[9px] border text-[13px] font-bold leading-none select-none",
    "transition-[background-color,border-color,color,filter,box-shadow] duration-150",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "aria-invalid:border-perigo",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground shadow-acc hover:brightness-[1.08]",
        outline:
          "border-acc/34 bg-transparent text-acc-txt hover:border-primary hover:bg-primary hover:text-primary-foreground",
        secondary:
          "border-linha/20 bg-sup-1 font-semibold text-ink-2 hover:border-acc/34 hover:bg-acc/8 hover:text-acc-txt",
        neutro:
          "border-linha/20 bg-sup-1 font-semibold text-ink-2 hover:border-acc/34 hover:bg-acc/8 hover:text-acc-txt",
        ghost: "border-transparent bg-transparent font-semibold text-ink-2 hover:bg-linha/6 hover:text-ink-forte",
        destructive: "border-perigo bg-perigo text-tinta-cheia hover:brightness-[1.08]",
        link: "border-transparent bg-transparent font-semibold text-acc-txt underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-[30px] rounded-[8px] px-[11px] text-xs",
        lg: "h-10 px-[18px]",
        icon: "size-9",
        "icon-sm": "size-[30px] rounded-[8px]",
        "icon-lg": "size-10 rounded-[10px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? "default"}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
