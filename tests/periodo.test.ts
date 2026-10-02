import { describe, expect, it } from "vitest";
import { dentroDoPeriodo, periodoChuvoso } from "@/lib/dominio/periodo";

describe("periodoChuvoso", () => {
  it("em outubro, a temporada atual começa no mesmo ano", () => {
    const p = periodoChuvoso("atual", new Date("2026-10-02T15:00:00Z"));
    expect(p.rotulo).toBe("Período chuvoso 2026/2027");
    expect(p.inicio).toBe("2026-10-01T03:00:00.000Z");
    expect(p.fim).toBe("2027-04-01T03:00:00.000Z");
  });

  it("em fevereiro, a temporada atual começou no ano anterior", () => {
    const p = periodoChuvoso("atual", new Date("2027-02-10T12:00:00Z"));
    expect(p.rotulo).toBe("Período chuvoso 2026/2027");
  });

  it("usa o horário de Brasília na virada de 30/09 para 01/10", () => {
    // 01/10 01:00 UTC ainda é 30/09 22:00 em Brasília → temporada atual = 2026 (próxima)
    const antes = periodoChuvoso("anterior", new Date("2026-10-01T01:00:00Z"));
    expect(antes.rotulo).toBe("Período chuvoso 2025/2026");
  });

  it("anterior e tudo", () => {
    const agora = new Date("2026-10-02T15:00:00Z");
    expect(periodoChuvoso("anterior", agora).rotulo).toBe("Período chuvoso 2025/2026");
    expect(periodoChuvoso("tudo", agora)).toMatchObject({ inicio: null, fim: null });
  });
});

describe("dentroDoPeriodo", () => {
  const p = periodoChuvoso("atual", new Date("2026-10-02T15:00:00Z"));

  it("inclui o início e exclui o fim", () => {
    expect(dentroDoPeriodo("2026-10-01T03:00:00.000Z", p)).toBe(true);
    expect(dentroDoPeriodo("2026-10-01T02:59:59.000Z", p)).toBe(false);
    expect(dentroDoPeriodo("2027-04-01T03:00:00.000Z", p)).toBe(false);
  });

  it("registros sem data só entram em 'tudo'", () => {
    expect(dentroDoPeriodo(null, p)).toBe(false);
    expect(dentroDoPeriodo(null, periodoChuvoso("tudo"))).toBe(true);
  });
});
