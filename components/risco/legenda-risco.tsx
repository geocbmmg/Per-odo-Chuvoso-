import { CarimboAtualizacao } from "@/components/layout/carimbo-atualizacao";
import type { LegendaRisco, MetaPintura } from "@/lib/mapa/risco";
import { cn } from "@/lib/utils";

import { AmostraNivel } from "./selo-nivel";

/**
 * Legenda do mapa de risco: um item por nível (amostra de cor + nome da cor +
 * nome do nível na matriz da camada + critério resumido, gerado das matrizes),
 * o que "sem cor" significa nesta camada, o crédito da fonte e o carimbo
 * "Atualizado às HH:MM".
 */
export function LegendaMapaRisco({
  legenda,
  cobertura,
  nota,
  credito,
  meta,
  fonte,
  className,
}: {
  legenda: LegendaRisco;
  cobertura: string;
  nota: string | null;
  credito: string;
  meta: MetaPintura | null;
  /** Nome da fonte para o carimbo (leitores de tela e dica). */
  fonte: string;
  className?: string;
}) {
  return (
    <section aria-label={`Legenda: ${legenda.titulo}`} className={cn("flex min-w-0 flex-col gap-3", className)}>
      <h3 className="text-[11px] font-bold uppercase tracking-[.18em] text-faint">Legenda · {legenda.titulo}</h3>
      <ul
        role="list"
        className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6"
      >
        {legenda.itens.map((item) => (
          <li key={item.nivel} className="flex min-w-0 items-start gap-2">
            <AmostraNivel nivel={item.nivel} className="mt-[2px] size-[15px]" />
            <span className="min-w-0 text-[12.5px] leading-snug">
              <span className="font-bold text-ink">{item.nomeCor}</span>
              {item.nome ? <span className="text-ink-2"> · {item.nome}</span> : null}
              {item.criterio ? (
                <span className="block text-[11.5px] text-mut tabular-nums">{item.criterio}</span>
              ) : null}
            </span>
          </li>
        ))}
        <li className="flex min-w-0 items-start gap-2">
          <AmostraNivel nivel={null} className="mt-[2px] size-[15px]" />
          <span className="min-w-0 text-[12.5px] leading-snug">
            <span className="font-bold text-ink">Sem cor</span>
            <span className="text-ink-2"> · {legenda.semDado}</span>
          </span>
        </li>
      </ul>

      <div className="flex min-w-0 flex-col gap-1.5 text-[12px] leading-snug text-ink-2">
        <p className="break-words">{cobertura}</p>
        {nota ? <p className="break-words">{nota}</p> : null}
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-2.5">
        <p className="min-w-0 break-words text-[11.5px] text-mut">
          <span className="font-semibold text-ink-2">Fonte:</span> {credito || "—"} · Malha municipal: IBGE · Limites:
          CBMMG
        </p>
        {meta ? (
          <CarimboAtualizacao atualizadoEm={meta.atualizadoEm} origem={meta.origem} erro={meta.erro} fonte={fonte} />
        ) : null}
      </div>
    </section>
  );
}
