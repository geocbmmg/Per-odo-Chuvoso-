import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  classifyRings,
  createExpression,
  diff,
  latest,
  validateStyleMin,
  type StylePropertySpecification,
} from "@maplibre/maplibre-gl-style-spec";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { StyleSpecification } from "maplibre-gl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { descreverLeitura, estadoPilula, infoDaCamada, rotuloContagem, textoContagem } from "@/components/mapa/info";
import { abreviarContagem } from "@/components/mapa/marcadores";
import { CAMADAS_MAPA, type CamadaMapaId } from "@/lib/dominio/tipos";
import {
  AGRUPAMENTOS,
  ANEL_MUNDO,
  BASES_MAPA,
  BBOX_MG,
  CAMADAS_DE_ESTILO,
  CATALOGO_BASES,
  CENTRO_MG,
  CHAVE_BASE_MAPA,
  COR_COB_DESCONHECIDO,
  CORES_COB,
  ErroCamada,
  FONTES_CAMADAS,
  ID_CAMADAS,
  LIMITES_VISTA_MG,
  PALETAS_MAPA,
  ZOOM_INICIAL,
  areaAssinada,
  arquivoDaVersao,
  camadaLogicaDoEstilo,
  carregarCamada,
  chamadasComAcaoRrd,
  combinarCarimboMapa,
  conteudoAcaoRrd,
  conteudoAlerta,
  conteudoCob,
  conteudoOcorrencia,
  contarPorCob,
  contarRegistrosNoMapa,
  COR_ACAO_RRD,
  COR_ALERTA,
  COR_CONTORNO_PONTO,
  descreverFalhas,
  corDoCob,
  criarEstiloBase,
  criarMascaraMg,
  ehContornoMg,
  expandirBbox,
  expressaoCorCob,
  filtrarPorPeriodo,
  interpretarRespostaCamada,
  lerBaseSalva,
  montarEstiloMapa,
  paddingVista,
  pontoDeRotulo,
  pontoNoPoligono,
  prepararWorkerMapLibre,
  registrarMeta,
  registrosParaLista,
  reiniciarPreparoWorker,
  resolverTemaMapa,
  rotuloUnidade,
  resolverUrlWorker,
  salvarBase,
  urlWorkerCdn,
  type ColecaoMapa,
  type EstadosMetaCamadas,
  type MetaCamada,
  type OpcoesEstiloMapa,
} from "@/lib/mapa";

const contornoMg = JSON.parse(
  readFileSync(fileURLToPath(new URL("../public/geo/mg-outline.json", import.meta.url)), "utf8"),
) as Feature<MultiPolygon>;

function errosDoEstilo(estilo: StyleSpecification): string[] {
  return validateStyleMin(estilo).map((e) => e.message);
}

/** Avalia uma expressão de cor do MapLibre para uma feição com estas propriedades. */
function avaliarCor(expressao: unknown, propriedades: Record<string, unknown>): string {
  const spec = latest.paint_fill["fill-color"] as unknown as StylePropertySpecification;
  const resultado = createExpression(expressao, "cor", spec);
  if (resultado.result !== "success") throw new Error(JSON.stringify(resultado.value));
  const cor = resultado.value.evaluate({ zoom: 6 }, { type: "Polygon", properties: propriedades }) as {
    toString(): string;
  };
  return cor.toString();
}

function hexParaRgba(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},1)`;
}

const quadrado = (x: number, y: number, lado: number) => [
  [x, y],
  [x + lado, y],
  [x + lado, y + lado],
  [x, y + lado],
  [x, y],
];

describe("constantes da vista", () => {
  it("usa a vista 'MG inteiro' do GeoRescue e um bbox com folga", () => {
    expect(CENTRO_MG).toEqual([-44.5, -18.5]);
    expect(ZOOM_INICIAL).toBe(6);
    const [[o, s], [l, n]] = LIMITES_VISTA_MG;
    expect(o).toBeLessThan(BBOX_MG[0]);
    expect(s).toBeLessThan(BBOX_MG[1]);
    expect(l).toBeGreaterThan(BBOX_MG[2]);
    expect(n).toBeGreaterThan(BBOX_MG[3]);
  });

  it("expande bbox sem passar dos limites do mundo", () => {
    expect(expandirBbox([-179, -84, 179, 84], 5)).toEqual([-180, -85, 180, 85]);
  });

  it("deixa espaço para a barra de ferramentas e não estoura contêineres pequenos", () => {
    expect(paddingVista(1200, 700).left).toBeGreaterThan(paddingVista(1200, 700).right);
    const pequeno = paddingVista(100, 100);
    expect(pequeno.left + pequeno.right).toBeLessThanOrEqual(100);
  });
});

describe("mapas base", () => {
  it.each(BASES_MAPA.flatMap((base) => (["escuro", "claro"] as const).map((tema) => [base, tema] as const)))(
    "%s / %s gera estilo válido, sem glyphs nem sprite",
    (base, tema) => {
      const estilo = criarEstiloBase(base, tema);
      expect(estilo.version).toBe(8);
      expect(estilo).not.toHaveProperty("glyphs");
      expect(estilo).not.toHaveProperty("sprite");
      expect(errosDoEstilo(estilo)).toEqual([]);
      expect(estilo.layers[0]).toMatchObject({
        id: "fundo",
        type: "background",
        paint: { "background-color": PALETAS_MAPA[tema].fundo },
      });
      for (const fonte of Object.values(estilo.sources)) {
        expect(fonte).toMatchObject({ type: "raster", tileSize: 256, maxzoom: 19 });
        const tiles = (fonte as { tiles: string[] }).tiles;
        // Esri: linha ({y}) antes da coluna ({x}).
        expect(tiles[0]).toMatch(/^https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/.+\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}$/);
        expect((fonte as { attribution: string }).attribution).toMatch(/Esri/);
      }
    },
  );

  it("fundo segue --gr-bg de cada tema", () => {
    expect(PALETAS_MAPA.escuro.fundo).toBe("#0A0E14");
    expect(PALETAS_MAPA.claro.fundo).toBe("#F2F4F7");
  });

  it("híbrido empilha imagem e nomes; padrão do catálogo é satélite", () => {
    expect(CATALOGO_BASES.hibrido.camadas.map((c) => c.url)).toEqual([
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    ]);
    expect(CATALOGO_BASES.ruas.camadas[0].url).toContain("World_Street_Map");
    expect(CATALOGO_BASES.relevo.camadas[0].url).toContain("World_Topo_Map");
    expect(Object.keys(criarEstiloBase("hibrido", "escuro").sources)).toEqual(["base-0", "base-1"]);
  });
});

describe("cores dos COBs", () => {
  it("tabela do GeoRescue, com contorno por tema", () => {
    expect(CORES_COB.map((c) => c.preenchimento)).toEqual([
      "#F1C23C",
      "#5FA07A",
      "#4E86C4",
      "#D08A3E",
      "#9AA0AC",
      "#C05F58",
    ]);
    expect(corDoCob("1º COB", "escuro", "contorno")).toBe("#F6D06A");
    expect(corDoCob("1º COB", "claro", "contorno")).toBe("#9B7A18");
    expect(corDoCob("6º COB", "claro", "preenchimento")).toBe("#C05F58");
    expect(corDoCob("Sem COB", "escuro", "preenchimento")).toBe(COR_COB_DESCONHECIDO);
    expect(corDoCob(null, "claro", "contorno")).toBe("#5A6371");
  });

  it("expressão match do MapLibre resolve cada COB e cai no cinza para o resto", () => {
    const preenchimento = expressaoCorCob("escuro", "preenchimento");
    expect(preenchimento.slice(0, 2)).toEqual(["match", ["get", "cob"]]);
    for (const c of CORES_COB) {
      expect(avaliarCor(preenchimento, { cob: c.cob })).toBe(hexParaRgba(c.preenchimento));
      expect(avaliarCor(expressaoCorCob("claro", "contorno"), { cob: c.cob })).toBe(hexParaRgba(c.contorno.claro));
    }
    for (const outro of [{ cob: "Sem COB" }, { cob: "7º COB" }, { cob: null }, {}]) {
      expect(avaliarCor(preenchimento, outro)).toBe(hexParaRgba(COR_COB_DESCONHECIDO));
    }
  });
});

describe("máscara de MG", () => {
  it("é o mundo com MG recortado como buraco, nos sentidos da RFC 7946", () => {
    const mascara = criarMascaraMg(contornoMg);
    const [mundo, buraco] = mascara.geometry.coordinates[0];
    expect(mascara.geometry.coordinates).toHaveLength(1);
    expect(mundo).toEqual(ANEL_MUNDO);
    expect(areaAssinada(mundo)).toBeGreaterThan(0);
    expect(areaAssinada(buraco)).toBeLessThan(0);
    expect(buraco).toHaveLength(contornoMg.geometry.coordinates[0][0].length);
    expect(buraco[0]).toEqual(buraco[buraco.length - 1]);
  });

  it("o MapLibre classifica MG como buraco (classifyRings)", () => {
    const aneis = criarMascaraMg(contornoMg).geometry.coordinates.flat();
    // Como no canvas: y cresce para baixo.
    const pontos = aneis.map((anel) => anel.map(([x, y]) => ({ x, y: -y })));
    const poligonos = classifyRings(pontos as never);
    expect(poligonos).toHaveLength(1);
    expect(poligonos[0]).toHaveLength(2);
  });

  it("aceita anel no sentido errado e buraco interno vira polígono à parte", () => {
    const externoHorario = quadrado(0, 0, 10).reverse();
    const buracoInterno = quadrado(4, 4, 2);
    const mascara = criarMascaraMg({ type: "Polygon", coordinates: [externoHorario, buracoInterno] });
    expect(mascara.geometry.coordinates).toHaveLength(2);
    expect(areaAssinada(mascara.geometry.coordinates[0][1])).toBeLessThan(0);
    expect(areaAssinada(mascara.geometry.coordinates[1][0])).toBeGreaterThan(0);
  });

  it("valida o contorno de MG", () => {
    expect(ehContornoMg(contornoMg)).toBe(true);
    expect(ehContornoMg({ type: "FeatureCollection", features: [] })).toBe(false);
    expect(ehContornoMg(null)).toBe(false);
  });
});

describe("ponto de rótulo (centroide)", () => {
  it("centro de um quadrado", () => {
    expect(pontoDeRotulo({ type: "Polygon", coordinates: [quadrado(0, 0, 2)] })).toEqual([1, 1]);
  });

  it("polígono em U: o centroide cairia fora, o rótulo fica dentro", () => {
    const u = [
      [0, 0],
      [6, 0],
      [6, 6],
      [4, 6],
      [4, 2],
      [2, 2],
      [2, 6],
      [0, 6],
      [0, 0],
    ];
    const ponto = pontoDeRotulo({ type: "Polygon", coordinates: [u] });
    expect(ponto).not.toBeNull();
    expect(pontoNoPoligono(ponto!, [u])).toBe(true);
  });

  it("MultiPolygon usa a maior parte; geometria inválida dá null", () => {
    const multi: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [[quadrado(0, 0, 1)], [quadrado(10, 10, 4)]],
    };
    expect(pontoDeRotulo(multi)).toEqual([12, 12]);
    expect(pontoDeRotulo({ type: "Point", coordinates: [0, 0] })).toBeNull();
    expect(pontoDeRotulo(null)).toBeNull();
  });

  it("rótulo de MG cai dentro do estado", () => {
    const ponto = pontoDeRotulo(contornoMg.geometry);
    expect(ponto).not.toBeNull();
    expect(pontoNoPoligono(ponto!, contornoMg.geometry.coordinates[0])).toBe(true);
  });
});

describe("estilo completo do mapa", () => {
  const cobs = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: { cob: "1º COB" },
        geometry: { type: "Polygon" as const, coordinates: [quadrado(-45, -20, 1)] },
      },
    ],
  };
  const opcoes: OpcoesEstiloMapa = {
    base: "satelite",
    tema: "escuro",
    visiveis: CAMADAS_MAPA,
    dados: { cobs },
    contornoMg: contornoMg as Feature<Polygon | MultiPolygon>,
  };

  it("é válido, offline (sem glyphs/sprite) e sem camadas symbol", () => {
    for (const tema of ["escuro", "claro"] as const) {
      for (const base of BASES_MAPA) {
        const estilo = montarEstiloMapa({ ...opcoes, tema, base });
        expect(errosDoEstilo(estilo)).toEqual([]);
        expect(estilo).not.toHaveProperty("glyphs");
        expect(estilo).not.toHaveProperty("sprite");
        expect(estilo.layers.some((l) => l.type === "symbol")).toBe(false);
      }
    }
  });

  it("ordem: fundo, base, máscara, COBs, contorno de MG e pontos por cima", () => {
    const ids = montarEstiloMapa(opcoes).layers.map((l) => l.id);
    expect(ids.slice(0, 2)).toEqual(["fundo", "base-0"]);
    expect(ids.indexOf(ID_CAMADAS.mascara)).toBeLessThan(ids.indexOf(ID_CAMADAS.cobsPreenchimento));
    expect(ids.indexOf(ID_CAMADAS.cobsContorno)).toBeLessThan(ids.indexOf(ID_CAMADAS.contornoMg));
    expect(ids.indexOf(ID_CAMADAS.acoesPonto)).toBeLessThan(ids.indexOf(ID_CAMADAS.alertasPonto));
    expect(ids[ids.length - 1]).toBe(ID_CAMADAS.ocorrenciasPonto);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("opacidades e contornos por tema", () => {
    const escuro = montarEstiloMapa(opcoes);
    const claro = montarEstiloMapa({ ...opcoes, tema: "claro" });
    const paint = (estilo: StyleSpecification, id: string) =>
      (estilo.layers.find((l) => l.id === id) as { paint: Record<string, unknown> }).paint;
    expect(paint(escuro, ID_CAMADAS.mascara)["fill-opacity"]).toBe(0.55);
    expect(paint(claro, ID_CAMADAS.mascara)["fill-opacity"]).toBe(0.35);
    expect(paint(escuro, ID_CAMADAS.contornoMg)).toMatchObject({ "line-color": "#FFFFFF", "line-width": 1.4 });
    expect(paint(claro, ID_CAMADAS.contornoMg)).toMatchObject({ "line-color": "#10151C" });
    expect(paint(escuro, ID_CAMADAS.cobsPreenchimento)["fill-opacity"]).toEqual([
      "case",
      ["boolean", ["feature-state", "selecionado"], false],
      PALETAS_MAPA.escuro.opacidadeCobSelecionado,
      0.16,
    ]);
    expect((paint(claro, ID_CAMADAS.cobsPreenchimento)["fill-opacity"] as unknown[])[3]).toBe(0.5);
    expect(paint(escuro, ID_CAMADAS.alertasPonto)).toMatchObject({
      "circle-color": "#FF8A45",
      "circle-stroke-color": "#0A0E14",
      "circle-stroke-width": 2,
    });
  });

  it("clusters só para alertas e ações; ocorrências sempre individuais", () => {
    const { sources } = montarEstiloMapa(opcoes);
    expect(sources[FONTES_CAMADAS.alertas]).toMatchObject({ type: "geojson", cluster: true });
    expect(sources[FONTES_CAMADAS["acoes-rrd"]]).toMatchObject({ type: "geojson", cluster: true });
    expect(sources[FONTES_CAMADAS["ocorrencias-complexas"]]).not.toHaveProperty("cluster");
    expect(sources[FONTES_CAMADAS.cobs]).toMatchObject({ promoteId: "cob", data: cobs });
  });

  it("agrupamentos de alertas e de ações RRD diferem na forma, não só na cor", () => {
    const estilo = montarEstiloMapa(opcoes);
    const paint = (id: string) => (estilo.layers.find((l) => l.id === id) as { paint: Record<string, unknown> }).paint;
    // Alertas: disco cheio laranja com halo translúcido.
    expect(paint(ID_CAMADAS.alertasCluster)).toMatchObject({
      "circle-color": COR_ALERTA,
      "circle-stroke-color": "rgba(255, 138, 69, 0.35)",
    });
    // Ações RRD: anel — miolo escuro e traço verde cheio.
    expect(paint(ID_CAMADAS.acoesCluster)).toMatchObject({
      "circle-color": COR_CONTORNO_PONTO,
      "circle-stroke-color": COR_ACAO_RRD,
      "circle-stroke-width": AGRUPAMENTOS["acoes-rrd"].larguraContorno,
    });
    expect(AGRUPAMENTOS.alertas.forma).not.toBe(AGRUPAMENTOS["acoes-rrd"].forma);
    expect(AGRUPAMENTOS["acoes-rrd"].rotulo).toBe("Agrupamento de ações RRD");
  });

  it("camada desligada fica com visibility none", () => {
    const estilo = montarEstiloMapa({ ...opcoes, visiveis: ["cobs"] });
    for (const camada of CAMADAS_MAPA) {
      for (const id of CAMADAS_DE_ESTILO[camada]) {
        const layer = estilo.layers.find((l) => l.id === id) as { layout: { visibility: string } };
        expect(layer.layout.visibility).toBe(camada === "cobs" ? "visible" : "none");
        expect(camadaLogicaDoEstilo(id)).toBe(camada);
      }
    }
    expect(camadaLogicaDoEstilo("base-0")).toBeNull();
  });

  it("nenhuma chave undefined (o diff do MapLibre compara objetos)", () => {
    const procurar = (valor: unknown, caminho: string): string[] => {
      if (valor === undefined) return [caminho];
      if (!valor || typeof valor !== "object") return [];
      return Object.entries(valor).flatMap(([k, v]) => procurar(v, `${caminho}.${k}`));
    };
    expect(procurar(montarEstiloMapa({ ...opcoes, contornoMg: null, dados: {} }), "estilo")).toEqual([]);
  });

  it("trocar o tema não recria fontes nem camadas (só setPaintProperty)", () => {
    const comandos = diff(montarEstiloMapa(opcoes), montarEstiloMapa({ ...opcoes, tema: "claro" }));
    expect(comandos.length).toBeGreaterThan(0);
    expect(new Set(comandos.map((c) => c.command))).toEqual(new Set(["setPaintProperty"]));
  });

  it("chegada de dados vira setGeoJSONSourceData; desligar camada vira setLayoutProperty", () => {
    const vazio = montarEstiloMapa({ ...opcoes, dados: {} });
    const comDados = diff(vazio, montarEstiloMapa(opcoes));
    expect(comDados).toEqual([{ command: "setGeoJSONSourceData", args: ["cobs", cobs] }]);
    const desligar = diff(montarEstiloMapa(opcoes), montarEstiloMapa({ ...opcoes, visiveis: ["cobs"] }));
    expect(new Set(desligar.map((c) => c.command))).toEqual(new Set(["setLayoutProperty"]));
  });

  it("trocar o mapa base mexe só nas fontes raster", () => {
    const comandos = diff(montarEstiloMapa(opcoes), montarEstiloMapa({ ...opcoes, base: "hibrido" }));
    const fontesTocadas = comandos
      .filter((c) => c.command === "addSource" || c.command === "removeSource")
      .map((c) => c.args[0]);
    expect(fontesTocadas).toEqual(["base-1"]);
    const deRuas = diff(montarEstiloMapa(opcoes), montarEstiloMapa({ ...opcoes, base: "ruas" }));
    expect(deRuas.filter((c) => c.command === "removeSource").map((c) => c.args[0])).toEqual(["base-0"]);
  });
});

describe("resposta de /api/arcgis/{camada}", () => {
  const corpo = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "1",
        geometry: { type: "Point", coordinates: [-43.9, -19.9] },
        properties: { id: "1", cob: "1º COB", numeroChamada: "2610020066", emitidoEm: "2026-10-02T15:00:00.000Z" },
      },
      { type: "Feature", geometry: null, properties: { id: "2", cob: null, emitidoEm: "2025-11-01T12:00:00.000Z" } },
      { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: { id: "3", cob: "2º COB" } },
      { type: "Feature", geometry: { type: "Point", coordinates: [500, 10] }, properties: { id: "4" } },
      "lixo",
    ],
    meta: { fonte: "arcgis-alertas", atualizadoEm: "2026-10-02T15:00:00.000Z", origem: "exemplo", camada: "Emissão de Alertas" },
  };

  it("mantém só pontos válidos no mapa e conta os sem localização", () => {
    const dados = interpretarRespostaCamada("alertas", corpo);
    expect(dados.colecao.features).toHaveLength(1);
    expect(dados.propriedades).toHaveLength(4);
    expect(dados.semLocalizacao).toBe(3);
    expect(dados.meta).toEqual({
      fonte: "arcgis-alertas",
      atualizadoEm: "2026-10-02T15:00:00.000Z",
      origem: "exemplo",
      camada: "Emissão de Alertas",
    });
  });

  it("rejeita corpo que não é FeatureCollection", () => {
    expect(() => interpretarRespostaCamada("alertas", { erro: "x" })).toThrow(ErroCamada);
  });

  it("COBs exigem Polygon/MultiPolygon", () => {
    const dados = interpretarRespostaCamada("cobs", {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { cob: "1º COB" }, geometry: { type: "Polygon", coordinates: [quadrado(0, 0, 1)] } },
        { type: "Feature", properties: { cob: "2º COB" }, geometry: { type: "Point", coordinates: [1, 1] } },
      ],
    });
    expect(dados.colecao.features).toHaveLength(1);
    expect(dados.semLocalizacao).toBe(1);
  });

  it("503 vira ErroCamada com a mensagem da rota; rede fora vira mensagem amigável", async () => {
    const buscar503 = vi.fn(async () =>
      Response.json({ erro: "Emissão de Alertas indisponível no momento.", fonte: "arcgis-alertas" }, { status: 503 }),
    );
    await expect(carregarCamada("alertas", { buscar: buscar503 })).rejects.toMatchObject({
      name: "ErroCamada",
      status: 503,
      message: "Emissão de Alertas indisponível no momento.",
    });
    expect(buscar503).toHaveBeenCalledWith("/api/arcgis/alertas", expect.objectContaining({ cache: "no-store" }));

    const semRede = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(carregarCamada("cobs", { buscar: semRede })).rejects.toMatchObject({
      message: "Sem conexão com o servidor.",
    });

    const ok = vi.fn(async () => Response.json(corpo));
    await expect(carregarCamada("alertas", { buscar: ok })).resolves.toMatchObject({ semLocalizacao: 3 });
  });

  it("filtro de período segue a regra dos indicadores", () => {
    const dados = interpretarRespostaCamada("alertas", corpo);
    const periodo = { inicio: "2026-10-01T03:00:00.000Z", fim: "2027-04-01T03:00:00.000Z" };
    const filtrado = filtrarPorPeriodo("alertas", dados, periodo);
    expect(filtrado.colecao.features).toHaveLength(1);
    expect(filtrado.propriedades).toHaveLength(1);
    expect(filtrado.semLocalizacao).toBe(0);
    expect(filtrarPorPeriodo("alertas", dados, { inicio: null, fim: null })).toBe(dados);

    const ocorrencias = interpretarRespostaCamada("ocorrencias-complexas", {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [-44, -19] }, properties: { situacao: "em-andamento", iniciadaEm: "2020-01-01T00:00:00Z" } },
        { type: "Feature", geometry: { type: "Point", coordinates: [-44, -19] }, properties: { situacao: "finalizada", iniciadaEm: "2020-01-01T00:00:00Z" } },
      ],
    });
    expect(filtrarPorPeriodo("ocorrencias-complexas", ocorrencias, periodo).colecao.features).toHaveLength(1);
  });

  it("conta registros por COB com balde 'Sem COB'", () => {
    const contagem = contarPorCob(interpretarRespostaCamada("alertas", corpo).propriedades);
    expect(contagem.get("1º COB")).toBe(1);
    expect(contagem.get("Sem COB")).toBe(2);
  });
});

describe("conteúdo dos balões", () => {
  it("alerta em pt-BR com data no horário de Brasília e situação de pendência", () => {
    const props = {
      numeroChamada: "2610020066",
      cob: "1º COB",
      ueop: "1º BBM",
      municipio: "Belo Horizonte",
      tipoRisco: "Alagamento",
      nivel: "Alerta",
      cota: 250,
      emitidoEm: "2026-10-02T15:00:00.000Z",
    };
    const conteudo = conteudoAlerta(props, { chamadasComAcao: chamadasComAcaoRrd([{ numeroChamada: "26.1002.0066" }]) });
    expect(conteudo.titulo).toBe("Alagamento — Belo Horizonte");
    expect(conteudo.campos).toContainEqual({ rotulo: "Emitido em", valor: "02/10/2026 12:00" });
    expect(conteudo.campos).toContainEqual({ rotulo: "Cota", valor: "250 cm" });
    expect(conteudo.campos).toContainEqual({ rotulo: "Nº chamada CAD", valor: "2610020066" });
    expect(conteudo.selo).toEqual({ texto: "Com ação RRD vinculada", tom: "ok" });

    const pendente = conteudoAlerta({ ...props, numeroChamada: "999999" }, { chamadasComAcao: new Set() });
    expect(pendente.selo?.tom).toBe("alerta");
    expect(conteudoAlerta({ numeroChamada: null }).selo).toBeUndefined();
    expect(conteudoAlerta({}).campos.every((c) => c.valor === "Não informado")).toBe(true);
  });

  it("alerta mostra os dados do tipo de risco e omite os que não se aplicam", () => {
    const chuva = conteudoAlerta({
      tipoRisco: "Meteorológico",
      chuvaMmHora: 42,
      chuva24hMm: 96.5,
      emitidoEm: "2026-10-02T15:00:00.000Z",
      validoAte: "2026-10-03T15:00:00.000Z",
    });
    expect(chuva.campos).toContainEqual({ rotulo: "Chuva", valor: "42 mm/h · 96,5 mm em 24 h" });
    expect(chuva.campos).toContainEqual({ rotulo: "Válido até", valor: "03/10/2026 12:00" });
    expect(chuva.campos.some((c) => c.rotulo === "Cota" || c.rotulo === "Rio" || c.rotulo === "Índice de risco")).toBe(false);

    const rio = conteudoAlerta({ tipoRisco: "Hidrológico", rio: "Rio Muriaé", bacia: "Rio Muriaé", cota: 640 });
    expect(rio.campos).toContainEqual({ rotulo: "Rio", valor: "Rio Muriaé · bacia Rio Muriaé" });
    expect(rio.campos).toContainEqual({ rotulo: "Cota", valor: "640 cm" });
    expect(conteudoAlerta({ indiceRisco: 1.9 }).campos).toContainEqual({ rotulo: "Índice de risco", valor: "1,9" });
  });

  it("ação RRD lista as ações da repetição e os nº REDS", () => {
    const conteudo = conteudoAcaoRrd({
      acoes: ["Evacuação preventiva", "Isolamento da área"],
      descricao: "Evacuação preventiva; Isolamento da área",
      reds: ["2026-000000001-001"],
    });
    expect(conteudo.campos).toContainEqual({ rotulo: "Ações executadas", valor: "Evacuação preventiva; Isolamento da área" });
    expect(conteudo.campos).toContainEqual({ rotulo: "Nº REDS", valor: "2026-000000001-001" });
    expect(conteudoAcaoRrd({ acoes: ["Uma"], descricao: "Uma", reds: [] }).campos.some((c) => c.rotulo === "Nº REDS")).toBe(false);
  });

  it("ocorrência traz a situação em palavra; finalizada muda cor e forma", () => {
    expect(conteudoOcorrencia({ situacao: "em-andamento", titulo: "Deslizamento" }).selo).toEqual({
      texto: "Em andamento",
      tom: "perigo",
    });
    const finalizada = conteudoOcorrencia({ situacao: "finalizada" });
    expect(finalizada.forma).toBe("alvo-apagado");
    expect(finalizada.selo?.texto).toBe("Finalizada");
  });

  it("fração logo após a UEOp nos três registros; omitida quando não informada", () => {
    const base = { cob: "1º COB", ueop: "1º BBM", municipio: "Belo Horizonte" };
    for (const conteudo of [
      conteudoAlerta({ ...base, fracao: "2ª Cia" }),
      conteudoAcaoRrd({ ...base, fracao: "2ª Cia" }),
      conteudoOcorrencia({ ...base, fracao: "2ª Cia" }),
    ]) {
      const rotulos = conteudo.campos.map((c) => c.rotulo);
      expect(rotulos.indexOf("Fração")).toBe(rotulos.indexOf("UEOp") + 1);
      expect(conteudo.campos).toContainEqual({ rotulo: "Fração", valor: "2ª Cia" });
    }
    for (const fracao of [null, undefined, "  "]) {
      expect(conteudoAlerta({ ...base, fracao }).campos.some((c) => c.rotulo === "Fração")).toBe(false);
      expect(conteudoAcaoRrd({ ...base, fracao }).campos.some((c) => c.rotulo === "Fração")).toBe(false);
      expect(conteudoOcorrencia({ ...base, fracao }).campos.some((c) => c.rotulo === "Fração")).toBe(false);
    }
  });

  it("COB mostra contagens e camada indisponível", () => {
    const conteudo = conteudoCob("3º COB", "escuro", { alertas: 1234, acoesRrd: 0, ocorrencias: null });
    expect(conteudo.cor).toBe("#74A6E0");
    expect(conteudo.campos).toEqual([
      { rotulo: "Alertas", valor: "1.234" },
      { rotulo: "Ações RRD", valor: "0" },
      { rotulo: "Ocorrências complexas", valor: "Camada indisponível" },
    ]);
  });
});

describe("tema e preferências", () => {
  it("interpreta next-themes e o data-tema do GeoRescue; padrão escuro", () => {
    expect(resolverTemaMapa("light")).toBe("claro");
    expect(resolverTemaMapa("dark")).toBe("escuro");
    expect(resolverTemaMapa(null, "claro")).toBe("claro");
    expect(resolverTemaMapa("system", undefined)).toBe("escuro");
  });

  it("lê e grava o mapa base com tolerância a falhas", () => {
    const memoria = new Map<string, string>();
    const armazenamento = {
      getItem: (k: string) => memoria.get(k) ?? null,
      setItem: (k: string, v: string) => void memoria.set(k, v),
    };
    expect(lerBaseSalva(armazenamento)).toBe("satelite");
    expect(salvarBase(armazenamento, "relevo")).toBe(true);
    expect(memoria.get(CHAVE_BASE_MAPA)).toBe("relevo");
    expect(lerBaseSalva(armazenamento)).toBe("relevo");
    memoria.set(CHAVE_BASE_MAPA, "inexistente");
    expect(lerBaseSalva(armazenamento)).toBe("satelite");

    const quebrado = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(lerBaseSalva(quebrado)).toBe("satelite");
    expect(salvarBase(quebrado, "ruas")).toBe(false);
    expect(lerBaseSalva(null)).toBe("satelite");
  });
});

describe("worker do MapLibre", () => {
  beforeEach(() => reiniciarPreparoWorker());

  const cabecalho = (versao: string) =>
    `/**\n* MapLibre GL JS\n* @license 3-Clause BSD. Full text of license: https://github.com/maplibre/maplibre-gl-js/blob/v${versao}/LICENSE.txt\n*/\nimport{}from"./maplibre-gl-shared.mjs";`;

  it("o cabeçalho do worker instalado cita a versão do pacote", () => {
    const pacote = JSON.parse(
      readFileSync(fileURLToPath(new URL("../node_modules/maplibre-gl/package.json", import.meta.url)), "utf8"),
    ) as { version: string };
    const worker = readFileSync(
      fileURLToPath(new URL("../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url)),
      "utf8",
    );
    expect(arquivoDaVersao(worker, pacote.version)).toBe(true);
  });

  it("usa a cópia local da mesma versão; senão, o CDN da versão exata", async () => {
    const local = vi.fn(async () => new Response(cabecalho("6.11.2")));
    expect(await resolverUrlWorker("6.11.2", { buscar: local, origem: "https://sala.exemplo" })).toBe(
      "https://sala.exemplo/vendor/maplibre-gl/maplibre-gl-worker.mjs",
    );
    const outraVersao = vi.fn(async () => new Response(cabecalho("6.0.0")));
    expect(await resolverUrlWorker("6.11.2", { buscar: outraVersao, origem: "https://sala.exemplo" })).toBe(
      urlWorkerCdn("6.11.2"),
    );
    const ausente = vi.fn(async () => new Response("não encontrado", { status: 404 }));
    expect(await resolverUrlWorker("6.11.2", { buscar: ausente })).toBe(
      "https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl-worker.mjs",
    );
    const semRede = vi.fn(async () => {
      throw new TypeError("offline");
    });
    expect(await resolverUrlWorker("6.11.2", { buscar: semRede })).toBe(urlWorkerCdn("6.11.2"));
  });

  it("define a URL uma vez e respeita uma URL já configurada", async () => {
    let url = "";
    const api = { getVersion: () => "6.11.2", getWorkerUrl: () => url, setWorkerUrl: vi.fn((u: string) => void (url = u)) };
    const buscar = vi.fn(async () => new Response("", { status: 404 }));
    await prepararWorkerMapLibre(api, { buscar });
    await prepararWorkerMapLibre(api, { buscar });
    expect(api.setWorkerUrl).toHaveBeenCalledTimes(1);
    expect(buscar).toHaveBeenCalledTimes(1);

    reiniciarPreparoWorker();
    const jaDefinida = { getVersion: () => "6.11.2", getWorkerUrl: () => "/meu-worker.mjs", setWorkerUrl: vi.fn() };
    expect(await prepararWorkerMapLibre(jaDefinida, { buscar })).toBe("/meu-worker.mjs");
    expect(jaDefinida.setWorkerUrl).not.toHaveBeenCalled();
  });
});

describe("catálogo de camadas", () => {
  it("cada camada lógica tem fonte e camadas de estilo", () => {
    for (const camada of CAMADAS_MAPA as readonly CamadaMapaId[]) {
      expect(FONTES_CAMADAS[camada]).toBe(camada);
      expect(CAMADAS_DE_ESTILO[camada].length).toBeGreaterThan(0);
    }
  });
});

describe("resumo das camadas fora do canvas (painel e legenda)", () => {
  const dados = interpretarRespostaCamada("alertas", {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "Point", coordinates: [-44, -19] }, properties: { id: "1" } },
      { type: "Feature", geometry: null, properties: { id: "2" } },
    ],
    meta: { fonte: "arcgis-alertas", atualizadoEm: "2026-10-02T17:35:00.000Z", origem: "ultima-valida" },
  });

  it("carregando, ok, atualizando e erro com ou sem dados", () => {
    expect(infoDaCamada(undefined, null)).toMatchObject({ estado: "carregando", total: null });
    const ok = infoDaCamada({ carregando: false, erro: null, dados }, dados);
    expect(ok).toMatchObject({ estado: "ok", total: 2, semLocalizacao: 1 });
    expect(descreverLeitura(ok)).toBe("Atualizado às 14:35 · última leitura válida");
    expect(textoContagem(ok)).toBe("2");
    expect(rotuloContagem(ok, "alertas")).toBe("2 registros");
    expect(descreverLeitura(infoDaCamada({ carregando: true, erro: null, dados }, dados))).toBe("Atualizando…");

    const falhaSemDados = infoDaCamada({ carregando: false, erro: "Fonte indisponível.", dados: null }, null);
    expect(falhaSemDados).toMatchObject({ estado: "erro", total: null });
    expect(textoContagem(falhaSemDados)).toBe("indisponível");
    expect(estadoPilula(falhaSemDados)).toBe("erro");

    const falhaComDados = infoDaCamada({ carregando: false, erro: "Fonte indisponível.", dados }, dados);
    expect(falhaComDados).toMatchObject({ estado: "erro", total: 2 });
    expect(rotuloContagem(falhaComDados, "alertas")).toContain("última leitura");
  });

  it("abrevia contagens dos agrupamentos em pt-BR", () => {
    expect(abreviarContagem(8)).toBe("8");
    expect(abreviarContagem(999)).toBe("999");
    expect(abreviarContagem(1234)).toBe("1,2 mil");
    expect(abreviarContagem(25_400)).toBe("25 mil");
  });
});

describe("carimbo do mapa (Visão Geral)", () => {
  const meta = (atualizadoEm: string, origem: MetaCamada["origem"] = "ao-vivo", erro?: string): MetaCamada => ({
    fonte: "arcgis-alertas",
    atualizadoEm,
    origem,
    ...(erro ? { erro } : {}),
  });
  const TODAS = CAMADAS_MAPA;

  it("ignora os limites dos COBs (lidos uma vez só) e usa a leitura de pontos mais antiga", () => {
    const estados: EstadosMetaCamadas = {
      cobs: { meta: meta("2026-10-02T11:00:00.000Z") },
      alertas: { meta: meta("2026-10-02T12:05:00.000Z") },
      "acoes-rrd": { meta: meta("2026-10-02T12:00:00.000Z", "cache") },
      "ocorrencias-complexas": { meta: meta("2026-10-02T12:03:00.000Z") },
    };
    expect(combinarCarimboMapa(estados, TODAS)).toEqual({
      estado: "ok",
      atualizadoEm: "2026-10-02T12:00:00.000Z",
      origem: "cache",
    });
  });

  it("pior origem e erros das leituras de reserva", () => {
    const estados: EstadosMetaCamadas = {
      alertas: {
        meta: { ...meta("2026-10-02T12:00:00.000Z", "ultima-valida", "HTTP 503"), camada: "Emissão de Alertas" },
      },
      "acoes-rrd": { meta: meta("2026-10-02T12:01:00.000Z", "ultima-valida", "timeout") },
    };
    expect(combinarCarimboMapa(estados, TODAS)).toEqual({
      estado: "ok",
      atualizadoEm: "2026-10-02T12:00:00.000Z",
      origem: "ultima-valida",
      erro: "Emissão de Alertas: HTTP 503 · Ações RRD: timeout",
    });
  });

  it("carregando enquanto falta resposta; falha quando todas as camadas de pontos falharam", () => {
    expect(combinarCarimboMapa({}, TODAS)).toEqual({ estado: "carregando" });
    // Só os COBs responderam: o carimbo ainda espera os pontos.
    expect(combinarCarimboMapa({ cobs: { meta: meta("2026-10-02T11:00:00.000Z") } }, TODAS)).toEqual({
      estado: "carregando",
    });
    let estados: EstadosMetaCamadas = {};
    estados = registrarMeta(estados, "alertas", null, "Fonte indisponível no momento.");
    estados = registrarMeta(estados, "acoes-rrd", null, "Fonte indisponível no momento.");
    expect(combinarCarimboMapa(estados, TODAS)).toEqual({ estado: "carregando" });
    estados = registrarMeta(estados, "ocorrencias-complexas", null, "Fonte indisponível no momento.");
    expect(combinarCarimboMapa(estados, TODAS)).toEqual({ estado: "falha", motivo: "Fonte indisponível no momento." });
  });

  it("falha numa atualização mantém o carimbo da leitura anterior", () => {
    let estados = registrarMeta({}, "alertas", meta("2026-10-02T12:00:00.000Z"));
    estados = registrarMeta(estados, "alertas", null, "Sem conexão com o servidor.");
    expect(estados.alertas).toEqual({ meta: meta("2026-10-02T12:00:00.000Z"), erro: "Sem conexão com o servidor." });
    expect(combinarCarimboMapa(estados, ["alertas"])).toMatchObject({ estado: "ok" });
    estados = registrarMeta(estados, "alertas", meta("2026-10-02T12:05:00.000Z"));
    expect(estados.alertas).toEqual({ meta: meta("2026-10-02T12:05:00.000Z"), erro: undefined });
  });

  it("sem horário quando as rotas respondem sem meta; mapa só de COBs usa os COBs", () => {
    const semMeta: EstadosMetaCamadas = {
      alertas: { meta: null },
      "acoes-rrd": { meta: null },
      "ocorrencias-complexas": { meta: null },
    };
    expect(combinarCarimboMapa(semMeta, TODAS)).toEqual({ estado: "sem-horario" });
    expect(combinarCarimboMapa({ cobs: { meta: meta("2026-10-02T11:00:00.000Z") } }, ["cobs"])).toMatchObject({
      estado: "ok",
      atualizadoEm: "2026-10-02T11:00:00.000Z",
    });
  });

  it("motivo da falha: uma frase se igual em todas, por camada se diferente", () => {
    expect(descreverFalhas([["alertas", "A"], ["acoes-rrd", "A"]])).toBe("A");
    expect(descreverFalhas([["alertas", "A"], ["acoes-rrd", "B"]])).toBe("Alertas: A; Ações RRD: B");
    expect(descreverFalhas([["alertas", " "]])).toBe("Falha ao carregar a camada.");
  });
});

describe("registros em lista (alternativa ao clique no mapa)", () => {
  const ponto = (x: number, y: number, properties: Record<string, unknown>) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [x, y] },
    properties,
  });
  const colecao = (...features: ReturnType<typeof ponto>[]): ColecaoMapa => ({ type: "FeatureCollection", features });
  const colecoes: Partial<Record<CamadaMapaId, ColecaoMapa>> = {
    alertas: colecao(
      ponto(-44, -19, {
        id: "a1",
        tipoRisco: "Alagamento",
        municipio: "Contagem",
        cob: "1º COB",
        ueop: "1º BBM",
        fracao: "2ª Cia",
        emitidoEm: "2026-10-02T10:00:00.000Z",
      }),
      ponto(-44, -19, { id: "a2", municipio: "Betim", emitidoEm: null }),
    ),
    "acoes-rrd": colecao(
      ponto(-43, -18, { id: "r1", municipio: "Sabará", ueop: "3º BBM", executadaEm: "2026-10-02T12:00:00.000Z" }),
    ),
    "ocorrencias-complexas": colecao(
      ponto(-42, -20, {
        id: "o1",
        situacao: "finalizada",
        municipio: "Ipatinga",
        iniciadaEm: "2026-10-02T10:00:00.000Z",
      }),
    ),
  };
  const todas = new Set<CamadaMapaId>(CAMADAS_MAPA);

  it("do mais recente ao mais antigo, sem data no fim; empate segue a ordem das camadas", () => {
    const lista = registrosParaLista(colecoes, todas);
    expect(lista.map((r) => r.propriedades.id)).toEqual(["r1", "a1", "o1", "a2"]);
    expect(new Set(lista.map((r) => r.chave)).size).toBe(lista.length);
  });

  it("traz tipo, detalhe, município, COB, UEOp, fração, data e coordenadas", () => {
    const [, alerta, ocorrencia] = registrosParaLista(colecoes, todas);
    expect(alerta).toMatchObject({
      camada: "alertas",
      tipo: "Alerta",
      detalhe: "Alagamento",
      municipio: "Contagem",
      cob: "1º COB",
      ueop: "1º BBM",
      fracao: "2ª Cia",
      data: "2026-10-02T10:00:00.000Z",
      coordenadas: [-44, -19],
    });
    expect(ocorrencia).toMatchObject({ tipo: "Ocorrência complexa", detalhe: "Finalizada", situacao: "finalizada" });
  });

  it("só as camadas ligadas no mapa; contagem igual à do mapa", () => {
    const soAlertas = new Set<CamadaMapaId>(["cobs", "alertas"]);
    expect(registrosParaLista(colecoes, soAlertas).every((r) => r.camada === "alertas")).toBe(true);
    expect(contarRegistrosNoMapa(colecoes, soAlertas)).toBe(2);
    expect(contarRegistrosNoMapa(colecoes, todas)).toBe(4);
    expect(registrosParaLista({}, todas)).toEqual([]);
  });

  it("UEOp e fração juntas, uma só ou nenhuma", () => {
    expect(rotuloUnidade("1º BBM", "2ª Cia")).toBe("1º BBM · 2ª Cia");
    expect(rotuloUnidade("1º BBM", null)).toBe("1º BBM");
    expect(rotuloUnidade(null, "2ª Cia")).toBe("2ª Cia");
    expect(rotuloUnidade(" ", null)).toBeNull();
  });
});
