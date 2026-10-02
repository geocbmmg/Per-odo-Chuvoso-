import "server-only";
import type { PrevisaoLocal } from "@/lib/dominio/tipos";
import { env } from "@/lib/env";
import { buscarJson } from "@/lib/fontes/http";
import { obterLeituraServidor } from "@/lib/fontes/armazem-servidor";
import type { Leitura } from "@/lib/fontes/tipos";
import { SEDES_COBS } from "@/lib/territorio";
import { DIAS_EXIBIDOS, interpretarPrevisao, montarUrlPrevisao, type PontoPrevisao } from "./parser";

export const PONTOS_PREVISAO: PontoPrevisao[] = SEDES_COBS.map((s) => ({
  local: `${s.cob} — ${s.municipio}`,
  cob: s.cob,
  municipio: s.municipio,
  latitude: s.latitude,
  longitude: s.longitude,
}));

// Um dia além dos exibidos, para a janela de 72 h nunca ficar curta.
const DIAS = DIAS_EXIBIDOS + 1;

/**
 * Resposta fictícia no formato da Open-Meteo (modo exemplo): padrão de
 * pancadas à tarde, mais intenso nos COBs do leste/sul. Determinística.
 */
export function respostaExemploOpenMeteo(pontos: PontoPrevisao[], agora: Date): unknown[] {
  const offsetMs = -3 * 3_600_000;
  const local = new Date(agora.getTime() + offsetMs);
  const inicio = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return pontos.map((p, i) => {
    const time: string[] = [];
    const precipitation: number[] = [];
    const precipitation_probability: number[] = [];
    const intensidade = [1.2, 0.6, 1.6, 0.3, 1.0, 1.3][i % 6];
    for (let h = 0; h < DIAS * 24; h++) {
      const t = new Date(inicio + h * 3_600_000);
      time.push(t.toISOString().slice(0, 16));
      const horaDia = h % 24;
      const tarde = horaDia >= 14 && horaDia <= 20 ? Math.sin(((horaDia - 14) / 6) * Math.PI) : 0;
      const dia = Math.floor(h / 24);
      const mm = Math.round(tarde * intensidade * (dia === 1 ? 6 : 3) * 10) / 10;
      precipitation.push(mm);
      precipitation_probability.push(Math.min(95, Math.round(20 + tarde * 60 * intensidade)));
    }
    const daily = { time: [] as string[], precipitation_sum: [] as number[], precipitation_probability_max: [] as number[] };
    for (let d = 0; d < DIAS; d++) {
      daily.time.push(time[d * 24].slice(0, 10));
      const fatia = precipitation.slice(d * 24, d * 24 + 24);
      daily.precipitation_sum.push(Math.round(fatia.reduce((a, b) => a + b, 0) * 10) / 10);
      daily.precipitation_probability_max.push(Math.max(...precipitation_probability.slice(d * 24, d * 24 + 24)));
    }
    return {
      latitude: p.latitude,
      longitude: p.longitude,
      utc_offset_seconds: -10800,
      timezone: "America/Sao_Paulo",
      hourly: { time, precipitation, precipitation_probability },
      daily,
    };
  });
}

/**
 * Previsão de chuva nas sedes dos COBs (Open-Meteo). A resposta bruta fica em
 * cache (1 h); os acumulados são recalculados a partir da hora corrente.
 */
export async function obterPrevisaoCobs(agora: Date = new Date()): Promise<Leitura<PrevisaoLocal[]>> {
  const leitura = await obterLeituraServidor(
    "open-meteo-previsao",
    "sedes-cob",
    () => buscarJson<unknown>(montarUrlPrevisao(PONTOS_PREVISAO, DIAS), { timeoutMs: env().FONTES_TIMEOUT_MS }).then(
      (corpo) => {
        // Valida já na carga: resposta inválida não pode virar "última leitura válida".
        interpretarPrevisao(corpo, PONTOS_PREVISAO, agora);
        return corpo;
      },
    ),
    { exemplo: () => respostaExemploOpenMeteo(PONTOS_PREVISAO, agora) },
  );
  return { ...leitura, dados: interpretarPrevisao(leitura.dados, PONTOS_PREVISAO, agora) };
}
