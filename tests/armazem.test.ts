import { afterEach, describe, expect, it, vi } from "vitest";
import { criarArmazemEmCamadas } from "@/lib/fontes/armazem-servidor";
import {
  criarArmazemMemoria,
  definirArmazem,
  obterLeitura,
  reiniciarLeituras,
  type ArmazemLeituras,
  type LeituraGuardada,
} from "@/lib/fontes/leituras";

function armazemFalso(inicial: Record<string, LeituraGuardada> = {}) {
  const dados = new Map(Object.entries(inicial));
  const armazem: ArmazemLeituras = {
    ler: vi.fn(async (chave: string) => dados.get(chave)),
    gravar: vi.fn(async (chave: string, leitura: LeituraGuardada) => {
      dados.set(chave, leitura);
    }),
  };
  return { armazem, dados };
}

describe("armazém em camadas (memória + persistente)", () => {
  afterEach(() => reiniciarLeituras());

  it("cold start: fonte fora do ar devolve a última leitura válida do armazém persistente", async () => {
    const persistente = armazemFalso({
      "inmet-avisos:rss": { dados: ["aviso de ontem"], atualizadoEm: "2026-10-02T12:00:00.000Z" },
    });
    definirArmazem(criarArmazemEmCamadas(criarArmazemMemoria(), persistente.armazem));

    const leitura = await obterLeitura("inmet-avisos", "rss", async () => {
      throw new Error("HTTP 503");
    });
    expect(leitura).toMatchObject({
      origem: "ultima-valida",
      dados: ["aviso de ontem"],
      atualizadoEm: "2026-10-02T12:00:00.000Z",
      erro: "HTTP 503",
    });
  });

  it("grava a leitura nova nas duas camadas", async () => {
    const persistente = armazemFalso();
    definirArmazem(criarArmazemEmCamadas(criarArmazemMemoria(), persistente.armazem));
    await obterLeitura("open-meteo-previsao", "sedes-cob", async () => ({ ok: true }));
    expect(persistente.dados.get("open-meteo-previsao:sedes-cob")?.dados).toEqual({ ok: true });
  });

  it("falha do banco não derruba a leitura", async () => {
    const quebrado: ArmazemLeituras = {
      ler: async () => {
        throw new Error("banco fora");
      },
      gravar: async () => {
        throw new Error("banco fora");
      },
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    definirArmazem(criarArmazemEmCamadas(criarArmazemMemoria(), quebrado));
    const leitura = await obterLeitura("arcgis-cobs", "geo", async () => 42);
    expect(leitura).toMatchObject({ dados: 42, origem: "ao-vivo" });
    vi.restoreAllMocks();
  });
});
