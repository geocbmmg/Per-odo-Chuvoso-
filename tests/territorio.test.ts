import { describe, expect, it } from "vitest";
import { cobOuSemCob, compararCobs, normalizarRotuloCob } from "@/lib/territorio";

describe("normalizarRotuloCob", () => {
  it.each([
    ["1º COB", "1º COB"],
    ["1° COB", "1º COB"],
    ["1 COB", "1º COB"],
    ["1COB", "1º COB"],
    ["1_cob", "1º COB"],
    ["cob1", "1º COB"],
    ["COB 3", "3º COB"],
    ["cob_6", "6º COB"],
    ["2o COB", "2º COB"],
    ["4º Comando Operacional de Bombeiros", "4º COB"],
    ["Quinto COB", "5º COB"],
    ["  5ºCOB ", "5º COB"],
  ])("%s → %s", (entrada, esperado) => {
    expect(normalizarRotuloCob(entrada)).toBe(esperado);
  });

  it.each([null, undefined, "", "null", "1º BBM", "COBRADE 1.2.1.0.0", "Belo Horizonte"])(
    "não reconhece %s",
    (entrada) => {
      expect(normalizarRotuloCob(entrada)).toBeNull();
    },
  );

  it("usa 'Sem COB' para agregação", () => {
    expect(cobOuSemCob(null)).toBe("Sem COB");
    expect(cobOuSemCob("3 cob")).toBe("3º COB");
  });

  it("ordena numericamente com 'Sem COB' por último", () => {
    expect(["Sem COB", "10º COB", "2º COB", "1º COB"].sort(compararCobs)).toEqual([
      "1º COB",
      "2º COB",
      "10º COB",
      "Sem COB",
    ]);
  });
});
