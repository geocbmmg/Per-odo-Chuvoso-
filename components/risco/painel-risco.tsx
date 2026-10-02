"use client";

import { ListOrdered, RefreshCw, Table2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useId, useMemo, useRef, useState } from "react";

import { FonteIndisponivel } from "@/components/comum/fonte-indisponivel";
import { CarimboAtualizacao } from "@/components/layout/carimbo-atualizacao";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { CabecalhoBloco } from "@/components/monitoramento/cabecalho-bloco";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { JanelaChuva } from "@/lib/dominio/chuva";
import {
  INTERVALO_CHUVA_MS,
  INTERVALO_RISCO_MS,
  interpretarRespostaChuva,
  interpretarRespostaRisco,
  URL_API_CHUVA,
  URL_API_RISCO,
} from "@/lib/mapa/dados-risco";
import {
  buscaDaSelecao,
  camadasIndisponiveis,
  dadosDaPintura,
  legendaDaPintura,
  listaMunicipiosEmRisco,
  listaRankingChuva,
  mesmaSelecao,
  resumoPorCob,
  ROTULOS_JANELA,
  ROTULOS_PINTURA,
  type EscolhaNivel,
  type PinturaRisco,
  type SelecaoMapaRisco,
} from "@/lib/mapa/risco";
import { itemDaRota } from "@/lib/navegacao";
import { municipioPorIbge } from "@/lib/territorio/municipios";

import { ALTURA_MAPA_RISCO } from "./altura";
import { EsqueletoListaRisco, EsqueletoMapaRisco } from "./esqueletos";
import { useLeituraPeriodica } from "./hooks";
import { LegendaMapaRisco } from "./legenda-risco";
import { ListaMunicipiosRisco } from "./lista-municipios";
import type { PedidoFocoMapa } from "./mapa-risco";
import { SeletorPintura } from "./seletor-pintura";
import { TabelaResumoCob } from "./tabela-resumo-cob";

const MapaRisco = dynamic(() => import("./mapa-risco"), {
  ssr: false,
  loading: () => <EsqueletoMapaRisco altura={ALTURA_MAPA_RISCO} />,
});

const modulo = itemDaRota("/risco");

const SUBTITULO =
  "Chuva prevista e riscos por município. Aproxime para ir do COB à UEOp e ao município, como no GeoRisk (Cemaden).";

/** Fonte de cada pintura, para o carimbo e os leitores de tela. */
function fonteDaPintura(pintura: PinturaRisco): string {
  return pintura === "chuva" ? "Chuva prevista (Open-Meteo)" : ROTULOS_PINTURA[pintura];
}

/**
 * Mapa de Risco (docs/fase-1.md §5 e §6): seletor "Pintar municípios por",
 * mapa no modelo do GeoRisk, legenda, lista de municípios e resumo por COB.
 * Os dados vêm de /api/chuva e /api/risco, lidos no navegador e atualizados
 * sozinhos com a aba visível; uma camada fora do ar não derruba as outras.
 * A seleção fica na URL (?camada=…&janela=…&nivel=…), compartilhável.
 */
export function PainelRisco({ selecaoInicial }: { selecaoInicial: SelecaoMapaRisco }) {
  const [selecao, setSelecao] = useState(selecaoInicial);
  // Navegação para outra URL de /risco (link do menu): a seleção acompanha.
  const [daUrl, setDaUrl] = useState(selecaoInicial);
  if (!mesmaSelecao(daUrl, selecaoInicial)) {
    setDaUrl(selecaoInicial);
    setSelecao(selecaoInicial);
  }

  const chuva = useLeituraPeriodica(URL_API_CHUVA, interpretarRespostaChuva, INTERVALO_CHUVA_MS);
  const risco = useLeituraPeriodica(URL_API_RISCO, interpretarRespostaRisco, INTERVALO_RISCO_MS);

  const { pintura, janela } = selecao;
  const estado = useMemo(
    () =>
      dadosDaPintura(
        { pintura, janela },
        { dados: chuva.dados, erro: chuva.erro, carregando: false },
        { dados: risco.dados, erro: risco.erro, carregando: false },
      ),
    [pintura, janela, chuva.dados, chuva.erro, risco.dados, risco.erro],
  );
  const dados = estado.estado === "ok" ? estado.dados : null;

  const legenda = useMemo(
    () => legendaDaPintura(pintura, janela, dados ? new Set(dados.niveis.values()) : []),
    [pintura, janela, dados],
  );
  const indisponiveis = useMemo(() => camadasIndisponiveis(risco.dados), [risco.dados]);

  const linhas = useMemo(() => {
    if (pintura === "chuva") return chuva.dados ? listaRankingChuva(chuva.dados, janela) : null;
    return dados ? listaMunicipiosEmRisco(dados, municipioPorIbge) : null;
  }, [pintura, janela, chuva.dados, dados]);

  const resumo = useMemo(() => (dados ? resumoPorCob(dados) : null), [dados]);

  // ── Seleção → URL (substitui a entrada do histórico; nada de recarregar) ──

  const aplicar = (nova: SelecaoMapaRisco) => {
    setSelecao(nova);
    try {
      const { pathname, search, hash } = window.location;
      window.history.replaceState(null, "", `${pathname}${buscaDaSelecao(nova, search)}${hash}`);
    } catch {
      // Sem acesso ao histórico (iframe restrito): a seleção vale só nesta tela.
    }
  };
  const escolherPintura = (p: PinturaRisco) => aplicar({ ...selecao, pintura: p });
  const escolherJanela = (j: JanelaChuva) => aplicar({ ...selecao, janela: j });
  const escolherNivel = (n: EscolhaNivel) => aplicar({ ...selecao, nivel: n });

  // ── "Ver no mapa" (listas e tabela) ──────────────────────────────────────

  const idMapa = useId();
  const idTituloMapa = useId();
  const idTituloLista = useId();
  const idTituloTabela = useId();
  const seqRef = useRef(0);
  const [pedidoFoco, setPedidoFoco] = useState<PedidoFocoMapa | null>(null);

  const pedir = (alvo: PedidoFocoMapa["alvo"], origem: HTMLElement) => {
    const mapa = document.getElementById(idMapa);
    if (mapa) {
      const caixa = mapa.getBoundingClientRect();
      // No celular a lista fica abaixo do mapa: traz o mapa para a tela.
      if (caixa.top < 0 || caixa.bottom > window.innerHeight) mapa.scrollIntoView({ block: "start" });
    }
    seqRef.current += 1;
    setPedidoFoco({ seq: seqRef.current, alvo, origem });
  };
  const verMunicipio = (ibge: string, origem: HTMLElement) => pedir({ tipo: "municipio", ibge }, origem);
  const verCob = (cob: string, origem: HTMLElement) => pedir({ tipo: "area", nivel: "cob", chave: cob }, origem);

  // ── Textos ───────────────────────────────────────────────────────────────

  const rotuloPintura =
    pintura === "chuva"
      ? `${ROTULOS_PINTURA.chuva} · ${ROTULOS_JANELA[janela].toLowerCase()}`
      : ROTULOS_PINTURA[pintura];
  const fonte = fonteDaPintura(pintura);
  const avisoMapa =
    estado.estado === "carregando"
      ? `Carregando ${rotuloPintura.toLowerCase()}…`
      : estado.estado === "indisponivel"
        ? `${rotuloPintura}: fonte indisponível — o mapa fica sem cores.`
        : null;
  const recarregar = pintura === "chuva" ? chuva.recarregar : risco.recarregar;

  const tituloLista = pintura === "chuva" ? "Municípios com mais chuva prevista" : "Municípios em risco";
  const descricaoLista =
    pintura === "chuva"
      ? janela === "24h"
        ? "Maior acumulado previsto nas próximas 24 h."
        : "Pior acumulado em 24 h consecutivas dentro das próximas 72 h."
      : `${ROTULOS_PINTURA[pintura]} · do nível mais grave ao menos grave.`;
  const vazioLista =
    pintura === "chuva"
      ? "Nenhum município com chuva prevista nesta janela."
      : `Nenhum município com alerta nesta camada agora. ${dados?.cobertura ?? ""}`.trim();

  const indisponivel =
    estado.estado === "indisponivel" ? (
      <div className="flex min-w-0 flex-col gap-2">
        <FonteIndisponivel titulo={rotuloPintura} mensagem={estado.motivo} fonte={estado.fonte} />
        <Button variant="secondary" size="sm" className="w-fit" onClick={recarregar}>
          <RefreshCw aria-hidden="true" />
          Tentar de novo
        </Button>
      </div>
    ) : null;

  return (
    <>
      <CabecalhoPagina titulo={modulo.rotulo} subtitulo={SUBTITULO} icone={modulo.icone}>
        <SeletorPintura
          pintura={pintura}
          janela={janela}
          indisponiveis={indisponiveis}
          onPintura={escolherPintura}
          onJanela={escolherJanela}
        />
      </CabecalhoPagina>

      <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-5">
        <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-12">
          <section aria-labelledby={idTituloMapa} className="flex min-w-0 flex-col gap-2.5 xl:col-span-8">
            <h2 id={idTituloMapa} className="text-[15px] font-bold uppercase leading-tight tracking-[.03em] text-ink">
              Mapa · {rotuloPintura}
            </h2>
            {/* scroll-mt: a tarja de demonstração fica fixa no topo. */}
            <div id={idMapa} className="min-w-0 scroll-mt-16">
              <MapaRisco
                dados={dados}
                aviso={avisoMapa}
                escolhaNivel={selecao.nivel}
                onEscolherNivel={escolherNivel}
                pedidoFoco={pedidoFoco}
                rotulo={`Mapa de Minas Gerais pintado por ${rotuloPintura.toLowerCase()}, do COB ao município conforme o zoom`}
              />
            </div>
            <Card className="gap-3">
              {dados ? (
                <LegendaMapaRisco
                  legenda={legenda}
                  cobertura={dados.cobertura}
                  nota={dados.nota}
                  credito={dados.credito}
                  meta={dados.meta}
                  fonte={fonte}
                />
              ) : (
                (indisponivel ?? (
                  <p role="status" className="text-[13px] text-mut">
                    Carregando a legenda…
                  </p>
                ))
              )}
            </Card>
          </section>

          <Card className="min-w-0 xl:col-span-4 xl:self-start" aria-labelledby={idTituloLista} role="region">
            <CabecalhoBloco
              id={idTituloLista}
              titulo={tituloLista}
              descricao={descricaoLista}
              icone={ListOrdered}
              carimbo={
                dados?.meta ? (
                  <CarimboAtualizacao
                    atualizadoEm={dados.meta.atualizadoEm}
                    origem={dados.meta.origem}
                    erro={dados.meta.erro}
                    fonte={fonte}
                    motivoVisivel={false}
                  />
                ) : null
              }
            />
            {linhas ? (
              <ListaMunicipiosRisco
                linhas={linhas}
                numerada={pintura === "chuva"}
                vazio={vazioLista}
                onVerNoMapa={verMunicipio}
              />
            ) : estado.estado === "indisponivel" ? (
              <p className="text-[13px] text-ink-2">Lista indisponível: a fonte desta camada não respondeu.</p>
            ) : (
              <>
                <span role="status" className="sr-only">
                  Carregando a lista de municípios…
                </span>
                <EsqueletoListaRisco />
              </>
            )}
          </Card>
        </div>

        <Card className="min-w-0" aria-labelledby={idTituloTabela} role="region">
          <CabecalhoBloco
            id={idTituloTabela}
            titulo="Resumo por COB"
            descricao={`Quantos municípios em cada nível · ${rotuloPintura}. O pior nível do COB é o do seu pior município.`}
            icone={Table2}
          />
          {resumo ? (
            <TabelaResumoCob
              resumo={resumo}
              idTitulo={idTituloTabela}
              legenda={dados?.cobertura ?? ""}
              onVerNoMapa={verCob}
            />
          ) : estado.estado === "indisponivel" ? (
            <p className="text-[13px] text-ink-2">Resumo indisponível: a fonte desta camada não respondeu.</p>
          ) : (
            <EsqueletoListaRisco linhas={6} />
          )}
        </Card>
      </div>
    </>
  );
}
