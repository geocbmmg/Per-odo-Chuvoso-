import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/chuva/route";
import { montarPainelChuva, obterChuvaMunicipios, TAMANHO_RANKING } from "@/lib/dados/chuva";
import type { ChuvaMunicipio } from "@/lib/dominio/chuva";
import { gravidade, maisGrave, NIVEIS_RISCO, type NivelRisco } from "@/lib/dominio/matrizes";
import { reiniciarEnv } from "@/lib/env";
import { reiniciarLeituras } from "@/lib/fontes/leituras";
import { FonteIndisponivelError } from "@/lib/fontes/tipos";
import { respostaExemploMunicipios } from "@/lib/sources/exemplos/open-meteo-municipios";
import { obterSeriesChuvaMunicipios, PONTOS_MUNICIPIOS } from "@/lib/sources/open-meteo/municipios";
import {
  compactarRespostaMunicipios,
  ehCacheChuvaMunicipios,
  horasDaJanela,
  inicioDaJanela,
  montarConsultaMunicipios,
  resumirCacheChuva,
  type PontoMunicipio,
} from "@/lib/sources/open-meteo/parser-municipios";
import { MUNICIPIOS_MG, municipioPorNome } from "@/lib/territorio/municipios";

const BH: PontoMunicipio = { ibge: "3106200", latitude: -19.9167, longitude: -43.9345 };
const JF: PontoMunicipio = { ibge: "3136702", latitude: -21.7595, longitude: -43.3398 };

/** Bloco bruto como a API devolve: 120 h a partir de 02/10 00:00 (Brasília); `mm(k)` = registro k. */
function bloco(p: PontoMunicipio, mm: (k: number) => unknown, extra: Record<string, unknown> = {}) {
  const time: string[] = [];
  const precipitation: unknown[] = [];
  for (let k = 0; k < 120; k++) {
    const dia = 2 + Math.floor(k / 24);
    time.push(`2026-10-${String(dia).padStart(2, "0")}T${String(k % 24).padStart(2, "0")}:00`);
    precipitation.push(mm(k));
  }
  return {
    latitude: Math.round(p.latitude * 10) / 10,
    longitude: Math.round(p.longitude * 10) / 10,
    generationtime_ms: 0.3,
    utc_offset_seconds: -10800,
    timezone: "America/Sao_Paulo",
    timezone_abbreviation: "GMT-3",
    elevation: 850,
    hourly_units: { time: "iso8601", precipitation: "mm" },
    hourly: { time, precipitation },
    ...extra,
  };
}

/** 02/10 12:30 em Brasília: o 1º registro da janela é o das 13:00 (índice 13, 16:00Z). */
const AGORA = new Date("2026-10-02T15:30:00Z");

function nivelDe(nome: string, chuvas: readonly ChuvaMunicipio[]): ChuvaMunicipio | undefined {
  const m = municipioPorNome(nome);
  return chuvas.find((c) => c.ibge === m?.ibge);
}

describe("Open-Meteo nos municípios — consulta", () => {
  it("monta o corpo do POST com as 853 sedes, fuso de Brasília e 5 dias, bem abaixo de 128 KB", () => {
    const corpo = montarConsultaMunicipios(PONTOS_MUNICIPIOS);
    expect(corpo.get("latitude")!.split(",")).toHaveLength(853);
    expect(corpo.get("longitude")!.split(",")[0]).toBe(PONTOS_MUNICIPIOS[0].longitude.toFixed(4));
    expect(corpo.get("hourly")).toBe("precipitation");
    expect(corpo.get("timezone")).toBe("America/Sao_Paulo");
    expect(corpo.get("forecast_days")).toBe("5");
    expect(corpo.toString().length).toBeLessThan(32 * 1024);
  });
});

describe("Open-Meteo nos municípios — parser e cache compacto", () => {
  it("interpreta o array na ordem dos pontos e corta as horas que já passaram", () => {
    const corpo = [bloco(BH, (k) => k), bloco(JF, (k) => (k === 13 ? 2.346 : 0), { location_id: 1 })];
    const cache = compactarRespostaMunicipios(corpo, [BH, JF], AGORA);
    expect(cache.primeiraHoraIso).toBe("2026-10-02T16:00:00.000Z"); // registro das 13:00 locais
    expect(cache.offsetSegundos).toBe(-10800);
    expect(cache.modelo).toBe("best_match");
    expect(Object.keys(cache.series)).toEqual([BH.ibge, JF.ibge]);
    expect(cache.series[BH.ibge]).toHaveLength(120 - 13);
    expect(cache.series[BH.ibge].slice(0, 3)).toEqual([13, 14, 15]);
    expect(cache.series[JF.ibge][0]).toBe(2.35); // 2 casas
    expect(ehCacheChuvaMunicipios(cache)).toBe(true);
  });

  it("aceita objeto único quando há um só ponto", () => {
    const cache = compactarRespostaMunicipios(bloco(BH, () => 0.1), [BH], AGORA);
    expect(cache.series[BH.ibge].every((v) => v === 0.1)).toBe(true);
  });

  it("propaga o erro da API e recusa divergência de pontos", () => {
    expect(() =>
      compactarRespostaMunicipios({ error: true, reason: "Parameter 'latitude' and 'longitude' must have the same number of elements" }, [BH], AGORA),
    ).toThrow("Open-Meteo: Parameter 'latitude'");
    expect(() => compactarRespostaMunicipios([bloco(BH, () => 0)], [BH, JF], AGORA)).toThrow(/esperados 2/);
    expect(() => compactarRespostaMunicipios(null, [BH], AGORA)).toThrow(/fora do formato/);
  });

  it("recusa resposta fora de ordem (coordenadas ou location_id)", () => {
    const trocados = [bloco(JF, () => 0), bloco(BH, () => 0, { location_id: 1 })];
    expect(() => compactarRespostaMunicipios(trocados, [BH, JF], AGORA)).toThrow(/não conferem com 3106200/);
    const idErrado = [bloco(BH, () => 0), bloco(JF, () => 0, { location_id: 7 })];
    expect(() => compactarRespostaMunicipios(idErrado, [BH, JF], AGORA)).toThrow(/location_id 7/);
  });

  it("hora sem dado vira null; valor negativo ou não numérico também", () => {
    const corpo = bloco(BH, (k) => (k === 14 ? null : k === 15 ? -1 : k === 16 ? "x" : 1));
    const serie = compactarRespostaMunicipios(corpo, [BH], AGORA).series[BH.ibge];
    expect(serie.slice(0, 5)).toEqual([1, null, null, null, 1]);
  });

  it("resposta inválida nunca vira leitura: eixo quebrado, previsão curta ou tudo nulo", () => {
    const pulo = bloco(BH, () => 0);
    pulo.hourly.time[50] = "2026-10-04T05:00";
    expect(() => compactarRespostaMunicipios(pulo, [BH], AGORA)).toThrow(/sequência horária/);

    const curto = bloco(BH, () => 0);
    curto.hourly.time = curto.hourly.time.slice(0, 80);
    curto.hourly.precipitation = curto.hourly.precipitation.slice(0, 80);
    expect(() => compactarRespostaMunicipios(curto, [BH], AGORA)).toThrow(/mínimo 72 h/);

    expect(() => compactarRespostaMunicipios(bloco(BH, () => null), [BH], AGORA)).toThrow(/nenhuma hora/);

    const eixoDiferente = [bloco(BH, () => 0), bloco(JF, () => 0, { location_id: 1, utc_offset_seconds: 0 })];
    expect(() => compactarRespostaMunicipios(eixoDiferente, [BH, JF], AGORA)).toThrow(/eixo de tempo/);
  });

  it("reconhece cache fora do formato (ex.: leitura antiga no Postgres)", () => {
    expect(ehCacheChuvaMunicipios({ previsoes: [] })).toBe(false);
    expect(ehCacheChuvaMunicipios({ primeiraHoraIso: "x", offsetSegundos: 0, modelo: "m", series: {} })).toBe(false);
    expect(ehCacheChuvaMunicipios(null)).toBe(false);
  });

  it("o cache compacto das 853 sedes fica abaixo de 600 KB mesmo com chuva em todas as horas", () => {
    const corpo = PONTOS_MUNICIPIOS.map((p, i) =>
      bloco(p, (k) => Math.round(((k * 7 + i) % 400) + 1) / 10 + 10, i > 0 ? { location_id: i } : {}),
    );
    // Consulta logo após a meia-noite: quase nada é cortado.
    const cache = compactarRespostaMunicipios(corpo, PONTOS_MUNICIPIOS, new Date("2026-10-02T03:10:00Z"));
    expect(cache.series[PONTOS_MUNICIPIOS[0].ibge]).toHaveLength(119);
    expect(JSON.stringify(cache).length).toBeLessThan(600 * 1024);
  });
});

describe("Open-Meteo nos municípios — janelas a partir de agora", () => {
  // Registro 12 (12:00 local, chuva das 11 às 12) já passou às 12:30; o 13 cobre a hora em curso.
  const corpo = bloco(BH, (k) => (k === 12 ? 50 : k === 13 ? 20 : k === 37 ? 7 : 0));
  const cacheCompleto = compactarRespostaMunicipios(corpo, [BH], new Date("2026-10-02T03:00:00Z"));

  it("começa no registro de floor(agora)+1h e expõe a hora cheia corrente", () => {
    const { inicioJanela, indice } = inicioDaJanela(cacheCompleto, AGORA);
    expect(inicioJanela).toBe("2026-10-02T15:00:00.000Z"); // 12:00 em Brasília
    expect(cacheCompleto.series[BH.ibge][indice]).toBe(20);
    const r = resumirCacheChuva(cacheCompleto, [BH.ibge], AGORA);
    expect(r.inicioJanela).toBe("2026-10-02T15:00:00.000Z");
    // registros 13 a 36: só os 20 mm (o 37 fica fora das 24 h)
    expect(r.municipios[0]).toMatchObject({ acumulado24h: 20, maxHora24h: 20, acumulado72h: 27, nivel24h: "amarelo" });
  });

  it("a mesma leitura serve horas depois: a janela anda com o relógio", () => {
    // 13:05 locais: o registro das 13:00 (20 mm) já passou.
    const depois = resumirCacheChuva(cacheCompleto, [BH.ibge], new Date("2026-10-02T16:05:00Z"));
    expect(depois.inicioJanela).toBe("2026-10-02T16:00:00.000Z");
    expect(depois.municipios[0]).toMatchObject({ acumulado24h: 7, acumulado72h: 7, nivel24h: "amarelo" });
  });

  it("vira o dia: às 23:30 a janela começa no registro de 00:00 do dia seguinte", () => {
    const viradaCorpo = bloco(BH, (k) => (k === 23 ? 99 : k === 24 ? 10 : 0));
    const agora = new Date("2026-10-03T02:30:00Z"); // 02/10 23:30 em Brasília
    const cache = compactarRespostaMunicipios(viradaCorpo, [BH], agora);
    expect(cache.primeiraHoraIso).toBe("2026-10-03T03:00:00.000Z"); // 03/10 00:00 local
    const r = resumirCacheChuva(cache, [BH.ibge], agora);
    expect(r.inicioJanela).toBe("2026-10-03T02:00:00.000Z");
    expect(r.municipios[0].acumulado24h).toBe(10);
    expect(r.municipios[0].acumulado72h).toBe(10);
  });

  it("hora faltando ou janela além do fim da série deixa a janela sem dado (null)", () => {
    const comBuraco = compactarRespostaMunicipios(bloco(BH, (k) => (k === 20 ? null : 1)), [BH], AGORA);
    expect(resumirCacheChuva(comBuraco, [BH.ibge], AGORA).municipios[0]).toMatchObject({
      acumulado24h: null,
      nivel24h: null,
      nivel72h: null,
    });
    // Dois dias depois da leitura só restam 59 registros: 24 h ok, 72 h sem dado.
    const tarde = resumirCacheChuva(cacheCompleto, [BH.ibge], new Date("2026-10-04T15:30:00Z"));
    expect(tarde.municipios[0].acumulado24h).toBe(0);
    expect(tarde.municipios[0].acumulado72h).toBeNull();
    // Município sem série
    expect(resumirCacheChuva(cacheCompleto, ["3100104"], AGORA).municipios[0].nivel24h).toBeNull();
    expect(horasDaJanela([1, 2, 3], -1, 5)).toEqual([null, 1, 2, 3, null]);
  });
});

describe("Open-Meteo nos municípios — modo exemplo", () => {
  const instantes = ["2026-10-02T15:30:00Z", "2026-10-03T02:30:00Z", "2026-10-02T09:10:00Z", "2026-12-15T20:59:00Z"];

  it.each(instantes)("às %s gera os níveis do cenário (via o parser da produção)", (iso) => {
    const agora = new Date(iso);
    const bruto = respostaExemploMunicipios(PONTOS_MUNICIPIOS, agora);
    const cache = compactarRespostaMunicipios(bruto, PONTOS_MUNICIPIOS, agora);
    const { municipios } = resumirCacheChuva(cache, PONTOS_MUNICIPIOS.map((p) => p.ibge), agora);
    const conta = (janela: "nivel24h" | "nivel72h", nivel: NivelRisco) =>
      municipios.filter((m) => m[janela] === nivel).length;

    expect(municipios.every((m) => m.nivel24h !== null && m.nivel72h !== null)).toBe(true);
    for (const nivel of NIVEIS_RISCO) expect(conta("nivel72h", nivel)).toBeGreaterThan(0);
    for (const nivel of ["verde", "amarelo", "laranja"] as const) expect(conta("nivel24h", nivel)).toBeGreaterThan(0);
    expect(conta("nivel72h", "roxo")).toBeLessThanOrEqual(3);
    expect(conta("nivel72h", "vermelho")).toBeGreaterThanOrEqual(3);

    expect(nivelDe("Juiz de Fora", municipios)?.nivel72h).toBe("roxo");
    expect(nivelDe("Belo Horizonte", municipios)?.nivel24h).toBe("laranja");
    expect(nivelDe("Pouso Alegre", municipios)?.nivel72h).toBe("amarelo");
    expect(gravidade(nivelDe("Uberlândia", municipios)!.nivel72h!)).toBeGreaterThanOrEqual(1);
    // Norte de Minas seco
    const norte = MUNICIPIOS_MG.filter((m) => m.lat > -17.5).map((m) => m.ibge);
    expect(municipios.filter((m) => norte.includes(m.ibge)).every((m) => m.nivel72h === "verde")).toBe(true);
    expect(nivelDe("Montes Claros", municipios)?.acumulado72h).toBe(0);
  });

  it("é determinístico e segue o formato bruto da API", () => {
    const a = respostaExemploMunicipios(PONTOS_MUNICIPIOS, AGORA) as Record<string, unknown>[];
    const b = respostaExemploMunicipios(PONTOS_MUNICIPIOS, AGORA);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a).toHaveLength(853);
    expect(a[0]).not.toHaveProperty("location_id");
    expect(a[1]).toMatchObject({ location_id: 1, utc_offset_seconds: -10800, timezone: "America/Sao_Paulo" });
    const hourly = a[0].hourly as { time: string[]; precipitation: number[] };
    expect(hourly.time[0]).toBe("2026-10-02T00:00");
    expect(hourly.time).toHaveLength(120);
    expect(hourly.precipitation).toHaveLength(120);
  });
});

describe("painel de chuva: áreas e ranking", () => {
  const cache = compactarRespostaMunicipios(respostaExemploMunicipios(PONTOS_MUNICIPIOS, AGORA), PONTOS_MUNICIPIOS, AGORA);
  const painel = montarPainelChuva(cache, AGORA);
  const porIbge = new Map(painel.municipios.map((m) => [m.ibge, m]));

  it("traz os 853 municípios na ordem do território", () => {
    expect(painel.municipios.map((m) => m.ibge)).toEqual(MUNICIPIOS_MG.map((m) => m.ibge));
    expect(painel.inicioJanela).toBe("2026-10-02T15:00:00.000Z");
    expect(painel.modelo).toBe("best_match");
  });

  it.each(["24h", "72h"] as const)("agrega por COB e por UEOp de forma coerente com os municípios (%s)", (janela) => {
    const campo = janela === "24h" ? "nivel24h" : "nivel72h";
    const { cob, ueop } = painel.areas[janela];
    expect(cob.map((a) => a.chave)).toEqual(["1º COB", "2º COB", "3º COB", "4º COB", "5º COB", "6º COB"]);
    expect(cob.reduce((s, a) => s + a.totalMunicipios, 0)).toBe(853);
    expect(ueop.reduce((s, a) => s + a.totalMunicipios, 0)).toBe(853);

    for (const area of [...cob, ...ueop]) {
      const membros = MUNICIPIOS_MG.filter((m) => m.cob === area.cob && (area.ueop === null || m.ueop === area.ueop));
      const niveis = membros.map((m) => porIbge.get(m.ibge)![campo]);
      expect(area.totalMunicipios).toBe(membros.length);
      for (const n of NIVEIS_RISCO) expect(area.contagem[n]).toBe(niveis.filter((x) => x === n).length);
      expect(area.nivel).toBe(maisGrave(...niveis));
      expect(porIbge.get(area.piorMunicipio!.ibge)![campo]).toBe(area.nivel);
    }
    // A soma das UEOp de cada COB fecha com o COB.
    for (const c of cob) {
      const filhas = ueop.filter((u) => u.cob === c.cob);
      for (const n of NIVEIS_RISCO) expect(filhas.reduce((s, u) => s + u.contagem[n], 0)).toBe(c.contagem[n]);
    }
    expect(cob.find((a) => a.cob === "3º COB")?.nivel).toBe(janela === "72h" ? "roxo" : "amarelo");
  });

  it("ranqueia os 15 maiores acumulados, com território e nível da janela", () => {
    const { acumulado24h, pior24hEm72h } = painel.ranking;
    expect(acumulado24h).toHaveLength(TAMANHO_RANKING);
    expect(pior24hEm72h).toHaveLength(TAMANHO_RANKING);
    for (const lista of [acumulado24h, pior24hEm72h]) {
      const campo = lista === acumulado24h ? "acumulado24h" : "pior24hEm72h";
      const valores = lista.map((i) => i[campo]!);
      expect([...valores].sort((a, b) => b - a)).toEqual(valores);
    }
    expect(pior24hEm72h[0]).toMatchObject({ nome: "Juiz de Fora", cob: "3º COB", nivel: "roxo" });
    expect(pior24hEm72h[0].ueop).toBe(municipioPorNome("Juiz de Fora")!.ueop);
    expect(acumulado24h.every((i) => i.nivel === i.nivel24h)).toBe(true);
    expect(pior24hEm72h.every((i) => i.nivel === i.nivel72h)).toBe(true);
    // O maior acumulado de 24 h é na Grande BH.
    expect(acumulado24h[0].cob).toBe("1º COB");
  });
});

describe("dados e rota /api/chuva", () => {
  beforeEach(() => {
    reiniciarLeituras();
    vi.stubEnv("ARMAZEM_LEITURAS", "memoria");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    reiniciarEnv();
    reiniciarLeituras();
  });

  it("com DADOS_EXEMPLO=1 responde sem rede, com carimbo de exemplo", async () => {
    vi.stubEnv("DADOS_EXEMPLO", "1");
    reiniciarEnv();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const dados = await obterChuvaMunicipios(AGORA);
    expect(dados.meta).toMatchObject({ fonte: "open-meteo-municipios", origem: "exemplo" });
    expect(dados.inicioJanela).toBe("2026-10-02T15:00:00.000Z");
    expect(dados.credito).toBe("Previsão: Open-Meteo.com (CC BY 4.0)");

    const resposta = await GET();
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("Cache-Control")).toBe("no-store");
    const corpo = await resposta.json();
    expect(Object.keys(corpo).sort()).toEqual(
      ["areas", "credito", "inicioJanela", "meta", "modelo", "municipios", "ranking"].sort(),
    );
    expect(corpo.municipios).toHaveLength(853);
    expect(corpo.areas["24h"].cob).toHaveLength(6);
    expect(corpo.areas["72h"].ueop.length).toBeGreaterThan(6);
    expect(corpo.ranking.pior24hEm72h).toHaveLength(TAMANHO_RANKING);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("produção: um POST em formulário com as 853 sedes; a leitura válida é o cache compacto", async () => {
    vi.stubEnv("DADOS_EXEMPLO", "0");
    reiniciarEnv();
    const agora = new Date();
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      void init;
      return Response.json(respostaExemploMunicipios(PONTOS_MUNICIPIOS, agora));
    });
    vi.stubGlobal("fetch", fetch);

    const leitura = await obterSeriesChuvaMunicipios(agora);
    expect(leitura.origem).toBe("ao-vivo");
    expect(Object.keys(leitura.dados.series)).toHaveLength(853);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.open-meteo.com/v1/forecast");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(URLSearchParams);
    expect((init?.body as URLSearchParams).get("latitude")!.split(",")).toHaveLength(853);

    // Segunda chamada: cache (3 h), sem nova consulta.
    const resposta = await GET();
    expect(resposta.status).toBe(200);
    expect((await resposta.json()).meta.origem).toBe("cache");
    expect(resposta.headers.get("Cache-Control")).toContain("s-maxage=300");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("produção sem leitura anterior: 429 vira 503 com o motivo da Open-Meteo", async () => {
    vi.stubEnv("DADOS_EXEMPLO", "0");
    reiniciarEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: true, reason: "Daily API request limit exceeded. Please try again tomorrow." }, { status: 429 }),
      ),
    );
    await expect(obterSeriesChuvaMunicipios()).rejects.toBeInstanceOf(FonteIndisponivelError);
    const resposta = await GET();
    expect(resposta.status).toBe(503);
    const corpo = await resposta.json();
    expect(corpo.fonte).toBe("open-meteo-municipios");
    expect(corpo.detalhe).toContain("Daily API request limit exceeded");
  });

  it("produção: resposta inválida não substitui a última leitura válida", async () => {
    vi.stubEnv("DADOS_EXEMPLO", "0");
    reiniciarEnv();
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-02T15:30:00Z"));
      vi.stubGlobal("fetch", vi.fn(async () => Response.json(respostaExemploMunicipios(PONTOS_MUNICIPIOS, AGORA))));
      const valida = await obterSeriesChuvaMunicipios(AGORA);
      expect(valida.origem).toBe("ao-vivo");

      // 4 h depois (cache vencido) a fonte devolve um bloco só: a leitura válida continua a anterior.
      vi.setSystemTime(new Date("2026-10-02T19:30:00Z"));
      vi.stubGlobal("fetch", vi.fn(async () => Response.json([{ latitude: 0 }])));
      const depois = await obterSeriesChuvaMunicipios(new Date());
      expect(depois.origem).toBe("ultima-valida");
      expect(depois.erro).toMatch(/esperados 853/);
      expect(depois.atualizadoEm).toBe(valida.atualizadoEm);
      expect(depois.dados).toEqual(valida.dados);
    } finally {
      vi.useRealTimers();
    }
  });
});
