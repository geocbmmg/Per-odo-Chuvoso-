"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, TriangleAlert } from "lucide-react";

import { CarimboAtualizacao } from "@/components/layout/carimbo-atualizacao";
import { MapaSituacao } from "@/components/mapa";
import { Badge } from "@/components/ui/badge";
import type { CamadaMapaId, Periodo } from "@/lib/dominio/tipos";
import {
  combinarCarimboMapa,
  ehCamadaPontual,
  registrarMeta,
  ROTULOS_CAMADAS,
  type EstadosMetaCamadas,
  type MetaCamada,
} from "@/lib/mapa";

const CAMADAS: readonly CamadaMapaId[] = ["cobs", "alertas", "acoes-rrd", "ocorrencias-complexas"];

/** ~60% da tela no celular, 560px no desktop (a legenda fica abaixo). */
const ALTURA_MAPA = "h-[60svh] min-h-[340px] md:h-[560px] md:min-h-0";

/**
 * Bloco do mapa da Visão Geral: título, carimbo combinado das camadas de
 * pontos (vindo do onMeta do mapa) e aviso das camadas que falharam. O mapa
 * filtra os pontos com o mesmo período dos indicadores e se atualiza sozinho
 * a cada 5 min. Os limites dos COBs ficam fora do carimbo (são lidos uma vez
 * só); o horário deles aparece no painel "Camadas" do mapa.
 */
export function MapaVisaoGeral({ periodo }: { periodo: Pick<Periodo, "inicio" | "fim" | "rotulo"> }) {
  const [estados, setEstados] = useState<EstadosMetaCamadas>({});

  const aoReceberMeta = useCallback((camada: CamadaMapaId, meta: MetaCamada | null, erro?: string) => {
    setEstados((atual) => registrarMeta(atual, camada, meta, erro));
  }, []);

  const carimbo = useMemo(() => combinarCarimboMapa(estados, CAMADAS), [estados]);
  // Na falha total o aviso do carimbo já explica as camadas de pontos; o selo
  // fica para as falhas parciais (e para os limites dos COBs).
  const comFalha = CAMADAS.filter(
    (c) => estados[c]?.erro && (carimbo.estado !== "falha" || !ehCamadaPontual(c)),
  );

  return (
    <section aria-labelledby="mapa-titulo" className="flex min-w-0 flex-col gap-2.5">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 id="mapa-titulo" className="text-[15px] font-bold uppercase leading-tight tracking-[.03em] text-ink">
          Mapa de Minas Gerais
        </h2>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {carimbo.estado === "ok" ? (
            <CarimboAtualizacao
              atualizadoEm={carimbo.atualizadoEm}
              origem={carimbo.origem}
              erro={carimbo.erro}
              fonte="Camadas do mapa (ArcGIS CBMMG)"
            />
          ) : carimbo.estado === "falha" ? (
            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] leading-snug">
              <Badge variant="alerta">
                <TriangleAlert aria-hidden="true" />
                Registros do mapa indisponíveis
              </Badge>
              <span className="min-w-0 break-words text-ink-2">{carimbo.motivo}</span>
              <Link
                href="/status"
                className="relative alvo-toque inline-flex items-center gap-1 rounded-[8px] font-semibold text-acc-txt underline-offset-4 hover:underline"
              >
                <Activity aria-hidden="true" className="size-3.5" />
                Ver status das fontes
              </Link>
            </div>
          ) : carimbo.estado === "sem-horario" ? (
            <span className="text-[12px] text-mut">Horário da leitura não informado</span>
          ) : (
            <span className="text-[12px] text-mut">Carregando camadas…</span>
          )}
          {comFalha.length > 0 ? (
            <Badge
              variant="alerta"
              title={comFalha.map((c) => `${ROTULOS_CAMADAS[c]}: ${estados[c]?.erro ?? ""}`).join(" · ")}
            >
              <TriangleAlert aria-hidden="true" />
              {comFalha.length === 1
                ? `${ROTULOS_CAMADAS[comFalha[0]]} indisponível`
                : `${comFalha.length} camadas indisponíveis`}
            </Badge>
          ) : null}
        </div>
      </header>
      <MapaSituacao
        camadas={CAMADAS}
        camadasIniciais={CAMADAS}
        periodo={periodo}
        altura={ALTURA_MAPA}
        onMeta={aoReceberMeta}
        rotulo={`Mapa de Minas Gerais com COBs, alertas, ações RRD e ocorrências complexas — ${periodo.rotulo}`}
      />
    </section>
  );
}
