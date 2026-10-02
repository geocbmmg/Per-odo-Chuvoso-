import { describe, expect, it } from "vitest";

import { acessoNaSala, chaveDominio, cobsDosDominios, papelGeoRescue, type DadosAcessoGeoRescue } from "@/lib/auth/papeis";

const CONFIG = { grupoOperador: "SALA" };

function dados(extra: Partial<DadosAcessoGeoRescue>): DadosAcessoGeoRescue {
  return { papel: "operacional", dominios: [], grupos: [], situacao: "ativo", trocaSenha: false, ...extra };
}

describe("mapeamento GeoRescue → papel da Sala (docs/fase-1.md §3.3)", () => {
  it.each([
    // [descrição, entrada, papel, escopoGlobal, cobs, regra]
    ["administrador → admin (Estado)", { papel: "administrador" }, "admin", true, [], "administrador"],
    ["grupo SALA + gerenciador → operador-sala", { papel: "gerenciador", grupos: ["SALA"] }, "operador-sala", true, [], "grupo-sala"],
    [
      "grupo SALA + operador (Gestor) → operador-sala",
      { papel: "operador", dominios: ["1º COB"], grupos: ["SALA"] },
      "operador-sala",
      true,
      ["1º COB"],
      "grupo-sala",
    ],
    [
      "grupo SALA + operacional (Operador) → operador-sala",
      { papel: "operacional", dominios: ["1COB"], grupos: ["SALA"] },
      "operador-sala",
      true,
      ["1º COB"],
      "grupo-sala",
    ],
    ["operador (Gestor) com COB → unidade", { papel: "operador", dominios: ["2º COB"] }, "unidade", false, ["2º COB"], "unidade-cob"],
    [
      "operacional (Operador) com COB → unidade",
      { papel: "operacional", dominios: ["3º COB"] },
      "unidade",
      false,
      ["3º COB"],
      "unidade-cob",
    ],
    ["visualizador no próprio COB → leitura", { papel: "visualizador", dominios: ["5COB"] }, "leitura", false, ["5º COB"], "visualizador-cob"],
    ["gerenciador sem o grupo → leitura do Estado", { papel: "gerenciador" }, "leitura", true, [], "gerenciador-sem-grupo"],
    [
      "visualizador com o grupo SALA → leitura do Estado (não vira operador)",
      { papel: "visualizador", grupos: ["SALA"] },
      "leitura",
      true,
      [],
      "visualizador-grupo-sala",
    ],
  ] as const)("%s", (_d, entrada, papel, escopoGlobal, cobs, regra) => {
    const r = acessoNaSala(dados(entrada as Partial<DadosAcessoGeoRescue>), CONFIG);
    expect(r).toEqual({ ok: true, papel, escopoGlobal, cobs: [...cobs], grupos: expect.any(Array), regra });
  });

  it("domínio como CÓDIGO ou como NOME dá o mesmo COB", () => {
    for (const dominio of ["1COB", "1º COB", "1 COB", "1°COB", "1_cob"]) {
      const r = acessoNaSala(dados({ papel: "operador", dominios: [dominio] }), CONFIG);
      expect(r).toMatchObject({ ok: true, papel: "unidade", cobs: ["1º COB"] });
    }
    expect(cobsDosDominios(["6COB", "2º COB", "2COB", "CG", "EMBM"])).toEqual(["2º COB", "6º COB"]);
  });

  it("vários COBs (ex.: EMBM3 marcado à mão com 1COB + 4COB) ficam todos no escopo, em ordem", () => {
    const r = acessoNaSala(dados({ papel: "operacional", dominios: ["4COB", "1º COB", "EMBM3"] }), CONFIG);
    expect(r).toMatchObject({ ok: true, papel: "unidade", escopoGlobal: false, cobs: ["1º COB", "4º COB"] });
  });

  it("exceção do CEB: Gestor/Operador com CEB alcança o Estado; visualizador do CEB não", () => {
    expect(acessoNaSala(dados({ papel: "operador", dominios: ["CEB"] }), CONFIG)).toMatchObject({
      ok: true,
      papel: "unidade",
      escopoGlobal: true,
      regra: "unidade-ceb",
    });
    expect(acessoNaSala(dados({ papel: "operacional", dominios: ["ceb"] }), CONFIG)).toMatchObject({
      ok: true,
      escopoGlobal: true,
    });
    // gr_optotal do token também dá a exceção (já derivada pelo GeoRescue).
    expect(acessoNaSala(dados({ papel: "operacional", dominios: ["BEMAD"], operacoesTotal: true }), CONFIG)).toMatchObject({
      ok: true,
      papel: "unidade",
      escopoGlobal: true,
    });
    expect(acessoNaSala(dados({ papel: "visualizador", dominios: ["CEB"] }), CONFIG)).toMatchObject({ ok: false, motivo: "sem_cob" });
  });

  it("grupo comparado sem caixa/acentos e também quando vem misturado em `dominios` (GeoRescue antigo)", () => {
    expect(acessoNaSala(dados({ papel: "operacional", grupos: ["sala"] }), CONFIG)).toMatchObject({ ok: true, papel: "operador-sala" });
    expect(acessoNaSala(dados({ papel: "operacional", dominios: ["1COB", "SALA"] }), CONFIG)).toMatchObject({
      ok: true,
      papel: "operador-sala",
      cobs: ["1º COB"],
      grupos: ["SALA"],
    });
    // Outro nome de grupo configurado
    expect(acessoNaSala(dados({ papel: "operacional", grupos: ["SALA"] }), { grupoOperador: "SALA_SITUACAO" })).toMatchObject({
      ok: false,
      motivo: "sem_cob",
    });
    expect(
      acessoNaSala(dados({ papel: "operacional", grupos: ["Sala_Situação"] }), { grupoOperador: "SALA_SITUACAO" }),
    ).toMatchObject({ ok: true, papel: "operador-sala" });
  });

  it("outro grupo (INSARAG) não dá acesso de operador", () => {
    expect(acessoNaSala(dados({ papel: "operacional", dominios: ["2COB"], grupos: ["INSARAG"] }), CONFIG)).toMatchObject({
      ok: true,
      papel: "unidade",
      grupos: ["INSARAG"],
    });
  });

  describe("negado (falha fechada)", () => {
    it.each([
      ["conta suspensa", { situacao: "suspenso", dominios: ["1COB"] }, "conta_inativa"],
      ["conta bloqueada", { situacao: "bloqueado", papel: "gerenciador", grupos: ["SALA"] }, "conta_inativa"],
      ["troca de senha pendente", { trocaSenha: true, dominios: ["1COB"] }, "troca_senha"],
      ["troca pendente vence até o grupo da Sala", { trocaSenha: true, grupos: ["SALA"] }, "troca_senha"],
      ["papel vazio", { papel: "" }, "papel_desconhecido"],
      ["papel desconhecido", { papel: "superusuario", grupos: ["SALA"] }, "papel_desconhecido"],
      ["sem domínio nem grupo (operacional)", { papel: "operacional" }, "sem_dominio"],
      ["sem domínio nem grupo (visualizador)", { papel: "visualizador", dominios: [" "] }, "sem_dominio"],
      ["domínio que não é COB (DRH)", { papel: "operador", dominios: ["DRH"] }, "sem_cob"],
      ["só um grupo que não é o da Sala", { papel: "operacional", grupos: ["INSARAG"] }, "sem_cob"],
    ] as const)("%s", (_d, entrada, motivo) => {
      const r = acessoNaSala(dados(entrada as Partial<DadosAcessoGeoRescue>), CONFIG);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.motivo).toBe(motivo);
        expect(r.mensagem).toMatch(/GeoRescue/);
      }
    });

    it("situação ausente = ativo (o GeoRescue só emite token para conta ativa)", () => {
      expect(acessoNaSala(dados({ situacao: undefined, dominios: ["1COB"] }), CONFIG)).toMatchObject({ ok: true });
      expect(acessoNaSala(dados({ situacao: null, dominios: ["1COB"] }), CONFIG)).toMatchObject({ ok: true });
    });
  });

  it("papelGeoRescue normaliza caixa/espaços e recusa o desconhecido; chaveDominio tira acento e símbolo", () => {
    expect(papelGeoRescue(" Operacional ")).toBe("operacional");
    expect(papelGeoRescue("gestor")).toBeNull(); // rótulo da tela, não a chave
    expect(papelGeoRescue(undefined)).toBeNull();
    expect(chaveDominio("Força-Tarefa ITO 35")).toBe("FORCATAREFAITO35");
  });
});
