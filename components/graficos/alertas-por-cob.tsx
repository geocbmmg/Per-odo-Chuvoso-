"use client";

import { useMemo } from "react";

import { SEM_COB } from "@/lib/dominio/tipos";
import { corDoCob } from "@/lib/mapa/cores-cob";

import { BarrasHorizontais, LinhaDica, type LinhaGrafico } from "./barras-horizontais";
import { alertasAtendidos, SERIES_ALERTAS_POR_COB, type LinhaAlertasPorCob } from "./dados";
import { formatoPercentual } from "./medidas";

function Dica({ linha, original }: { linha: LinhaGrafico; original: LinhaAlertasPorCob }) {
  const atendidos = alertasAtendidos(original);
  const fracao = original.alertas > 0 ? original.pendentes / original.alertas : null;
  return (
    <>
      <p className="mb-1 flex items-center gap-1.5 font-bold text-ink-forte">
        {linha.amostra ? (
          <span aria-hidden="true" className="size-2 shrink-0 rounded-[2px]" style={{ background: linha.amostra }} />
        ) : null}
        {linha.rotulo}
      </p>
      <LinhaDica valor={original.alertas} rotulo={original.alertas === 1 ? "alerta emitido" : "alertas emitidos"} />
      <LinhaDica serie="atendido" valor={atendidos} rotulo="com ação RRD" />
      <LinhaDica
        serie="pendente"
        valor={original.pendentes}
        rotulo={fracao === null ? "pendentes" : `pendentes (${formatoPercentual.format(fracao)})`}
      />
      <div className="mt-1 border-t border-linha/12 pt-1">
        <LinhaDica
          valor={original.acoesRrd}
          rotulo={original.acoesRrd === 1 ? "ação RRD executada" : "ações RRD executadas"}
        />
      </div>
    </>
  );
}

/**
 * "Alertas por COB": barras horizontais empilhadas — "Com ação RRD" e
 * "Pendente" — com o total de alertas no fim da barra. COB é identificado pelo
 * texto do eixo (o quadradinho de cor só acompanha o texto). "Sem COB" por último.
 */
export default function GraficoAlertasPorCobCliente({ linhas }: { linhas: readonly LinhaAlertasPorCob[] }) {
  const { dados, originais } = useMemo(() => {
    const originais = new Map(linhas.map((l) => [l.cob, l]));
    const dados: LinhaGrafico[] = linhas.map((l) => ({
      id: l.cob,
      rotulo: l.cob,
      amostra: corDoCob(l.cob === SEM_COB ? null : l.cob, "escuro", "preenchimento"),
      valores: { atendidos: alertasAtendidos(l), pendentes: l.pendentes },
      total: l.alertas,
    }));
    return { dados, originais };
  }, [linhas]);

  return (
    <BarrasHorizontais
      linhas={dados}
      series={SERIES_ALERTAS_POR_COB}
      rotulo="Gráfico de barras: alertas por COB, divididos em com ação RRD e pendentes. Os mesmos dados estão na tabela."
      dica={(linha) => {
        const original = originais.get(linha.id);
        return original ? <Dica linha={linha} original={original} /> : null;
      }}
    />
  );
}
