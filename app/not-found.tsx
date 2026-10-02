import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MapPinOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NAVEGACAO } from "@/lib/navegacao";

export const metadata: Metadata = {
  title: "Página não encontrada",
};

export default function NaoEncontrada() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-5 py-10 max-md:py-6">
      <span
        aria-hidden="true"
        className="grid size-[52px] place-items-center rounded-[14px] border border-acc/34 bg-acc/12 text-acc-txt shadow-halo"
      >
        <MapPinOff className="size-6" />
      </span>
      <div>
        <p className="gr-eyebrow">Erro 404</p>
        <h1 className="mt-2 text-[20px] font-bold uppercase leading-[1.12] tracking-[.02em] text-ink-forte">
          Página não encontrada
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
          O endereço pode ter mudado ou o módulo ainda não existe. Escolha um destino abaixo.
        </p>
      </div>

      <Button asChild>
        <Link href="/">
          <ArrowLeft aria-hidden="true" />
          Voltar à Visão Geral
        </Link>
      </Button>

      <nav aria-label="Módulos da Sala" className="w-full border-t border-border pt-4">
        <ul className="flex flex-wrap gap-2">
          {NAVEGACAO.map((item) => {
            const Icone = item.icone;
            return (
              <li key={item.rota}>
                <Button asChild variant="secondary" size="sm">
                  <Link href={item.rota}>
                    <Icone aria-hidden="true" />
                    {item.rotulo}
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
