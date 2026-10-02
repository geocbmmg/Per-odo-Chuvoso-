import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ErroArcGIS,
  consultarTodas,
  montarUrlCamada,
  montarUrlConsulta,
} from "@/lib/sources/arcgis/cliente";
import { areaComSinal, poligonoEsriParaGeoJSON, pontoEsriParaGeoJSON } from "@/lib/sources/arcgis/geometria";

const BASE = "https://geoprocessamento.bombeiros.mg.gov.br/server/rest/services/Hosted";

describe("montarUrlCamada / montarUrlConsulta (somente leitura)", () => {
  it("monta a URL da camada e da consulta com outSR 4326", () => {
    const camada = montarUrlCamada(BASE, "MG_DISSOLVIDO_COB", 0);
    expect(camada).toBe(`${BASE}/MG_DISSOLVIDO_COB/FeatureServer/0`);
    const url = new URL(montarUrlConsulta(camada, { where: "1=1" }, { offset: 1000, tamanho: 500 }));
    expect(url.pathname.endsWith("/FeatureServer/0/query")).toBe(true);
    expect(url.searchParams.get("outSR")).toBe("4326");
    expect(url.searchParams.get("f")).toBe("json");
    expect(url.searchParams.get("outFields")).toBe("*");
    expect(url.searchParams.get("resultOffset")).toBe("1000");
    expect(url.searchParams.get("resultRecordCount")).toBe("500");
  });

  it("recusa nomes de serviço que tentem escapar do caminho", () => {
    expect(() => montarUrlCamada(BASE, "x/FeatureServer/0/applyEdits?", 0)).toThrow(ErroArcGIS);
    expect(() => montarUrlCamada(BASE, "../admin", 0)).toThrow(ErroArcGIS);
    expect(() => montarUrlCamada(BASE, "ok", -1)).toThrow(ErroArcGIS);
  });
});

describe("consultarTodas", () => {
  afterEach(() => vi.unstubAllGlobals());

  function respostaJson(corpo: unknown) {
    return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
  }

  it("pagina enquanto exceededTransferLimit for true", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      const offset = Number(new URL(url).searchParams.get("resultOffset"));
      if (offset === 0) {
        return respostaJson({ features: [{ attributes: { objectid: 1 } }, { attributes: { objectid: 2 } }], exceededTransferLimit: true });
      }
      return respostaJson({ features: [{ attributes: { objectid: 3 } }] });
    }));

    const resposta = await consultarTodas(`${BASE}/svc/FeatureServer/1`, {}, { tamanhoPagina: 2 });
    expect(resposta.features.map((f) => f.attributes.objectid)).toEqual([1, 2, 3]);
    expect(urls).toHaveLength(2);
    expect(urls.every((u) => u.includes("/query?"))).toBe(true);
  });

  it("transforma o erro com HTTP 200 em ErroArcGIS", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      respostaJson({ error: { code: 400, message: "Unable to complete operation.", details: ["Invalid query"] } }),
    ));
    await expect(consultarTodas(`${BASE}/svc/FeatureServer/1`)).rejects.toThrow(
      "ArcGIS 400: Unable to complete operation. (Invalid query)",
    );
  });

  it("propaga HTTP de erro", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503, statusText: "Service Unavailable" })));
    await expect(consultarTodas(`${BASE}/svc/FeatureServer/1`)).rejects.toThrow("HTTP 503");
  });
});

describe("geometria Esri → GeoJSON", () => {
  it("converte ponto e descarta 0,0 e coordenadas fora de 4326", () => {
    expect(pontoEsriParaGeoJSON({ x: -43.94, y: -19.92 })).toEqual({ type: "Point", coordinates: [-43.94, -19.92] });
    expect(pontoEsriParaGeoJSON({ x: 0, y: 0 })).toBeNull();
    expect(pontoEsriParaGeoJSON({ x: -4891000, y: -2263000 })).toBeNull();
    expect(pontoEsriParaGeoJSON(null)).toBeNull();
  });

  it("converte polígono com buraco e reorienta para RFC 7946", () => {
    // Externo horário (Esri) e buraco anti-horário.
    const externo = [[-44, -19], [-43, -19], [-43, -20], [-44, -20], [-44, -19]];
    const buraco = [[-43.8, -19.2], [-43.8, -19.8], [-43.2, -19.8], [-43.2, -19.2], [-43.8, -19.2]];
    expect(areaComSinal(externo)).toBeLessThan(0);
    const geo = poligonoEsriParaGeoJSON({ rings: [externo, buraco] });
    expect(geo?.type).toBe("Polygon");
    if (geo?.type !== "Polygon") throw new Error("esperava Polygon");
    expect(geo.coordinates).toHaveLength(2);
    expect(areaComSinal(geo.coordinates[0])).toBeGreaterThan(0); // externo anti-horário
    expect(areaComSinal(geo.coordinates[1])).toBeLessThan(0); // buraco horário
  });

  it("gera MultiPolygon para dois anéis externos e fecha anéis abertos", () => {
    const a = [[-44, -19], [-43, -19], [-43, -20], [-44, -20]];
    const b = [[-42, -19], [-41, -19], [-41, -20], [-42, -20]];
    const geo = poligonoEsriParaGeoJSON({ rings: [a, b] });
    expect(geo?.type).toBe("MultiPolygon");
    if (geo?.type !== "MultiPolygon") throw new Error("esperava MultiPolygon");
    expect(geo.coordinates[0][0][0]).toEqual(geo.coordinates[0][0][4]);
  });

  it("retorna null para geometria vazia", () => {
    expect(poligonoEsriParaGeoJSON({ rings: [] })).toBeNull();
    expect(poligonoEsriParaGeoJSON(undefined)).toBeNull();
  });
});
