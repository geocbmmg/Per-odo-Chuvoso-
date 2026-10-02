"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Abas no padrão GeoRescue (visual-tokens.md §6.6):
 * - "chip"       → .gr-abas: chips de raio 10; ativo = fundo acento .16 + borda .45 + peso 750
 * - "sublinhado" → .dash-nav: caixa alta, ativo = traço inferior de 2px + fundo .07
 * Em ambos o ativo tem mais de um sinal além da cor (fundo/traço + peso).
 */
type VarianteAbas = "chip" | "sublinhado";

const ContextoAbas = React.createContext<VarianteAbas>("chip");

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-3.5", className)} {...props} />;
}

function TabsList({
  className,
  variant = "chip",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & { variant?: VarianteAbas }) {
  return (
    <ContextoAbas.Provider value={variant}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(
          "rolagem-fina flex w-full max-w-full items-center overflow-x-auto",
          variant === "chip" && "gap-1.5 border-b border-border pb-3.5",
          variant === "sublinhado" && "gap-0.5 rounded-t-[12px] border border-border bg-background px-1.5",
          className,
        )}
        {...props}
      />
    </ContextoAbas.Provider>
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.useContext(ContextoAbas);
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative alvo-toque inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap transition-colors",
        "disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        variant === "chip" && [
          "rounded-[10px] border border-transparent bg-linha/4 px-[17px] py-2.5 text-[13px] font-[650] text-mut",
          "hover:bg-linha/8 hover:text-ink-forte",
          "data-[state=active]:border-acc/45 data-[state=active]:bg-acc/16 data-[state=active]:font-[750] data-[state=active]:text-acc-forte",
        ],
        variant === "sublinhado" && [
          "-mb-px border-b-2 border-transparent px-[18px] py-3 text-[12.8px] font-bold uppercase tracking-[.02em] text-mut",
          "hover:text-ink",
          "data-[state=active]:border-acc-txt data-[state=active]:bg-acc/7 data-[state=active]:text-ink",
        ],
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("min-w-0 flex-1", className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent, type VarianteAbas };
