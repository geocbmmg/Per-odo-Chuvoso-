import { describe, expect, it } from "vitest";
import { calcularIndicadores } from "@/lib/dados/indicadores";
import { periodoChuvoso } from "@/lib/dominio/periodo";
import type { AcaoRrd, Alerta, OcorrenciaComplexa } from "@/lib/dominio/tipos";

const agora = new Date("2026-10-20T15:00:00Z");
const atual = periodoChuvoso("atual", agora); // 2026/2027

function alerta(p: Partial<Alerta>): Alerta {
  return {
    id: Math.random().toString(36).slice(2),
    numeroChamada: null,
    cob: null,
    ueop: null,
    fracao: null,
    municipio: null,
    tipoRisco: null,
    nivel: null,
    chuvaMmHora: null,
    chuva24hMm: null,
    bacia: null,
    rio: null,
    cota: null,
    indiceRisco: null,
    emitidoEm: "2026-10-10T12:00:00Z",
    validoAte: null,
    ...p,
  };
}

function acao(p: Partial<AcaoRrd>): AcaoRrd {
  return {
    id: Math.random().toString(36).slice(2),
    numeroChamada: null,
    cob: null,
    ueop: null,
    fracao: null,
    municipio: null,
    descricao: null,
    acoes: [],
    reds: [],
    executadaEm: "2026-10-11T12:00:00Z",
    ...p,
  };
}

describe("calcularIndicadores", () => {
  const alertas = [
    alerta({ numeroChamada: "CAD 0001234", cob: "1º COB", tipoRisco: "Inundação" }),
    alerta({ numeroChamada: "5555", cob: "1º COB", tipoRisco: "Deslizamento" }),
    alerta({ numeroChamada: null, cob: null, tipoRisco: "Inundação" }),
    alerta({ numeroChamada: "7777", cob: "3º COB", tipoRisco: null }),
    // fora do período (temporada anterior)
    alerta({ numeroChamada: "9999", cob: "2º COB", emitidoEm: "2026-02-01T12:00:00Z" }),
  ];
  const acoes = [
    acao({ numeroChamada: "1234", cob: "1º COB" }),
    // ação de outra temporada ainda resolve o alerta 7777
    acao({ numeroChamada: "0007777", cob: "3º COB", executadaEm: "2026-03-30T12:00:00Z" }),
    acao({ numeroChamada: "4242", cob: null }),
  ];

  const ind = calcularIndicadores(atual, alertas, acoes, null);

  it("conta alertas e ações do período", () => {
    expect(ind.totalAlertas).toBe(4);
    expect(ind.totalAcoesRrd).toBe(2);
  });

  it("pendente = alerta sem ação RRD com o mesmo nº de chamada (normalizado)", () => {
    // 5555 sem ação; sem nº de chamada também é pendente
    expect(ind.alertasPendentes).toBe(2);
    expect(ind.alertasSemNumeroChamada).toBe(1);
  });

  it("agrega por COB com 'Sem COB' explícito e ordenado por último", () => {
    expect(ind.porCob).toEqual([
      { cob: "1º COB", alertas: 2, acoesRrd: 1, pendentes: 1 },
      { cob: "3º COB", alertas: 1, acoesRrd: 0, pendentes: 0 },
      { cob: "Sem COB", alertas: 1, acoesRrd: 1, pendentes: 1 },
    ]);
  });

  it("agrega por tipo de risco, com 'Não informado'", () => {
    expect(ind.porTipoRisco).toEqual([
      { tipo: "Inundação", total: 2 },
      { tipo: "Deslizamento", total: 1 },
      { tipo: "Não informado", total: 1 },
    ]);
  });

  it("conta ocorrências complexas por situação", () => {
    const ocorrencias: OcorrenciaComplexa[] = [
      { id: "1", numeroChamada: null, titulo: "A", situacao: "em-andamento", cob: null, ueop: null, fracao: null, municipio: null, iniciadaEm: "2025-01-01T00:00:00Z" },
      { id: "2", numeroChamada: null, titulo: "B", situacao: "finalizada", cob: null, ueop: null, fracao: null, municipio: null, iniciadaEm: "2026-10-05T00:00:00Z" },
      { id: "3", numeroChamada: null, titulo: "C", situacao: "finalizada", cob: null, ueop: null, fracao: null, municipio: null, iniciadaEm: "2025-12-05T00:00:00Z" },
    ];
    const r = calcularIndicadores(atual, [], [], ocorrencias);
    expect(r.ocorrenciasComplexas).toEqual({ "em-andamento": 1, monitoramento: 0, finalizada: 1, desconhecida: 0 });
  });

  it("período 'tudo' inclui registros sem data", () => {
    const r = calcularIndicadores(periodoChuvoso("tudo"), [alerta({ emitidoEm: null })], [], null);
    expect(r.totalAlertas).toBe(1);
  });
});
