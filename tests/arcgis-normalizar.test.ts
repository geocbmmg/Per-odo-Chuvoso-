import { describe, expect, it } from "vitest";
import { calcularIndicadores } from "@/lib/dados/indicadores";
import { periodoChuvoso } from "@/lib/dominio/periodo";
import {
  classificarSituacao,
  normalizarAcoesRrd,
  normalizarAlertas,
  normalizarCobs,
  normalizarOcorrencias,
} from "@/lib/sources/arcgis/normalizar";
import { REFERENCIA_ARCGIS_EXEMPLO, exemploBrutoArcgis } from "@/lib/sources/exemplos/arcgis";

const agora = new Date(REFERENCIA_ARCGIS_EXEMPLO);

describe("normalização das camadas ArcGIS (dados de exemplo no formato do servidor)", () => {
  const brutoAlertas = exemploBrutoArcgis("alertas", agora);
  const alertas = normalizarAlertas(brutoAlertas.metadados.fields, brutoAlertas.feicoes);

  it("resolve todos os atributos lógicos do formulário de alertas", () => {
    expect(alertas.diagnostico.campos).toEqual({
      numeroChamada: "numero_chamada",
      cob: "cob",
      ueop: "ueop",
      fracao: null, // o formulário de exemplo não tem fração: aparece como "não encontrado" em /status
      municipio: "municipio",
      tipoRisco: "tipo_risco",
      nivel: "nivel_alerta",
      cota: "cota",
      emitidoEm: "data_emissao",
    });
  });

  it("traduz domínios do Survey123 e normaliza o COB", () => {
    const bh = alertas.feicoes.features.find((f) => f.properties.municipio === "Belo Horizonte");
    expect(bh?.properties).toMatchObject({ cob: "1º COB", tipoRisco: "Alagamento", nivel: "Alerta" });
    expect(bh?.geometry?.type).toBe("Point");
  });

  it("descarta dados pessoais (LGPD): só os atributos de domínio saem", () => {
    const chaves = new Set(alertas.feicoes.features.flatMap((f) => Object.keys(f.properties)));
    expect([...chaves].sort()).toEqual(
      ["cob", "cota", "emitidoEm", "fracao", "id", "municipio", "nivel", "numeroChamada", "tipoRisco", "ueop"].sort(),
    );
    const texto = JSON.stringify(alertas.feicoes);
    expect(texto).not.toMatch(/militar|numero_bm|telefone|Sgt |Cb |Ten |\(31\)/);
  });

  it("mantém registro sem COB e descarta o ponto 0,0 do Survey123", () => {
    const semCob = alertas.feicoes.features.filter((f) => f.properties.cob === null);
    expect(semCob).toHaveLength(1);
    expect(semCob[0].geometry).toBeNull();
    expect(alertas.diagnostico.semGeometria).toBe(1);
  });

  it("normaliza ações RRD, ocorrências e COBs", () => {
    const b = exemploBrutoArcgis("acoes-rrd", agora);
    const acoes = normalizarAcoesRrd(b.metadados.fields, b.feicoes);
    expect(acoes.diagnostico.campos.descricao).toBe("acao_executada");
    expect(acoes.feicoes.features.some((f) => f.properties.cob === null)).toBe(true);

    const o = exemploBrutoArcgis("ocorrencias-complexas", agora);
    const ocorrencias = normalizarOcorrencias(o.metadados.fields, o.feicoes);
    expect(ocorrencias.feicoes.features.map((f) => f.properties.situacao)).toEqual([
      "em-andamento",
      "monitoramento",
      "monitoramento",
      "finalizada",
      "finalizada",
    ]);
    expect(JSON.stringify(ocorrencias.feicoes)).not.toMatch(/comandante/i);

    const c = exemploBrutoArcgis("cobs", agora);
    const cobs = normalizarCobs(c.metadados.fields, c.feicoes);
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
    const b = exemploBrutoArcgis("acoes-rrd", agora);
    const acoes = normalizarAcoesRrd(b.metadados.fields, b.feicoes);
    const ind = calcularIndicadores(
      periodoChuvoso("atual", agora),
      alertas.feicoes.features.map((f) => f.properties),
      acoes.feicoes.features.map((f) => f.properties),
      null,
    );
    // 18 alertas na temporada 2026/27; 12 com ação vinculada (inclusive "CAD 000…"), 6 pendentes
    expect(ind.totalAlertas).toBe(18);
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
