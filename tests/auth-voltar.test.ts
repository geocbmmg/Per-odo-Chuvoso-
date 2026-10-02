import { describe, expect, it } from "vitest";

import { cpfValido, interpretarIdentificador, mascararCpfDigitado } from "@/lib/auth/cpf";
import { caminhoDeVolta } from "@/lib/auth/voltar";

describe("?voltar= depois do login (sem open redirect)", () => {
  it.each([
    ["/", "/"],
    ["/monitoramento", "/monitoramento"],
    ["/alertas-acoes-rrd?situacao=PENDENTE#fila", "/alertas-acoes-rrd?situacao=PENDENTE#fila"],
    ["  /status  ", "/status"],
    [["/risco", "/status"], "/risco"],
  ])("aceita caminho interno %j", (entrada, esperado) => {
    expect(caminhoDeVolta(entrada)).toBe(esperado);
  });

  it.each([
    "https://evil.example/",
    "http://evil.example",
    "//evil.example",
    "//evil.example/%2F..",
    "/\\evil.example",
    "\\\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "javascript:alert(1)",
    "data:text/html,oi",
    "evil.example",
    "monitoramento",
    "",
    "/entrar",
    "/entrar?voltar=//evil.example",
    "/api/auth/logout",
    `/${"a".repeat(600)}`,
  ])("recusa %j (vai para o padrão)", (entrada) => {
    expect(caminhoDeVolta(entrada)).toBe("/");
    expect(caminhoDeVolta(entrada, "/status")).toBe("/status");
  });

  it("recusa o que não é texto", () => {
    expect(caminhoDeVolta(undefined)).toBe("/");
    expect(caminhoDeVolta(null)).toBe("/");
    expect(caminhoDeVolta(42)).toBe("/");
    expect(caminhoDeVolta({ href: "/" })).toBe("/");
  });

  it("caminho com %2F codificado continua relativo à própria Sala", () => {
    const destino = caminhoDeVolta("/%2F%2Fevil.example");
    expect(destino.startsWith("//")).toBe(false);
    expect(new URL(destino, "https://sala.exemplo").origin).toBe("https://sala.exemplo");
  });
});

describe("campo CPF do login", () => {
  it("máscara só quando é numérico (o administrador entra por nome de usuário)", () => {
    expect(mascararCpfDigitado("529")).toBe("529");
    expect(mascararCpfDigitado("5299")).toBe("529.9");
    expect(mascararCpfDigitado("5299822")).toBe("529.982.2");
    expect(mascararCpfDigitado("52998224725")).toBe("529.982.247-25");
    expect(mascararCpfDigitado("529.982.247-2599")).toBe("529.982.247-25");
    expect(mascararCpfDigitado("admin")).toBe("admin");
  });

  it("dígitos verificadores (mesma regra do GeoRescue)", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224724")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("123")).toBe(false);
  });

  it("interpreta CPF (com ou sem máscara) ou usuário; recusa o resto", () => {
    expect(interpretarIdentificador("529.982.247-25")).toEqual({ tipo: "cpf", valor: "52998224725" });
    expect(interpretarIdentificador(" 52998224725 ")).toEqual({ tipo: "cpf", valor: "52998224725" });
    expect(interpretarIdentificador("admin.sala")).toEqual({ tipo: "usuario", valor: "admin.sala" });
    expect(interpretarIdentificador("5299822472")).toBeNull();
    expect(interpretarIdentificador("' OR 1=1 --")).toBeNull();
    expect(interpretarIdentificador("")).toBeNull();
  });
});
