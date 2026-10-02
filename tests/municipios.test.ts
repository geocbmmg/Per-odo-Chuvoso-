import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FRACOES_CBMMG, nomeMunicipio, MUNICIPIOS_FORMULARIO } from "@/lib/territorio/fracoes";
import { MUNICIPIOS_MG, municipioPorIbge, municipioPorNome } from "@/lib/territorio/municipios";

describe("municípios de MG com território do CBMMG", () => {
  it("853 municípios, códigos IBGE únicos de MG, COB e UEOp preenchidos", () => {
    expect(MUNICIPIOS_MG).toHaveLength(853);
    expect(new Set(MUNICIPIOS_MG.map((m) => m.ibge)).size).toBe(853);
    for (const m of MUNICIPIOS_MG) {
      expect(m.ibge).toMatch(/^31\d{5}$/);
      expect(m.cob).toMatch(/^[1-6]º COB$/);
      expect(m.ueop).toBeTruthy();
      expect(m.lat).toBeGreaterThan(-23);
      expect(m.lat).toBeLessThan(-14);
    }
  });

  it("a UEOp de cada município é uma UEOp do seu COB na tabela oficial de frações", () => {
    const ueopsPorCob = new Map<string, Set<string>>();
    for (const f of FRACOES_CBMMG) {
      const s = ueopsPorCob.get(f.cob) ?? new Set();
      s.add(f.ueop);
      ueopsPorCob.set(f.cob, s);
    }
    for (const m of MUNICIPIOS_MG) expect(ueopsPorCob.get(m.cob)?.has(m.ueop), m.nome).toBe(true);
  });

  it("toda cidade-sede de fração fica com uma fração do próprio COB", () => {
    for (const f of FRACOES_CBMMG) {
      if (f.ueop.endsWith("COB") || f.cidade.startsWith("Barreiro")) continue;
      const m = municipioPorNome(f.cidade);
      expect(m, f.cidade).not.toBeNull();
      expect(m?.cob, f.cidade).toBe(f.cob);
    }
  });

  it("os 853 municípios do formulário Survey123 se ligam ao código IBGE pelo nome", () => {
    const semIbge = MUNICIPIOS_FORMULARIO.filter((m) => !municipioPorNome(nomeMunicipio(m.codigo)));
    expect(semIbge).toEqual([]);
  });

  it("busca por código e por nome tolerante", () => {
    expect(municipioPorIbge("3106200")?.nome).toBe("Belo Horizonte");
    expect(municipioPorIbge(3106200)?.nome).toBe("Belo Horizonte");
    expect(municipioPorNome("sao joao del rei")?.ibge).toBe(municipioPorNome("São João del-Rei")?.ibge);
    expect(municipioPorNome("Muriaé - MG")?.nome).toBe("Muriaé");
    expect(municipioPorNome("Atlantis")).toBeNull();
  });

  it("a malha pública traz o mesmo território", () => {
    const malha = JSON.parse(readFileSync(new URL("../public/geo/municipios-mg.json", import.meta.url), "utf8"));
    expect(malha.features).toHaveLength(853);
    for (const f of malha.features) {
      const m = municipioPorIbge(f.properties.ibge);
      expect(f.properties).toEqual({ ibge: m?.ibge, nome: m?.nome, cob: m?.cob, ueop: m?.ueop });
    }
    const ueops = JSON.parse(readFileSync(new URL("../public/geo/ueops-mg.json", import.meta.url), "utf8"));
    expect(ueops.features.reduce((s: number, f: { properties: { municipios: number } }) => s + f.properties.municipios, 0)).toBe(853);
  });
});
