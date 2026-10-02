"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { EVENTO_ATUALIZAR_FONTES } from "@/components/status/botao-atualizar";
import { MarcadorEstado } from "@/components/status/pilula-estado";
import type { PainelStatus } from "@/lib/dados/status";
import type { EstadoFonte } from "@/lib/fontes/tipos";
import { cn } from "@/lib/utils";

/** Intervalo de consulta a /api/status (só com a aba visível). */
const INTERVALO_MS = 5 * 60_000;

type Resumo =
  | { tipo: "carregando" }
  | { tipo: "erro" }
  | { tipo: "exemplo"; total: number }
  | { tipo: "ok" | "parcial" | "atrasada" | "fora"; ok: number; total: number; atrasadas: number; fora: number };

/**
 * Resumo do painel para o cabeçalho. Considera só as fontes IMPLEMENTADAS
 * (stubs das próximas fases não contam como problema).
 */
export function resumirPainel(painel: Pick<PainelStatus, "modoExemplo" | "fontes">): Resumo {
  const implementadas = painel.fontes.filter((f) => f.definicao.implementada);
  if (painel.modoExemplo) return { tipo: "exemplo", total: implementadas.length };
  const conta = (estado: EstadoFonte) => implementadas.filter((f) => f.estado === estado).length;
  const ok = conta("ok");
  const atrasadas = conta("atrasada");
  const fora = conta("fora-do-ar");
  const tipo = fora > 0 ? "fora" : atrasadas > 0 ? "atrasada" : ok === implementadas.length ? "ok" : "parcial";
  return { tipo, ok, total: implementadas.length, atrasadas, fora };
}

interface Aparencia {
  marcador: EstadoFonte;
  cor: string;
  moldura: string;
  curto: string;
  longo: string;
}

function aparencia(r: Resumo): Aparencia {
  switch (r.tipo) {
    case "carregando":
      return {
        marcador: "desconhecida",
        cor: "text-mut",
        moldura: "border-linha/20 bg-linha/5",
        curto: "Fontes: verificando…",
        longo: "Verificando a saúde das fontes de dados.",
      };
    case "erro":
      return {
        marcador: "desconhecida",
        cor: "text-mut",
        moldura: "border-dashed border-linha/30 bg-linha/5",
        curto: "Fontes: sem leitura",
        longo: "Não foi possível verificar as fontes de dados agora.",
      };
    case "exemplo":
      return {
        marcador: "exemplo",
        cor: "text-info-txt",
        moldura: "border-info/40 bg-info/12",
        curto: "Dados de exemplo",
        longo: `Modo de demonstração: ${r.total} fontes exibem dados de exemplo.`,
      };
    case "fora":
      return {
        marcador: "fora-do-ar",
        cor: "text-perigo-txt",
        moldura: "border-perigo/40 bg-perigo/14",
        curto: `Fontes: ${r.fora} fora do ar`,
        longo: `${r.fora} de ${r.total} fontes fora do ar; ${r.ok} ok.`,
      };
    case "atrasada":
      return {
        marcador: "atrasada",
        cor: "text-alerta-txt",
        moldura: "border-alerta/40 bg-alerta/14",
        curto: `Fontes: ${r.ok}/${r.total} ok · ${r.atrasadas} ${r.atrasadas === 1 ? "atrasada" : "atrasadas"}`,
        longo: `${r.ok} de ${r.total} fontes ok; ${r.atrasadas} ${r.atrasadas === 1 ? "atrasada" : "atrasadas"}.`,
      };
    case "parcial":
      return {
        marcador: "desconhecida",
        cor: "text-mut",
        moldura: "border-linha/30 bg-linha/5",
        curto: `Fontes: ${r.ok}/${r.total} ok`,
        longo: `${r.ok} de ${r.total} fontes ok; as demais ainda sem leitura.`,
      };
    case "ok":
      return {
        marcador: "ok",
        cor: "text-ok-txt",
        moldura: "border-ok/40 bg-ok/12",
        curto: `Fontes: ${r.ok}/${r.total} ok`,
        longo: `Todas as ${r.total} fontes de dados estão ok.`,
      };
  }
}

/**
 * Pílula compacta de saúde das fontes no cabeçalho institucional.
 * Consulta /api/status ao montar e a cada 5 min enquanto a aba estiver
 * visível (e ao voltar para a aba, se a última consulta passou de 5 min).
 * Estado com três sinais: forma do marcador + cor + texto. Leva a /status.
 */
export function IndicadorFontes({ className }: { className?: string }) {
  const [resumo, setResumo] = useState<Resumo>({ tipo: "carregando" });

  useEffect(() => {
    let ativo = true;
    let controlador: AbortController | null = null;
    let ultimaConsulta = 0;

    async function consultar() {
      controlador?.abort();
      const atual = new AbortController();
      controlador = atual;
      ultimaConsulta = Date.now();
      try {
        const resposta = await fetch("/api/status", {
          cache: "no-store",
          headers: { accept: "application/json" },
          signal: atual.signal,
        });
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
        const painel = (await resposta.json()) as PainelStatus;
        if (ativo && !atual.signal.aborted) setResumo(resumirPainel(painel));
      } catch {
        if (ativo && !atual.signal.aborted) setResumo({ tipo: "erro" });
      }
    }

    function aoTique() {
      if (document.visibilityState === "visible") void consultar();
    }

    function aoMudarVisibilidade() {
      if (document.visibilityState === "visible" && Date.now() - ultimaConsulta >= INTERVALO_MS) void consultar();
    }

    function aoPedirAtualizacao() {
      void consultar();
    }

    void consultar();
    const temporizador = setInterval(aoTique, INTERVALO_MS);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    window.addEventListener(EVENTO_ATUALIZAR_FONTES, aoPedirAtualizacao);

    return () => {
      ativo = false;
      controlador?.abort();
      clearInterval(temporizador);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      window.removeEventListener(EVENTO_ATUALIZAR_FONTES, aoPedirAtualizacao);
    };
  }, []);

  const a = aparencia(resumo);

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className={cn("inline-flex", className)}>
      <Link
        href="/status"
        title="Ver o status das fontes de dados"
        data-estado={resumo.tipo}
        className={cn(
          "relative alvo-toque inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1",
          "text-[12.5px] font-bold text-ink-2 transition-[filter,border-color] hover:brightness-110",
          a.moldura,
        )}
      >
        <MarcadorEstado estado={a.marcador} tamanho={9} className={cn(a.cor, resumo.tipo === "carregando" && "motion-safe:animate-pulse")} />
        <span aria-hidden="true" className="tabular-nums">
          {a.curto}
        </span>
        <span className="sr-only">{`Saúde das fontes: ${a.longo} Abrir o status das fontes.`}</span>
      </Link>
    </div>
  );
}
