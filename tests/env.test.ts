import { afterEach, describe, expect, it, vi } from "vitest";
import { env, modoExemplo, reiniciarEnv, variaveisInvalidas } from "@/lib/env";

describe("variáveis de ambiente", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    reiniciarEnv();
  });

  it("variável inválida é descartada sem derrubar as demais", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("ARCGIS_PORTAL", "isto-nao-e-url");
    vi.stubEnv("FONTES_TIMEOUT_MS", "abc");
    vi.stubEnv("DADOS_EXEMPLO", "1");
    reiniciarEnv();
    expect(() => env()).not.toThrow();
    expect(env().ARCGIS_PORTAL).toBeUndefined();
    expect(env().FONTES_TIMEOUT_MS).toBe(15000);
    expect(modoExemplo()).toBe(true);
    expect(variaveisInvalidas().sort()).toEqual(["ARCGIS_PORTAL", "FONTES_TIMEOUT_MS"]);
    // O log cita o nome, nunca o valor.
    expect(String(vi.mocked(console.error).mock.calls[0][0])).not.toContain("isto-nao-e-url");
  });

  it("CRON_SECRET curto não invalida o ambiente (a rota do cron é que recusa)", () => {
    vi.stubEnv("CRON_SECRET", "curto");
    reiniciarEnv();
    expect(env().CRON_SECRET).toBe("curto");
    expect(variaveisInvalidas()).toEqual([]);
  });
});
