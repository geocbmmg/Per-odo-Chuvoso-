import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createExpression,
  latest,
  validateStyleMin,
  type StylePropertySpecification,
} from "@maplibre/maplibre-gl-style-spec";
import type { ExpressionSpecification } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { obterChuvaMunicipios } from "@/lib/dados/chuva";
import { obterRisco } from "@/lib/dados/risco";
import type { ChuvaMunicipio } from "@/lib/dominio/chuva";
import { CORES_NIVEL, descreverFaixa, MATRIZ_CHUVA, NIVEIS_RISCO, type NivelRisco } from "@/lib/dominio/matrizes";
import { agregarPorArea, type MunicipioTerritorio } from "@/lib/dominio/risco";
import { reiniciarEnv } from "@/lib/env";
import { reiniciarLeituras } from "@/lib/fontes/leituras";
import {
  ErroDadosMapa,
  interpretarMalha,
  interpretarRespostaChuva,
  interpretarRespostaRisco,
} from "@/lib/mapa/dados-risco";
import {
  buscaDaSelecao,
  camadasIndisponiveis,
  chaveDaArea,
  conteudoBalaoArea,
  conteudoBalaoMunicipio,
  COR_SEM_DADO,
  criterioDoNivel,
  dadosDaPintura,
  ENTRADA_AREA,
  envelopeDaGeometria,
  expressaoCorPorChave,
  expressaoCorRisco,
  ID_CAMADAS_RISCO,
  indexarMalha,
  legendaDaPintura,
  lerSelecaoDaUrl,
  listaMunicipiosEmRisco,
  listaRankingChuva,
  montarEstiloRisco,
  nivelDoZoom,
  nivelEfetivo,
  niveisDaPintura,
  nomeDoNivel,
  opacidadeContornoMunicipal,
  PINTURAS_RISCO,
  resumoPorCob,
  rotuloDoNivel,
  rotulosDasAreas,
  rotulosDeslocados,
  rotulosSemSobreposicao,
  SELECAO_PADRAO,
  textoVigencia,
  valorPorNivel,
  ZOOM_AREA_MUNICIPIO,
  ZOOM_AREA_UEOP,
  type ColecaoPoligonos,
  type DadosPintura,
  type LeituraCliente,
  type RespostaChuvaMapa,
  type RespostaRiscoMapa,
} from "@/lib/mapa/risco";
import { MUNICIPIOS_MG, municipioPorIbge } from "@/lib/territorio/municipios";

// ---------------------------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------------------------

function hexParaRgba(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},1)`;
}

const SEM_DADO_RGBA = "rgba(0,0,0,0)";

/** Avalia a cor do preenchimento (expressão composta: zoom + feição) como o MapLibre. */
function avaliarCor(expressao: unknown, zoom: number, propriedades: Record<string, unknown>): string {
  const spec = latest.paint_fill["fill-color"] as unknown as StylePropertySpecification;
  const resultado = createExpression(expressao, "cor", spec);
  if (resultado.result !== "success") throw new Error(JSON.stringify(resultado.value));
  const cor = resultado.value.evaluate({ zoom }, { type: "Polygon", properties: propriedades }) as {
    toString(): string;
  };
  return cor.toString().replace(/\s/g, "");
}

const cor = (nivel: NivelRisco) => hexParaRgba(CORES_NIVEL[nivel].fundo);

/** Território de teste: 2 COBs, 3 UEOp, 5 municípios. */
const TERRITORIO: (MunicipioTerritorio & { fracao: string | null; lat: number; lon: number })[] = [
  { ibge: "3100001", nome: "Alfa", cob: "1º COB", ueop: "1º BBM", fracao: "1ª Cia", lat: -19, lon: -44 },
  { ibge: "3100002", nome: "Beta", cob: "1º COB", ueop: "1º BBM", fracao: null, lat: -19.2, lon: -44.1 },
  { ibge: "3100003", nome: "Gama", cob: "1º COB", ueop: "2º BBM", fracao: "2ª Cia", lat: -19.5, lon: -44.3 },
  { ibge: "3100004", nome: "Delta", cob: "2º COB", ueop: "8º BBM", fracao: null, lat: -18.9, lon: -47.9 },
  { ibge: "3100005", nome: "Épsilon", cob: "2º COB", ueop: "8º BBM", fracao: null, lat: -18.7, lon: -47.5 },
];

function chuva(
  ibge: string,
  acumulado24h: number,
  nivel24h: NivelRisco | null,
  nivel72h: NivelRisco | null = nivel24h,
): ChuvaMunicipio {
  return {
    ibge,
    maxHora24h: 7.5,
    acumulado24h,
    maxHora72h: 9,
    pior24hEm72h: acumulado24h + 10,
    acumulado72h: acumulado24h * 2,
    nivel24h,
    nivel72h,
  };
}

function respostaChuva(): RespostaChuvaMapa {
  const municipios = [
    chuva("3100001", 95, "laranja", "vermelho"),
    chuva("3100002", 61, "amarelo"),
    chuva("3100003", 10, "verde"),
    chuva("3100004", 2, "verde"),
    { ...chuva("3100005", 0, null), acumulado24h: null, maxHora24h: null },
  ];
  const areas = (janela: "24h" | "72h") => {
    const niveis = new Map<string, NivelRisco>();
    for (const m of municipios) {
      const n = janela === "24h" ? m.nivel24h : m.nivel72h;
      if (n) niveis.set(m.ibge, n);
    }
    return { cob: agregarPorArea(TERRITORIO, niveis, "cob"), ueop: agregarPorArea(TERRITORIO, niveis, "ueop") };
  };
  const ranking = municipios
    .filter((m) => (m.acumulado24h ?? 0) > 0)
    .map((m) => {
      const t = TERRITORIO.find((x) => x.ibge === m.ibge)!;
      return { ...m, nome: t.nome, cob: t.cob, ueop: t.ueop, nivel: m.nivel24h };
    });
  return {
    meta: { fonte: "open-meteo-municipios", atualizadoEm: "2026-10-02T19:00:00.000Z", origem: "exemplo" },
    credito: "Previsão: Open-Meteo.com (CC BY 4.0)",
    inicioJanela: "2026-10-02T19:00:00.000Z",
    modelo: "best_match",
    municipios,
    areas: { "24h": areas("24h"), "72h": areas("72h") },
    ranking: { acumulado24h: ranking, pior24hEm72h: ranking },
  };
}

function leitura<T>(dados: T | null, erro: string | null = null): LeituraCliente<T> {
  return { dados, erro, carregando: false };
}

function dadosChuva(janela: "24h" | "72h" = "24h"): DadosPintura {
  const estado = dadosDaPintura(
    { pintura: "chuva", janela },
    leitura(respostaChuva()),
    leitura<RespostaRiscoMapa>(null),
  );
  if (estado.estado !== "ok") throw new Error("esperado ok");
  return estado.dados;
}

function respostaRisco(): RespostaRiscoMapa {
  const itemInmet = {
    nivel: "laranja" as const,
    titulo: "Chuvas Intensas · Perigo",
    fonte: "INMET",
    inicio: "2026-10-02T15:00:00.000Z",
    fim: "2026-10-03T17:00:00.000Z",
    ref: "56012",
  };
  const itemCemaden = {
    nivel: "vermelho" as const,
    titulo: "Movimentos de Massa · Muito Alto",
    fonte: "Cemaden/MCTI",
    inicio: "2026-10-02T17:30:00.000Z",
    fim: null,
    ref: "2104",
  };
  const meteo = [{ ibge: "3100001", nivel: "laranja" as const, itens: [itemInmet] }];
  const geo = [{ ibge: "3100003", nivel: "vermelho" as const, itens: [itemCemaden] }];
  const areasDe = (lista: { ibge: string; nivel: NivelRisco }[]) => {
    const niveis = new Map(lista.map((m) => [m.ibge, m.nivel]));
    return { cob: agregarPorArea(TERRITORIO, niveis, "cob"), ueop: agregarPorArea(TERRITORIO, niveis, "ueop") };
  };
  const meta = { fontes: ["inmet-municipios"], atualizadoEm: "2026-10-02T19:10:00.000Z", origem: "exemplo" as const };
  const combinado = [
    {
      ibge: "3100001",
      nivel: "laranja" as const,
      camadas: ["meteorologico" as const],
      itens: [{ ...itemInmet, camada: "meteorologico" as const }],
    },
    {
      ibge: "3100003",
      nivel: "vermelho" as const,
      camadas: ["geologico" as const],
      itens: [{ ...itemCemaden, camada: "geologico" as const }],
    },
  ];
  return {
    geradoEm: "2026-10-02T19:10:00.000Z",
    camadas: {
      meteorologico: {
        id: "meteorologico",
        rotulo: "Meteorológico",
        camada: {
          id: "meteorologico",
          municipios: meteo,
          cobertura: "Sem aviso não quer dizer sem chuva.",
          credito: "Avisos: INMET (domínio público)",
        },
        meta,
        erro: null,
        areas: areasDe(meteo),
      },
      geologico: {
        id: "geologico",
        rotulo: "Geológico",
        camada: {
          id: "geologico",
          municipios: geo,
          cobertura: "Sem alerta não quer dizer sem risco.",
          credito: "Alertas: Cemaden/MCTI",
        },
        meta: { ...meta, fontes: ["cemaden-alertas"] },
        erro: null,
        areas: areasDe(geo),
      },
      hidrologico: {
        id: "hidrologico",
        rotulo: "Hidrológico",
        camada: {
          id: "hidrologico",
          municipios: [],
          cobertura: "Sem alerta não quer dizer sem risco.",
          credito: "Alertas: Cemaden/MCTI",
        },
        meta: { ...meta, fontes: ["cemaden-alertas"] },
        erro: null,
        areas: areasDe([]),
      },
      "alertas-cbmmg": {
        id: "alertas-cbmmg",
        rotulo: "Alertas do CBMMG",
        camada: null,
        meta: null,
        erro: "Emissão de Alertas indisponível e sem leitura anterior (timeout)",
        areas: null,
      },
    },
    combinado: {
      municipios: combinado,
      areas: areasDe(combinado),
      camadas: ["meteorologico", "geologico", "hidrologico"],
      indisponiveis: ["alertas-cbmmg"],
    },
    meta: { atualizadoEm: "2026-10-02T19:10:00.000Z", origem: "exemplo" },
  };
}

function dadosRisco(pintura: "meteorologico" | "geologico" | "combinado"): DadosPintura {
  const estado = dadosDaPintura({ pintura, janela: "24h" }, leitura<RespostaChuvaMapa>(null), leitura(respostaRisco()));
  if (estado.estado !== "ok") throw new Error("esperado ok");
  return estado.dados;
}

const props = (ibge: string) => {
  const t = TERRITORIO.find((m) => m.ibge === ibge)!;
  return { ibge: t.ibge, nome: t.nome, cob: t.cob, ueop: t.ueop };
};

// ---------------------------------------------------------------------------------------------
// Seleção pela URL
// ---------------------------------------------------------------------------------------------

describe("seleção da camada pela URL", () => {
  it("sem parâmetros: chuva, próximas 24 h, nível automático", () => {
    expect(lerSelecaoDaUrl({})).toEqual(SELECAO_PADRAO);
    expect(SELECAO_PADRAO).toEqual({ pintura: "chuva", janela: "24h", nivel: "auto" });
  });

  it("lê ?camada, ?janela e ?nivel (objeto da página ou URLSearchParams)", () => {
    expect(lerSelecaoDaUrl({ camada: "geologico", janela: "72h", nivel: "ueop" })).toEqual({
      pintura: "geologico",
      janela: "72h",
      nivel: "ueop",
    });
    expect(lerSelecaoDaUrl(new URLSearchParams("camada=alertas-cbmmg&nivel=municipio"))).toEqual({
      pintura: "alertas-cbmmg",
      janela: "24h",
      nivel: "municipio",
    });
    // Repetido: vale o primeiro; caixa e espaços não importam.
    expect(lerSelecaoDaUrl({ camada: [" Combinado ", "chuva"] }).pintura).toBe("combinado");
  });

  it("valor desconhecido cai no padrão (nunca quebra a página)", () => {
    expect(lerSelecaoDaUrl({ camada: "<script>", janela: "48h", nivel: "estado" })).toEqual(SELECAO_PADRAO);
  });

  it("toda pintura do seletor é aceita pela URL", () => {
    for (const pintura of PINTURAS_RISCO) expect(lerSelecaoDaUrl({ camada: pintura }).pintura).toBe(pintura);
  });

  it("monta a busca sem os valores padrão e preserva os outros parâmetros", () => {
    expect(buscaDaSelecao(SELECAO_PADRAO)).toBe("");
    expect(buscaDaSelecao({ pintura: "chuva", janela: "72h", nivel: "auto" }, "?x=1")).toBe("?x=1&janela=72h");
    expect(buscaDaSelecao({ pintura: "hidrologico", janela: "24h", nivel: "cob" }, "?camada=chuva&janela=72h")).toBe(
      "?camada=hidrologico&nivel=cob",
    );
    // A janela só vale para a chuva.
    expect(buscaDaSelecao({ pintura: "combinado", janela: "72h", nivel: "auto" })).toBe("?camada=combinado");
  });

  it("ida e volta: a busca gerada é lida de novo igual", () => {
    const selecao = { pintura: "chuva", janela: "72h", nivel: "municipio" } as const;
    expect(lerSelecaoDaUrl(new URLSearchParams(buscaDaSelecao(selecao)))).toEqual(selecao);
  });
});

// ---------------------------------------------------------------------------------------------
// Zoom pela hierarquia
// ---------------------------------------------------------------------------------------------

describe("nível pelo zoom (COB → UEOp → município)", () => {
  it("limiares inteiros: o tile da fonte GeoJSON é gerado em floor(zoom)", () => {
    expect(Number.isInteger(ZOOM_AREA_UEOP) && Number.isInteger(ZOOM_AREA_MUNICIPIO)).toBe(true);
    expect(ZOOM_AREA_UEOP).toBeLessThan(ZOOM_AREA_MUNICIPIO);
  });

  it.each([
    [4.6, "cob"],
    [5.5, "cob"],
    [ZOOM_AREA_UEOP - 0.01, "cob"],
    [ZOOM_AREA_UEOP, "ueop"],
    [ZOOM_AREA_MUNICIPIO - 0.01, "ueop"],
    [ZOOM_AREA_MUNICIPIO, "municipio"],
    [12, "municipio"],
  ] as const)("zoom %s → %s", (zoom, nivel) => {
    expect(nivelDoZoom(zoom)).toBe(nivel);
    expect(nivelEfetivo("auto", zoom)).toBe(nivel);
  });

  it("nível fixado pelo usuário ignora o zoom", () => {
    expect(nivelEfetivo("cob", 10)).toBe("cob");
    expect(nivelEfetivo("municipio", 4)).toBe("municipio");
  });

  it("valorPorNivel: step com ['zoom'] no automático, valor fixo quando fixado", () => {
    expect(valorPorNivel("auto", { cob: 1, ueop: 2, municipio: 3 })).toEqual([
      "step",
      ["zoom"],
      1,
      ZOOM_AREA_UEOP,
      2,
      ZOOM_AREA_MUNICIPIO,
      3,
    ]);
    expect(valorPorNivel("ueop", { cob: 1, ueop: 2, municipio: 3 })).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------
// Expressões de estilo
// ---------------------------------------------------------------------------------------------

describe("expressões de cor do preenchimento", () => {
  it("a chave de cada nível bate com a entrada do match (COB, COB · UEOp, IBGE)", () => {
    const p = props("3100003");
    for (const nivel of ["cob", "ueop", "municipio"] as const) {
      const spec = latest.paint_fill["fill-color"] as unknown as StylePropertySpecification;
      const entrada = createExpression(
        ["to-color", ["case", ["==", ENTRADA_AREA[nivel], chaveDaArea(nivel, p)], "#000001", "#ffffff"]],
        "x",
        spec,
      );
      if (entrada.result !== "success") throw new Error("expressão inválida");
      expect(
        entrada.value.evaluate({ zoom: 5 }, { type: "Polygon", properties: p }).toString().replace(/\s/g, ""),
      ).toBe("rgba(0,0,1,1)");
    }
    expect(chaveDaArea("ueop", p)).toBe("1º COB · 2º BBM");
  });

  it("match agrupado por nível, chaves ordenadas, sem dado transparente", () => {
    const niveis = new Map<string, NivelRisco>([
      ["b", "amarelo"],
      ["a", "amarelo"],
      ["c", "roxo"],
    ]);
    expect(expressaoCorPorChave(niveis, ["get", "x"])).toEqual([
      "match",
      ["get", "x"],
      ["a", "b"],
      CORES_NIVEL.amarelo.fundo,
      ["c"],
      CORES_NIVEL.roxo.fundo,
      COR_SEM_DADO,
    ]);
    expect(expressaoCorPorChave(new Map(), ["get", "x"])).toBe(COR_SEM_DADO);
  });

  it("automático: step com ['zoom'] no topo e um match por nível", () => {
    const expr = expressaoCorRisco(dadosChuva(), "auto") as ExpressionSpecification;
    expect(expr[0]).toBe("step");
    expect(expr[1]).toEqual(["zoom"]);
    expect((expr[2] as unknown[])[1]).toEqual(["get", "cob"]);
    expect((expr[4] as unknown[])[1]).toEqual(ENTRADA_AREA.ueop);
    expect((expr[6] as unknown[])[1]).toEqual(["get", "ibge"]);
  });

  it("zoom do Estado: todo município pinta com o pior nível do SEU COB", () => {
    const expr = expressaoCorRisco(dadosChuva(), "auto");
    // 1º COB tem um laranja (Alfa) → Gama (verde) também fica laranja.
    expect(avaliarCor(expr, 5, props("3100003"))).toBe(cor("laranja"));
    expect(avaliarCor(expr, 5, props("3100002"))).toBe(cor("laranja"));
    // 2º COB: Delta verde, Épsilon sem dado → verde.
    expect(avaliarCor(expr, 5, props("3100005"))).toBe(cor("verde"));
  });

  it("zoom intermediário: o nível agregado da UEOp", () => {
    const expr = expressaoCorRisco(dadosChuva(), "auto");
    expect(avaliarCor(expr, 6.5, props("3100002"))).toBe(cor("laranja")); // 1º BBM: Alfa laranja
    expect(avaliarCor(expr, 6.5, props("3100003"))).toBe(cor("verde")); // 2º BBM: só Gama
  });

  it("zoom alto: o nível do próprio município; sem dado fica sem preenchimento", () => {
    const expr = expressaoCorRisco(dadosChuva(), "auto");
    expect(avaliarCor(expr, 8, props("3100001"))).toBe(cor("laranja"));
    expect(avaliarCor(expr, 8, props("3100002"))).toBe(cor("amarelo"));
    expect(avaliarCor(expr, 8, props("3100003"))).toBe(cor("verde"));
    expect(avaliarCor(expr, 8, props("3100005"))).toBe(SEM_DADO_RGBA);
    // Município fora dos dados também.
    expect(avaliarCor(expr, 8, { ibge: "3199999", cob: "9º COB", ueop: "X" })).toBe(SEM_DADO_RGBA);
  });

  it("janela de 72 h usa o nível de 72 h", () => {
    const expr = expressaoCorRisco(dadosChuva("72h"), "auto");
    expect(avaliarCor(expr, 8, props("3100001"))).toBe(cor("vermelho"));
    expect(avaliarCor(expr, 5, props("3100003"))).toBe(cor("vermelho"));
  });

  it("nível fixado: o mesmo nível em qualquer zoom (sem step)", () => {
    const expr = expressaoCorRisco(dadosChuva(), "cob") as ExpressionSpecification;
    expect(expr[0]).toBe("match");
    expect(avaliarCor(expr, 12, props("3100003"))).toBe(cor("laranja"));
    const mun = expressaoCorRisco(dadosChuva(), "municipio");
    expect(avaliarCor(mun, 4, props("3100003"))).toBe(cor("verde"));
  });

  it("camada de risco: área sem alerta fica sem cor (sem cor não é sem risco)", () => {
    const expr = expressaoCorRisco(dadosRisco("geologico"), "auto");
    expect(avaliarCor(expr, 5, props("3100001"))).toBe(cor("vermelho")); // 1º COB tem Gama vermelho
    expect(avaliarCor(expr, 5, props("3100004"))).toBe(SEM_DADO_RGBA); // 2º COB sem alerta
    expect(avaliarCor(expr, 6.5, props("3100001"))).toBe(SEM_DADO_RGBA); // 1º BBM sem alerta
    expect(avaliarCor(expr, 8, props("3100003"))).toBe(cor("vermelho"));
  });

  it("sem dados (carregando): tudo transparente, sem erro", () => {
    expect(avaliarCor(expressaoCorRisco(null, "auto"), 8, props("3100001"))).toBe(SEM_DADO_RGBA);
  });

  it("as cores do mapa são as CORES_NIVEL (iguais nos dois temas)", () => {
    const escuro = montarEstiloRisco({ ...opcoesEstilo(), tema: "escuro" });
    const claro = montarEstiloRisco({ ...opcoesEstilo(), tema: "claro" });
    const corDe = (estilo: ReturnType<typeof montarEstiloRisco>) =>
      estilo.layers.find((l) => l.id === ID_CAMADAS_RISCO.preenchimento)!.paint;
    expect((corDe(escuro) as Record<string, unknown>)["fill-color"]).toEqual(
      (corDe(claro) as Record<string, unknown>)["fill-color"],
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Estilo completo
// ---------------------------------------------------------------------------------------------

const quadrado = (x: number, y: number, lado = 1) => [
  [
    [x, y],
    [x + lado, y],
    [x + lado, y + lado],
    [x, y + lado],
    [x, y],
  ],
];

const MALHA: ColecaoPoligonos = {
  type: "FeatureCollection",
  features: TERRITORIO.map((m, i) => ({
    type: "Feature",
    properties: { ibge: m.ibge, nome: m.nome, cob: m.cob, ueop: m.ueop },
    geometry: { type: "Polygon", coordinates: quadrado(-48 + i, -20) },
  })),
};

function opcoesEstilo() {
  return {
    base: "satelite" as const,
    tema: "escuro" as const,
    contornoMg: null,
    municipios: MALHA,
    ueops: null,
    cobs: null,
    dados: dadosChuva(),
    escolha: "auto" as const,
  };
}

describe("estilo do mapa de risco", () => {
  it("é um estilo válido (version 8, sem glyphs) nos dois temas e em todo nível", () => {
    for (const tema of ["escuro", "claro"] as const) {
      for (const escolha of ["auto", "cob", "ueop", "municipio"] as const) {
        const estilo = montarEstiloRisco({ ...opcoesEstilo(), tema, escolha });
        expect(validateStyleMin(estilo).map((e) => e.message)).toEqual([]);
        expect(estilo.glyphs).toBeUndefined();
      }
    }
    expect(
      validateStyleMin(montarEstiloRisco({ ...opcoesEstilo(), dados: null, municipios: null })).map((e) => e.message),
    ).toEqual([]);
  });

  it("ids de fontes e camadas estáveis (setStyle com diff) e malha sem nova simplificação", () => {
    const a = montarEstiloRisco(opcoesEstilo());
    const b = montarEstiloRisco({ ...opcoesEstilo(), dados: dadosRisco("combinado"), escolha: "ueop" });
    expect(Object.keys(a.sources)).toEqual(Object.keys(b.sources));
    expect(a.layers.map((l) => l.id)).toEqual(b.layers.map((l) => l.id));
    expect(a.sources["risco-municipios"]).toMatchObject({ promoteId: "ibge", tolerance: 0 });
    // A malha é a mesma referência: o diff não reenvia os 440 KB.
    expect((a.sources["risco-municipios"] as { data: unknown }).data).toBe(
      (b.sources["risco-municipios"] as { data: unknown }).data,
    );
  });

  it("contorno municipal só no nível do município; contorno da UEOp some no do COB", () => {
    const estilo = montarEstiloRisco(opcoesEstilo());
    const paint = (id: string) => estilo.layers.find((l) => l.id === id)!.paint as Record<string, unknown>;
    expect(paint(ID_CAMADAS_RISCO.contornoMunicipio)["line-opacity"]).toEqual(
      valorPorNivel("auto", { cob: 0, ueop: 0.16, municipio: 0.55 }),
    );
    // Nível fixado: o contorno municipal esmaece ao afastar.
    expect(opacidadeContornoMunicipal("municipio")).toEqual([
      "interpolate",
      ["linear"],
      ["zoom"],
      5,
      0.55 * 0.35,
      7.5,
      0.55,
    ]);
    expect(opacidadeContornoMunicipal("cob")).toBe(0);
    const ueop = montarEstiloRisco({ ...opcoesEstilo(), escolha: "cob" });
    expect(
      (ueop.layers.find((l) => l.id === ID_CAMADAS_RISCO.contornoUeop)!.paint as Record<string, unknown>)["line-width"],
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Legenda gerada das matrizes
// ---------------------------------------------------------------------------------------------

describe("legenda", () => {
  it("chuva: cinco níveis, nomes da matriz e critério gerado das faixas", () => {
    const legenda = legendaDaPintura("chuva", "24h");
    expect(legenda.itens.map((i) => i.nivel)).toEqual([...NIVEIS_RISCO]);
    expect(legenda.itens.map((i) => i.nome)).toEqual(["Normalidade", "Alerta", "Perigo", "Perigo severo", "Desastre"]);
    expect(legenda.itens.map((i) => i.criterio)).toEqual([
      "≤ 6 mm/h e < 60 mm em 24 h",
      "> 6 mm/h ou ≥ 60 mm em 24 h",
      "> 30 mm/h ou > 90 mm em 24 h",
      "> 70 mm/h ou > 120 mm em 24 h",
      "> 90 mm/h ou ≥ 170 mm em 24 h",
    ]);
    expect(legenda.semDado).toBe("Sem dado");
    expect(legenda.titulo).toBe("Chuva prevista · próximas 24 h");
  });

  it("o critério acompanha a matriz (nada digitado na legenda)", () => {
    for (const nivel of NIVEIS_RISCO.slice(1)) {
      const { mmHora, mm24h } = MATRIZ_CHUVA[nivel];
      expect(criterioDoNivel("chuva", nivel)).toBe(
        `${descreverFaixa({ ...mmHora, max: null }, "mm/h")} ou ${descreverFaixa({ ...mm24h, max: null }, "mm em 24 h")}`,
      );
    }
  });

  it("cor de cada item = CORES_NIVEL (os mesmos valores dos tokens --risco-*)", () => {
    for (const pintura of PINTURAS_RISCO) {
      for (const item of legendaDaPintura(pintura, "24h").itens) {
        expect(item.cor).toBe(CORES_NIVEL[item.nivel].fundo);
        expect(item.tinta).toBe(CORES_NIVEL[item.nivel].tinta);
        expect(item.nomeCor).toBe(CORES_NIVEL[item.nivel].nome);
      }
    }
  });

  it("geológico e hidrológico: os níveis que o Cemaden emite, com os nomes das matrizes", () => {
    expect(niveisDaPintura("geologico")).toEqual(["amarelo", "laranja", "vermelho"]);
    expect(legendaDaPintura("geologico", "24h").itens.map((i) => i.nome)).toEqual(["Moderado", "Alto", "Muito alto"]);
    expect(legendaDaPintura("hidrologico", "24h").itens.map((i) => i.nome)).toEqual(["Atenção", "Alerta", "Inundação"]);
    expect(criterioDoNivel("geologico", "laranja")).toBe("Alerta “Alto” do Cemaden");
    expect(legendaDaPintura("geologico", "24h").semDado).toBe("Sem alerta");
    // O verde da matriz geológica junta duas classes.
    expect(nomeDoNivel("geologico", "verde")).toBe("Extremamente baixo e muito baixo");
  });

  it("meteorológico: severidades do INMET (sem verde nem roxo)", () => {
    const legenda = legendaDaPintura("meteorologico", "24h");
    expect(legenda.itens.map((i) => [i.nivel, i.nome])).toEqual([
      ["amarelo", "Perigo potencial"],
      ["laranja", "Perigo"],
      ["vermelho", "Grande perigo"],
    ]);
    expect(legenda.itens[0].criterio).toBe("Aviso “Perigo potencial” do INMET");
  });

  it("combinada: a escala inteira, só com o nome da cor", () => {
    const legenda = legendaDaPintura("combinado", "24h");
    expect(legenda.itens).toHaveLength(5);
    expect(legenda.itens.every((i) => i.nome === null && i.criterio === null)).toBe(true);
    expect(rotuloDoNivel("combinado", "laranja")).toBe("Laranja");
  });

  it("nível presente nos dados fora da conversão esperada também entra", () => {
    expect(legendaDaPintura("geologico", "24h", ["roxo"]).itens.map((i) => i.nivel)).toEqual([
      "amarelo",
      "laranja",
      "vermelho",
      "roxo",
    ]);
  });

  it("rótulo do nível: cor + palavra", () => {
    expect(rotuloDoNivel("chuva", "vermelho")).toBe("Vermelho · Perigo severo");
    expect(rotuloDoNivel("hidrologico", "amarelo")).toBe("Amarelo · Atenção");
    expect(rotuloDoNivel("chuva", null)).toBe("Sem dado");
    expect(rotuloDoNivel("geologico", null)).toBe("Sem alerta");
  });
});

// ---------------------------------------------------------------------------------------------
// Balões
// ---------------------------------------------------------------------------------------------

describe("conteúdo dos balões", () => {
  it("área (COB): pior nível, municípios por nível, pior município e maior acumulado", () => {
    const balao = conteudoBalaoArea(dadosChuva(), "cob", "1º COB", TERRITORIO)!;
    expect(balao.tipo).toBe("COB");
    expect(balao.titulo).toBe("1º COB");
    expect(balao.nivel).toBe("laranja");
    expect(balao.rotuloNivel).toBe("Laranja · Perigo");
    expect(balao.totalMunicipios).toBe(3);
    expect(balao.contagem).toEqual([
      { nivel: "laranja", rotulo: "Laranja · Perigo", quantidade: 1 },
      { nivel: "amarelo", rotulo: "Amarelo · Alerta", quantidade: 1 },
      { nivel: "verde", rotulo: "Verde · Normalidade", quantidade: 1 },
    ]);
    expect(balao.campos).toEqual([
      { rotulo: "Pior município", valor: "Alfa" },
      { rotulo: "Maior acumulado em 24 h", valor: "Alfa — 95 mm" },
    ]);
    expect(balao.aproximar).toEqual({ nivel: "cob", chave: "1º COB", rotulo: "Aproximar em 1º COB" });
  });

  it("área (UEOp): COB, sem dado contado e nota da área aproximada", () => {
    const balao = conteudoBalaoArea(dadosChuva(), "ueop", "2º COB · 8º BBM", TERRITORIO)!;
    expect(balao.titulo).toBe("8º BBM · 2º COB");
    // Verde não tem "pior município".
    expect(balao.campos.some((c) => c.rotulo === "Pior município")).toBe(false);
    expect(balao.contagem.at(-1)).toEqual({ nivel: null, rotulo: "Sem dado", quantidade: 1 });
    expect(balao.nota).toMatch(/aproximada/);
    expect(conteudoBalaoArea(dadosChuva(), "ueop", "9º COB · X", TERRITORIO)).toBeNull();
  });

  it("município (chuva 24 h): território, nível, maior mm/h e acumulados de 24 h e 72 h", () => {
    const balao = conteudoBalaoMunicipio(dadosChuva(), TERRITORIO[0]);
    expect(balao.titulo).toBe("Alfa");
    expect(balao.rotuloNivel).toBe("Laranja · Perigo");
    expect(balao.subtitulo).toBe("1º COB · 1º BBM · 1ª Cia");
    expect(balao.campos).toEqual([
      { rotulo: "Maior chuva em 1 h", valor: "7,5 mm/h" },
      { rotulo: "Acumulado em 24 h", valor: "95 mm" },
      { rotulo: "Acumulado em 72 h", valor: "190 mm" },
    ]);
    expect(balao.aproximar).toBeNull();
  });

  it("município (chuva 72 h): pior 24 h dentro das 72 h; sem dado escrito por extenso", () => {
    const balao = conteudoBalaoMunicipio(dadosChuva("72h"), TERRITORIO[0]);
    expect(balao.rotuloNivel).toBe("Vermelho · Perigo severo");
    expect(balao.campos.find((c) => c.rotulo === "Pior 24 h em 72 h")?.valor).toBe("105 mm");
    const semDado = conteudoBalaoMunicipio(dadosChuva(), TERRITORIO[4]);
    expect(semDado.rotuloNivel).toBe("Sem dado");
    expect(semDado.campos.find((c) => c.rotulo === "Maior chuva em 1 h")?.valor).toBe("Sem dado");
    expect(semDado.subtitulo).toBe("2º COB · 8º BBM");
  });

  it("município (risco): itens com fonte, título e vigência em horário de Brasília", () => {
    const balao = conteudoBalaoMunicipio(dadosRisco("meteorologico"), TERRITORIO[0]);
    expect(balao.rotuloNivel).toBe("Laranja · Perigo");
    expect(balao.itens).toEqual([
      {
        nivel: "laranja",
        rotuloNivel: "Laranja · Perigo",
        titulo: "Chuvas Intensas · Perigo",
        fonte: "INMET",
        vigencia: "02/10 12:00 até 03/10 14:00",
        camada: null,
        origem: "INMET",
      },
    ]);
  });

  it("município (combinada): a camada de cada item e a vigência aberta", () => {
    const balao = conteudoBalaoMunicipio(dadosRisco("combinado"), TERRITORIO[2]);
    expect(balao.itens[0]).toMatchObject({
      camada: "Geológico",
      origem: "Geológico · Cemaden/MCTI",
      vigencia: "desde 02/10 14:30",
      rotuloNivel: "Vermelho · Muito alto",
    });
  });

  it("município sem alerta: a nota explica a cobertura da camada", () => {
    const balao = conteudoBalaoMunicipio(dadosRisco("geologico"), TERRITORIO[3]);
    expect(balao.nivel).toBeNull();
    expect(balao.rotuloNivel).toBe("Sem alerta");
    expect(balao.itens).toEqual([]);
    expect(balao.nota).toBe("Sem alerta não quer dizer sem risco.");
  });

  it("vigência: só fim, nenhuma", () => {
    expect(textoVigencia(null, "2026-10-03T02:00:00Z")).toBe("até 02/10 23:00");
    expect(textoVigencia(null, null)).toBe("Vigência não informada");
  });
});

// ---------------------------------------------------------------------------------------------
// Dados da pintura, listas e tabela
// ---------------------------------------------------------------------------------------------

describe("dados da pintura", () => {
  it("carregando, indisponível e ok, por camada", () => {
    const nada = leitura<RespostaChuvaMapa>(null);
    expect(dadosDaPintura({ pintura: "chuva", janela: "24h" }, nada, leitura<RespostaRiscoMapa>(null)).estado).toBe(
      "carregando",
    );
    expect(
      dadosDaPintura(
        { pintura: "chuva", janela: "24h" },
        leitura<RespostaChuvaMapa>(null, "HTTP 503"),
        leitura<RespostaRiscoMapa>(null),
      ),
    ).toMatchObject({
      estado: "indisponivel",
      motivo: "HTTP 503",
    });
    // Alertas do CBMMG fora do ar não derruba as outras camadas.
    const risco = leitura(respostaRisco());
    expect(dadosDaPintura({ pintura: "alertas-cbmmg", janela: "24h" }, nada, risco)).toMatchObject({
      estado: "indisponivel",
      motivo: expect.stringContaining("Emissão de Alertas"),
    });
    expect(dadosDaPintura({ pintura: "geologico", janela: "24h" }, nada, risco).estado).toBe("ok");
    expect([...camadasIndisponiveis(risco.dados)]).toEqual(["alertas-cbmmg"]);
  });

  it("combinada: avisa as camadas que ficaram de fora e junta os créditos sem repetir", () => {
    const dados = dadosRisco("combinado");
    expect(dados.nota).toMatch(/Alertas do CBMMG está indisponível/);
    expect(dados.credito).toBe("Avisos: INMET (domínio público) · Alertas: Cemaden/MCTI");
    expect(dados.meta).toEqual({ atualizadoEm: "2026-10-02T19:10:00.000Z", origem: "exemplo" });
  });

  it("ranking da chuva na janela escolhida", () => {
    const linhas = listaRankingChuva(respostaChuva(), "24h");
    expect(linhas[0]).toMatchObject({ nome: "Alfa", destaque: "95 mm", rotuloNivel: "Laranja · Perigo" });
    expect(linhas[0].detalhe).toBe("Maior chuva em 1 h: 7,5 mm/h");
    expect(listaRankingChuva(respostaChuva(), "72h")[0].destaque).toBe("105 mm");
  });

  it("municípios em risco: do mais grave ao menos grave", () => {
    const linhas = listaMunicipiosEmRisco(
      dadosRisco("combinado"),
      (ibge) => TERRITORIO.find((m) => m.ibge === ibge) ?? null,
    );
    expect(linhas.map((l) => [l.nome, l.nivel])).toEqual([
      ["Gama", "vermelho"],
      ["Alfa", "laranja"],
    ]);
    expect(linhas[0].destaque).toBe("Movimentos de Massa · Muito Alto");
    expect(linhas[0].detalhe).toBe("Geológico");
  });

  it("resumo por COB: colunas dos níveis da camada e sem dado", () => {
    const resumo = resumoPorCob(dadosChuva());
    expect(resumo.niveis).toEqual([...NIVEIS_RISCO]);
    expect(resumo.linhas).toEqual([
      {
        cob: "1º COB",
        nivel: "laranja",
        rotuloNivel: "Laranja · Perigo",
        quantidades: [1, 1, 1, 0, 0],
        semDado: 0,
        total: 3,
      },
      {
        cob: "2º COB",
        nivel: "verde",
        rotuloNivel: "Verde · Normalidade",
        quantidades: [1, 0, 0, 0, 0],
        semDado: 1,
        total: 2,
      },
    ]);
    const geo = resumoPorCob(dadosRisco("geologico"));
    expect(geo.niveis).toEqual(["amarelo", "laranja", "vermelho"]);
    expect(geo.semDado).toBe("Sem alerta");
  });
});

// ---------------------------------------------------------------------------------------------
// Geometria auxiliar
// ---------------------------------------------------------------------------------------------

describe("geometria auxiliar", () => {
  it("envelopes por município, UEOp e COB a partir da malha", () => {
    const indice = indexarMalha(MALHA);
    expect(indice.municipio.get("3100001")).toEqual([-48, -20, -47, -19]);
    expect(indice.ueop.get("1º COB · 1º BBM")).toEqual([-48, -20, -46, -19]);
    expect(indice.cob.get("2º COB")).toEqual([-45, -20, -43, -19]);
    expect(envelopeDaGeometria({ type: "MultiPolygon", coordinates: [quadrado(0, 0), quadrado(5, 5)] })).toEqual([
      0, 0, 6, 6,
    ]);
  });

  it("rótulos das áreas com o nível da pintura", () => {
    const ueops: ColecaoPoligonos = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { chave: "1º COB · 1º BBM", cob: "1º COB", ueop: "1º BBM" },
          geometry: { type: "Polygon", coordinates: quadrado(0, 0, 2) },
        },
      ],
    };
    expect(rotulosDasAreas(ueops, "ueop", dadosChuva())).toEqual([
      {
        nivelArea: "ueop",
        chave: "1º COB · 1º BBM",
        texto: "1º BBM",
        nivel: "laranja",
        rotuloNivel: "Laranja · Perigo",
        ponto: [1, 1],
      },
    ]);
  });

  it("rótulos sem sobreposição: o primeiro (prioritário) fica", () => {
    const caixa = (x: number) => ({ caixa: { x, y: 0, largura: 50, altura: 18 } });
    const aceitos = rotulosSemSobreposicao([
      { id: "a", ...caixa(0) },
      { id: "b", ...caixa(30) },
      { id: "c", ...caixa(60) },
    ]);
    expect(aceitos.map((a) => a.id)).toEqual(["a", "c"]);
  });

  it("rótulos deslocados (nível COB): ninguém some; o de menor prioridade é empurrado para longe do outro", () => {
    // 3º COB (prioritário) e 6º COB 14 px abaixo, sobrepostos na horizontal — as caixas medidas a 1280 px.
    const r = rotulosDeslocados(
      [
        { id: "3º COB", caixa: { x: 378, y: 439, largura: 156, altura: 18 } },
        { id: "6º COB", caixa: { x: 262, y: 453, largura: 142, altura: 18 } },
      ],
      2,
    );
    expect(r.map((a) => a.id)).toEqual(["3º COB", "6º COB"]);
    expect(r[0].deslocamento).toEqual([0, 0]);
    // Uma altura + folga para baixo (o 6º COB já estava abaixo do 3º): deixam de encostar.
    expect(r[1].deslocamento).toEqual([0, 20]);
    expect(r[1].caixa.y).toBe(473);
    expect(r[1].caixa.y - 2 >= r[0].caixa.y + r[0].caixa.altura).toBe(true);
  });

  it("rótulos deslocados: para cima quando o outro está embaixo; depois o lado oposto; sem lugar livre fica no ponto", () => {
    const caixa = (y: number) => ({ caixa: { x: 0, y, largura: 50, altura: 18 } });
    const acima = rotulosDeslocados([{ id: "a", ...caixa(100) }, { id: "b", ...caixa(96) }], 2);
    expect(acima[1].deslocamento).toEqual([0, -20]);

    // a, c e d ocupam o ponto e as duas posições de baixo; "e" cai na primeira de cima.
    const oposto = rotulosDeslocados(
      [{ id: "a", ...caixa(100) }, { id: "c", ...caixa(120) }, { id: "d", ...caixa(140) }, { id: "e", ...caixa(100) }],
      2,
    );
    expect(oposto.map((x) => x.id)).toEqual(["a", "c", "d", "e"]);
    expect(oposto[3].deslocamento).toEqual([0, -20]);

    // Cercado pelas quatro posições tentadas: continua na lista, no ponto original (visível, encostando).
    const cercado = rotulosDeslocados(
      [
        { id: "a", ...caixa(100) },
        { id: "c", ...caixa(120) },
        { id: "d", ...caixa(140) },
        { id: "e", ...caixa(80) },
        { id: "f", ...caixa(60) },
        { id: "g", ...caixa(100) },
      ],
      2,
    );
    expect(cercado.map((x) => x.id)).toEqual(["a", "c", "d", "e", "f", "g"]);
    expect(cercado[5].deslocamento).toEqual([0, 0]);
    expect(cercado[5].caixa.y).toBe(100);
  });
});

// ---------------------------------------------------------------------------------------------
// De ponta a ponta com os dados de exemplo (mesmo formato das rotas)
// ---------------------------------------------------------------------------------------------

describe("dados de exemplo → mapa", () => {
  beforeEach(() => {
    reiniciarLeituras();
    vi.stubEnv("ARMAZEM_LEITURAS", "memoria");
    vi.stubEnv("DADOS_EXEMPLO", "1");
    reiniciarEnv();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    reiniciarEnv();
    reiniciarLeituras();
  });

  const malha = interpretarMalha(
    JSON.parse(readFileSync(fileURLToPath(new URL("../public/geo/municipios-mg.json", import.meta.url)), "utf8")),
    "ibge",
  );

  it("as respostas de /api/chuva e /api/risco passam na conferência do navegador e pintam a malha real", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const chuvaJson = JSON.parse(JSON.stringify(await obterChuvaMunicipios(new Date())));
    const riscoJson = JSON.parse(JSON.stringify(await obterRisco(new Date())));
    const chuva = interpretarRespostaChuva(chuvaJson);
    const risco = interpretarRespostaRisco(riscoJson);
    expect(malha.features).toHaveLength(853);

    for (const pintura of PINTURAS_RISCO) {
      const estado = dadosDaPintura({ pintura, janela: "72h" }, leitura(chuva), leitura(risco));
      expect(estado.estado).toBe("ok");
      if (estado.estado !== "ok") continue;
      const estilo = montarEstiloRisco({ ...opcoesEstilo(), municipios: malha, dados: estado.dados });
      expect(validateStyleMin(estilo).map((e) => e.message)).toEqual([]);
      // Toda chave de área dos dados existe na malha (COB e COB · UEOp batem com as propriedades).
      const chavesCob = new Set(malha.features.map((f) => chaveDaArea("cob", f.properties ?? {})));
      const chavesUeop = new Set(malha.features.map((f) => chaveDaArea("ueop", f.properties ?? {})));
      for (const area of estado.dados.areas.cob) expect(chavesCob.has(area.chave)).toBe(true);
      for (const area of estado.dados.areas.ueop) expect(chavesUeop.has(area.chave)).toBe(true);
    }

    // Balão de um município real e de um COB real.
    const dados = dadosDaPintura({ pintura: "chuva", janela: "24h" }, leitura(chuva), leitura(risco));
    if (dados.estado !== "ok") throw new Error("esperado ok");
    const bh = municipioPorIbge("3106200")!;
    expect(conteudoBalaoMunicipio(dados.dados, bh).subtitulo).toBe(
      [bh.cob, bh.ueop, bh.fracao].filter(Boolean).join(" · "),
    );
    expect(conteudoBalaoArea(dados.dados, "cob", "1º COB", MUNICIPIOS_MG)?.totalMunicipios).toBe(
      MUNICIPIOS_MG.filter((m) => m.cob === "1º COB").length,
    );
  });

  it("resposta fora do formato vira erro de dados (cartão de fonte indisponível)", () => {
    expect(() => interpretarRespostaChuva({ municipios: [] })).toThrow(ErroDadosMapa);
    expect(() => interpretarRespostaRisco({ camadas: {} })).toThrow(ErroDadosMapa);
    expect(() => interpretarMalha({ type: "Feature" }, "ibge")).toThrow(ErroDadosMapa);
    // Feições sem a propriedade-chave ou sem polígono ficam de fora.
    expect(
      interpretarMalha(
        {
          type: "FeatureCollection",
          features: [
            { type: "Feature", properties: { ibge: "1" }, geometry: { type: "Point", coordinates: [0, 0] } },
            { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: quadrado(0, 0) } },
            { type: "Feature", properties: { ibge: "2" }, geometry: { type: "Polygon", coordinates: quadrado(0, 0) } },
          ],
        },
        "ibge",
      ).features.map((f) => f.properties?.ibge),
    ).toEqual(["2"]);
  });
});
