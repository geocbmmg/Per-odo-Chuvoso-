import { useId } from "react";

import type { PainelStatus } from "@/lib/dados/status";
import type { EstadoFonte } from "@/lib/fontes/tipos";
import { cn } from "@/lib/utils";

import { formatarInteiro } from "./formatos";
import { COR_ESTADO, MarcadorEstado, ROTULO_ESTADO } from "./pilula-estado";

/** Ordem dos indicadores no resumo: do saudável ao neutro. */
const ORDEM_RESUMO: readonly EstadoFonte[] = ["ok", "atrasada", "fora-do-ar", "desconhecida", "exemplo", "nao-implementada"];

/** Faixa lateral de 3px do .dash-kpi na cor do estado. */
const FAIXA_ESTADO: Record<EstadoFonte, string> = {
  ok: "before:bg-ok",
  atrasada: "before:bg-alerta",
  "fora-do-ar": "before:bg-perigo",
  "nao-implementada": "before:bg-linha/30",
  exemplo: "before:bg-info",
  desconhecida: "before:bg-linha/30",
};

function frase(painel: PainelStatus): string {
  const implementadas = painel.fontes.filter((f) => f.definicao.implementada);
  if (painel.modoExemplo) {
    return `Modo de demonstração: ${implementadas.length} fontes implementadas exibem dados de exemplo.`;
  }
  const ok = implementadas.filter((f) => f.estado === "ok").length;
  const fora = implementadas.filter((f) => f.estado === "fora-do-ar").length;
  const atrasadas = implementadas.filter((f) => f.estado === "atrasada").length;
  const partes = [`${ok} de ${implementadas.length} fontes em operação estão OK`];
  if (fora > 0) partes.push(`${fora} fora do ar`);
  if (atrasadas > 0) partes.push(`${atrasadas} ${atrasadas === 1 ? "atrasada" : "atrasadas"}`);
  return `${partes.join(" · ")}.`;
}

/** Resumo no topo de /status: frase-síntese + um indicador (.dash-kpi) por estado. */
export function ResumoStatus({ painel }: { painel: PainelStatus }) {
  const idTitulo = useId();
  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-3">
      <div>
        <h2 id={idTitulo} className="text-[16px] font-bold uppercase leading-tight tracking-[.03em] text-ink">
          Resumo
        </h2>
        <p className="mt-1 text-[13.5px] text-ink-2 tabular-nums">{frase(painel)}</p>
      </div>
      <ul className="grid grid-cols-2 gap-[11px] sm:grid-cols-3 xl:grid-cols-6">
        {ORDEM_RESUMO.map((estado) => {
          const n = painel.resumo[estado] ?? 0;
          return (
            <li
              key={estado}
              data-estado={estado}
              className={cn(
                "relative overflow-hidden rounded-[14px] border border-border bg-superficie py-3 pl-4 pr-3",
                "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-['']",
                FAIXA_ESTADO[estado],
              )}
            >
              <p className="flex min-h-6 items-center gap-1.5 text-[10.5px] font-bold uppercase leading-tight tracking-[.06em] text-mut">
                <MarcadorEstado estado={estado} className={COR_ESTADO[estado]} />
                {ROTULO_ESTADO[estado]}
              </p>
              <p
                className={cn(
                  "numero mt-1.5 text-[1.85rem] font-extrabold leading-none",
                  n > 0 ? "text-ink" : "text-mut",
                )}
              >
                {formatarInteiro(n)}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
