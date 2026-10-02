"use client";

import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";

import type { SeveridadeInmet } from "@/lib/dominio/tipos";
import { cn } from "@/lib/utils";

import { CartaoAviso } from "./cartao-aviso";
import { AmostraSeveridade } from "./marca-severidade";
import { ESTILO_SEVERIDADE, ORDEM_SEVERIDADES } from "./severidade";
import type { AvisoVisao } from "./tipos";

type Filtro = "todos" | SeveridadeInmet;

/** Pílula de filtro .mon-filtro do GeoRescue (visual-tokens.md §6.6): ativa CHEIA no acento + ✓. */
function ChipFiltro({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        "relative alvo-toque inline-flex items-center gap-1.5 rounded-[20px] border px-[11px] py-[5px] text-[11.5px] leading-tight transition-colors",
        ativo
          ? "border-acc-txt bg-acc-txt font-bold text-acc-ink"
          : "border-linha/14 bg-linha/4 font-semibold text-ink-2 hover:border-acc/34 hover:bg-acc/8 hover:text-ink-forte",
      )}
    >
      {ativo ? <Check aria-hidden="true" className="size-3.5" strokeWidth={2.6} /> : null}
      {children}
    </button>
  );
}

/**
 * Lista de avisos do INMET (já ordenados por severidade no servidor) com
 * filtro opcional por nível. O filtro só aparece quando há mais de um nível.
 */
export function ListaAvisos({ avisos }: { avisos: AvisoVisao[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const contagem = new Map<SeveridadeInmet, number>();
  for (const a of avisos) contagem.set(a.severidade, (contagem.get(a.severidade) ?? 0) + 1);
  const niveis = ORDEM_SEVERIDADES.filter((s) => (contagem.get(s) ?? 0) > 0);

  const filtroValido: Filtro = filtro !== "todos" && !contagem.has(filtro) ? "todos" : filtro;
  const visiveis = filtroValido === "todos" ? avisos : avisos.filter((a) => a.severidade === filtroValido);

  return (
    <div className="flex flex-col gap-3">
      {niveis.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar avisos por severidade">
          <ChipFiltro ativo={filtroValido === "todos"} onClick={() => setFiltro("todos")}>
            Todos <span className="tabular-nums">({avisos.length})</span>
          </ChipFiltro>
          {niveis.map((s) => (
            <ChipFiltro key={s} ativo={filtroValido === s} onClick={() => setFiltro(s)}>
              <AmostraSeveridade severidade={s} />
              {ESTILO_SEVERIDADE[s].rotulo} <span className="tabular-nums">({contagem.get(s)})</span>
            </ChipFiltro>
          ))}
        </div>
      ) : null}

      <p aria-live="polite" className="text-[12px] text-mut tabular-nums">
        {filtroValido === "todos"
          ? avisos.length === 1
            ? "1 aviso vigente ou programado para MG."
            : `${avisos.length} avisos vigentes ou programados para MG, do mais grave ao menos grave.`
          : `Mostrando ${visiveis.length} de ${avisos.length} avisos (${ESTILO_SEVERIDADE[filtroValido].rotulo.toLowerCase()}).`}
      </p>

      <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {visiveis.map((aviso, i) => (
          <li key={`${aviso.id}-${i}`} className="min-w-0">
            <CartaoAviso aviso={aviso} />
          </li>
        ))}
      </ul>
    </div>
  );
}
