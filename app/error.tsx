"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Erro inesperado ao montar uma tela. Em produção a mensagem real não chega ao
 * navegador (só o código "digest", que localiza o erro nos logs do servidor).
 */
export default function ErroDaTela({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[sala] erro ao montar a tela", error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex w-full max-w-2xl flex-col items-start gap-5 py-10 max-md:py-6">
      <span
        aria-hidden="true"
        className="grid size-[52px] place-items-center rounded-[14px] border border-perigo/40 bg-perigo/16 text-perigo-txt"
      >
        <TriangleAlert className="size-6" />
      </span>
      <div>
        <p className="gr-eyebrow">Falha ao carregar</p>
        <h1 className="mt-2 text-[20px] font-bold uppercase leading-[1.12] tracking-[.02em] text-ink-forte">
          Não foi possível montar esta tela
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
          Pode ser uma falha passageira de rede ou de uma fonte de dados. Tente de novo; se persistir, confira o{" "}
          <Link href="/status" className="font-semibold text-acc-txt underline underline-offset-4">
            status das fontes
          </Link>
          .
        </p>
        {error.digest ? (
          <p className="mt-3 text-[12px] text-mut">
            Código para o suporte: <code className="font-mono text-ink-2">{error.digest}</code>
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => retry()}>
          <RotateCw aria-hidden="true" />
          Tentar de novo
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">Voltar à Visão Geral</Link>
        </Button>
      </div>
    </div>
  );
}
