import { beforeEach, describe, expect, it } from "vitest";
import { obterLeitura, reiniciarLeituras, statusDaFonte } from "@/lib/fontes/leituras";
import { FonteIndisponivelError } from "@/lib/fontes/tipos";

function relogio(inicioIso: string) {
  let atual = new Date(inicioIso).getTime();
  return {
    agora: () => new Date(atual),
    avancar: (segundos: number) => {
      atual += segundos * 1000;
    },
  };
}

describe("obterLeitura", () => {
  beforeEach(() => reiniciarLeituras());

  it("lê ao vivo e depois serve do cache dentro do ttl", async () => {
    const r = relogio("2026-10-02T12:00:00Z");
    let chamadas = 0;
    const carregar = async () => ++chamadas;

    const primeira = await obterLeitura("inmet-avisos", "mg", carregar, { agora: r.agora });
    expect(primeira).toMatchObject({ dados: 1, origem: "ao-vivo" });

    r.avancar(60);
    const segunda = await obterLeitura("inmet-avisos", "mg", carregar, { agora: r.agora });
    expect(segunda).toMatchObject({ dados: 1, origem: "cache", atualizadoEm: primeira.atualizadoEm });
    expect(chamadas).toBe(1);
  });

  it("devolve a última leitura válida quando a fonte falha", async () => {
    const r = relogio("2026-10-02T12:00:00Z");
    await obterLeitura("inmet-avisos", "mg", async () => ["aviso"], { agora: r.agora });

    r.avancar(11 * 60); // passa do ttl de 10 min
    const leitura = await obterLeitura(
      "inmet-avisos",
      "mg",
      async () => {
        throw new Error("HTTP 503");
      },
      { agora: r.agora },
    );
    expect(leitura.origem).toBe("ultima-valida");
    expect(leitura.dados).toEqual(["aviso"]);
    expect(leitura.erro).toBe("HTTP 503");
    expect(leitura.atualizadoEm).toBe("2026-10-02T12:00:00.000Z");
  });

  it("lança FonteIndisponivelError sem leitura anterior", async () => {
    await expect(
      obterLeitura("open-meteo-previsao", "x", async () => {
        throw new Error("Falha de rede");
      }),
    ).rejects.toBeInstanceOf(FonteIndisponivelError);
  });

  it("não reconsulta a fonte logo após uma falha", async () => {
    const r = relogio("2026-10-02T12:00:00Z");
    let chamadas = 0;
    const falhar = async () => {
      chamadas++;
      throw new Error("fora");
    };
    await expect(obterLeitura("arcgis-alertas", "t", falhar, { agora: r.agora })).rejects.toThrow();
    r.avancar(10);
    await expect(obterLeitura("arcgis-alertas", "t", falhar, { agora: r.agora })).rejects.toThrow("fora");
    expect(chamadas).toBe(1);
    r.avancar(120);
    await expect(obterLeitura("arcgis-alertas", "t", falhar, { agora: r.agora })).rejects.toThrow();
    expect(chamadas).toBe(2);
  });

  it("unifica requisições simultâneas para a mesma chave", async () => {
    let chamadas = 0;
    const carregar = () =>
      new Promise<number>((resolve) => {
        chamadas++;
        setTimeout(() => resolve(42), 5);
      });
    const [a, b] = await Promise.all([
      obterLeitura("arcgis-cobs", "geo", carregar),
      obterLeitura("arcgis-cobs", "geo", carregar),
    ]);
    expect(a.dados).toBe(42);
    expect(b.dados).toBe(42);
    expect(chamadas).toBe(1);
  });

  it("usa os dados de exemplo no modo exemplo", async () => {
    const leitura = await obterLeitura("inmet-avisos", "mg", async () => [], {
      modoExemplo: true,
      exemplo: () => ["exemplo"],
    });
    expect(leitura).toMatchObject({ origem: "exemplo", dados: ["exemplo"] });
  });
});

describe("statusDaFonte", () => {
  beforeEach(() => reiniciarLeituras());

  it("classifica ok, atrasada e fora do ar", async () => {
    const r = relogio("2026-10-02T12:00:00Z");
    expect(statusDaFonte("inmet-avisos").estado).toBe("desconhecida");

    await obterLeitura("inmet-avisos", "mg", async () => 1, { agora: r.agora });
    expect(statusDaFonte("inmet-avisos", { agora: r.agora() }).estado).toBe("ok");

    r.avancar(11 * 60);
    await obterLeitura("inmet-avisos", "mg", async () => {
      throw new Error("503");
    }, { agora: r.agora });
    const atrasada = statusDaFonte("inmet-avisos", { agora: r.agora() });
    expect(atrasada.estado).toBe("atrasada");
    expect(atrasada.ultimoErro).toBe("503");

    r.avancar(7 * 3600); // limite fora do ar do INMET: 6 h
    expect(statusDaFonte("inmet-avisos", { agora: r.agora() }).estado).toBe("fora-do-ar");
  });

  it("marca stubs como não implementados e respeita o modo exemplo", () => {
    expect(statusDaFonte("ana-telemetria").estado).toBe("nao-implementada");
    expect(statusDaFonte("inmet-avisos", { modoExemplo: true }).estado).toBe("exemplo");
  });

  it("fica fora do ar quando nunca houve leitura válida", async () => {
    await obterLeitura("open-meteo-previsao", "x", async () => {
      throw new Error("timeout");
    }).catch(() => undefined);
    expect(statusDaFonte("open-meteo-previsao").estado).toBe("fora-do-ar");
  });
});

describe("stubs das fontes da Fase 1", () => {
  it("falham com FonteIndisponivelError e mensagem clara", async () => {
    const { obterTelemetriaAna } = await import("@/lib/sources/ana");
    const { obterVazaoPrevista } = await import("@/lib/sources/glofas");
    const { obterQuadrosRadar } = await import("@/lib/sources/rainviewer");
    await expect(obterTelemetriaAna(["56110005"])).rejects.toBeInstanceOf(FonteIndisponivelError);
    await expect(obterVazaoPrevista()).rejects.toThrow(/não implementado/);
    await expect(obterQuadrosRadar()).rejects.toThrow(/Fase 1/);
  });
});

describe("modo exemplo e deslocamento de datas", () => {
  beforeEach(() => reiniciarLeituras());

  it("registra a leitura de exemplo para o carimbo de /status", async () => {
    await obterLeitura("inmet-avisos", "rss", async () => [], { modoExemplo: true, exemplo: () => [] });
    const s = statusDaFonte("inmet-avisos", { modoExemplo: true });
    expect(s.estado).toBe("exemplo");
    expect(s.atualizadoEm).not.toBeNull();
  });

  it("desloca em dias inteiros no horário de Brasília", async () => {
    const { deslocamentoEmDiasAte } = await import("@/lib/sources/exemplos/deslocar");
    const ref = "2026-10-02T15:00:00.000Z"; // 02/10 12:00 BRT
    expect(deslocamentoEmDiasAte(ref, new Date("2026-10-02T02:59:00Z"))).toBe(-86_400_000); // 01/10 23:59 BRT
    expect(deslocamentoEmDiasAte(ref, new Date("2026-10-02T03:00:00Z"))).toBe(0); // 02/10 00:00 BRT
    expect(deslocamentoEmDiasAte(ref, new Date("2026-10-03T02:59:00Z"))).toBe(0); // 02/10 23:59 BRT
    expect(deslocamentoEmDiasAte(ref, new Date("2026-10-05T12:00:00Z"))).toBe(3 * 86_400_000);
  });
});
