import type { PrevisaoDia, PrevisaoHora, PrevisaoLocal, RotuloCob } from "@/lib/dominio/tipos";

/**
 * Cliente puro da Open-Meteo Forecast API (https://open-meteo.com/en/docs).
 *
 * Com várias coordenadas (latitude=a,b&longitude=c,d) a resposta é um ARRAY,
 * um objeto por ponto, na mesma ordem; com uma só, é um objeto. Com
 * timezone=America/Sao_Paulo, os horários vêm locais sem offset
 * ("2026-10-02T14:00") e `utc_offset_seconds` informa o deslocamento.
 * Erros vêm como HTTP 400 com {"error": true, "reason": "..."}.
 */

export const URL_OPEN_METEO = "https://api.open-meteo.com/v1/forecast";

export interface PontoPrevisao {
  local: string;
  cob: RotuloCob | null;
  municipio: string;
  latitude: number;
  longitude: number;
}

interface BlocoOpenMeteo {
  latitude?: number;
  longitude?: number;
  utc_offset_seconds?: number;
  hourly?: { time?: string[]; precipitation?: (number | null)[]; precipitation_probability?: (number | null)[] };
  daily?: {
    time?: string[];
    precipitation_sum?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
  };
}

export function montarUrlPrevisao(pontos: PontoPrevisao[], dias = 4): string {
  const params = new URLSearchParams({
    latitude: pontos.map((p) => p.latitude.toFixed(4)).join(","),
    longitude: pontos.map((p) => p.longitude.toFixed(4)).join(","),
    hourly: "precipitation,precipitation_probability",
    daily: "precipitation_sum,precipitation_probability_max",
    timezone: "America/Sao_Paulo",
    forecast_days: String(dias),
  });
  return `${URL_OPEN_METEO}?${params.toString()}`;
}

function offsetIso(segundos: number): string {
  const sinal = segundos < 0 ? "-" : "+";
  const abs = Math.abs(segundos);
  const h = String(Math.floor(abs / 3600)).padStart(2, "0");
  const m = String(Math.floor((abs % 3600) / 60)).padStart(2, "0");
  return `${sinal}${h}:${m}`;
}

function numeroOuNull(valor: number | null | undefined): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

/** Soma ignorando nulos; null se não houver nenhum valor. */
function somar(valores: (number | null)[]): number | null {
  const validos = valores.filter((v): v is number => v !== null);
  if (validos.length === 0) return null;
  return Math.round(validos.reduce((a, b) => a + b, 0) * 10) / 10;
}

function erroOpenMeteo(corpo: unknown): string | null {
  if (corpo && typeof corpo === "object" && !Array.isArray(corpo) && (corpo as { error?: unknown }).error) {
    return String((corpo as { reason?: unknown }).reason ?? "erro desconhecido");
  }
  return null;
}

/**
 * Converte a resposta em PrevisaoLocal[] na ordem de `pontos`.
 * Acumulados de 24 h e 72 h contam a partir da hora corrente (`agora`).
 */
export function interpretarPrevisao(corpo: unknown, pontos: PontoPrevisao[], agora: Date): PrevisaoLocal[] {
  const erro = erroOpenMeteo(corpo);
  if (erro) throw new Error(`Open-Meteo: ${erro}`);

  const blocos = (Array.isArray(corpo) ? corpo : [corpo]) as BlocoOpenMeteo[];
  if (blocos.length !== pontos.length) {
    throw new Error(`Open-Meteo devolveu ${blocos.length} pontos, esperados ${pontos.length}`);
  }

  return blocos.map((bloco, i) => {
    const ponto = pontos[i];
    const offset = offsetIso(bloco.utc_offset_seconds ?? -10800);
    const tempos = bloco.hourly?.time ?? [];
    const chuva = bloco.hourly?.precipitation ?? [];
    const prob = bloco.hourly?.precipitation_probability ?? [];

    const horaria: PrevisaoHora[] = tempos.map((t, j) => ({
      hora: `${t.length === 16 ? `${t}:00` : t}${offset}`,
      precipitacaoMm: numeroOuNull(chuva[j]),
      probabilidade: numeroOuNull(prob[j]),
    }));

    // Hora corrente: a última hora cujo início é <= agora.
    const inicioHoraAtual = agora.getTime() - (agora.getTime() % 3_600_000);
    const futuras = horaria.filter((h) => new Date(h.hora).getTime() >= inicioHoraAtual);
    const acumulado24hMm = futuras.length >= 24 ? somar(futuras.slice(0, 24).map((h) => h.precipitacaoMm)) : null;
    const acumulado72hMm = futuras.length >= 72 ? somar(futuras.slice(0, 72).map((h) => h.precipitacaoMm)) : null;

    const dias = bloco.daily?.time ?? [];
    const diaria: PrevisaoDia[] = dias.map((d, j) => ({
      data: d,
      precipitacaoMm: numeroOuNull(bloco.daily?.precipitation_sum?.[j]),
      probabilidadeMax: numeroOuNull(bloco.daily?.precipitation_probability_max?.[j]),
    }));

    return {
      ...ponto,
      acumulado24hMm,
      acumulado72hMm,
      diaria,
      horaria: futuras.slice(0, 72),
    };
  });
}
