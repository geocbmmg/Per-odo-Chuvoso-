"use client";

import { ChevronDown, MapPin } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import type { LinhaListaRisco } from "@/lib/mapa/risco";
import { cn } from "@/lib/utils";

import { SeloNivel } from "./selo-nivel";

const LIMITE_INICIAL = 12;

/**
 * Lista de municípios ao lado do mapa (alternativa textual): "Municípios com
 * mais chuva prevista" (ranking da API) ou "Municípios em risco" (do mais
 * grave ao menos grave). Cada linha é um botão que centraliza o mapa no
 * município e abre o balão dele.
 */
export function ListaMunicipiosRisco({
  linhas,
  numerada,
  vazio,
  onVerNoMapa,
  rodape,
}: {
  linhas: readonly LinhaListaRisco[];
  /** Mostra a posição (ranking). */
  numerada: boolean;
  /** Texto quando não há nenhum município. */
  vazio: string;
  onVerNoMapa: ((ibge: string, origem: HTMLElement) => void) | null;
  rodape?: ReactNode;
}) {
  const [todos, setTodos] = useState(false);
  const idLista = useId();
  const visiveis = todos ? linhas : linhas.slice(0, LIMITE_INICIAL);
  const restantes = linhas.length - visiveis.length;

  if (linhas.length === 0) {
    return (
      <p className="rounded-[10px] border border-dashed border-linha/20 px-3 py-5 text-center text-[13px] text-mut">
        {vazio}
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ol
        id={idLista}
        role="list"
        className="flex min-w-0 flex-col divide-y divide-linha/8 rounded-[12px] border border-border"
      >
        {visiveis.map((linha, i) => {
          const conteudo = (
            <>
              {numerada ? (
                <span
                  className="w-6 shrink-0 text-right text-[12px] font-bold text-faint tabular-nums"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
              ) : null}
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <span className="min-w-0 truncate text-[13.5px] font-bold text-ink">{linha.nome}</span>
                  <span className="shrink-0 text-[13px] font-bold text-ink tabular-nums">
                    {numerada ? linha.destaque : null}
                  </span>
                </span>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <SeloNivel nivel={linha.nivel} texto={linha.rotuloNivel} />
                  <span className="min-w-0 truncate text-[11.5px] text-mut">
                    {linha.cob} · {linha.ueop}
                  </span>
                </span>
                {!numerada ? (
                  <span className="min-w-0 break-words text-[12px] text-ink-2">{linha.destaque}</span>
                ) : null}
                {linha.detalhe ? (
                  <span className="min-w-0 break-words text-[11.5px] text-mut">{linha.detalhe}</span>
                ) : null}
              </span>
              {onVerNoMapa ? <MapPin aria-hidden="true" className="size-4 shrink-0 self-center text-acc-txt" /> : null}
            </>
          );
          return (
            <li key={linha.ibge} className="min-w-0">
              {onVerNoMapa ? (
                <button
                  type="button"
                  onClick={(e) => onVerNoMapa(linha.ibge, e.currentTarget)}
                  className={cn(
                    "flex min-h-11 w-full min-w-0 items-start gap-2.5 px-3 py-2 text-left",
                    "transition-colors hover:bg-acc/8 focus-visible:bg-acc/8",
                    i === 0 && "rounded-t-[12px]",
                    i === visiveis.length - 1 && "rounded-b-[12px]",
                  )}
                >
                  {/* Sem aria-label: o nome acessível é o conteúdo inteiro (nome, destaque, nível, COB · UEOp e detalhe). */}
                  <span className="sr-only">Ver no mapa: </span>
                  {conteudo}
                </button>
              ) : (
                <div className="flex min-h-11 min-w-0 items-start gap-2.5 px-3 py-2">{conteudo}</div>
              )}
            </li>
          );
        })}
      </ol>
      {restantes > 0 || todos ? (
        <button
          type="button"
          aria-expanded={todos}
          aria-controls={idLista}
          onClick={() => setTodos((t) => !t)}
          className="relative alvo-toque inline-flex w-fit items-center gap-1.5 rounded-[8px] px-1 text-[12.5px] font-semibold text-acc-txt underline-offset-4 hover:underline"
        >
          <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", todos && "rotate-180")} />
          {todos ? "Mostrar menos" : `Ver todos (${linhas.length})`}
        </button>
      ) : null}
      {rodape}
    </div>
  );
}
