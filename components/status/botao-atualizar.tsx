"use client";

import { useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Evento global para quem mostra dados de /api/status fora da página (ex.: indicador do cabeçalho). */
export const EVENTO_ATUALIZAR_FONTES = "sala:atualizar-fontes";

/**
 * "Atualizar" — refaz a renderização da página no servidor (router.refresh),
 * mantendo rolagem e estado do navegador. Sem JavaScript, é um link comum
 * para a própria página (mesmo efeito, com recarga completa).
 */
export function BotaoAtualizar({ href, className }: { href: string; className?: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  function atualizar(evento: MouseEvent<HTMLAnchorElement>) {
    // Ctrl/⌘/meio-clique continuam abrindo em nova aba.
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey || evento.button !== 0) return;
    evento.preventDefault();
    if (pendente) return;
    iniciar(() => {
      router.refresh();
    });
    window.dispatchEvent(new Event(EVENTO_ATUALIZAR_FONTES));
  }

  return (
    <Button asChild variant="secondary" className={className}>
      <a href={href} onClick={atualizar} aria-disabled={pendente || undefined} aria-busy={pendente || undefined}>
        <RefreshCw aria-hidden="true" className={cn("size-4", pendente && "motion-safe:animate-spin")} />
        <span aria-live="polite">{pendente ? "Atualizando…" : "Atualizar"}</span>
      </a>
    </Button>
  );
}
