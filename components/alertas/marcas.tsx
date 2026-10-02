import { AlarmClock, CalendarClock, CalendarX2, Clock, FlaskConical, TriangleAlert } from "lucide-react";

import { AmostraNivel, SeloNivel } from "@/components/risco/selo-nivel";
import { Badge } from "@/components/ui/badge";
import type { Natureza, SituacaoAlerta } from "@/lib/alertas/codigos";
import type { NivelRisco } from "@/lib/dominio/matrizes";
import { cn } from "@/lib/utils";

import { rotuloNatureza, rotuloNivel, rotuloSituacao, tomSituacao, type PrazoRelativo } from "./apresentacao";

/**
 * Marcas da fila de alertas: nível, situação, prazo e validade. Sempre dois
 * sinais (padrão visual §4.1): cor + palavra, e no prazo também o ícone.
 */

/** Nível do alerta: amostra na cor da matriz (cor-dado) + a palavra. */
export function SeloNivelAlerta({ nivel, className }: { nivel: NivelRisco | null; className?: string }) {
  return <SeloNivel nivel={nivel} texto={rotuloNivel(nivel)} className={className} />;
}

/** Faixa grande do nível (cabeçalho do detalhe): bloco na cor + palavra na tinta da própria cor. */
export function FaixaNivel({ nivel, complemento }: { nivel: NivelRisco | null; complemento?: string | null }) {
  return (
    <div className="flex items-center gap-2.5">
      <AmostraNivel nivel={nivel} className="size-9 rounded-[9px]" />
      <div className="min-w-0 leading-tight">
        <p className="text-[10.5px] font-bold uppercase tracking-[.09em] text-mut">Nível</p>
        <p className="text-[15px] font-extrabold uppercase tracking-[.04em] text-ink-forte">
          {rotuloNivel(nivel)}
          {complemento ? <span className="ml-1.5 text-[12px] font-semibold normal-case tracking-normal text-ink-2">{complemento}</span> : null}
        </p>
      </div>
    </div>
  );
}

/** Situação gravada do fluxo: pílula com palavra e forma por tom. */
export function SeloSituacao({ situacao, className }: { situacao: SituacaoAlerta; className?: string }) {
  return (
    <Badge variant={tomSituacao(situacao)} marcador className={className}>
      {rotuloSituacao(situacao)}
    </Badge>
  );
}

/** Exercício/teste: fora do mapa e dos indicadores. Real não leva marca. */
export function MarcaNatureza({ natureza }: { natureza: Natureza }) {
  const rotulo = rotuloNatureza(natureza);
  if (!rotulo) return null;
  return (
    <Badge variant="info">
      <FlaskConical aria-hidden="true" />
      {rotulo}
    </Badge>
  );
}

/**
 * Prazo da ação RRD: "vencido há 35 min" em vermelho COM ícone de alerta (e o
 * prefixo "Vencido" para leitor de tela), "vence em 40 min" em laranja com
 * despertador, "vence em 5 h" neutro com relógio.
 */
export function MarcaPrazo({ prazo, compacto = false, className }: { prazo: PrazoRelativo; compacto?: boolean; className?: string }) {
  const Icone = prazo.estado === "vencido" ? TriangleAlert : prazo.estado === "proximo" ? AlarmClock : Clock;
  const tom =
    prazo.estado === "vencido"
      ? "font-bold text-perigo-txt"
      : prazo.estado === "proximo"
        ? "font-semibold text-alerta-txt"
        : prazo.estado === "nao-se-aplica" || prazo.estado === "sem-prazo"
          ? "text-mut"
          : "text-ink-2";
  return (
    <span className={cn("inline-flex min-w-0 items-start gap-1.5 tabular-nums", tom, className)}>
      {prazo.estado === "nao-se-aplica" && prazo.texto === "—" ? null : <Icone aria-hidden="true" className="mt-px size-3.5 shrink-0" />}
      <span className="min-w-0">
        <span className="block">{prazo.texto}</span>
        {!compacto && prazo.quando && prazo.estado !== "nao-se-aplica" ? (
          <span className="block text-[11px] font-normal text-mut">{prazo.quando}</span>
        ) : null}
      </span>
    </span>
  );
}

/** Validade: "até 15:00"; expirada, ícone de calendário cortado + "expirou às…". */
export function MarcaValidade({ texto, expirada, className }: { texto: string; expirada: boolean; className?: string }) {
  const Icone = expirada ? CalendarX2 : CalendarClock;
  return (
    <span className={cn("inline-flex items-center gap-1.5 tabular-nums", expirada ? "text-alerta-txt" : "text-ink-2", className)}>
      {texto === "—" ? null : <Icone aria-hidden="true" className="size-3.5 shrink-0" />}
      <span>
        {expirada ? <span className="sr-only">Vigência </span> : null}
        {texto}
      </span>
    </span>
  );
}
