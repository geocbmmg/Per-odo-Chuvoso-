"use client";

import { useState } from "react";
import { ChevronRight, Eye, LoaderCircle, Radio, ShieldCheck } from "lucide-react";

import type { OpcaoPerfilDemonstracao, PerfilDemonstracao } from "@/lib/auth/demonstracao";
import { caminhoDeVolta } from "@/lib/auth/voltar";
import { cn } from "@/lib/utils";

import { enviarAuth } from "./enviar";
import { MensagemErroAuth } from "./mensagem-erro";

const ICONES: Record<PerfilDemonstracao, typeof Radio> = {
  "operador-sala": Radio,
  unidade: ShieldCheck,
  leitura: Eye,
};

/**
 * "Entrar como (demonstração)": três perfis fictícios do modo demonstração.
 * Cada botão pede ao servidor a MESMA sessão assinada do login real, com
 * `demonstracao: true` — o GeoRescue não é chamado.
 */
export function PerfisDemonstracao({
  perfis,
  voltar,
  atual,
}: {
  perfis: readonly OpcaoPerfilDemonstracao[];
  voltar: string;
  /** Perfil da sessão de demonstração atual (marcado como "em uso"). */
  atual: PerfilDemonstracao | null;
}) {
  const [enviando, setEnviando] = useState<PerfilDemonstracao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function entrarComo(perfil: PerfilDemonstracao) {
    if (enviando) return;
    setEnviando(perfil);
    setErro(null);
    const resultado = await enviarAuth("/api/auth/login", { perfilDemonstracao: perfil });
    if (resultado.ok) {
      window.location.assign(caminhoDeVolta(voltar));
      return;
    }
    setEnviando(null);
    setErro(resultado.erro);
  }

  return (
    <div className="flex flex-col gap-3">
      <ul role="list" aria-label="Perfis de demonstração" className="flex flex-col gap-2">
        {perfis.map((perfil) => {
          const Icone = ICONES[perfil.id];
          const emUso = atual === perfil.id;
          const carregando = enviando === perfil.id;
          return (
            <li key={perfil.id}>
              <button
                type="button"
                onClick={() => void entrarComo(perfil.id)}
                disabled={enviando !== null}
                aria-busy={carregando || undefined}
                className={cn(
                  "group flex min-h-14 w-full items-center gap-3 rounded-[12px] border bg-sup-1 px-3 py-2.5 text-left",
                  "transition-[border-color,background-color] hover:border-acc/40 hover:bg-acc/8 disabled:opacity-60",
                  emUso ? "border-acc/40 border-l-[3px] border-l-primary" : "border-linha/14",
                )}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-acc/30 bg-acc/12 text-acc-txt"
                >
                  {carregando ? <LoaderCircle className="size-[18px] motion-safe:animate-spin" /> : <Icone className="size-[18px]" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold leading-tight text-ink">
                    Entrar como {perfil.titulo}
                    {emUso ? <span className="ml-1.5 text-[11px] font-semibold text-acc-txt">(em uso)</span> : null}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-mut">{perfil.descricao}</span>
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-mut transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          );
        })}
      </ul>
      <MensagemErroAuth id="entrar-demo-erro" mensagem={erro} />
    </div>
  );
}
