import { describe, expect, it } from "vitest";
import type { CampoEsri } from "@/lib/sources/arcgis/cliente";
import {
  comoDataIso,
  comoNumero,
  comoTexto,
  lerAtributo,
  normalizarIdentificador,
  normalizarNumeroChamada,
  resolverCampo,
  resolverCampos,
  resumoResolucao,
} from "@/lib/sources/arcgis/campos";

const campos: CampoEsri[] = [
  { name: "objectid", type: "esriFieldTypeOID", alias: "ObjectID" },
  { name: "cobrade", type: "esriFieldTypeString", alias: "Código COBRADE" },
  { name: "n_chamada", type: "esriFieldTypeString", alias: "Nº da Chamada (CAD)" },
  {
    name: "cob_resp",
    type: "esriFieldTypeString",
    alias: "COB",
    domain: {
      type: "codedValue",
      codedValues: [
        { name: "1º COB", code: "cob1" },
        { name: "2º COB", code: "cob2" },
      ],
    },
  },
  { name: "municipio", type: "esriFieldTypeString", alias: "Município" },
  {
    name: "riscos",
    type: "esriFieldTypeString",
    alias: "Tipos de risco",
    domain: {
      type: "codedValue",
      codedValues: [
        { name: "Inundação", code: "inundacao" },
        { name: "Deslizamento", code: "deslizamento" },
      ],
    },
  },
];

describe("resolução de campos", () => {
  it("normaliza identificadores", () => {
    expect(normalizarIdentificador("Nº da Chamada (CAD)")).toBe("ndachamadacad");
    expect(normalizarIdentificador("Município")).toBe("municipio");
  });

  it("resolve por nome, prefixo e alias, com nome tendo prioridade", () => {
    expect(resolverCampo(campos, ["cob", "cob_*"])?.name).toBe("cob_resp");
    // "cob_*" não pode casar "cobrade" (classificação de desastres).
    expect(resolverCampo(campos.filter((c) => c.name !== "cob_resp"), ["cob_*"])).toBeNull();
    expect(resolverCampo(campos, ["numero_chamada", "Nº da Chamada (CAD)"])?.name).toBe("n_chamada");
    expect(resolverCampo(campos, ["municipio"])?.name).toBe("municipio");
    expect(resolverCampo(campos, ["inexistente"])).toBeNull();
  });

  it("resume a resolução para diagnóstico", () => {
    const mapa = resolverCampos(campos, { cob: ["cob_*"], ueop: ["ueop", "unidade"] });
    expect(resumoResolucao(mapa)).toEqual({ cob: "cob_resp", ueop: null });
  });

  it("traduz domínios codificados, inclusive escolha múltipla", () => {
    const cob = campos.find((c) => c.name === "cob_resp")!;
    const riscos = campos.find((c) => c.name === "riscos")!;
    expect(lerAtributo({ cob_resp: "cob2" }, cob)).toBe("2º COB");
    expect(lerAtributo({ cob_resp: "outro" }, cob)).toBe("outro");
    expect(lerAtributo({ riscos: "inundacao,deslizamento" }, riscos)).toBe("Inundação, Deslizamento");
    expect(lerAtributo({ cob_resp: null }, cob)).toBeNull();
    expect(lerAtributo({}, null)).toBeNull();
  });
});

describe("conversões", () => {
  it("texto", () => {
    expect(comoTexto("  Belo   Horizonte ")).toBe("Belo Horizonte");
    expect(comoTexto("null")).toBeNull();
    expect(comoTexto("")).toBeNull();
    expect(comoTexto(42)).toBe("42");
  });

  it("número em formato brasileiro e internacional", () => {
    expect(comoNumero("1.234,5")).toBe(1234.5);
    expect(comoNumero("3,2")).toBe(3.2);
    expect(comoNumero("1234.5")).toBe(1234.5);
    expect(comoNumero(7)).toBe(7);
    expect(comoNumero("abc")).toBeNull();
    expect(comoNumero(Number.NaN)).toBeNull();
  });

  it("datas epoch ms e ISO", () => {
    expect(comoDataIso(1790000000000)).toBe(new Date(1790000000000).toISOString());
    expect(comoDataIso("1790000000000")).toBe(new Date(1790000000000).toISOString());
    expect(comoDataIso("2026-10-02T13:00:00Z")).toBe("2026-10-02T13:00:00.000Z");
    expect(comoDataIso(null)).toBeNull();
    expect(comoDataIso(0)).toBeNull();
    expect(comoDataIso("xyz")).toBeNull();
  });

  it("nº de chamada CAD", () => {
    expect(normalizarNumeroChamada("CAD 000123456")).toBe("123456");
    expect(normalizarNumeroChamada("2026-0001234")).toBe("20260001234");
    expect(normalizarNumeroChamada("12")).toBeNull();
    expect(normalizarNumeroChamada(null)).toBeNull();
  });
});
