import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/risco/route";
import {
  alertaVigente,
  areasDeRisco,
  camadaAlertasCbmmg,
  combinarCamadas,
  selecionarAlertasCbmmg,
} from "@/lib/dados/camadas-risco";
import { obterRisco, type FonteAlertasCbmmg } from "@/lib/dados/risco";
import type { CamadaRisco } from "@/lib/dominio/risco";
import type { Alerta } from "@/lib/dominio/tipos";
import { reiniciarEnv } from "@/lib/env";
import { reiniciarLeituras } from "@/lib/fontes/leituras";
import { FonteIndisponivelError, type Leitura } from "@/lib/fontes/tipos";
import { normalizarCamada, planejarLeitura } from "@/lib/sources/arcgis/plano";
import { obterAlertasCemaden } from "@/lib/sources/cemaden";
import {
  alertaCemadenAberto,
  camadaDoEventoCemaden,
  camadasCemaden,
  interpretarAlertasCemaden,
  interpretarDataCemaden,
  nivelDoAlertaCemaden,
} from "@/lib/sources/cemaden/parser";
import { exemploServicoArcgis, REFERENCIA_ARCGIS_EXEMPLO } from "@/lib/sources/exemplos/arcgis";
import { ALERTAS_CEMADEN_EXEMPLO } from "@/lib/sources/exemplos/cemaden";
import { AVISOS_ATIVOS_INMET_EXEMPLO } from "@/lib/sources/exemplos/inmet-ativos";
import { obterAvisosInmetMunicipios } from "@/lib/sources/inmet/ativos";
import {
  EVENTOS_FORA_DO_PERIODO_CHUVOSO,
  EVENTOS_PERIODO_CHUVOSO,
  camadaMeteorologica,
  eventoDoPeriodoChuvoso,
  geocodesDoAviso,
  interpretarAvisosAtivosInmet,
  interpretarDataHoraInmet,
  interpretarPoligonoInmet,
  selecionarAvisosRisco,
  severidadeDoAvisoAtivo,
  vigenciaNaJanela,
} from "@/lib/sources/inmet/parser-ativos";
import { MUNICIPIOS_MG } from "@/lib/territorio/municipios";

/** Instante de referência dos dados de exemplo: 02/10/2026 12:00 em Brasília. */
const AGORA = new Date("2026-10-02T15:00:00.000Z");

const JUIZ_DE_FORA = "3136702";
const MURIAE = "3143906";
const BELO_HORIZONTE = "3106200";
const OURO_PRETO = "3146107";

function nivelDe(camada: CamadaRisco, ibge: string) {
  return camada.municipios.find((m) => m.ibge === ibge)?.nivel ?? null;
}

/** Aviso bruto mínimo do /avisos/ativos. */
function avisoBruto(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    id_aviso: 10,
    id_sequencia: 1,
    descricao: "Chuvas Intensas",
    severidade: "Perigo",
    inicio: "2026-10-02 08:00",
    fim: "2026-10-02 23:59",
    geocodes: "3106200,3118601",
    municipios: "Belo Horizonte - MG (3106200),Contagem - MG (3118601)",
    encerrado: false,
    ...extra,
  };
}

// ---------------------------------------------------------------------------------------------
// INMET — /avisos/ativos
// ---------------------------------------------------------------------------------------------

describe("INMET avisos ativos: parser", () => {
  const dados = interpretarAvisosAtivosInmet(AVISOS_ATIVOS_INMET_EXEMPLO);

  it("lê hoje + futuro, junta o aviso repetido e descarta o que não toca MG", () => {
    expect(dados.recebidos).toBe(6);
    expect(dados.avisos.map((a) => a.id)).toEqual(["56012", "56018", "56015", "56009"]);
    expect(dados.descartados).toEqual({
      invalidos: 0,
      encerrados: 0,
      severidadeDesconhecida: 0,
      foraDeMg: 1, // Vendaval só no RS e em SC
      repetidos: 1, // Chuvas Intensas em "hoje" e em "futuro"
    });
  });

  it("atribui pela lista IBGE, só municípios de MG, e converte as datas de Brasília", () => {
    const chuvas = dados.avisos.find((a) => a.id === "56012");
    expect(chuvas).toMatchObject({
      idAviso: "28140",
      evento: "Chuvas Intensas",
      severidade: "perigo",
      severidadeRotulo: "Perigo",
      nivel: "laranja",
      inicio: "2026-10-02T11:00:00.000Z", // 08:00 em Brasília
      fim: "2026-10-03T13:00:00.000Z", // 10:00 em Brasília
      link: "https://avisos.inmet.gov.br/56012",
    });
    expect(chuvas?.geocodes).toHaveLength(8);
    expect(chuvas?.geocodes).toContain(JUIZ_DE_FORA);
    expect(chuvas?.geocodes).toContain(MURIAE);
    expect(chuvas?.geocodes.every((g) => g.startsWith("31"))).toBe(true); // Petrópolis e Teresópolis (RJ) fora
    expect(chuvas?.poligono?.type).toBe("Polygon");
  });

  it("converte severidade: Perigo Potencial → amarelo, Perigo → laranja, Grande Perigo → vermelho", () => {
    expect(severidadeDoAvisoAtivo("Perigo Potencial")).toBe("perigo-potencial");
    expect(severidadeDoAvisoAtivo("PERIGO")).toBe("perigo");
    expect(severidadeDoAvisoAtivo(" Grande Perigo ")).toBe("grande-perigo");
    expect(severidadeDoAvisoAtivo("Severo")).toBeNull();
    expect(severidadeDoAvisoAtivo(3)).toBeNull();

    const r = interpretarAvisosAtivosInmet({
      hoje: [
        avisoBruto({ id: 1, id_aviso: 1, severidade: "Perigo Potencial" }),
        avisoBruto({ id: 2, id_aviso: 2, severidade: "Grande Perigo" }),
        avisoBruto({ id: 3, id_aviso: 3, severidade: "Atenção" }),
      ],
    });
    expect(r.avisos.map((a) => [a.id, a.nivel])).toEqual([
      ["2", "vermelho"],
      ["1", "amarelo"],
    ]);
    expect(r.descartados.severidadeDesconhecida).toBe(1);
  });

  it("descarta encerrados e cancelados, e fica com a versão mais recente do aviso alterado", () => {
    const r = interpretarAvisosAtivosInmet({
      hoje: [
        avisoBruto({ id: 1, id_aviso: 1, encerrado: true }),
        avisoBruto({ id: 2, id_aviso: 2, status: "Cancel" }),
        avisoBruto({ id: 3, id_aviso: 3, id_sequencia: 1, geocodes: "3106200", municipios: "" }),
        avisoBruto({ id: 4, id_aviso: 3, id_sequencia: 2, alterado: true, geocodes: "3118601", municipios: "" }),
      ],
      futuro: [],
    });
    expect(r.descartados.encerrados).toBe(2);
    expect(r.descartados.repetidos).toBe(1);
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0]).toMatchObject({ id: "4", geocodes: ["3118601"] });
  });

  it("junta as janelas e os municípios do mesmo aviso repetido em hoje e futuro", () => {
    const r = interpretarAvisosAtivosInmet({
      hoje: [avisoBruto({ fim: "2026-10-02 23:59", geocodes: "3106200", municipios: "" })],
      futuro: [avisoBruto({ inicio: "2026-10-03 00:00", fim: "2026-10-03 12:00", geocodes: "3118601", municipios: "" })],
    });
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0].geocodes).toEqual(["3106200", "3118601"]);
    expect(r.avisos[0].inicio).toBe("2026-10-02T11:00:00.000Z");
    expect(r.avisos[0].fim).toBe("2026-10-03T15:00:00.000Z");
  });

  it("lê geocodes em texto, em lista e nos parênteses de municipios", () => {
    expect(geocodesDoAviso({ geocodes: " 3106200 , 3118601,abc" })).toEqual(["3106200", "3118601"]);
    expect(geocodesDoAviso({ geocodes: [3106200, "3118601"] })).toEqual(["3106200", "3118601"]);
    expect(geocodesDoAviso({ municipios: "Juiz de Fora - MG (3136702),Petrópolis - RJ (3303906)" })).toEqual([
      "3136702",
      "3303906",
    ]);
    expect(geocodesDoAviso({})).toEqual([]);
  });

  it("datas: Brasília sem offset (inclusive com o Z falso), offset explícito respeitado, data_* + hora_*", () => {
    expect(interpretarDataHoraInmet("2026-10-02 08:00")?.toISOString()).toBe("2026-10-02T11:00:00.000Z");
    expect(interpretarDataHoraInmet("2026-10-02T08:00:00.000Z")?.toISOString()).toBe("2026-10-02T11:00:00.000Z");
    expect(interpretarDataHoraInmet("2026-10-02T08:00:00-03:00")?.toISOString()).toBe("2026-10-02T11:00:00.000Z");
    expect(interpretarDataHoraInmet("ontem")).toBeNull();
    expect(interpretarDataHoraInmet(null)).toBeNull();

    const semInicioFim = avisoBruto({
      inicio: undefined,
      fim: undefined,
      data_inicio: "2026-08-14T00:00:00.000Z",
      hora_inicio: "10:00",
      data_fim: "2026-08-15T00:00:00.000Z",
      hora_fim: null,
    });
    const [aviso] = interpretarAvisosAtivosInmet({ hoje: [semInicioFim] }).avisos;
    expect(aviso.inicio).toBe("2026-08-14T13:00:00.000Z"); // 10:00 de Brasília, não UTC
    expect(aviso.fim).toBe("2026-08-16T02:59:00.000Z"); // sem hora: até 23:59
  });

  it("polígono: string ou objeto, Polygon/MultiPolygon/Feature; inválido vira null sem derrubar o aviso", () => {
    const anel = [
      [-43.123456, -19.98765],
      [-43, -19.9],
      [-43.1, -20.1],
      [-43.123456, -19.98765],
    ];
    expect(interpretarPoligonoInmet(JSON.stringify({ type: "Polygon", coordinates: [anel] }))).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [-43.123, -19.988],
          [-43, -19.9],
          [-43.1, -20.1],
          [-43.123, -19.988],
        ],
      ],
    });
    expect(interpretarPoligonoInmet({ type: "MultiPolygon", coordinates: [[anel]] })?.type).toBe("MultiPolygon");
    expect(interpretarPoligonoInmet({ type: "Feature", geometry: { type: "Polygon", coordinates: [anel] } })?.type).toBe(
      "Polygon",
    );
    expect(interpretarPoligonoInmet("{quebrado")).toBeNull();
    expect(interpretarPoligonoInmet({ type: "Polygon", coordinates: [[["a", "b"]]] })).toBeNull();
    expect(interpretarAvisosAtivosInmet({ hoje: [avisoBruto({ poligono: "{quebrado" })] }).avisos[0].poligono).toBeNull();
  });

  it("estrutura inválida é erro (para cair na última leitura válida)", () => {
    expect(() => interpretarAvisosAtivosInmet(null)).toThrow(/não é um objeto/);
    expect(() => interpretarAvisosAtivosInmet([avisoBruto()])).toThrow(/não é um objeto/);
    expect(() => interpretarAvisosAtivosInmet({ avisos: [] })).toThrow(/hoje/);
    expect(() => interpretarAvisosAtivosInmet({ hoje: [], futuro: {} })).toThrow(/futuro/);
    // Avisos presentes, mas nenhum com severidade e municípios: o formato mudou.
    expect(() =>
      interpretarAvisosAtivosInmet({ hoje: [{ id: 1, nivel: "Perigo", cidades: ["3106200"] }] }),
    ).toThrow(/não reconhecido/);
    // Lista vazia é válida: nenhum aviso ativo no país.
    expect(interpretarAvisosAtivosInmet({ hoje: [], futuro: [] }).avisos).toEqual([]);
    expect(interpretarAvisosAtivosInmet({ hoje: [42, avisoBruto()] }).descartados.invalidos).toBe(1);
  });
});

describe("INMET avisos ativos: eventos e janela de 24 h", () => {
  it("lista de eventos do período chuvoso", () => {
    for (const evento of EVENTOS_PERIODO_CHUVOSO) expect(eventoDoPeriodoChuvoso(evento)).toBe(true);
    for (const evento of EVENTOS_FORA_DO_PERIODO_CHUVOSO) expect(eventoDoPeriodoChuvoso(evento)).toBe(false);
    expect(eventoDoPeriodoChuvoso("CHUVAS INTENSAS")).toBe(true);
    expect(eventoDoPeriodoChuvoso("Tempestade Local/Convectiva - Chuvas Intensas")).toBe(true);
    expect(eventoDoPeriodoChuvoso("Declinio de Temperatura")).toBe(false);
    expect(eventoDoPeriodoChuvoso("")).toBe(false);
    expect(eventoDoPeriodoChuvoso(null)).toBe(false);
  });

  it("vigente, futuro dentro de 24 h (bordas inclusivas) ou fora", () => {
    const aviso = { inicio: "2026-10-03T15:00:00.000Z", fim: "2026-10-04T02:59:00.000Z" };
    expect(vigenciaNaJanela(aviso, new Date("2026-10-02T15:00:00.000Z"))).toBe("futuro"); // começa em 24 h
    expect(vigenciaNaJanela(aviso, new Date("2026-10-02T14:59:00.000Z"))).toBeNull(); // 24 h e 1 min
    expect(vigenciaNaJanela(aviso, new Date("2026-10-03T15:00:00.000Z"))).toBe("vigente");
    expect(vigenciaNaJanela(aviso, new Date("2026-10-04T02:59:00.000Z"))).toBe("vigente");
    expect(vigenciaNaJanela(aviso, new Date("2026-10-04T03:00:00.000Z"))).toBeNull();
    expect(vigenciaNaJanela({ inicio: null, fim: null }, AGORA)).toBe("vigente");
  });

  it("exemplo: Zona da Mata e BH vigentes, Sul de Minas a partir das 22:00, Baixa Umidade fora", () => {
    const r = selecionarAvisosRisco(interpretarAvisosAtivosInmet(AVISOS_ATIVOS_INMET_EXEMPLO), AGORA);
    expect(r.avisos.map((a) => [a.evento, a.vigencia])).toEqual([
      ["Chuvas Intensas", "vigente"],
      ["Acumulado de Chuva", "futuro"],
      ["Tempestade", "vigente"],
    ]);
    expect(r.descartados).toMatchObject({ foraDoPeriodoChuvoso: 1, foraDaJanela: 0, foraDeMg: 1 });

    // Depois da meia-noite a Tempestade (até 23:59) sai; o Acumulado já vale.
    const depois = selecionarAvisosRisco(
      interpretarAvisosAtivosInmet(AVISOS_ATIVOS_INMET_EXEMPLO),
      new Date("2026-10-03T03:00:00.000Z"),
    );
    expect(depois.avisos.map((a) => [a.evento, a.vigencia])).toEqual([
      ["Chuvas Intensas", "vigente"],
      ["Acumulado de Chuva", "vigente"],
    ]);
    expect(depois.descartados.foraDaJanela).toBe(1);
  });

  it("camada Meteorológico: um item por aviso × município, com início e fim para o 'a partir de'", () => {
    const camada = camadaMeteorologica(
      selecionarAvisosRisco(interpretarAvisosAtivosInmet(AVISOS_ATIVOS_INMET_EXEMPLO), AGORA).avisos,
    );
    expect(camada.id).toBe("meteorologico");
    expect(camada.credito).toBe("Avisos: INMET (domínio público)");
    expect(camada.municipios).toHaveLength(23);
    expect(nivelDe(camada, JUIZ_DE_FORA)).toBe("laranja");
    expect(nivelDe(camada, BELO_HORIZONTE)).toBe("amarelo");
    expect(nivelDe(camada, "3143302")).toBeNull(); // Montes Claros: só Baixa Umidade
    const pousoAlegre = camada.municipios.find((m) => m.ibge === "3152501");
    expect(pousoAlegre?.itens[0]).toEqual({
      nivel: "laranja",
      titulo: "Acumulado de Chuva · Perigo",
      fonte: "INMET",
      inicio: "2026-10-03T01:00:00.000Z", // 22:00 de 02/10 em Brasília
      fim: "2026-10-04T00:59:00.000Z",
      ref: "56018",
    });
  });
});

// ---------------------------------------------------------------------------------------------
// CEMADEN — wsAlertas2
// ---------------------------------------------------------------------------------------------

describe("CEMADEN: parser", () => {
  const dados = interpretarAlertasCemaden(ALERTAS_CEMADEN_EXEMPLO);

  it("fica só com os alertas abertos de MG", () => {
    expect(dados.recebidos).toBe(14);
    expect(dados.alertas).toHaveLength(11);
    expect(dados.alertas.every((a) => a.ibge.startsWith("31"))).toBe(true);
    expect(dados.alertas.some((a) => a.cod === "2072")).toBe(false); // status 0
    expect(dados.descartados).toMatchObject({ fechados: 1, outrasUfs: 2, municipioDesconhecido: 0 });
    expect(dados.atualizadoNaFonte).toBe("2026-10-02T14:58:00.000Z");
    expect(dados.alertas.find((a) => a.cod === "2101")).toEqual({
      cod: "2101",
      ibge: JUIZ_DE_FORA,
      camada: "geologico",
      nivel: "laranja",
      nivelRotulo: "Alto",
      evento: "Movimentos de Massa - Alto",
      criadoEm: "2026-10-02T11:40:12.000Z",
      atualizadoEm: "2026-10-02T11:40:12.000Z",
    });
  });

  it("evento → camada (tolerante a acento perdido e a variações)", () => {
    expect(camadaDoEventoCemaden("Movimentos de Massa - Alto")).toBe("geologico");
    expect(camadaDoEventoCemaden("Deslizamento")).toBe("geologico");
    expect(camadaDoEventoCemaden("Risco Hidrológico - Moderado")).toBe("hidrologico");
    expect(camadaDoEventoCemaden("Risco HidrolÃ³gico - Alto")).toBe("hidrologico");
    expect(camadaDoEventoCemaden("Enxurrada")).toBe("hidrologico");
    expect(camadaDoEventoCemaden("Inundação")).toBe("hidrologico");
    expect(camadaDoEventoCemaden("Alagamento")).toBe("hidrologico");
    expect(camadaDoEventoCemaden("Incêndio florestal")).toBeNull();
    expect(camadaDoEventoCemaden(undefined)).toBeNull();
  });

  it("nível: Moderado → amarelo, Alto → laranja, Muito Alto → vermelho (sem roxo)", () => {
    expect(nivelDoAlertaCemaden("Moderado")?.nivel).toBe("amarelo");
    expect(nivelDoAlertaCemaden("Alto")?.nivel).toBe("laranja");
    expect(nivelDoAlertaCemaden("MUITO ALTO")).toEqual({ nivel: "vermelho", rotulo: "Muito Alto" });
    expect(nivelDoAlertaCemaden(undefined, "Movimentos de Massa - Muito Alto")?.nivel).toBe("vermelho");
    expect(nivelDoAlertaCemaden("Baixo")).toBeNull();
    expect(nivelDoAlertaCemaden(undefined, "Movimentos de Massa")).toBeNull();
  });

  it("datas em vários formatos; sem fuso vale UTC", () => {
    expect(interpretarDataCemaden("14-02-2022 16:51:54")).toBe("2022-02-14T16:51:54.000Z");
    expect(interpretarDataCemaden("02-10-2026 14:58:00 UTC")).toBe("2026-10-02T14:58:00.000Z");
    expect(interpretarDataCemaden("2026-10-02 09:10:00")).toBe("2026-10-02T09:10:00.000Z");
    expect(interpretarDataCemaden("2026-10-02T09:10:00.123")).toBe("2026-10-02T09:10:00.000Z");
    expect(interpretarDataCemaden("02/10/2026 09:10")).toBe("2026-10-02T09:10:00.000Z");
    expect(interpretarDataCemaden("02/10/26 09:10")).toBe("2026-10-02T09:10:00.000Z");
    expect(interpretarDataCemaden("02-10-2026")).toBe("2026-10-02T00:00:00.000Z"); // o "-2026" não é fuso
    expect(interpretarDataCemaden("02-10-2026 09:10:00 BRT")).toBe("2026-10-02T12:10:00.000Z");
    expect(interpretarDataCemaden("2026-10-02T09:10:00-03:00")).toBe("2026-10-02T12:10:00.000Z");
    expect(interpretarDataCemaden("2026-10-02T09:10:00Z")).toBe("2026-10-02T09:10:00.000Z");
    expect(interpretarDataCemaden(1_790_949_000)).toBe("2026-10-02T13:50:00.000Z");
    expect(interpretarDataCemaden(1_790_949_000_000)).toBe("2026-10-02T13:50:00.000Z");
    expect(interpretarDataCemaden("31-02-2026 10:00:00")).toBeNull();
    expect(interpretarDataCemaden("02-10-2026 25:00:00")).toBeNull();
    expect(interpretarDataCemaden("ontem")).toBeNull();
    expect(interpretarDataCemaden(null)).toBeNull();
  });

  it("MG pelo código IBGE (número, texto ou 6 dígitos) ou, sem código, por uf + nome", () => {
    const base = { evento: "Risco Hidrológico - Alto", nivel: "Alto", status: 1 };
    const r = interpretarAlertasCemaden({
      alertas: [
        { ...base, cod_alerta: 1, codibge: "3143906" },
        { ...base, cod_alerta: 2, codibge: 314390 }, // sem dígito verificador
        { ...base, cod_alerta: 3, uf: "MG", municipio: "JUIZ DE FORA" },
        { ...base, cod_alerta: 4, codibge: 3303906, uf: "MG" }, // código do RJ decide
        { ...base, cod_alerta: 5, uf: "MG", municipio: "Cidade Inexistente" },
        { ...base, cod_alerta: 6, codibge: 3199999 },
      ],
    });
    expect(r.alertas.map((a) => [a.cod, a.ibge])).toEqual([
      ["3", JUIZ_DE_FORA],
      ["1", MURIAE],
      ["2", MURIAE],
    ]);
    expect(r.descartados).toMatchObject({ outrasUfs: 1, municipioDesconhecido: 2 });
  });

  it("status: só 1 é aberto (ausente conta como aberto); cod repetido fica com a atualização mais recente", () => {
    expect(alertaCemadenAberto(1)).toBe(true);
    expect(alertaCemadenAberto("1")).toBe(true);
    expect(alertaCemadenAberto(undefined)).toBe(true);
    expect(alertaCemadenAberto(0)).toBe(false);
    expect(alertaCemadenAberto("0")).toBe(false);

    const r = interpretarAlertasCemaden({
      alertas: [
        { cod_alerta: 7, codibge: 3143906, evento: "Risco Hidrológico - Moderado", nivel: "Moderado", ult_atualizacao: "02-10-2026 10:00:00" },
        { cod_alerta: 7, codibge: 3143906, evento: "Risco Hidrológico - Alto", nivel: "Alto", ult_atualizacao: "02-10-2026 12:00:00" },
        { cod_alerta: 8, codibge: 3143906, evento: "Risco Hidrológico - Alto", nivel: "Baixo" },
        { cod_alerta: 9, codibge: 3143906, evento: "Estiagem", nivel: "Alto" },
      ],
    });
    expect(r.alertas).toHaveLength(1);
    expect(r.alertas[0]).toMatchObject({ cod: "7", nivel: "laranja" });
    expect(r.descartados).toMatchObject({ repetidos: 1, nivelDesconhecido: 1, eventoDesconhecido: 1 });
  });

  it("validação de contrato: sem 'alertas' em lista, ou sem nenhum evento reconhecível, é erro", () => {
    expect(() => interpretarAlertasCemaden(null)).toThrow(/não é um objeto/);
    expect(() => interpretarAlertasCemaden([])).toThrow(/não é um objeto/);
    expect(() => interpretarAlertasCemaden({ atualizado: "x" })).toThrow(/alertas/);
    expect(() => interpretarAlertasCemaden({ alertas: "nenhum" })).toThrow(/alertas/);
    expect(() => interpretarAlertasCemaden({ alertas: [{ tipo: "MM", codigo: 3106200 }] })).toThrow(/não reconhecido/);
    expect(interpretarAlertasCemaden({ atualizado: "", alertas: [] }).alertas).toEqual([]);
  });

  it("camadas Geológico e Hidrológico do exemplo", () => {
    const { geologico, hidrologico } = camadasCemaden(dados.alertas);
    expect(geologico.municipios.map((m) => [m.ibge, m.nivel])).toEqual([
      [BELO_HORIZONTE, "amarelo"],
      [JUIZ_DE_FORA, "laranja"],
      ["3140001", "laranja"], // Mariana
      ["3144805", "amarelo"], // Nova Lima
      [OURO_PRETO, "vermelho"],
    ]);
    expect(hidrologico.municipios).toHaveLength(6);
    expect(nivelDe(hidrologico, MURIAE)).toBe("laranja");
    expect(nivelDe(hidrologico, "3127701")).toBe("amarelo"); // Governador Valadares
    expect(nivelDe(hidrologico, "3152105")).toBe("laranja"); // Ponte Nova
    expect(nivelDe(hidrologico, JUIZ_DE_FORA)).toBe("amarelo");
    expect(geologico.municipios.find((m) => m.ibge === OURO_PRETO)?.itens[0]).toEqual({
      nivel: "vermelho",
      titulo: "Movimentos de Massa · Muito Alto",
      fonte: "Cemaden/MCTI",
      inicio: "2026-10-02T09:05:47.000Z",
      fim: null,
      ref: "2098",
    });
    expect(geologico.credito).toBe("Alertas: Cemaden/MCTI");
    expect(geologico.cobertura).toMatch(/sem alerta não quer dizer sem risco/);
  });
});

// ---------------------------------------------------------------------------------------------
// Alertas do CBMMG, camada combinada e áreas
// ---------------------------------------------------------------------------------------------

function alerta(extra: Partial<Alerta>): Alerta {
  return {
    id: "1",
    numeroChamada: null,
    cob: null,
    ueop: null,
    fracao: null,
    municipio: "Belo Horizonte",
    tipoRisco: "Meteorológico",
    nivel: "Laranja (Perigo)",
    nivelRisco: "laranja",
    chuvaMmHora: null,
    chuva24hMm: null,
    bacia: null,
    rio: null,
    cota: null,
    indiceRisco: null,
    emitidoEm: "2026-10-02T12:00:00.000Z",
    validoAte: "2026-10-03T12:00:00.000Z",
    ...extra,
  };
}

describe("camada Alertas do CBMMG", () => {
  it("vigência: validade não vencida ou, sem validade, emitido nas últimas 24 h", () => {
    expect(alertaVigente({ emitidoEm: null, validoAte: "2026-10-02T15:00:00.000Z" }, AGORA)).toBe(true); // borda
    expect(alertaVigente({ emitidoEm: null, validoAte: "2026-10-02T14:59:59.000Z" }, AGORA)).toBe(false);
    expect(alertaVigente({ emitidoEm: "2026-10-01T15:00:00.000Z", validoAte: null }, AGORA)).toBe(true);
    expect(alertaVigente({ emitidoEm: "2026-10-01T14:59:00.000Z", validoAte: null }, AGORA)).toBe(false);
    expect(alertaVigente({ emitidoEm: null, validoAte: null }, AGORA)).toBe(false);
  });

  it("usa nivelRisco e o município → IBGE; descarta e conta o que não dá para pintar", () => {
    const alertas = [
      alerta({ id: "1", municipio: "Belo Horizonte", nivelRisco: "laranja" }),
      alerta({ id: "2", municipio: "Belo_Horizonte", nivelRisco: "vermelho", nivel: "Vermelho (Perigo Severo)" }),
      alerta({ id: "3", municipio: "Juiz de Fora - MG", nivelRisco: "amarelo", validoAte: null }),
      alerta({ id: "4", municipio: "Contagem", validoAte: "2026-10-01T00:00:00.000Z" }),
      alerta({ id: "5", municipio: "Betim", nivelRisco: null }),
      alerta({ id: "6", municipio: null }),
      alerta({ id: "7", municipio: "Cidade Inexistente" }),
    ];
    const selecao = selecionarAlertasCbmmg(alertas, AGORA);
    expect(selecao.descartados).toEqual({ foraDaVigencia: 1, semNivel: 1, semMunicipio: 2, repetidos: 0 });

    const camada = camadaAlertasCbmmg(alertas, AGORA);
    expect(camada).toMatchObject({ id: "alertas-cbmmg", credito: "CBMMG" });
    expect(camada.municipios.map((m) => [m.ibge, m.nivel])).toEqual([
      [BELO_HORIZONTE, "vermelho"],
      [JUIZ_DE_FORA, "amarelo"],
    ]);
    expect(camada.municipios[0].itens[0]).toEqual({
      nivel: "vermelho",
      titulo: "Meteorológico · Vermelho (Perigo Severo)",
      fonte: "CBMMG",
      inicio: "2026-10-02T12:00:00.000Z",
      fim: "2026-10-03T12:00:00.000Z",
      ref: null,
    });
  });

  it("deduplica pelo nº da chamada + município + tipo (Survey123 e Sala), ficando com o mais recente", () => {
    const camada = camadaAlertasCbmmg(
      [
        alerta({ id: "s1", numeroChamada: "2026-0001234-5", nivelRisco: "amarelo", emitidoEm: "2026-10-02T10:00:00.000Z" }),
        alerta({ id: "s2", numeroChamada: "20260001234 5", nivelRisco: "laranja", emitidoEm: "2026-10-02T11:00:00.000Z" }),
        alerta({ id: "s3", numeroChamada: "2026-0001234-5", municipio: "Contagem", nivelRisco: "amarelo" }),
      ],
      AGORA,
    );
    expect(camada.municipios.map((m) => [m.ibge, m.nivel, m.itens.length])).toEqual([
      [BELO_HORIZONTE, "laranja", 1],
      ["3118601", "amarelo", 1],
    ]);
  });

  it("dados de exemplo do formulário: só os alertas vigentes no instante de referência", () => {
    const exemplo = exemploServicoArcgis("alertas", new Date(REFERENCIA_ARCGIS_EXEMPLO));
    const plano = planejarLeitura("alertas", exemplo.servico);
    const alertas = normalizarCamada("alertas", plano, exemplo.feicoes(plano.principal.id), []).feicoes.features.map(
      (f) => f.properties,
    );
    const camada = camadaAlertasCbmmg(alertas, AGORA);
    expect(camada.municipios).toHaveLength(14);
    expect(nivelDe(camada, JUIZ_DE_FORA)).toBe("vermelho");
    expect(nivelDe(camada, MURIAE)).toBe("vermelho");
    expect(nivelDe(camada, BELO_HORIZONTE)).toBe("laranja"); // o vermelho de janeiro já venceu
    expect(nivelDe(camada, "3106705")).toBeNull(); // Betim: validade vencida às 09:19
  });
});

describe("camada combinada e resumo por COB/UEOp", () => {
  const camada = (id: CamadaRisco["id"], itens: [string, CamadaRisco["municipios"][number]["nivel"]][]): CamadaRisco => ({
    id,
    municipios: itens.map(([ibge, nivel]) => ({
      ibge,
      nivel,
      itens: [{ nivel, titulo: `${id} ${nivel}`, fonte: "teste", inicio: null, fim: null, ref: null }],
    })),
    cobertura: "",
    credito: "",
  });

  it("pior nível por município, com os itens de todas as camadas", () => {
    const combinado = combinarCamadas([
      camada("meteorologico", [
        [JUIZ_DE_FORA, "laranja"],
        [BELO_HORIZONTE, "amarelo"],
      ]),
      camada("geologico", [[JUIZ_DE_FORA, "vermelho"]]),
      camada("alertas-cbmmg", [[JUIZ_DE_FORA, "amarelo"]]),
    ]);
    expect(combinado.map((m) => [m.ibge, m.nivel])).toEqual([
      [BELO_HORIZONTE, "amarelo"],
      [JUIZ_DE_FORA, "vermelho"],
    ]);
    const jf = combinado[1];
    expect(jf.camadas).toEqual(["meteorologico", "geologico", "alertas-cbmmg"]);
    expect(jf.itens.map((i) => [i.camada, i.nivel])).toEqual([
      ["geologico", "vermelho"],
      ["meteorologico", "laranja"],
      ["alertas-cbmmg", "amarelo"],
    ]);
  });

  it("agrega na hierarquia do CBMMG: 6 COBs e as UEOp, com todos os 853 municípios", () => {
    const areas = areasDeRisco(MUNICIPIOS_MG, [
      { ibge: JUIZ_DE_FORA, nivel: "vermelho" },
      { ibge: MURIAE, nivel: "laranja" },
      { ibge: BELO_HORIZONTE, nivel: "amarelo" },
    ]);
    expect(areas.cob.map((a) => a.chave)).toEqual(["1º COB", "2º COB", "3º COB", "4º COB", "5º COB", "6º COB"]);
    expect(areas.cob.reduce((s, a) => s + a.totalMunicipios, 0)).toBe(853);
    const terceiro = areas.cob.find((a) => a.cob === "3º COB");
    expect(terceiro).toMatchObject({ nivel: "vermelho", piorMunicipio: { ibge: JUIZ_DE_FORA, nome: "Juiz de Fora" } });
    expect(terceiro?.contagem).toMatchObject({ vermelho: 1, laranja: 1 });
    expect(areas.cob.find((a) => a.cob === "2º COB")?.nivel).toBeNull();
    expect(areas.ueop.find((a) => a.chave === "3º COB · 4º BBM")?.nivel).toBe("vermelho");
  });
});

// ---------------------------------------------------------------------------------------------
// Dados (server) e rota /api/risco
// ---------------------------------------------------------------------------------------------

/** Todas as chaves de um JSON, em qualquer profundidade. */
function chaves(valor: unknown, saida = new Set<string>()): Set<string> {
  if (Array.isArray(valor)) valor.forEach((v) => chaves(v, saida));
  else if (valor && typeof valor === "object") {
    for (const [k, v] of Object.entries(valor)) {
      saida.add(k);
      chaves(v, saida);
    }
  }
  return saida;
}

describe("obterRisco e GET /api/risco", () => {
  beforeEach(() => {
    reiniciarLeituras();
    vi.stubEnv("ARMAZEM_LEITURAS", "memoria");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
    reiniciarEnv();
    reiniciarLeituras();
  });

  it("DADOS_EXEMPLO=1: as quatro camadas pelo mesmo parser da produção, sem rede", async () => {
    vi.stubEnv("DADOS_EXEMPLO", "1");
    reiniciarEnv();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const risco = await obterRisco(new Date());
    expect(fetch).not.toHaveBeenCalled();
    expect(risco.meta?.origem).toBe("exemplo");
    expect(risco.combinado.indisponiveis).toEqual([]);
    expect(risco.combinado.camadas).toEqual(["meteorologico", "geologico", "hidrologico", "alertas-cbmmg"]);

    const { meteorologico, geologico, hidrologico } = risco.camadas;
    expect(meteorologico.camada?.municipios).toHaveLength(23);
    expect(meteorologico.meta).toMatchObject({ fontes: ["inmet-municipios"], origem: "exemplo" });
    expect(meteorologico.descartados).toMatchObject({ foraDoPeriodoChuvoso: 1, foraDeMg: 1 });
    expect(geologico.camada?.municipios).toHaveLength(5);
    expect(hidrologico.camada?.municipios).toHaveLength(6);
    expect(hidrologico.meta?.fontes).toEqual(["cemaden-alertas"]);
    expect(risco.camadas["alertas-cbmmg"].camada?.municipios.length).toBeGreaterThan(0);
    expect(risco.camadas["alertas-cbmmg"].meta?.fontes).toEqual(["arcgis-alertas"]);

    // Cada camada traz o resumo por COB e por UEOp.
    expect(geologico.areas?.cob).toHaveLength(6);
    expect(geologico.areas?.cob.find((a) => a.cob === "1º COB")?.nivel).toBe("vermelho"); // Ouro Preto

    // Juiz de Fora: aviso do INMET (laranja), CEMADEN geológico (laranja) e hidrológico
    // (amarelo) e alerta do CBMMG (vermelho) → vermelho na combinada.
    const jf = risco.combinado.municipios.find((m) => m.ibge === JUIZ_DE_FORA);
    expect(jf?.nivel).toBe("vermelho");
    expect(jf?.camadas).toEqual(["meteorologico", "geologico", "hidrologico", "alertas-cbmmg"]);
    expect(risco.combinado.municipios.find((m) => m.ibge === OURO_PRETO)?.nivel).toBe("vermelho");
    expect(risco.combinado.areas.cob.find((a) => a.cob === "3º COB")?.nivel).toBe("vermelho");
  });

  it("uma origem de alertas fora do ar deixa só a sua camada indisponível", async () => {
    vi.stubEnv("DADOS_EXEMPLO", "1");
    reiniciarEnv();
    const falha: FonteAlertasCbmmg = async () => {
      throw new FonteIndisponivelError("arcgis-alertas", "HTTP 503 Service Unavailable");
    };
    const risco = await obterRisco(new Date(), { fontesAlertasCbmmg: [falha] });
    expect(risco.camadas["alertas-cbmmg"]).toMatchObject({ camada: null, meta: null, areas: null });
    expect(risco.camadas["alertas-cbmmg"].erro).toContain("HTTP 503");
    expect(risco.camadas.meteorologico.camada).not.toBeNull();
    expect(risco.combinado.indisponiveis).toEqual(["alertas-cbmmg"]);
    expect(risco.meta?.erro).toContain("Alertas do CBMMG");
  });

  it("ponto de extensão: várias origens de alertas entram na mesma camada", async () => {
    vi.stubEnv("DADOS_EXEMPLO", "1");
    reiniciarEnv();
    const agora = new Date();
    const daSala: FonteAlertasCbmmg = async (instante): Promise<Leitura<Alerta[]>> => ({
      fonte: "arcgis-alertas",
      atualizadoEm: instante.toISOString(),
      origem: "ao-vivo",
      dados: [
        alerta({
          municipio: "Uberaba",
          nivelRisco: "roxo",
          nivel: "Roxo (Desastre)",
          emitidoEm: instante.toISOString(),
          validoAte: new Date(instante.getTime() + 3_600_000).toISOString(),
        }),
      ],
    });
    const quebrada: FonteAlertasCbmmg = async () => {
      throw new Error("bug");
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const risco = await obterRisco(agora, { fontesAlertasCbmmg: [daSala, quebrada] });
    const camada = risco.camadas["alertas-cbmmg"];
    expect(nivelDe(camada.camada!, "3170107")).toBe("roxo"); // Uberaba
    expect(camada.meta?.erro).toContain("Falha inesperada");
    expect(risco.combinado.areas.cob.find((a) => a.cob === "2º COB")?.nivel).toBe("roxo");
  });

  it("GET com DADOS_EXEMPLO=1: 200, sem cache no CDN e sem nenhum dado pessoal (LGPD)", async () => {
    vi.stubEnv("DADOS_EXEMPLO", "1");
    reiniciarEnv();
    vi.stubGlobal("fetch", vi.fn());

    const resposta = await GET();
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("Cache-Control")).toBe("no-store");
    const texto = await resposta.text();
    const corpo = JSON.parse(texto);
    expect(Object.keys(corpo).sort()).toEqual(["camadas", "combinado", "geradoEm", "meta"]);
    expect(Object.keys(corpo.camadas)).toEqual(["meteorologico", "geologico", "hidrologico", "alertas-cbmmg"]);

    // Os exemplos do formulário trazem nome, nº BM e posto do militar: nada disso pode sair.
    for (const pessoal of ["Fulano", "Beltrano", "Ciclano", "Fulana", "187517-0", "Sgt", "survey123_cbmmg"]) {
      expect(texto).not.toContain(pessoal);
    }
    const proibidas = ["cpf", "nome_militar", "numero", "posto_grad", "Creator", "Editor", "observacoes", "telefone"];
    const todas = chaves(corpo);
    for (const chave of proibidas) expect(todas.has(chave)).toBe(false);
  });

  it("produção: envia os cabeçalhos do painel ao CEMADEN e cai na última leitura válida se o formato mudar", async () => {
    vi.stubEnv("DADOS_EXEMPLO", "0");
    reiniciarEnv();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AGORA);
    const fetch = vi.fn(async () => Response.json(ALERTAS_CEMADEN_EXEMPLO));
    vi.stubGlobal("fetch", fetch);

    const primeira = await obterAlertasCemaden(AGORA);
    expect(primeira.origem).toBe("ao-vivo");
    expect(primeira.dados.alertas).toHaveLength(11);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://painelalertas.cemaden.gov.br/wsAlertas2");
    expect(init.headers).toMatchObject({
      Origin: "https://painelalertas.cemaden.gov.br",
      Referer: "https://painelalertas.cemaden.gov.br/",
      Accept: "application/json",
    });
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/SalaSituacao-CBMMG/);

    // 11 min depois (cache de 10 min vencido) o endpoint muda de formato.
    vi.setSystemTime(new Date(AGORA.getTime() + 11 * 60_000));
    fetch.mockImplementation(async () => Response.json({ atualizado: "x", dados: [] }));
    const segunda = await obterAlertasCemaden();
    expect(segunda.origem).toBe("ultima-valida");
    expect(segunda.erro).toMatch(/alertas/);
    expect(segunda.dados.alertas).toHaveLength(11);
  });

  it("produção: INMET ativo ao vivo, filtrado a cada chamada pela janela", async () => {
    vi.stubEnv("DADOS_EXEMPLO", "0");
    reiniciarEnv();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AGORA);
    const fetch = vi.fn(async () => Response.json(AVISOS_ATIVOS_INMET_EXEMPLO));
    vi.stubGlobal("fetch", fetch);

    const leitura = await obterAvisosInmetMunicipios(AGORA);
    expect(leitura.origem).toBe("ao-vivo");
    expect(fetch.mock.calls[0]).toContain("https://apiprevmet3.inmet.gov.br/avisos/ativos");
    expect(leitura.dados.avisos.map((a) => a.id)).toEqual(["56012", "56018", "56015"]);

    // Mesma leitura em cache, outra hora: a Tempestade (até 23:59) já saiu.
    vi.setSystemTime(new Date(AGORA.getTime() + 5 * 60_000));
    const depois = await obterAvisosInmetMunicipios(new Date("2026-10-03T03:00:00.000Z"));
    expect(depois.origem).toBe("cache");
    expect(depois.dados.avisos.map((a) => a.id)).toEqual(["56012", "56018"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("GET: 503 só quando TODAS as fontes falham sem leitura anterior", async () => {
    vi.stubEnv("DADOS_EXEMPLO", "0");
    reiniciarEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const resposta = await GET();
    expect(resposta.status).toBe(503);
    expect(resposta.headers.get("Cache-Control")).toBe("no-store");
    const corpo = await resposta.json();
    expect(corpo.camadas).toHaveLength(4);
    expect(corpo.camadas.every((c: { erro: string | null }) => c.erro)).toBe(true);
  });

  it("GET: com uma fonte de pé, responde 200 com as outras camadas indisponíveis", async () => {
    vi.stubEnv("DADOS_EXEMPLO", "0");
    reiniciarEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("https://painelalertas.cemaden.gov.br")) return Response.json(ALERTAS_CEMADEN_EXEMPLO);
        throw new TypeError("fetch failed");
      }),
    );
    const resposta = await GET();
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("Cache-Control")).toContain("s-maxage=30");
    const corpo = await resposta.json();
    expect(corpo.combinado.camadas).toEqual(["geologico", "hidrologico"]);
    expect(corpo.combinado.indisponiveis).toEqual(["meteorologico", "alertas-cbmmg"]);
    expect(corpo.camadas.meteorologico.erro).toMatch(/INMET/);
    expect(corpo.meta.origem).toBe("ao-vivo");
  });
});
