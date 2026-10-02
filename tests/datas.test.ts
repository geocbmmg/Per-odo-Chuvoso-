import { describe, expect, it } from "vitest";
import {
  formatarData,
  formatarDataHora,
  formatarHora,
  formatarIdade,
  interpretarDataHoraBrasilia,
} from "@/lib/datas";

describe("datas (America/Sao_Paulo)", () => {
  it("formata no horário de Brasília mesmo com o servidor em UTC", () => {
    const iso = "2026-10-02T17:35:00Z"; // 14:35 em Brasília
    expect(formatarHora(iso)).toBe("14:35");
    expect(formatarData(iso)).toBe("02/10/2026");
    expect(formatarDataHora(iso)).toBe("02/10/2026 14:35");
  });

  it("vira o dia corretamente perto da meia-noite UTC", () => {
    expect(formatarDataHora("2026-10-03T02:10:00Z")).toBe("02/10/2026 23:10");
  });

  it("interpreta datas de parede de Brasília", () => {
    expect(interpretarDataHoraBrasilia("2026-10-02 10:00:00.0")?.toISOString()).toBe(
      "2026-10-02T13:00:00.000Z",
    );
    expect(interpretarDataHoraBrasilia("2026-10-02T10:00")?.toISOString()).toBe(
      "2026-10-02T13:00:00.000Z",
    );
    expect(interpretarDataHoraBrasilia("02/10/2026 10:00")?.toISOString()).toBe(
      "2026-10-02T13:00:00.000Z",
    );
    expect(interpretarDataHoraBrasilia("Thu, 02 Oct 2026 13:00:00 GMT")?.toISOString()).toBe(
      "2026-10-02T13:00:00.000Z",
    );
    expect(interpretarDataHoraBrasilia("ontem")).toBeNull();
    expect(interpretarDataHoraBrasilia("")).toBeNull();
  });

  it("tolera valores inválidos na formatação", () => {
    expect(formatarHora("x")).toBe("--:--");
    expect(formatarDataHora(Number.NaN)).toBe("—");
  });

  it("descreve idades", () => {
    expect(formatarIdade(30)).toBe("agora");
    expect(formatarIdade(5 * 60)).toBe("há 5 min");
    expect(formatarIdade(3 * 3600)).toBe("há 3 h");
  });
});
