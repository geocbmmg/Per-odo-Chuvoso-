import type { ReactNode } from "react";
import { connection } from "next/server";
import { CloudRain } from "lucide-react";

import { dentroDoPeriodo, periodoChuvoso } from "@/lib/dominio/periodo";
import { FUSO_PADRAO } from "@/lib/datas";
import { cn } from "@/lib/utils";

import { GavetaNavegacao } from "./gaveta-navegacao";

/** "quinta-feira, 2 de outubro" no horário de Brasília (a caixa alta é feita por CSS). */
const formatoDataExtenso = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_PADRAO,
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** "2026-10-02" no horário de Brasília, para o atributo dateTime. */
const formatoDataIso = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_PADRAO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Cabeçalho institucional da área de conteúdo — faixa .gr-hero compacta do portal
 * GeoRescue (visual-shell.md §1.1) com a linha de identificação do .painel-topbar.
 *
 * Esquerda: (celular) ☰ + nome curto; eyebrow com a data por extenso; identificação.
 * Direita: pílula do período chuvoso vigente + espaço `extra` (ex.: saúde das fontes).
 *
 * A data é calculada no servidor a cada requisição (`connection()`), nunca no build,
 * e chega pronta no HTML — não há relógio no cliente, então não há mismatch.
 * Se o projeto ligar cacheComponents, envolva este componente em <Suspense>.
 */
export async function CabecalhoInstitucional({
  extra,
  children,
  className,
}: {
  /** Conteúdo à direita, depois da pílula do período (ex.: indicador de saúde das fontes). */
  extra?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  await connection();
  const agora = new Date();
  const periodo = periodoChuvoso("atual", agora);
  const vigente = dentroDoPeriodo(agora.toISOString(), periodo);
  const anos = periodo.rotulo.match(/\d{4}\/\d{4}/)?.[0] ?? periodo.rotulo;

  return (
    <header
      className={cn(
        "border-b border-linha/9 bg-(image:--veu-forte) px-5 py-3 backdrop-blur-[3px] max-md:px-3 max-md:py-2.5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
          <GavetaNavegacao />
          <div className="min-w-0">
            <p className="text-[15px] font-bold leading-tight text-ink-forte md:hidden">Sala de Situação</p>
            <p className="gr-eyebrow mt-0.5 text-[10.5px] md:mt-0 md:text-[11px]">
              <time dateTime={formatoDataIso.format(agora)}>{formatoDataExtenso.format(agora)}</time>
            </p>
            <p className="mt-1 hidden truncate text-[14px] font-semibold leading-tight text-ink md:block">
              CBMMG · Sala de Situação — Período Chuvoso
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border bg-linha/5 px-3 py-1 text-[12.5px] font-bold text-ink-2",
              vigente ? "border-acc/40" : "border-dashed border-linha/30",
            )}
          >
            <CloudRain aria-hidden="true" className={cn("size-4", vigente ? "text-acc-txt" : "text-mut")} />
            {vigente ? (
              <>
                Período chuvoso <b className="font-bold text-acc-forte tabular-nums">{anos}</b>
              </>
            ) : (
              <>
                Fora do período chuvoso · próximo <b className="font-bold text-ink tabular-nums">{anos}</b>
              </>
            )}
          </span>
          {extra}
          {children}
        </div>
      </div>
    </header>
  );
}
