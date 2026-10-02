import { describe, expect, it } from "vitest";
import { calcularIndicadores } from "@/lib/dados/indicadores";
import { periodoChuvoso } from "@/lib/dominio/periodo";
import type { CamadaArcgisId } from "@/lib/sources/arcgis/camadas";
import type { CampoEsri, CamadasServicoEsri, MetadadosCamadaEsri } from "@/lib/sources/arcgis/cliente";
import { encontrarRepeticao, escolherCamada, normalizarGuid } from "@/lib/sources/arcgis/deteccao";
import { classificarSituacao, classificarTipoRisco } from "@/lib/sources/arcgis/normalizar";
import { normalizarCamada, planejarLeitura } from "@/lib/sources/arcgis/plano";
import { CANDIDATOS_ACAO_RRD_REPETICAO, CANDIDATOS_ALERTA } from "@/lib/sources/arcgis/camadas";
import { REFERENCIA_ARCGIS_EXEMPLO, exemploServicoArcgis } from "@/lib/sources/exemplos/arcgis";

const agora = new Date(REFERENCIA_ARCGIS_EXEMPLO);

/** Mesmo caminho da produção: escolha da camada → repetição → normalização. */
function ler<K extends CamadaArcgisId>(id: K) {
  const exemplo = exemploServicoArcgis(id, agora);
  const plano = planejarLeitura(id, exemplo.servico);
  return normalizarCamada(
    id,
    plano,
    exemplo.feicoes(plano.principal.id),
    plano.repeticao ? exemplo.feicoes(plano.repeticao.metadados.id) : [],
  );
}

describe("leitura das camadas ArcGIS no esquema real dos formulários (dados de exemplo)", () => {
  const alertas = ler("alertas");
  const acoes = ler("acoes-rrd");

  it("resolve os campos do XLSForm de Emissão de Alertas", () => {
    expect(alertas.diagnostico.campos).toEqual({
      numeroChamada: "chamada",
      cob: "cob",
      ueop: "ueop",
      // O alias "Fração Responsável" do campo ueop casa com fração; a fração sai da tabela oficial.
      fracao: "ueop",
      municipio: "municipio",
      tipoRisco: "tipo",
      nivel: "nivel",
      nivelHidrologico: "inundacao",
      nivelGeologico: "deslizamento",
      chuvaMmHora: "mmh",
      chuva24hMm: "mmpor",
      bacia: "bacia",
      rio: "rio",
      cota: "cota",
      indiceRisco: "indice",
      validoAte: "validade",
      emitidoEm: "datain",
    });
  });

  it("decompõe a fração oficial em COB → UEOp → fração e traduz o município", () => {
    const ouroPreto = alertas.feicoes.features.find((f) => f.properties.municipio === "Ouro Preto");
    expect(ouroPreto?.properties).toMatchObject({
      cob: "1º COB",
      ueop: "1º BBM",
      fracao: "2ª Cia/1º Pel (Ouro Preto)",
      tipoRisco: "Geológico",
      nivel: "Laranja (Alto)",
      indiceRisco: 1.9,
    });
    const pocos = alertas.feicoes.features.find((f) => f.properties.municipio === "Poços de Caldas");
    expect(pocos?.properties).toMatchObject({ cob: "6º COB", ueop: "1ª Cia Ind", fracao: null });
  });

  it("lê o nível no campo do tipo de risco e os dados de cada tipo", () => {
    const porTipo = (tipo: string) => alertas.feicoes.features.filter((f) => f.properties.tipoRisco === tipo);
    expect(porTipo("Meteorológico").every((f) => f.properties.nivel && f.properties.chuva24hMm !== null)).toBe(true);
    const hidro = porTipo("Hidrológico");
    expect(hidro.length).toBeGreaterThan(0);
    expect(hidro.every((f) => f.properties.nivel && f.properties.rio && f.properties.cota !== null)).toBe(true);
    const muriae = hidro.find((f) => f.properties.municipio === "Muriaé");
    expect(muriae?.properties).toMatchObject({ bacia: "Rio Muriaé", nivel: "Vermelho (Inundação)", cota: 640 });
    expect(alertas.feicoes.features.every((f) => f.properties.validoAte === null || f.properties.validoAte > (f.properties.emitidoEm ?? ""))).toBe(true);
  });

  it("descarta dados pessoais (LGPD): só os atributos de domínio saem", () => {
    const chaves = new Set(alertas.feicoes.features.flatMap((f) => Object.keys(f.properties)));
    expect([...chaves].sort()).toEqual(
      [
        "bacia",
        "chuva24hMm",
        "chuvaMmHora",
        "cob",
        "cota",
        "emitidoEm",
        "fracao",
        "id",
        "indiceRisco",
        "municipio",
        "nivel",
        "numeroChamada",
        "rio",
        "tipoRisco",
        "ueop",
        "validoAte",
      ].sort(),
    );
    const texto = JSON.stringify([alertas.feicoes, acoes.feicoes]);
    expect(texto).not.toMatch(/Fulan|Beltrano|Ciclano|Sgt |Ten |survey123_cbmmg|EMBM|repassado/);
    // nº BM de quem emitiu (campo "numero" do formulário)
    const exemplo = exemploServicoArcgis("alertas", agora);
    for (const f of exemplo.feicoes(0)) {
      if (typeof f.attributes.numero === "string") expect(texto).not.toContain(f.attributes.numero);
    }
  });

  it("agrupa o tipo de risco nas três categorias, apesar dos rótulos do formulário", () => {
    const tipos = new Set(alertas.feicoes.features.map((f) => f.properties.tipoRisco));
    expect([...tipos].sort()).toEqual(["Geológico", "Hidrológico", "Meteorológico"]);
    expect(classificarTipoRisco("Metereológico (Chuva)")).toBe("Meteorológico");
    expect(classificarTipoRisco("Hidrológico (Inuncação)")).toBe("Hidrológico");
    expect(classificarTipoRisco("Deslizamento")).toBe("Geológico");
    expect(classificarTipoRisco("Incêndio")).toBe("Incêndio");
  });

  it("mantém registro sem COB e descarta o ponto 0,0 do Survey123", () => {
    const semCob = alertas.feicoes.features.filter((f) => f.properties.cob === null);
    expect(semCob).toHaveLength(1);
    expect(semCob[0].geometry).toBeNull();
    expect(alertas.diagnostico.semGeometria).toBe(1);
  });

  it("junta as ações da repetição ao registro de Ações RRD (parentglobalid)", () => {
    expect(acoes.diagnostico.campos).toEqual({
      numeroChamada: "chamada",
      cob: "cob",
      ueop: "ueop",
      fracao: "ueop",
      municipio: "municipio",
      // descrição: vem da repetição (não aparece como "não encontrado" na camada principal)
      executadaEm: "datain",
    });
    expect(acoes.diagnostico.repeticao).toEqual({
      campos: { descricao: "acao", reds: "reds", ligacao: "parentglobalid" },
      totalRegistros: 33,
      vinculados: 33,
    });
    expect(acoes.feicoes.features.every((f) => f.properties.acoes.length >= 1)).toBe(true);
    const comDuas = acoes.feicoes.features.find((f) => f.properties.acoes.length === 2);
    expect(comDuas?.properties.descricao).toBe(comDuas?.properties.acoes.join("; "));
    const semCob = acoes.feicoes.features.find((f) => f.properties.cob === null);
    expect(semCob?.properties).toMatchObject({ municipio: "Ouro Preto", acoes: ["CONTATOS SENDO REALIZADOS"], reds: [] });
  });

  it("informa a camada lida e a tabela de repetição", () => {
    // Configurada a camada 1; o serviço de exemplo só tem a 0, com os campos do formulário.
    expect(alertas.origem).toMatchObject({ id: 0, configurada: 1, tipo: "camada", pontuacao: 8, total: 8, repeticao: null });
    expect(acoes.origem).toMatchObject({ id: 0, configurada: 0, repeticao: { id: 1, nome: "acoes" } });
  });

  it("normaliza ocorrências e COBs", () => {
    const ocorrencias = ler("ocorrencias-complexas");
    expect(ocorrencias.feicoes.features.map((f) => f.properties.situacao)).toEqual([
      "em-andamento",
      "monitoramento",
      "monitoramento",
      "finalizada",
      "finalizada",
    ]);
    expect(JSON.stringify(ocorrencias.feicoes)).not.toMatch(/comandante/i);

    const cobs = ler("cobs");
    expect(cobs.feicoes.features.map((f) => f.properties.cob)).toEqual([
      "1º COB",
      "2º COB",
      "3º COB",
      "4º COB",
      "5º COB",
      "6º COB",
    ]);
    expect(cobs.feicoes.features.every((f) => f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")).toBe(true);
  });

  it("os indicadores do exemplo fecham com os registros", () => {
    const ind = calcularIndicadores(
      periodoChuvoso("atual", agora),
      alertas.feicoes.features.map((f) => f.properties),
      acoes.feicoes.features.map((f) => f.properties),
      null,
    );
    // 18 alertas na temporada 2026/27: 12 com ação RRD, 5 sem ação e 1 sem nº de chamada.
    expect(ind.totalAlertas).toBe(18);
    expect(ind.totalAcoesRrd).toBe(13);
    expect(ind.alertasPendentes).toBe(6);
    expect(ind.alertasSemNumeroChamada).toBe(1);
    expect(ind.porCob.at(-1)?.cob).toBe("Sem COB");
    const anterior = calcularIndicadores(
      periodoChuvoso("anterior", agora),
      alertas.feicoes.features.map((f) => f.properties),
      acoes.feicoes.features.map((f) => f.properties),
      null,
    );
    expect(anterior.totalAlertas).toBe(8);
    expect(anterior.alertasPendentes).toBe(0);
  });

  it("classifica situações de ocorrência a partir do texto", () => {
    expect(classificarSituacao("Em andamento")).toBe("em-andamento");
    expect(classificarSituacao("MONITORAMENTO")).toBe("monitoramento");
    expect(classificarSituacao("Encerrada")).toBe("finalizada");
    expect(classificarSituacao(null)).toBe("desconhecida");
  });
});

describe("escolha automática da camada do formulário", () => {
  const campo = (name: string, alias = name): CampoEsri => ({ name, alias, type: "esriFieldTypeString" });
  const camada = (id: number, nomes: string[], type = "Feature Layer"): MetadadosCamadaEsri => ({
    id,
    name: `c${id}`,
    type,
    fields: [{ name: "objectid", type: "esriFieldTypeOID" }, ...nomes.map((n) => campo(n))],
  });
  const opcoes = (preferida: number) => ({
    preferida,
    candidatos: CANDIDATOS_ALERTA,
    chaves: ["numeroChamada", "cob", "ueop", "tipoRisco"] as const,
  });

  it("vence a camada com mais campos-chave, mesmo fora do índice configurado", () => {
    const servico: CamadasServicoEsri = {
      layers: [camada(0, ["chamada", "cob", "ueop", "tipo"]), camada(1, ["cob", "observacao"])],
      tables: [],
    };
    expect(escolherCamada(servico, opcoes(1))).toMatchObject({
      metadados: { id: 0 },
      pontuacao: 4,
      total: 4,
      diferenteDaConfigurada: true,
    });
  });

  it("empate fica com o índice configurado; depois camada antes de tabela", () => {
    const servico: CamadasServicoEsri = {
      layers: [camada(0, ["chamada", "cob"]), camada(1, ["chamada", "cob"])],
      tables: [camada(2, ["chamada", "cob"], "Table")],
    };
    expect(escolherCamada(servico, opcoes(1))?.metadados.id).toBe(1);
    expect(escolherCamada(servico, opcoes(2))?.metadados.id).toBe(2);
    expect(escolherCamada(servico, opcoes(7))?.metadados.id).toBe(0);
  });

  it("acha a tabela de repetição pelo parentglobalid e não a usa como principal", () => {
    const filha: MetadadosCamadaEsri = {
      ...camada(1, ["acao", "reds", "var2"], "Table"),
      fields: [
        ...camada(1, ["acao", "reds"]).fields,
        campo("var2", "Chamada duplicada"),
        campo("var4", "cob duplicado"),
        campo("var5", "ueop duplicado"),
        { name: "parentglobalid", type: "esriFieldTypeGUID" },
      ],
    };
    const servico: CamadasServicoEsri = { layers: [camada(0, ["chamada", "cob", "ueop"])], tables: [filha] };
    const repeticao = encontrarRepeticao(servico, {
      principal: 0,
      candidatos: CANDIDATOS_ACAO_RRD_REPETICAO,
      conteudo: "descricao",
    });
    expect(repeticao?.metadados.id).toBe(1);
    expect(repeticao?.campoPai.name).toBe("parentglobalid");
  });

  it("compara GlobalIDs sem chaves e sem caixa", () => {
    expect(normalizarGuid("{ab-12}")).toBe("AB-12");
    expect(normalizarGuid("AB-12")).toBe("AB-12");
    expect(normalizarGuid(null)).toBeNull();
  });
});
