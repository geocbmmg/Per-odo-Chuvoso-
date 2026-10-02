import { describe, expect, it } from "vitest";
import { interpretarPrevisao, montarUrlPrevisao, type PontoPrevisao } from "@/lib/sources/open-meteo/parser";

const pontos: PontoPrevisao[] = [
  { local: "1º COB — Belo Horizonte", cob: "1º COB", municipio: "Belo Horizonte", latitude: -19.92, longitude: -43.94 },
  { local: "3º COB — Juiz de Fora", cob: "3º COB", municipio: "Juiz de Fora", latitude: -21.76, longitude: -43.35 },
];

/** Bloco no formato da API: 96 horas a partir de 02/10 00:00 (Brasília). */
function bloco(lat: number, lon: number, mmPorHora: (h: number) => number | null) {
  const time: string[] = [];
  const precipitation: (number | null)[] = [];
  const precipitation_probability: (number | null)[] = [];
  for (let h = 0; h < 96; h++) {
    const dia = 2 + Math.floor(h / 24);
    time.push(`2026-10-${String(dia).padStart(2, "0")}T${String(h % 24).padStart(2, "0")}:00`);
    precipitation.push(mmPorHora(h));
    precipitation_probability.push(h < 24 ? 80 : 40);
  }
  return {
    latitude: lat,
    longitude: lon,
    generationtime_ms: 0.5,
    utc_offset_seconds: -10800,
    timezone: "America/Sao_Paulo",
    timezone_abbreviation: "GMT-3",
    elevation: 850,
    hourly_units: { time: "iso8601", precipitation: "mm", precipitation_probability: "%" },
    hourly: { time, precipitation, precipitation_probability },
    daily_units: { time: "iso8601", precipitation_sum: "mm", precipitation_probability_max: "%" },
    daily: {
      time: ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"],
      precipitation_sum: [24, 12, 0, null],
      precipitation_probability_max: [90, 60, 10, null],
    },
  };
}

describe("Open-Meteo", () => {
  it("monta a URL com vários pontos, fuso de Brasília e 4 dias", () => {
    const url = new URL(montarUrlPrevisao(pontos));
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(url.searchParams.get("latitude")).toBe("-19.9200,-21.7600");
    expect(url.searchParams.get("longitude")).toBe("-43.9400,-43.3500");
    expect(url.searchParams.get("timezone")).toBe("America/Sao_Paulo");
    expect(url.searchParams.get("forecast_days")).toBe("4");
    expect(url.searchParams.get("hourly")).toBe("precipitation,precipitation_probability");
  });

  it("interpreta a resposta em array e calcula acumulados a partir da hora atual", () => {
    const corpo = [bloco(-19.92, -43.94, () => 1), bloco(-21.76, -43.35, (h) => (h < 30 ? 0.5 : null))];
    // 02/10 12:30 em Brasília = 15:30Z → hora corrente começa às 12:00 local (índice 12)
    const agora = new Date("2026-10-02T15:30:00Z");
    const [bh, jf] = interpretarPrevisao(corpo, pontos, agora);

    expect(bh.local).toBe("1º COB — Belo Horizonte");
    expect(bh.horaria[0].hora).toBe("2026-10-02T12:00:00-03:00");
    expect(bh.acumulado24hMm).toBe(24);
    expect(bh.acumulado72hMm).toBe(72);
    expect(bh.diaria[0]).toEqual({ data: "2026-10-02", precipitacaoMm: 24, probabilidadeMax: 90 });
    expect(bh.diaria[3]).toEqual({ data: "2026-10-05", precipitacaoMm: null, probabilidadeMax: null });

    // JF: chuva só até a hora 29 (18 horas a partir das 12:00) → 9 mm; nulos ignorados
    expect(jf.acumulado24hMm).toBe(9);
    expect(jf.acumulado72hMm).toBe(9);
  });

  it("aceita objeto único quando há um só ponto", () => {
    const [bh] = interpretarPrevisao(bloco(-19.92, -43.94, () => 0), [pontos[0]], new Date("2026-10-02T15:30:00Z"));
    expect(bh.acumulado24hMm).toBe(0);
  });

  it("não inventa acumulado quando faltam horas", () => {
    const curto = bloco(-19.92, -43.94, () => 1);
    curto.hourly.time = curto.hourly.time.slice(0, 20);
    curto.hourly.precipitation = curto.hourly.precipitation.slice(0, 20);
    const [bh] = interpretarPrevisao(curto, [pontos[0]], new Date("2026-10-02T15:30:00Z"));
    expect(bh.acumulado24hMm).toBeNull();
    expect(bh.acumulado72hMm).toBeNull();
  });

  it("propaga erro da API e divergência de pontos", () => {
    expect(() =>
      interpretarPrevisao({ error: true, reason: "Latitude must be in range of -90 to 90°." }, pontos, new Date()),
    ).toThrow("Open-Meteo: Latitude must be in range");
    expect(() => interpretarPrevisao([bloco(0, 0, () => 0)], pontos, new Date())).toThrow(/esperados 2/);
  });
});

describe("Open-Meteo — modo exemplo", () => {
  it("gera resposta válida para as 6 sedes de COB", async () => {
    const { PONTOS_PREVISAO, respostaExemploOpenMeteo } = await import("@/lib/sources/open-meteo");
    const agora = new Date("2026-10-02T15:30:00Z");
    const previsoes = interpretarPrevisao(respostaExemploOpenMeteo(PONTOS_PREVISAO, agora), PONTOS_PREVISAO, agora);
    expect(previsoes.map((p) => p.cob)).toEqual(["1º COB", "2º COB", "3º COB", "4º COB", "5º COB", "6º COB"]);
    expect(previsoes.every((p) => p.acumulado24hMm !== null && p.acumulado72hMm !== null)).toBe(true);
    expect(previsoes[0].horaria[0].hora).toBe("2026-10-02T12:00:00-03:00");
    expect(previsoes[0].diaria).toHaveLength(4);
  });
});
