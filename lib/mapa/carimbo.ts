import type { CamadaMapaId } from "@/lib/dominio/tipos";
import type { OrigemLeitura } from "@/lib/fontes/tipos";
import type { MetaCamada } from "./dados";
import { ehCamadaPontual, ROTULOS_CAMADAS } from "./simbologia";

/**
 * Carimbo "Atualizado às" do mapa inteiro, a partir do `onMeta` de cada
 * camada. Função pura (a página só guarda o estado e renderiza).
 */

/** Última notícia de uma camada: meta da última leitura válida e erro da última tentativa. */
export interface EstadoMetaCamada {
  meta: MetaCamada | null;
  erro?: string;
}

export type EstadosMetaCamadas = Partial<Record<CamadaMapaId, EstadoMetaCamada>>;

export type CarimboMapa =
  /** Nenhuma camada respondeu ainda (ou faltam respostas e nenhuma trouxe horário). */
  | { estado: "carregando" }
  /** Todas as camadas consideradas responderam com erro e nenhuma tem leitura anterior. */
  | { estado: "falha"; motivo: string }
  /** Responderam sem erro, mas sem horário de leitura (rota sem "meta"). */
  | { estado: "sem-horario" }
  | { estado: "ok"; atualizadoEm: string; origem: OrigemLeitura; erro?: string };

const PESO_ORIGEM: Record<OrigemLeitura, number> = {
  "ao-vivo": 0,
  cache: 1,
  "ultima-valida": 2,
  exemplo: 3,
};

/** Registra a resposta de uma camada. Falha numa atualização não apaga o meta da leitura anterior. */
export function registrarMeta(
  atual: EstadosMetaCamadas,
  camada: CamadaMapaId,
  meta: MetaCamada | null,
  erro?: string,
): EstadosMetaCamadas {
  return {
    ...atual,
    [camada]: { meta: meta ?? atual[camada]?.meta ?? null, erro: meta ? undefined : erro },
  };
}

function instante(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/**
 * Carimbo combinado: vale a leitura MAIS ANTIGA e a pior origem (o mapa é tão
 * atual quanto a camada mais atrasada). Só as camadas de PONTOS entram: os
 * limites dos COBs são lidos uma vez só (não se atualizam a cada 5 min) e
 * prenderiam o carimbo à hora em que a página abriu. Se `camadas` não tiver
 * nenhuma camada de pontos, usa as que houver.
 */
export function combinarCarimboMapa(
  estados: EstadosMetaCamadas,
  camadas: readonly CamadaMapaId[],
): CarimboMapa {
  const pontuais = camadas.filter(ehCamadaPontual);
  const consideradas: readonly CamadaMapaId[] = pontuais.length ? pontuais : camadas;

  const comMeta = consideradas.flatMap((camada) => {
    const meta = estados[camada]?.meta;
    return meta ? [{ camada, meta }] : [];
  });

  if (comMeta.length) {
    const maisAntiga = comMeta.reduce((a, b) => (instante(b.meta.atualizadoEm) < instante(a.meta.atualizadoEm) ? b : a));
    const origem = comMeta.reduce<OrigemLeitura>(
      (pior, { meta }) => (PESO_ORIGEM[meta.origem] > PESO_ORIGEM[pior] ? meta.origem : pior),
      "ao-vivo",
    );
    const erros = comMeta
      .filter(({ meta }) => meta.erro)
      .map(({ camada, meta }) => `${meta.camada ?? ROTULOS_CAMADAS[camada]}: ${meta.erro}`);
    return {
      estado: "ok",
      atualizadoEm: maisAntiga.meta.atualizadoEm,
      origem,
      ...(erros.length ? { erro: erros.join(" · ") } : {}),
    };
  }

  // Sem horário nenhum: só decide quando todas as consideradas responderam.
  if (consideradas.length === 0 || consideradas.some((camada) => !estados[camada])) return { estado: "carregando" };

  const falhas = consideradas.filter((camada) => estados[camada]?.erro);
  if (falhas.length === 0) return { estado: "sem-horario" };
  return { estado: "falha", motivo: descreverFalhas(falhas.map((c) => [c, estados[c]?.erro ?? ""] as const)) };
}

/** "Fonte indisponível no momento." (mesmo motivo em todas) ou "Alertas: …; Ações RRD: …". */
export function descreverFalhas(falhas: readonly (readonly [CamadaMapaId, string])[]): string {
  const motivos = falhas.map(([, erro]) => erro.trim() || "Falha ao carregar a camada.");
  if (new Set(motivos).size <= 1) return motivos[0] ?? "Falha ao carregar as camadas.";
  return falhas.map(([camada], i) => `${ROTULOS_CAMADAS[camada]}: ${motivos[i]}`).join("; ");
}
