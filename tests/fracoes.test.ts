import { describe, expect, it } from "vitest";
import { FRACOES_CBMMG, MUNICIPIOS_FORMULARIO, buscarFracao, nomeMunicipio, ueopsDoCob } from "@/lib/territorio/fracoes";

describe("estrutura do CBMMG do formulário de alertas", () => {
  it("tem as 96 frações e os 853 municípios do formulário", () => {
    expect(FRACOES_CBMMG).toHaveLength(96);
    expect(MUNICIPIOS_FORMULARIO).toHaveLength(853);
  });

  it("decompõe fração em COB, UEOp e fração", () => {
    expect(buscarFracao("1_BBM_2CIA_1PEL_PA_Mariana_1_COB")).toMatchObject({
      cob: "1º COB",
      ueop: "1º BBM",
      fracao: "2ª Cia/1º Pel/PA (Mariana)",
      cidade: "Mariana",
    });
    expect(buscarFracao("1CIA IND - Pocos de Caldas (Sede)")).toMatchObject({
      cob: "6º COB",
      ueop: "1ª Cia Ind",
      fracao: null,
      sede: true,
    });
    expect(buscarFracao("inexistente")).toBeNull();
  });

  it("lista as UEOp de cada COB", () => {
    expect(ueopsDoCob("2º COB")).toEqual(["5º BBM", "8º BBM", "12º BBM"]);
    expect(ueopsDoCob("6º COB").sort()).toEqual(["1ª Cia Ind", "7ª Cia Ind", "9º BBM"].sort());
  });

  it("traduz o código do município do formulário", () => {
    expect(nomeMunicipio("Acucena")).toBe("Açucena");
    expect(nomeMunicipio("Belo Horizonte")).toBe("Belo Horizonte");
    expect(nomeMunicipio(null)).toBeNull();
  });
});
