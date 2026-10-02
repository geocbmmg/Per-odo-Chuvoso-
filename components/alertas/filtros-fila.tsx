"use client";

import { AlarmClockOff, Check, ChevronDown, FilterX, Hourglass, ListFilter, Send, ShieldCheck, type LucideIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { AmostraNivel } from "@/components/risco/selo-nivel";
import { Button } from "@/components/ui/button";
import { TIPOS_RISCO_SALA, type TipoRiscoSala } from "@/lib/alertas/codigos";
import { CORES_NIVEL, NIVEIS_RISCO, type NivelRisco } from "@/lib/dominio/matrizes";
import { cn } from "@/lib/utils";

import { alternar, filtrosAtivos, type ContadoresFila, type FiltrosFila } from "./apresentacao";

// ── Contadores do topo ──────────────────────────────────────────────────────

type Tom = "alerta" | "perigo" | "info" | "ok";

const FAIXA: Record<Tom, string> = {
  alerta: "before:bg-alerta",
  perigo: "before:bg-perigo",
  info: "before:bg-info",
  ok: "before:bg-ok",
};

const TINTA_ICONE: Record<Tom, string> = {
  alerta: "text-alerta-txt",
  perigo: "text-perigo-txt",
  info: "text-info-txt",
  ok: "text-ok-txt",
};

function Contador({ rotulo, valor, icone: Icone, tom, regra }: { rotulo: string; valor: number; icone: LucideIcon; tom: Tom; regra: string }) {
  return (
    <li
      title={regra}
      className={cn(
        "relative flex min-w-0 flex-col gap-1 overflow-hidden rounded-[14px] border border-border bg-superficie px-3 py-2.5 pl-3.5",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-['']",
        FAIXA[tom],
      )}
    >
      <span className="flex items-center justify-between gap-1.5">
        <span className="min-w-0 text-[10px] font-bold uppercase leading-tight tracking-[.05em] text-mut">{rotulo}</span>
        <Icone aria-hidden="true" className={cn("size-3.5 shrink-0", TINTA_ICONE[tom])} />
      </span>
      <span className="numero text-[1.5rem] font-extrabold leading-none text-ink">{valor}</span>
      <span className="sr-only">{regra}</span>
    </li>
  );
}

/** Pendentes, vencidos, emitidos hoje e (para quem encerra) a encerrar — sobre a fila inteira do escopo. */
export function ContadoresTopo({ contadores, mostrarAEncerrar }: { contadores: ContadoresFila; mostrarAEncerrar: boolean }) {
  return (
    <ul aria-label="Resumo da fila" className={cn("grid grid-cols-3 gap-2 sm:gap-2.5", mostrarAEncerrar && "grid-cols-2 min-[420px]:grid-cols-4")}>
      <Contador
        rotulo="Pendentes"
        valor={contadores.pendentes}
        icone={Hourglass}
        tom="alerta"
        regra="Emitidos, cientes ou em ação: aguardam a unidade."
      />
      <Contador
        rotulo="Vencidos"
        valor={contadores.vencidos}
        icone={AlarmClockOff}
        tom="perigo"
        regra="Pendentes com o prazo da ação RRD já passado."
      />
      <Contador
        rotulo="Emitidos hoje"
        valor={contadores.emitidosHoje}
        icone={Send}
        tom="info"
        regra="Alertas emitidos hoje (horário de Brasília), em qualquer situação."
      />
      {mostrarAEncerrar ? (
        <Contador
          rotulo="A encerrar"
          valor={contadores.aEncerrar}
          icone={ShieldCheck}
          tom="ok"
          regra="Ação RRD registrada: aguardam a Sala encerrar."
        />
      ) : null}
    </ul>
  );
}

// ── Filtros (chips) ─────────────────────────────────────────────────────────

const CHIP = cn(
  "relative alvo-toque inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] leading-none",
  "transition-[background-color,border-color,color] pointer-coarse:min-h-10",
  "aria-pressed:border-acc/42 aria-pressed:bg-acc/16 aria-pressed:font-bold aria-pressed:text-acc-txt",
  "border-linha/16 bg-linha/4 font-semibold text-ink-2 hover:bg-linha/8 hover:text-ink-forte",
);

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={ativo} onClick={onClick} className={CHIP}>
      {ativo ? <Check aria-hidden="true" className="size-3.5" /> : null}
      {children}
    </button>
  );
}

function GrupoChips({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span id={id} className="mr-1 w-full text-[10.5px] font-bold uppercase tracking-[.14em] text-faint sm:w-auto">
        {rotulo}
      </span>
      {children}
    </div>
  );
}

/**
 * Filtros por COB, tipo de risco e nível: botões alternáveis (aria-pressed),
 * com marca de "selecionado" além da cor. Dentro do grupo, "ou"; entre grupos, "e".
 */
export function FiltrosFilaAlertas({
  filtros,
  cobs,
  onMudar,
}: {
  filtros: FiltrosFila;
  /** COBs do escopo da sessão (todos, para quem vê o Estado). */
  cobs: readonly string[];
  onMudar: (filtros: FiltrosFila) => void;
}) {
  const ativos = filtrosAtivos(filtros);
  const [aberto, setAberto] = useState(false);
  const idGrupos = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {/* No celular os filtros recolhem atrás de um botão (a fila aparece antes); no desktop ficam sempre à vista. */}
      <Button
        variant="secondary"
        className="w-fit md:hidden"
        aria-expanded={aberto}
        aria-controls={idGrupos}
        onClick={() => setAberto((v) => !v)}
      >
        <ListFilter aria-hidden="true" />
        Filtros{ativos ? ` (${ativos})` : ""}
        <ChevronDown aria-hidden="true" className={cn("transition-transform", aberto && "rotate-180")} />
      </Button>
      <div id={idGrupos} className={cn("flex min-w-0 flex-col gap-2.5", !aberto && "max-md:hidden")}>
        {cobs.length > 1 ? (
          <GrupoChips rotulo="COB">
            {cobs.map((cob) => (
              <Chip key={cob} ativo={filtros.cobs.includes(cob)} onClick={() => onMudar({ ...filtros, cobs: alternar(filtros.cobs, cob) })}>
                {cob}
              </Chip>
            ))}
          </GrupoChips>
        ) : null}
        <GrupoChips rotulo="Tipo">
          {TIPOS_RISCO_SALA.map((t) => (
            <Chip
              key={t.codigo}
              ativo={filtros.tipos.includes(t.codigo)}
              onClick={() => onMudar({ ...filtros, tipos: alternar<TipoRiscoSala>(filtros.tipos, t.codigo) })}
            >
              {t.rotulo}
            </Chip>
          ))}
        </GrupoChips>
        <GrupoChips rotulo="Nível">
          {NIVEIS_RISCO.map((n) => (
            <Chip
              key={n}
              ativo={filtros.niveis.includes(n)}
              onClick={() => onMudar({ ...filtros, niveis: alternar<NivelRisco | "sem">(filtros.niveis, n) })}
            >
              <AmostraNivel nivel={n} className="size-2.5 rounded-[2px]" />
              {CORES_NIVEL[n].nome}
            </Chip>
          ))}
          {ativos > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => onMudar({ cobs: [], tipos: [], niveis: [] })} className="ml-1">
              <FilterX aria-hidden="true" />
              Limpar filtros ({ativos})
            </Button>
          ) : null}
        </GrupoChips>
      </div>
    </div>
  );
}
