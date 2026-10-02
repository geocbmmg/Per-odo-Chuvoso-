"use client";

import { useMemo } from "react";

import { BarrasHorizontais, LinhaDica, type LinhaGrafico } from "./barras-horizontais";
import { agruparTiposRisco, type LinhaAlertasPorTipo, type SerieGrafico } from "./dados";
import { formatoPercentual } from "./medidas";

const SERIES: readonly SerieGrafico[] = [{ chave: "total", rotulo: "Alertas", serie: "unica" }];

/**
 * "Alertas por tipo de risco": barras horizontais de série única (acento ouro),
 * ordenadas da maior para a menor, valor no fim da barra. Sem legenda: o
 * título nomeia a série.
 */
export default function GraficoAlertasPorTipoCliente({
  linhas,
  totalAlertas,
}: {
  linhas: readonly LinhaAlertasPorTipo[];
  totalAlertas: number;
}) {
  const dados = useMemo<LinhaGrafico[]>(
    () =>
      agruparTiposRisco(linhas).map((l, i) => ({
        id: `${i}:${l.tipo}`,
        rotulo: l.tipo,
        valores: { total: l.total },
        total: l.total,
      })),
    [linhas],
  );

  return (
    <BarrasHorizontais
      linhas={dados}
      series={SERIES}
      rotulo="Gráfico de barras: alertas por tipo de risco, do mais frequente ao menos frequente. Os mesmos dados estão na tabela."
      dica={(linha) => (
        <>
          <p className="mb-1 font-bold text-ink-forte">{linha.rotulo}</p>
          <LinhaDica serie="unica" valor={linha.total} rotulo={linha.total === 1 ? "alerta" : "alertas"} />
          {totalAlertas > 0 ? (
            <LinhaDica valor={formatoPercentual.format(linha.total / totalAlertas)} rotulo="do total do período" />
          ) : null}
        </>
      )}
    />
  );
}
