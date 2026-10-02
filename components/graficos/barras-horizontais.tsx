"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
  type TooltipContentProps,
  type YAxisTickContentProps,
} from "recharts";

import { usePrefereMenosMovimento } from "@/components/mapa/hooks";

import {
  ALTURA_EIXO_X,
  ALTURA_LINHA_TEXTO,
  calcularLayoutBarras,
  caminhoBarra,
  ESPESSURA_BARRA,
  formatarNumero,
  MARGEM_SUPERIOR,
  RAIO_PONTA,
  RECUO_ROTULO,
  RECUO_ROTULO_COM_AMOSTRA,
  TAMANHO_ROTULO,
  TAMANHO_VALOR,
  VAO_SEGMENTOS,
} from "./medidas";
import type { SerieGrafico } from "./dados";
import {
  COR_CURSOR,
  COR_EIXO,
  COR_GRADE,
  COR_TEXTO_EIXO,
  COR_TEXTO_ROTULO,
  COR_TEXTO_VALOR,
  corSerie,
  type SerieId,
} from "./paleta";

export interface LinhaGrafico {
  /** Identificador único da categoria (chave do eixo). */
  id: string;
  /** Texto da categoria (sempre visível no eixo). */
  rotulo: string;
  /** Cor de um quadradinho ao lado do rótulo (identidade complementar ao texto). */
  amostra?: string;
  /** Valor de cada série (pela `chave` da série). */
  valores: Record<string, number>;
  /** Total rotulado no fim da barra. */
  total: number;
}

export type { SerieGrafico };

type DadoGrafico = Record<string, number | string> & { id: string; total: number };

function useLarguraElemento(): [(elemento: HTMLDivElement | null) => void, number] {
  const [elemento, setElemento] = useState<HTMLDivElement | null>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    if (!elemento) return;
    const observador = new ResizeObserver((entradas) => {
      const nova = Math.round(entradas[0]?.contentRect.width ?? 0);
      setLargura((atual) => (atual === nova ? atual : nova));
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [elemento]);
  return [setElemento, largura];
}

/** Rótulo de categoria: texto (com quebra de linha, se preciso) + quadradinho de cor opcional. */
function TickCategoria({
  props,
  info,
}: {
  props: YAxisTickContentProps;
  info: Map<string, { linhas: string[]; amostra?: string }>;
}) {
  const x = Number(props.x);
  const y = Number(props.y);
  const dados = info.get(String(props.payload?.value ?? ""));
  if (!dados || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const { linhas, amostra } = dados;
  const recuo = amostra ? RECUO_ROTULO_COM_AMOSTRA : RECUO_ROTULO;
  const primeiraDy = -((linhas.length - 1) * ALTURA_LINHA_TEXTO) / 2 + 4;
  return (
    <g transform={`translate(${x},${y})`}>
      {amostra ? (
        <rect x={-14} y={-4} width={8} height={8} rx={2} fill={amostra} stroke={COR_EIXO} strokeWidth={0.5} />
      ) : null}
      <text x={-recuo} y={0} textAnchor="end" fill={COR_TEXTO_ROTULO} fontSize={TAMANHO_ROTULO}>
        {linhas.map((linha, i) => (
          <tspan key={i} x={-recuo} dy={i === 0 ? primeiraDy : ALTURA_LINHA_TEXTO}>
            {linha}
          </tspan>
        ))}
      </text>
    </g>
  );
}

/**
 * Barras horizontais (empilhadas quando há 2+ séries) no padrão da Sala:
 * marcas finas (18px) com ponta de 4px e base reta, 2px de superfície entre
 * segmentos, total rotulado no fim da barra (texto em tinta, nunca na cor da
 * série), grade e eixos recessivos, dica no hover/foco com fundo --sup-2.
 * Altura proporcional ao número de categorias; rótulos longos quebram linha.
 * Só roda no navegador (carregado com next/dynamic ssr:false).
 */
export function BarrasHorizontais({
  linhas,
  series,
  dica,
  rotulo,
}: {
  linhas: readonly LinhaGrafico[];
  series: readonly SerieGrafico[];
  /** Conteúdo da dica de uma categoria. */
  dica: (linha: LinhaGrafico) => ReactNode;
  /** Descrição curta para leitores de tela. */
  rotulo: string;
}) {
  const [refContainer, largura] = useLarguraElemento();
  const reduzir = usePrefereMenosMovimento();
  const comAmostra = linhas.some((l) => l.amostra);
  const maiorTotal = Math.max(0, ...linhas.map((l) => l.total));

  const layout = useMemo(
    () =>
      calcularLayoutBarras({
        rotulos: linhas.map((l) => l.rotulo),
        largura,
        comAmostra,
        maiorValor: formatarNumero(maiorTotal),
      }),
    [linhas, largura, comAmostra, maiorTotal],
  );

  const info = useMemo(() => {
    const mapa = new Map<string, { linhas: string[]; amostra?: string }>();
    linhas.forEach((l, i) => mapa.set(l.id, { linhas: layout.linhasPorRotulo[i] ?? [l.rotulo], amostra: l.amostra }));
    return mapa;
  }, [linhas, layout.linhasPorRotulo]);

  const porId = useMemo(() => new Map(linhas.map((l) => [l.id, l])), [linhas]);

  const dados = useMemo<DadoGrafico[]>(() => linhas.map((l) => ({ ...l.valores, id: l.id, total: l.total })), [linhas]);

  // Uma função de desenho por série (estável entre renderizações).
  const formas = useMemo(
    () =>
      series.map((serie, indice) => {
        const posteriores = series.slice(indice + 1);
        const ultima = indice === series.length - 1;
        return function desenharSegmento(props: BarShapeProps) {
          const linha = props.payload as DadoGrafico | undefined;
          const x = Number(props.x);
          const y = Number(props.y);
          const larguraBruta = Number(props.width) || 0;
          const altura = Number(props.height) || 0;
          if (!linha || !Number.isFinite(x) || !Number.isFinite(y)) return <g />;
          const valor = Number(linha[serie.chave]) || 0;
          const resto = posteriores.reduce((soma, s) => soma + (Number(linha[s.chave]) || 0), 0);
          // A ponta de dados (arredondada) é o último segmento com valor; os
          // anteriores ficam retos e cedem 2px de superfície ao seguinte.
          const ehPonta = resto === 0;
          const larguraSegmento =
            !ehPonta && larguraBruta > 0 ? Math.max(larguraBruta - VAO_SEGMENTOS, 1) : larguraBruta;
          const caminho = valor > 0 ? caminhoBarra(x, y, larguraSegmento, altura, ehPonta ? RAIO_PONTA : 0) : "";
          return (
            <g>
              {caminho ? <path d={caminho} fill={corSerie(serie.serie)} /> : null}
              {ultima ? (
                <text
                  x={x + Math.max(larguraBruta, 0) + 6}
                  y={y + altura / 2}
                  dominantBaseline="central"
                  fill={COR_TEXTO_VALOR}
                  fontSize={TAMANHO_VALOR}
                  fontWeight={600}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatarNumero(Number(linha.total) || 0)}
                </text>
              ) : null}
            </g>
          );
        };
      }),
    [series],
  );

  const conteudoDica = ({ active, payload }: TooltipContentProps) => {
    if (!active || !payload?.length) return null;
    const id = (payload[0]?.payload as DadoGrafico | undefined)?.id;
    const linha = id ? porId.get(id) : undefined;
    if (!linha) return null;
    return (
      <div className="min-w-[180px] max-w-[260px] rounded-[10px] border border-linha/12 bg-sup-2 px-3 py-2.5 text-[12px] leading-snug text-ink-2 shadow-menu">
        {dica(linha)}
      </div>
    );
  };

  return (
    <div
      ref={refContainer}
      className="relative w-full min-w-0"
      style={{ height: layout.altura }}
      role="figure"
      aria-label={rotulo}
    >
      {largura > 0 ? (
        <ResponsiveContainer width="100%" height={layout.altura}>
          <BarChart
            data={dados}
            layout="vertical"
            margin={{ top: MARGEM_SUPERIOR, right: layout.margemDireita, bottom: 0, left: 0 }}
            barSize={ESPESSURA_BARRA}
            barCategoryGap={0}
          >
            <CartesianGrid horizontal={false} stroke={COR_GRADE} strokeWidth={1} />
            <XAxis
              type="number"
              domain={[0, "auto"]}
              allowDecimals={false}
              tickFormatter={(v: number) => formatarNumero(v)}
              tick={{ fill: COR_TEXTO_EIXO, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              height={ALTURA_EIXO_X}
              tickCount={5}
            />
            <YAxis
              type="category"
              dataKey="id"
              width={layout.larguraEixo}
              interval={0}
              tickLine={false}
              tickSize={0}
              tickMargin={0}
              axisLine={{ stroke: COR_EIXO }}
              tick={(props: YAxisTickContentProps) => <TickCategoria props={props} info={info} />}
            />
            <Tooltip
              cursor={{ fill: COR_CURSOR }}
              content={conteudoDica}
              isAnimationActive={false}
              wrapperStyle={{ outline: "none", zIndex: 5 }}
            />
            {series.map((serie, indice) => (
              <Bar
                key={serie.chave}
                dataKey={serie.chave}
                name={serie.rotulo}
                stackId="pilha"
                fill={corSerie(serie.serie)}
                shape={formas[indice]}
                isAnimationActive={!reduzir}
                animationDuration={450}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

/** Linha da dica: traço curto na cor da série (identidade), valor em destaque e rótulo. */
export function LinhaDica({ serie, valor, rotulo }: { serie?: SerieId; valor: number | string; rotulo: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {serie ? (
        <span
          aria-hidden="true"
          className="h-[3px] w-3 shrink-0 rounded-full"
          style={{ background: corSerie(serie) }}
        />
      ) : (
        <span aria-hidden="true" className="w-3 shrink-0" />
      )}
      <span className="font-bold text-ink tabular-nums">
        {typeof valor === "number" ? formatarNumero(valor) : valor}
      </span>
      <span className="text-mut">{rotulo}</span>
    </div>
  );
}
