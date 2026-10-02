"use client";

import { useId } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import { useMediaQuery } from "@/components/layout/hidratacao";
import { formatarInteiro, formatarMm } from "@/components/status/formatos";

import type { LinhaChuvaCob } from "./tipos";

/*
 * Chuva prevista nas próximas 72 h por COB — barras HORIZONTAIS de série única.
 * - Cor: acento ouro (var(--acc): #F1C23C no escuro, #7A5800 no claro — paleta
 *   validada para série única). A cor dos COBs NÃO é usada (falha no teste de
 *   daltonismo); o COB é identificado pelo texto.
 * - Sem legenda (série única: o título nomeia); valor direto no fim da barra;
 *   grade e eixos recessivos; texto sempre nos tokens de texto, nunca na cor da série.
 * - ≥ 640px: rótulo "1º COB · Belo Horizonte" no eixo Y. < 640px: o rótulo vai
 *   ACIMA da barra, que ganha a largura toda (um eixo Y largo espremeria o gráfico).
 * - Alternativa acessível: tabela em <details> "Ver tabela".
 */

const ALTURA_POR_COB = 44;
const ALTURA_POR_COB_ESTREITO = 54;
const LARGURA_EIXO_Y = 212;
const MARGEM = { top: 4, right: 80, bottom: 4, left: 4 } as const;
const MARGEM_ESTREITO = { top: 8, right: 76, bottom: 4, left: 8 } as const;
const ALTURA_EIXO_X = 26;
const NBSP = " ";

interface Ponto {
  rotulo: string;
  cob: string;
  municipio: string;
  /** Valor da barra (0 quando não há dado). */
  valor: number;
  /** "53,6 mm" ou "sem dados" (com espaço inseparável: o rótulo nunca quebra). */
  texto: string;
  temDado: boolean;
}

function textoValor(mm: number | null): string {
  return mm === null ? `sem${NBSP}dados` : `${formatarMm(mm)}${NBSP}mm`;
}

/** Escala do eixo de valores com passos "redondos" (1, 2, 5 × 10ⁿ) e no mínimo 10 mm. */
function escala(maximo: number): { max: number; ticks: number[] } {
  const alvo = Math.max(maximo, 10) / 4;
  const potencia = 10 ** Math.floor(Math.log10(alvo));
  const passo = [1, 2, 5, 10].map((m) => m * potencia).find((p) => p >= alvo) ?? 10 * potencia;
  const max = Math.ceil(Math.max(maximo, 10) / passo) * passo;
  const ticks: number[] = [];
  for (let v = 0; v <= max + passo / 2; v += passo) ticks.push(Math.round(v * 100) / 100);
  return { max, ticks };
}

/**
 * Rótulo de cada COB, desenhado pelo eixo Y (um por categoria, mesmo sem barra).
 * Quando a barra tem largura zero (0 mm ou sem dados), o Recharts não desenha a
 * barra nem o rótulo de valor — então o valor é escrito aqui também.
 */
function TickCob({
  y,
  payload,
  pontos,
  largo,
  xPlot,
}: {
  y: number | string;
  payload: { value?: unknown };
  pontos: Map<string, Ponto>;
  largo: boolean;
  xPlot: number;
}) {
  const ponto = pontos.get(String(payload.value ?? ""));
  if (!ponto) return <g />;
  const cy = Number(y);
  return (
    <g>
      <text
        x={largo ? xPlot - 10 : xPlot}
        y={largo ? cy : cy - 12}
        dy={largo ? "0.35em" : undefined}
        textAnchor={largo ? "end" : "start"}
        fontSize={12}
      >
        <tspan fill="var(--gr-ink2)" fontWeight={700}>
          {ponto.cob}
        </tspan>
        <tspan fill="var(--gr-mut)">{` · ${ponto.municipio}`}</tspan>
      </text>
      {ponto.valor === 0 ? (
        <text
          x={xPlot + 6}
          y={largo ? cy : cy + 4}
          dy="0.35em"
          fontSize={12}
          fontWeight={600}
          fill={ponto.temDado ? "var(--gr-ink2)" : "var(--gr-mut)"}
          fontStyle={ponto.temDado ? undefined : "italic"}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {ponto.texto}
        </text>
      ) : null}
    </g>
  );
}

function DicaChuva({ active, payload }: TooltipContentProps) {
  const ponto = active ? (payload?.[0]?.payload as Ponto | undefined) : undefined;
  if (!ponto) return null;
  return (
    <div className="rounded-[10px] border border-linha/12 bg-sup-2 px-3 py-2 text-[12px] leading-snug shadow-menu">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-[3px] w-3.5 rounded-full bg-primary" />
        <span className="text-[13px] font-bold text-ink-forte tabular-nums">{ponto.texto}</span>
      </div>
      <div className="mt-0.5 text-mut">{ponto.rotulo} · próximas 72 h</div>
    </div>
  );
}

export function GraficoChuva72h({ linhas }: { linhas: LinhaChuvaCob[] }) {
  const idTitulo = useId();
  const largo = useMediaQuery("(min-width: 640px)");
  const reduzMovimento = useMediaQuery("(prefers-reduced-motion: reduce)", true);

  const pontos: Ponto[] = linhas.map((l) => ({
    rotulo: l.rotulo,
    cob: l.cob,
    municipio: l.municipio,
    valor: l.mm ?? 0,
    texto: textoValor(l.mm),
    temDado: l.mm !== null,
  }));
  const porRotulo = new Map(pontos.map((p) => [p.rotulo, p]));
  const margem = largo ? MARGEM : MARGEM_ESTREITO;
  // Estreito: 1px (o Recharts não desenha os ticks de um eixo com largura 0).
  const larguraEixoY = largo ? LARGURA_EIXO_Y : 1;
  const xPlot = margem.left + larguraEixoY;
  const { max, ticks } = escala(Math.max(0, ...pontos.map((p) => p.valor)));
  const altura =
    Math.max(1, pontos.length) * (largo ? ALTURA_POR_COB : ALTURA_POR_COB_ESTREITO) +
    margem.top +
    margem.bottom +
    ALTURA_EIXO_X;
  const semDados = pontos.every((p) => !p.temDado);

  return (
    <figure aria-labelledby={idTitulo} className="min-w-0">
      <figcaption id={idTitulo} className="text-[12px] font-bold uppercase tracking-[.12em] text-ink-2">
        Chuva prevista nas próximas 72 h (mm)
      </figcaption>
      <p className="mt-0.5 text-[12px] text-mut">Acumulado previsto a partir da hora atual, na sede de cada COB.</p>

      {semDados ? (
        <p className="mt-3 rounded-[9px] border border-dashed border-linha/20 px-3 py-4 text-center text-[12.5px] text-mut">
          A previsão não trouxe o acumulado de 72 h para nenhum COB.
        </p>
      ) : (
        <div className="mt-3 min-w-0" style={{ height: altura }}>
          <ResponsiveContainer width="100%" height={altura} initialDimension={{ width: 320, height: altura }}>
            <BarChart
              data={pontos}
              layout="vertical"
              margin={margem}
              barCategoryGap={0}
              title="Chuva prevista nas próximas 72 h por COB, em milímetros"
            >
              <CartesianGrid horizontal={false} stroke="rgba(var(--linha-rgb), .09)" />
              <XAxis
                type="number"
                dataKey="valor"
                height={ALTURA_EIXO_X}
                domain={[0, max]}
                ticks={ticks}
                interval={0}
                tickFormatter={(v: number) => formatarInteiro(v)}
                tick={{ fill: "var(--gr-mut)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="rotulo"
                width={larguraEixoY}
                interval={0}
                axisLine={largo ? { stroke: "rgba(var(--linha-rgb), .18)" } : false}
                tickLine={false}
                tick={(props) => (
                  <TickCob y={props.y} payload={props.payload} pontos={porRotulo} largo={largo} xPlot={xPlot} />
                )}
              />
              <Tooltip
                cursor={{ fill: "rgba(var(--linha-rgb), .05)" }}
                content={DicaChuva}
                isAnimationActive={false}
              />
              <Bar
                dataKey="valor"
                name="Chuva prevista (72 h)"
                fill="var(--acc)"
                maxBarSize={largo ? 18 : 14}
                radius={[0, 4, 4, 0]}
                isAnimationActive={!reduzMovimento}
              >
                <LabelList
                  dataKey="texto"
                  position="right"
                  offset={8}
                  fill="var(--gr-ink2)"
                  fontSize={12}
                  fontWeight={600}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <details className="group mt-2">
        <summary className="relative alvo-toque inline-flex cursor-pointer select-none items-center gap-1.5 rounded-[8px] text-[12.5px] font-semibold text-acc-txt marker:content-none hover:underline [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">
            ›
          </span>
          Ver tabela
        </summary>
        <table className="mt-2 w-full max-w-md border-collapse text-[12.5px]">
          <caption className="sr-only">Chuva prevista nas próximas 72 h por COB (mm)</caption>
          <thead>
            <tr className="border-b border-acc/34 text-left text-[10px] font-bold uppercase tracking-[.09em] text-faint">
              <th scope="col" className="py-1.5 pr-3">
                COB
              </th>
              <th scope="col" className="py-1.5 pr-3">
                Sede
              </th>
              <th scope="col" className="py-1.5 text-right">
                72 h
              </th>
            </tr>
          </thead>
          <tbody>
            {pontos.map((p) => (
              <tr key={p.rotulo} className="border-b border-linha/5">
                <th scope="row" className="py-1.5 pr-3 text-left font-semibold text-ink">
                  {p.cob}
                </th>
                <td className="py-1.5 pr-3 text-ink-2">{p.municipio}</td>
                <td className="py-1.5 text-right text-ink-2 tabular-nums">{p.texto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
