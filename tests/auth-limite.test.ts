import { describe, expect, it } from "vitest";

import { chaveDaConta, LIMITE_POR_CONTA, LIMITE_POR_IP, LimiteTentativas } from "@/lib/auth/limite";

const T0 = 1_000_000;
const MIN = 60_000;

describe("limite de tentativas (janela deslizante, em memória)", () => {
  it("permite até o máximo na janela e depois diz quando tentar de novo", () => {
    const limite = new LimiteTentativas(5, 10 * MIN);
    for (let i = 0; i < 5; i++) {
      expect(limite.estado("ip:1", T0 + i * MIN).permitido).toBe(true);
      limite.registrar("ip:1", T0 + i * MIN);
    }
    const bloqueado = limite.estado("ip:1", T0 + 5 * MIN);
    expect(bloqueado.permitido).toBe(false);
    // A 1ª tentativa (T0) sai da janela em T0 + 10 min: faltam 5 min.
    expect(bloqueado.tentarEmS).toBe(5 * 60);
    expect(limite.estado("ip:1", T0 + 10 * MIN).permitido).toBe(true);
    // Outra chave não é afetada.
    expect(limite.estado("ip:2", T0 + 5 * MIN).permitido).toBe(true);
  });

  it("devolver retira a vaga reservada (tentativa que não conta)", () => {
    const limite = new LimiteTentativas(2, 10 * MIN);
    limite.registrar("c", T0);
    limite.registrar("c", T0 + 1);
    expect(limite.estado("c", T0 + 2).permitido).toBe(false);
    limite.devolver("c");
    expect(limite.estado("c", T0 + 2).permitido).toBe(true);
    limite.devolver("c");
    limite.devolver("c"); // sem vaga: não quebra
    expect(limite.estado("c", T0 + 2)).toEqual({ permitido: true, tentarEmS: 0 });
  });

  it("teto de memória: descarta as chaves menos recentes", () => {
    const limite = new LimiteTentativas(1, 10 * MIN, 3);
    for (const ip of ["a", "b", "c", "d"]) limite.registrar(ip, T0);
    expect(limite.estado("a", T0).permitido).toBe(true); // "a" foi descartada
    expect(limite.estado("d", T0).permitido).toBe(false);
  });

  it("limites padrão: 10 por IP e 5 por conta em 10 min", () => {
    expect(LIMITE_POR_IP).toEqual({ maximo: 10, janelaMs: 10 * MIN });
    expect(LIMITE_POR_CONTA).toEqual({ maximo: 5, janelaMs: 10 * MIN });
  });

  it("chave da conta é um hash (o CPF não fica em claro na memória)", () => {
    const chave = chaveDaConta("52998224725");
    expect(chave).not.toContain("52998224725");
    expect(chave).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(chaveDaConta("52998224725")).toBe(chave);
    expect(chaveDaConta("Admin")).toBe(chaveDaConta("admin"));
  });
});
