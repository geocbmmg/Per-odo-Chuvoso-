import Link from "next/link";

import { periodoChuvoso, PERIODOS, type PeriodoId } from "@/lib/dominio/periodo";
import { cn } from "@/lib/utils";

export interface OpcaoPeriodo {
  id: PeriodoId;
  /** "Temporada atual (2026/27)", "Temporada anterior (2025/26)", "Todo o histórico". */
  rotulo: string;
  /** Duas linhas curtas para o celular ("Atual" / "2026/27"). */
  curto: [string, string];
}

/** "Período chuvoso 2026/2027" → "2026/27". */
function anosCurtos(rotulo: string): string | null {
  const m = rotulo.match(/(\d{4})\/(\d{2})(\d{2})/);
  return m ? `${m[1]}/${m[3]}` : null;
}

/** Rótulos do seletor, gerados por periodoChuvoso (a temporada muda sozinha em outubro). */
export function opcoesPeriodo(agora: Date = new Date()): OpcaoPeriodo[] {
  return PERIODOS.map((id) => {
    if (id === "tudo") return { id, rotulo: "Todo o histórico", curto: ["Todo o", "histórico"] };
    const anos = anosCurtos(periodoChuvoso(id, agora).rotulo) ?? "";
    const nome = id === "atual" ? "atual" : "anterior";
    return {
      id,
      rotulo: `Temporada ${nome} (${anos})`,
      curto: [id === "atual" ? "Atual" : "Anterior", anos],
    };
  });
}

/**
 * Seletor de período — segmented control no estilo .tut-vistas / .gr-abas do
 * GeoRescue, feito de links (?periodo=atual|anterior|tudo) para funcionar sem
 * JavaScript e manter o período na URL (compartilhável). O ativo tem três
 * sinais: fundo e moldura de acento, peso maior e aria-current.
 * No celular vira uma grade de 3 células de duas linhas (alvos ≥ 44px).
 */
export function SeletorPeriodo({
  atual,
  rota = "/",
  agora,
  className,
}: {
  /** Período selecionado. */
  atual: PeriodoId;
  /** Rota da página (os links só trocam ?periodo=). */
  rota?: string;
  agora?: Date;
  className?: string;
}) {
  const opcoes = opcoesPeriodo(agora);
  return (
    <nav aria-label="Período dos dados" className={cn("min-w-0", className)}>
      <ul
        className={cn(
          "grid grid-cols-3 gap-1 rounded-[12px] border border-linha/16 bg-linha/6 p-1",
          "sm:inline-flex sm:flex-wrap sm:rounded-full",
        )}
      >
        {opcoes.map((opcao) => {
          const ativo = opcao.id === atual;
          return (
            <li key={opcao.id} className="min-w-0">
              <Link
                href={{ pathname: rota, query: { periodo: opcao.id } }}
                scroll={false}
                aria-current={ativo ? "page" : undefined}
                title={opcao.rotulo}
                className={cn(
                  "relative alvo-toque flex h-full min-h-11 items-center justify-center rounded-[9px] border px-2 py-1.5 text-center",
                  "text-[13px] leading-tight transition-[background-color,border-color,color]",
                  "sm:min-h-0 sm:rounded-full sm:px-[15px] sm:py-1.5",
                  ativo
                    ? "border-acc/42 bg-acc/16 font-bold text-acc-txt"
                    : "border-transparent font-semibold text-ink-2 hover:bg-linha/8 hover:text-ink-forte",
                )}
              >
                <span className="flex flex-col items-center sm:hidden">
                  <span>{opcao.curto[0]}</span>
                  <span className="text-[11.5px] font-semibold tabular-nums opacity-90">{opcao.curto[1]}</span>
                </span>
                <span className="whitespace-nowrap tabular-nums max-sm:hidden">{opcao.rotulo}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
