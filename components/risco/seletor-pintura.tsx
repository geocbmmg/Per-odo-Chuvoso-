"use client";

import { CloudOff } from "lucide-react";
import { useId } from "react";

import type { JanelaChuva } from "@/lib/dominio/chuva";
import { JANELAS_MAPA, PINTURAS_RISCO, ROTULOS_JANELA, ROTULOS_PINTURA, type PinturaRisco } from "@/lib/mapa/risco";
import { cn } from "@/lib/utils";

/** Duas linhas curtas para o celular (grade de 2 colunas, alvos ≥ 44 px). */
const CURTOS: Record<PinturaRisco, [string, string | null]> = {
  chuva: ["Chuva prevista", null],
  meteorologico: ["Meteorológico", "INMET"],
  geologico: ["Geológico", "Cemaden"],
  hidrologico: ["Hidrológico", "Cemaden"],
  "alertas-cbmmg": ["Alertas", "CBMMG"],
  combinado: ["Maior risco", "combinado"],
};

const OPCAO = cn(
  "relative alvo-toque flex min-h-11 cursor-pointer items-center justify-center rounded-[9px] border px-2 py-1.5 text-center",
  "text-[13px] leading-tight transition-[background-color,border-color,color]",
  "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-acc-forte",
  "sm:min-h-0 sm:rounded-full sm:px-[14px] sm:py-1.5",
);

const ATIVA = "border-acc/42 bg-acc/16 font-bold text-acc-txt";
const INATIVA = "border-transparent font-semibold text-ink-2 hover:bg-linha/8 hover:text-ink-forte";

/** Radio nativo escondido: setas trocam a opção, o rótulo é o alvo de toque. */
const RADIO = "pointer-events-none absolute size-px opacity-0";

/**
 * "Pintar municípios por" — grupo de rádio no estilo .gr-abas do GeoRescue
 * (segmentado). Uma pintura por vez. A opção ativa tem três sinais: fundo e
 * moldura de acento, peso maior e o próprio estado do rádio. Camada fora do
 * ar leva ícone e a palavra "indisponível".
 */
export function SeletorPintura({
  pintura,
  janela,
  indisponiveis,
  onPintura,
  onJanela,
}: {
  pintura: PinturaRisco;
  janela: JanelaChuva;
  indisponiveis: ReadonlySet<PinturaRisco>;
  onPintura: (pintura: PinturaRisco) => void;
  onJanela: (janela: JanelaChuva) => void;
}) {
  const nomePintura = useId();
  const nomeJanela = useId();

  return (
    <div className="flex min-w-0 flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-end lg:gap-x-5">
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-[11px] font-bold uppercase tracking-[.18em] text-faint">
          Pintar municípios por
        </legend>
        <div
          className={cn(
            "grid grid-cols-2 gap-1 rounded-[12px] border border-linha/16 bg-linha/6 p-1",
            "sm:inline-flex sm:flex-wrap sm:rounded-[22px]",
          )}
        >
          {PINTURAS_RISCO.map((opcao) => {
            const ativa = opcao === pintura;
            const fora = indisponiveis.has(opcao);
            const [linha1, linha2] = CURTOS[opcao];
            return (
              <label key={opcao} className={cn(OPCAO, ativa ? ATIVA : INATIVA)} title={ROTULOS_PINTURA[opcao]}>
                <input
                  type="radio"
                  name={nomePintura}
                  value={opcao}
                  checked={ativa}
                  onChange={() => onPintura(opcao)}
                  className={RADIO}
                />
                <span className="flex flex-col items-center sm:hidden">
                  <span>{linha1}</span>
                  {linha2 ? <span className="text-[11.5px] font-semibold opacity-90">{linha2}</span> : null}
                </span>
                <span className="whitespace-nowrap max-sm:hidden">{ROTULOS_PINTURA[opcao]}</span>
                {fora ? (
                  <span className="ml-1 inline-flex items-center gap-0.5 text-[10.5px] font-bold uppercase tracking-[.04em] text-alerta-txt max-sm:absolute max-sm:top-0.5 max-sm:right-1">
                    <CloudOff aria-hidden="true" className="size-3" />
                    <span className="max-sm:sr-only">indisponível</span>
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      {pintura === "chuva" ? (
        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-[11px] font-bold uppercase tracking-[.18em] text-faint">
            Janela da previsão
          </legend>
          <div className="grid grid-cols-2 gap-1 rounded-[12px] border border-linha/16 bg-linha/6 p-1 sm:inline-flex sm:rounded-full">
            {JANELAS_MAPA.map((opcao) => {
              const ativa = opcao === janela;
              return (
                <label key={opcao} className={cn(OPCAO, ativa ? ATIVA : INATIVA)}>
                  <input
                    type="radio"
                    name={nomeJanela}
                    value={opcao}
                    checked={ativa}
                    onChange={() => onJanela(opcao)}
                    className={RADIO}
                  />
                  <span className="whitespace-nowrap tabular-nums">{ROTULOS_JANELA[opcao]}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
