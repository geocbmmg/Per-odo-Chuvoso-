"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { CAMADAS_MAPA, type CamadaMapaId } from "@/lib/dominio/tipos";
import {
  COR_ACAO_RRD,
  COR_ALERTA,
  CORES_COB,
  ehCamadaPontual,
  ROTULOS_CAMADAS,
  SIMBOLOS,
  type TemaMapa,
} from "@/lib/mapa";
import { useTemaMapa } from "./hooks";
import { estadoPilula, rotuloContagem, textoContagem, type InfoCamada } from "./info";
import { Simbolo, SimboloOcorrenciaFinalizada } from "./simbolo";

export interface PropsLegendaMapa {
  /** Camadas exibidas (padrão: todas). */
  camadas?: readonly CamadaMapaId[];
  /** Camadas ligadas no mapa (as desligadas aparecem esmaecidas). Padrão: todas. */
  visiveis?: Iterable<CamadaMapaId>;
  /** Contagens e estado de cada camada (vindos do mapa). */
  info?: Partial<Record<CamadaMapaId, InfoCamada>>;
  /** "embutida" = faixa sob o mapa; "solta" = cartão independente. */
  variante?: "embutida" | "solta";
  /** No celular, começa recolhida atrás de um botão "Legenda". */
  recolhivel?: boolean;
  rotuloPeriodo?: string;
  /** Força o tema (padrão: o tema da página). */
  tema?: TemaMapa;
  className?: string;
}

const NOME_CURTO: Record<CamadaMapaId, [string, string]> = {
  cobs: ["COB", "COBs"],
  alertas: ["alerta", "alertas"],
  "acoes-rrd": ["ação RRD", "ações RRD"],
  "ocorrencias-complexas": ["ocorrência", "ocorrências"],
};

function resumo(camadas: readonly CamadaMapaId[], info: Partial<Record<CamadaMapaId, InfoCamada>> | undefined) {
  const partes: string[] = [];
  for (const camada of camadas) {
    if (!ehCamadaPontual(camada)) continue;
    const total = info?.[camada]?.total;
    if (total === null || total === undefined) continue;
    const [um, varios] = NOME_CURTO[camada];
    partes.push(`${total.toLocaleString("pt-BR")} ${total === 1 ? um : varios}`);
  }
  return partes.join(" · ");
}

/**
 * Legenda do mapa: cores dos COBs e símbolos das camadas pontuais, sempre
 * com forma + cor + palavra, e as contagens fora do canvas.
 */
export function LegendaMapa({
  camadas = CAMADAS_MAPA,
  visiveis,
  info,
  variante = "solta",
  recolhivel = true,
  rotuloPeriodo,
  tema: temaForcado,
  className,
}: PropsLegendaMapa) {
  const temaPagina = useTemaMapa();
  const tema = temaForcado ?? temaPagina;
  const [aberta, setAberta] = useState(false);
  const idCorpo = useId();
  const idCobs = `${idCorpo}-cobs`;
  const idRegistros = `${idCorpo}-registros`;
  const ligadas = new Set(visiveis ?? camadas);
  const pontuais = camadas.filter(ehCamadaPontual);
  const semLocalizacao = pontuais.reduce((soma, c) => soma + (info?.[c]?.semLocalizacao ?? 0), 0);
  const textoResumo = resumo(camadas, info);

  return (
    <section
      className={cn("mapa-legenda", className)}
      data-mapa-tema={tema}
      data-variante={variante}
      data-recolhivel={recolhivel}
      data-aberta={aberta}
      aria-label="Legenda do mapa"
    >
      {recolhivel ? (
        <button
          type="button"
          className="mapa-legenda__alternar"
          aria-expanded={aberta}
          aria-controls={idCorpo}
          onClick={() => setAberta((a) => !a)}
        >
          <span className="mapa-legenda__titulo">Legenda</span>
          {textoResumo ? <span className="mapa-legenda__resumo">{textoResumo}</span> : null}
          <ChevronDown aria-hidden="true" />
        </button>
      ) : null}

      <div className="mapa-legenda__corpo" id={idCorpo}>
        {camadas.includes("cobs") ? (
          <div className="mapa-legenda__grupo">
            <p className="mapa-legenda__rotulo-grupo" id={idCobs}>
              Comandos Operacionais (COB)
            </p>
            <ul className="mapa-legenda__lista" role="list" aria-labelledby={idCobs}>
              {CORES_COB.map((cor) => (
                <li key={cor.cob} className="mapa-legenda__item" data-oculta={!ligadas.has("cobs")}>
                  <Simbolo forma="area" cor={cor.preenchimento} contorno={cor.contorno[tema]} />
                  {cor.cob}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {pontuais.length > 0 ? (
          <div className="mapa-legenda__grupo">
            <p className="mapa-legenda__rotulo-grupo" id={idRegistros}>
              Registros
            </p>
            <ul className="mapa-legenda__lista" role="list" aria-labelledby={idRegistros}>
              {pontuais.map((camada) => {
                const dados = info?.[camada];
                return (
                  <li key={camada} className="mapa-legenda__item" data-oculta={!ligadas.has(camada)}>
                    <Simbolo forma={SIMBOLOS[camada].forma} cor={SIMBOLOS[camada].cor} />
                    <span>
                      {ROTULOS_CAMADAS[camada]}
                      {!ligadas.has(camada) ? <span className="mapa-sr"> (oculta no mapa)</span> : null}
                    </span>
                    {dados ? (
                      <span
                        className="mapa-pilula"
                        data-estado={estadoPilula(dados)}
                        aria-label={rotuloContagem(dados, camada)}
                      >
                        {textoContagem(dados)}
                      </span>
                    ) : null}
                  </li>
                );
              })}
              {pontuais.includes("ocorrencias-complexas") ? (
                <li className="mapa-legenda__item" data-oculta={!ligadas.has("ocorrencias-complexas")}>
                  <SimboloOcorrenciaFinalizada />
                  Ocorrência finalizada
                </li>
              ) : null}
              {pontuais.includes("alertas") || pontuais.includes("acoes-rrd") ? (
                <li className="mapa-legenda__item">
                  <Simbolo
                    forma="agrupamento"
                    cor={pontuais.includes("alertas") ? COR_ALERTA : COR_ACAO_RRD}
                    numero="12"
                  />
                  Agrupamento (número = quantidade)
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {rotuloPeriodo || semLocalizacao > 0 ? (
          <p className="mapa-legenda__nota">
            {rotuloPeriodo ? `Contagens: ${rotuloPeriodo}.` : null}
            {rotuloPeriodo && semLocalizacao > 0 ? " " : null}
            {semLocalizacao > 0
              ? semLocalizacao === 1
                ? "1 registro sem localização fica fora do mapa, mas entra nas contagens."
                : `${semLocalizacao.toLocaleString("pt-BR")} registros sem localização ficam fora do mapa, mas entram nas contagens.`
              : null}
          </p>
        ) : null}
      </div>
    </section>
  );
}
