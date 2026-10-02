"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

import { AlternarTema } from "./alternar-tema";
import { BrasaoCbmmg } from "./brasao-cbmmg";
import { ListaNavegacao } from "./lista-navegacao";

/**
 * Celular (< 768px): o trilho vira gaveta sobreposta, aberta pelo botão ☰ de 38px
 * (.gr-abrir-gaveta, Index.html:3430-3449). A gaveta fecha ao escolher um item.
 */
export function GavetaNavegacao() {
  const [aberta, setAberta] = useState(false);

  return (
    <Sheet open={aberta} onOpenChange={setAberta}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Abrir menu de navegação"
          className="relative alvo-toque inline-flex size-[38px] shrink-0 items-center justify-center rounded-[10px] border border-border bg-sup-2 text-ink-2 transition-colors hover:text-ink-forte md:hidden"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" rotuloFechar="Fechar menu" className="w-[min(82vw,288px)] gap-0 sm:max-w-none">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 pt-4 pb-3.5 pr-14">
          <BrasaoCbmmg className="h-12" classeMonograma="h-12 text-[9.5px] rounded-[10px]" />
          <div className="min-w-0">
            <SheetTitle className="text-[15px] font-bold">Sala de Situação</SheetTitle>
            <SheetDescription className="gr-eyebrow mt-1 text-[10px] text-acc-txt">Período Chuvoso</SheetDescription>
          </div>
        </div>
        <div className="rolagem-fina min-h-0 flex-1 overflow-y-auto py-2">
          <ListaNavegacao variante="gaveta" aoNavegar={() => setAberta(false)} />
        </div>
        <div className="shrink-0 border-t border-border px-4 pt-3 pb-[max(14px,env(safe-area-inset-bottom))]">
          <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[.12em] text-faint">Aparência</p>
          <AlternarTema variante="segmentado" />
          <p className="mt-3 text-center text-[10.5px] text-faint">Sala de Situação · CBMMG</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
