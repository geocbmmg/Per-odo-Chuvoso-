import Link from "next/link";
import { ArrowRight, CircleCheck, Clock, ExternalLink, MapPin } from "lucide-react";

import { CarimboAtualizacao } from "@/components/layout/carimbo-atualizacao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cardVariants } from "@/components/ui/card";
import { formatarNumero } from "@/components/graficos/medidas";
import type { SeveridadeInmet } from "@/lib/dominio/tipos";
import { CATALOGO_FONTES } from "@/lib/fontes/catalogo";
import type { Leitura } from "@/lib/fontes/tipos";
import type { AvisoInmetVigente } from "@/lib/sources/inmet";
import { MESORREGIOES_MG, mesorregioesMg } from "@/lib/sources/inmet/parser";
import { cn } from "@/lib/utils";

import { formatarDiaMesHora } from "./formatos";

/**
 * Cores oficiais dos avisos do INMET (cor é dado: igual nos dois temas).
 * Nunca aparecem sozinhas: sempre com o nome da severidade ao lado.
 * O amarelo leva contorno escuro para continuar visível no tema claro.
 */
export const SEVERIDADES_INMET: readonly {
  id: Exclude<SeveridadeInmet, "desconhecida">;
  rotulo: string;
  cor: string;
}[] = [
  { id: "grande-perigo", rotulo: "Grande Perigo", cor: "#F80703" },
  { id: "perigo", rotulo: "Perigo", cor: "#F96602" },
  { id: "perigo-potencial", rotulo: "Perigo Potencial", cor: "#FFFE00" },
];

const POR_ID = new Map(SEVERIDADES_INMET.map((s) => [s.id, s]));

function AmostraSeveridade({ severidade, className }: { severidade: SeveridadeInmet; className?: string }) {
  const cor = severidade === "desconhecida" ? "#9AA0AC" : POR_ID.get(severidade)?.cor;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-3 shrink-0 rounded-[3px] ring-1 ring-black/35 ring-inset", className)}
      style={{ backgroundColor: cor }}
    />
  );
}

function rotuloSeveridade(aviso: Pick<AvisoInmetVigente, "severidade" | "severidadeRotulo">): string {
  return POR_ID.get(aviso.severidade as Exclude<SeveridadeInmet, "desconhecida">)?.rotulo ?? aviso.severidadeRotulo;
}

/** "até 03/10 18:00" (vigente) ou "a partir de 03/10 06:00 · até 04/10 10:00" (futuro). */
export function descreverVigencia(aviso: Pick<AvisoInmetVigente, "vigencia" | "inicio" | "fim">): string {
  const inicio = formatarDiaMesHora(aviso.inicio);
  const fim = formatarDiaMesHora(aviso.fim);
  if (aviso.vigencia === "futuro") {
    if (inicio && fim) return `a partir de ${inicio} · até ${fim}`;
    if (inicio) return `a partir de ${inicio}`;
    return "previsto, início não informado";
  }
  return fim ? `até ${fim}` : "vigente, sem fim informado";
}

function descreverAreas(areas: string[]): string {
  const mg = mesorregioesMg(areas);
  if (mg.length === MESORREGIOES_MG.length) return "Todas as 12 mesorregiões de MG";
  return mg.join(", ");
}

function linkSeguro(link: string | null): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Resumo dos avisos do INMET para MG (vigentes e futuros): contagem por
 * severidade, os 3 mais graves e o link para o Monitoramento. Estado vazio
 * explícito quando não há aviso.
 */
export function ResumoAvisosInmet({
  leitura,
  className,
}: {
  leitura: Leitura<AvisoInmetVigente[]>;
  className?: string;
}) {
  const avisos = leitura.dados;
  const contagem = new Map<SeveridadeInmet, number>();
  for (const aviso of avisos) contagem.set(aviso.severidade, (contagem.get(aviso.severidade) ?? 0) + 1);
  const semClassificacao = contagem.get("desconhecida") ?? 0;
  const maisGraves = avisos.slice(0, 3);
  const restantes = avisos.length - maisGraves.length;

  return (
    <section
      aria-labelledby="avisos-inmet-titulo"
      className={cn(cardVariants({ variant: "padrao" }), "min-w-0 gap-3", className)}
    >
      <header className="flex flex-col gap-1">
        <h2
          id="avisos-inmet-titulo"
          className="text-[15px] font-bold uppercase leading-tight tracking-[.03em] text-ink"
        >
          Avisos INMET para MG
        </h2>
        <p className="text-[12.5px] leading-snug text-mut">Avisos meteorológicos vigentes e previstos.</p>
        <CarimboAtualizacao
          className="mt-0.5"
          atualizadoEm={leitura.atualizadoEm}
          origem={leitura.origem}
          erro={leitura.erro}
          fonte={CATALOGO_FONTES["inmet-avisos"].nome}
        />
      </header>

      <ul aria-label="Avisos por severidade" className="grid grid-cols-3 gap-2">
        {SEVERIDADES_INMET.map((s) => {
          const n = contagem.get(s.id) ?? 0;
          return (
            <li
              key={s.id}
              className="flex min-w-0 flex-col gap-1.5 rounded-[10px] border border-linha/12 bg-linha/4 px-2.5 py-2"
            >
              <span className="flex items-start gap-1.5 text-[10.5px] font-bold uppercase leading-tight tracking-[.04em] text-ink-2">
                <AmostraSeveridade severidade={s.id} className="mt-px" />
                <span className="min-w-0">{s.rotulo}</span>
              </span>
              <span className={cn("numero text-[22px] font-extrabold leading-none", n > 0 ? "text-ink" : "text-mut")}>
                {formatarNumero(n)}
              </span>
            </li>
          );
        })}
      </ul>
      {semClassificacao > 0 ? (
        <p className="text-[12px] text-mut">
          + {formatarNumero(semClassificacao)} {semClassificacao === 1 ? "aviso" : "avisos"} sem severidade informada
        </p>
      ) : null}

      {avisos.length === 0 ? (
        <div className="flex items-start gap-2.5 rounded-[10px] border border-ok/30 bg-ok/8 px-3 py-3">
          <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ok-txt" />
          <p className="text-[13px] font-semibold leading-snug text-ink">
            Nenhum aviso vigente do INMET para Minas Gerais
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-[.18em] text-mut">
            {maisGraves.length === 1 ? "Aviso mais grave" : `Os ${maisGraves.length} mais graves`}
          </h3>
          <ol className="flex flex-col gap-2">
            {maisGraves.map((aviso) => {
              const href = linkSeguro(aviso.link);
              const areas = descreverAreas(aviso.areas);
              return (
                <li
                  key={aviso.id}
                  className="flex min-w-0 flex-col gap-1.5 rounded-[10px] border border-linha/12 bg-sup-1/60 px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[.05em] text-ink-2">
                      <AmostraSeveridade severidade={aviso.severidade} />
                      {rotuloSeveridade(aviso)}
                    </span>
                    {aviso.vigencia === "futuro" ? (
                      <Badge variant="info" marcador>
                        Previsto
                      </Badge>
                    ) : (
                      <Badge variant="acento" marcador>
                        Vigente
                      </Badge>
                    )}
                  </div>
                  <p className="text-[14px] font-bold leading-snug text-ink-forte">{aviso.evento}</p>
                  <p className="flex items-start gap-1.5 text-[12.5px] leading-snug text-ink-2">
                    <Clock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-mut" />
                    <span className="tabular-nums">{descreverVigencia(aviso)}</span>
                  </p>
                  {areas ? (
                    <p className="flex items-start gap-1.5 text-[12px] leading-snug text-mut">
                      <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                      <span className="min-w-0 break-words">{areas}</span>
                    </p>
                  ) : null}
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative alvo-toque inline-flex w-fit items-center gap-1 text-[12px] font-semibold text-acc-txt underline-offset-4 hover:underline"
                    >
                      Abrir no INMET
                      <ExternalLink aria-hidden="true" className="size-3.5" />
                      <span className="sr-only">(abre em nova aba)</span>
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {restantes > 0 ? (
            <p className="text-[12px] text-mut">
              + {formatarNumero(restantes)} {restantes === 1 ? "outro aviso" : "outros avisos"} no Monitoramento
            </p>
          ) : null}
        </div>
      )}

      <div className="mt-auto border-t border-border pt-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/monitoramento">
            Ver monitoramento
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
