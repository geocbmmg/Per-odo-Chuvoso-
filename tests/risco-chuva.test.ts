import { describe, expect, it } from "vitest";
import { nivelNaJanela, resumirChuva } from "@/lib/dominio/chuva";
import type { NivelRisco } from "@/lib/dominio/matrizes";
import { agregarPorArea, agruparPorMunicipio, type MunicipioTerritorio } from "@/lib/dominio/risco";

describe("resumirChuva (janelas de 24 h e 72 h pela matriz)", () => {
  it("chuva fraca o tempo todo fica verde nas duas janelas", () => {
    const r = resumirChuva("3106200", Array(96).fill(0.5));
    expect(r).toMatchObject({ maxHora24h: 0.5, acumulado24h: 12, acumulado72h: 36, pior24hEm72h: 12 });
    expect(r.nivel24h).toBe("verde");
    expect(r.nivel72h).toBe("verde");
  });

  it("pico horário decide quando o acumulado é baixo (critério mais grave)", () => {
    const horas = Array(72).fill(0);
    horas[5] = 45; // > 30 e ≤ 70 mm/h → laranja
    const r = resumirChuva("3106200", horas);
    expect(r.nivel24h).toBe("laranja");
    expect(r.acumulado24h).toBe(45);
  });

  it("a janela de 72 h usa o pior acumulado em 24 h consecutivas, não a soma das 72 h", () => {
    // 3 dias com 50 mm/dia: 150 mm em 72 h, mas nenhum bloco de 24 h passa de 60 → verde por 24 h
    const horas = Array(72).fill(50 / 24);
    const r = resumirChuva("3106200", horas);
    expect(r.acumulado72h).toBe(150);
    expect(r.pior24hEm72h).toBe(50);
    expect(r.nivel72h).toBe("verde");
    // chuva concentrada no 2º dia: 100 mm em 24 h → laranja (> 90) só na janela de 72 h
    const concentrada = Array(72).fill(0);
    for (let i = 30; i < 50; i++) concentrada[i] = 5;
    const c = resumirChuva("3106200", concentrada);
    expect(c.nivel24h).toBe("verde");
    expect(c.pior24hEm72h).toBe(100);
    expect(c.nivel72h).toBe("laranja");
    expect(nivelNaJanela(c, "24h")).toBe("verde");
    expect(nivelNaJanela(c, "72h")).toBe("laranja");
  });

  it("hora faltando não vira zero: a janela fica sem dado", () => {
    const horas: (number | null)[] = Array(72).fill(1);
    horas[10] = null;
    const r = resumirChuva("3106200", horas);
    expect(r.acumulado24h).toBeNull();
    expect(r.maxHora24h).toBeNull();
    expect(r.nivel24h).toBeNull();
    expect(r.pior24hEm72h).toBeNull();
    expect(resumirChuva("3106200", Array(30).fill(1)).nivel72h).toBeNull();
  });
});

describe("risco por município e agregação pela hierarquia do CBMMG", () => {
  const item = (ibge: string, nivel: NivelRisco, titulo = "Aviso") => ({
    ibge,
    nivel,
    titulo,
    fonte: "INMET",
    inicio: null,
    fim: null,
    ref: null,
  });

  it("agrupa itens por município, com o pior nível primeiro", () => {
    const r = agruparPorMunicipio([
      item("3106200", "amarelo", "A"),
      item("3106200", "vermelho", "B"),
      item("3170206", "laranja"),
      item("31", "roxo"), // código inválido é ignorado
    ]);
    expect(r.map((m) => [m.ibge, m.nivel])).toEqual([
      ["3106200", "vermelho"],
      ["3170206", "laranja"],
    ]);
    expect(r[0].itens.map((i) => i.titulo)).toEqual(["B", "A"]);
  });

  const municipios: MunicipioTerritorio[] = [
    { ibge: "1", nome: "Belo Horizonte", cob: "1º COB", ueop: "1º BBM" },
    { ibge: "2", nome: "Contagem", cob: "1º COB", ueop: "2º BBM" },
    { ibge: "3", nome: "Betim", cob: "1º COB", ueop: "2º BBM" },
    { ibge: "4", nome: "Juiz de Fora", cob: "3º COB", ueop: "4º BBM" },
  ];
  const niveis = new Map<string, NivelRisco>([
    ["1", "amarelo"],
    ["2", "laranja"],
    ["3", "laranja"],
  ]);

  it("COB: pior nível, contagem por nível e total de municípios", () => {
    const cobs = agregarPorArea(municipios, niveis, "cob");
    expect(cobs.map((a) => [a.chave, a.nivel, a.totalMunicipios])).toEqual([
      ["1º COB", "laranja", 3],
      ["3º COB", null, 1],
    ]);
    expect(cobs[0].contagem).toEqual({ verde: 0, amarelo: 1, laranja: 2, vermelho: 0, roxo: 0 });
    expect(cobs[0].piorMunicipio).toEqual({ ibge: "3", nome: "Betim" }); // empate: ordem alfabética
  });

  it("UEOp: chave com o COB", () => {
    const ueops = agregarPorArea(municipios, niveis, "ueop");
    expect(ueops.map((a) => [a.chave, a.nivel])).toEqual([
      ["1º COB · 1º BBM", "amarelo"],
      ["1º COB · 2º BBM", "laranja"],
      ["3º COB · 4º BBM", null],
    ]);
  });
});
