"use client";

import { useCallback, useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";

import { CarimboAtualizacao } from "@/components/layout/carimbo-atualizacao";
import { MapaSituacao } from "@/components/mapa";
import { Badge } from "@/components/ui/badge";
import type { CamadaMapaId, Periodo } from "@/lib/dominio/tipos";
import type { OrigemLeitura } from "@/lib/fontes/tipos";
import { ROTULOS_CAMADAS, type MetaCamada } from "@/lib/mapa";

const CAMADAS: readonly CamadaMapaId[] = ["cobs", "alertas", "acoes-rrd", "ocorrencias-complexas"];

/** ~60% da tela no celular, 560px no desktop (a legenda fica abaixo). */
const ALTURA_MAPA = "h-[60svh] min-h-[340px] md:h-[560px] md:min-h-0";

const PESO_ORIGEM: Record<OrigemLeitura, number> = {
  "ao-vivo": 0,
  cache: 1,
  "ultima-valida": 2,
  exemplo: 3,
};

type EstadoCamadas = Partial<Record<CamadaMapaId, { meta: MetaCamada | null; erro?: string }>>;

/**
 * Carimbo combinado das camadas do mapa: vale a leitura MAIS ANTIGA e a pior
 * origem (o mapa é tão atual quanto a camada mais atrasada).
 */
function combinar(estados: EstadoCamadas) {
  const metas = Object.values(estados)
    .map((e) => e?.meta)
    .filter((m): m is MetaCamada => Boolean(m));
  if (metas.length === 0) return null;
  const maisAntiga = [...metas].sort((a, b) => a.atualizadoEm.localeCompare(b.atualizadoEm))[0];
  const origem = metas.reduce<OrigemLeitura>(
    (pior, m) => (PESO_ORIGEM[m.origem] > PESO_ORIGEM[pior] ? m.origem : pior),
    "ao-vivo",
  );
  const erros = metas.filter((m) => m.erro).map((m) => `${m.camada ?? m.fonte}: ${m.erro}`);
  return { atualizadoEm: maisAntiga.atualizadoEm, origem, erro: erros.length ? erros.join(" · ") : undefined };
}

/**
 * Bloco do mapa da Visão Geral: título, carimbo combinado das camadas (vindo
 * do onMeta do mapa) e aviso das camadas que falharam. O mapa filtra os
 * pontos com o mesmo período dos indicadores e se atualiza sozinho a cada 5 min.
 */
export function MapaVisaoGeral({ periodo }: { periodo: Pick<Periodo, "inicio" | "fim" | "rotulo"> }) {
  const [estados, setEstados] = useState<EstadoCamadas>({});

  const aoReceberMeta = useCallback((camada: CamadaMapaId, meta: MetaCamada | null, erro?: string) => {
    setEstados((atual) => ({
      ...atual,
      // Falha numa atualização não apaga o carimbo da leitura anterior.
      [camada]: { meta: meta ?? atual[camada]?.meta ?? null, erro: meta ? undefined : erro },
    }));
  }, []);

  const carimbo = useMemo(() => combinar(estados), [estados]);
  const comFalha = CAMADAS.filter((c) => estados[c]?.erro);

  return (
    <section aria-labelledby="mapa-titulo" className="flex min-w-0 flex-col gap-2.5">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 id="mapa-titulo" className="text-[15px] font-bold uppercase leading-tight tracking-[.03em] text-ink">
          Mapa de Minas Gerais
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {carimbo ? (
            <CarimboAtualizacao
              atualizadoEm={carimbo.atualizadoEm}
              origem={carimbo.origem}
              erro={carimbo.erro}
              fonte="Camadas do mapa (ArcGIS CBMMG)"
            />
          ) : (
            <span className="text-[12px] text-mut">Carregando camadas…</span>
          )}
          {comFalha.length ? (
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
