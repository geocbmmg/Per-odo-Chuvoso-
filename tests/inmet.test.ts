import { describe, expect, it } from "vitest";
import {
  type AvisoInmetBruto,
  afetaMinasGerais,
  consolidarAvisos,
  classificarSeveridade,
  filtrarAvisosMg,
  interpretarRssInmet,
  lerTabelaDescricao,
  mesorregioesMg,
  vigenciaDoAviso,
} from "@/lib/sources/inmet/parser";
import { RSS_INMET_EXEMPLO } from "@/lib/sources/exemplos/inmet-avisos";

describe("interpretarRssInmet (fixture com a estrutura real do feed)", () => {
  const avisos = interpretarRssInmet(RSS_INMET_EXEMPLO);

  it("lê todos os itens", () => {
    expect(avisos).toHaveLength(6);
  });

  it("extrai a tabela do <description> e converte datas de Brasília", () => {
    const tempestade = avisos.find((a) => a.id === "55928");
    expect(tempestade).toMatchObject({
      evento: "Tempestade",
      severidade: "grande-perigo",
      severidadeRotulo: "Grande Perigo",
      inicio: "2026-10-02T11:30:00.000Z", // 08:30 em Brasília
      fim: "2026-10-03T02:59:00.000Z", // 23:59 em Brasília
      link: "https://avisos.inmet.gov.br/55928",
      status: "Alert",
    });
    expect(tempestade?.areas).toEqual(["Metropolitana de Belo Horizonte", "Zona da Mata", "Campo das Vertentes"]);
    expect(tempestade?.descricao).toMatch(/^INMET publica aviso/);
    // pubDate repete o Início com "+0000" falso: não pode virar publicadoEm
    expect(tempestade?.publicadoEm).toBeNull();
  });

  it("lê as datas como horário de Brasília (às 22:00 BRT o aviso até 23:59 segue vigente)", () => {
    const agora = new Date("2026-10-03T01:00:00Z"); // 02/10 22:00 em Brasília
    const ids = filtrarAvisosMg(avisos, agora).map((a) => a.id);
    expect(ids).toContain("55928");
    expect(ids).toContain("55925");
  });

  it("filtra MG, remove expirados e ordena por severidade", () => {
    const agora = new Date("2026-10-02T15:00:00Z"); // 12:00 em Brasília
    const mg = filtrarAvisosMg(avisos, agora);
    const ids = mg.map((a) => a.id);
    expect(ids[0]).toBe("55928"); // grande perigo primeiro
    expect(mg.every((a) => afetaMinasGerais(a.areas))).toBe(true);
    // Ventos Costeiros (Sul) não afeta MG
    expect(mg.some((a) => a.evento === "Ventos Costeiros")).toBe(false);
    // Baixa Umidade terminou em 31/07/2026: não pode aparecer
    expect(mg.some((a) => a.evento === "Baixa Umidade")).toBe(false);
    expect(mg.some((a) => "status" in a)).toBe(false);
  });
});

describe("regras auxiliares", () => {
  it("classifica severidades do RSS e do CAP", () => {
    expect(classificarSeveridade("Perigo Potencial")).toBe("perigo-potencial");
    expect(classificarSeveridade("Perigo")).toBe("perigo");
    expect(classificarSeveridade("Grande Perigo")).toBe("grande-perigo");
    expect(classificarSeveridade("Extreme")).toBe("grande-perigo");
    expect(classificarSeveridade("Severe")).toBe("perigo");
    expect(classificarSeveridade("Minor")).toBe("perigo-potencial");
    expect(classificarSeveridade("")).toBe("desconhecida");
  });

  it("reconhece mesorregiões de MG com variações de acento/caixa", () => {
    expect(afetaMinasGerais(["triangulo mineiro/alto paranaiba"])).toBe(true);
    expect(afetaMinasGerais(["Sul Fluminense", "Zona da Mata"])).toBe(true);
    expect(afetaMinasGerais(["Leste Goiano", "Distrito Federal"])).toBe(false);
    expect(mesorregioesMg(["Sul Baiano", "Jequitinhonha", "Vale do Mucuri"])).toEqual(["Jequitinhonha", "Vale do Mucuri"]);
  });

  it("calcula a vigência", () => {
    const aviso = { inicio: "2026-10-03T03:00:00Z", fim: "2026-10-04T02:59:00Z" };
    expect(vigenciaDoAviso(aviso, new Date("2026-10-02T15:00:00Z"))).toBe("futuro");
    expect(vigenciaDoAviso(aviso, new Date("2026-10-03T12:00:00Z"))).toBe("vigente");
    expect(vigenciaDoAviso(aviso, new Date("2026-10-04T02:59:00Z"))).toBe("vigente"); // borda
    expect(vigenciaDoAviso(aviso, new Date("2026-10-04T03:00:00Z"))).toBe("expirado");
  });

  it("lê tabela com entidades HTML", () => {
    const t = lerTabelaDescricao("<tr><th align='left'>&Aacute;rea</th><td>A &amp; B</td></tr>");
    expect(t.get("area")).toBe("A & B");
  });

  it("recusa XML que não é RSS e feed vazio", () => {
    expect(() => interpretarRssInmet("<html><body>erro</body></html>")).toThrow(/RSS/);
    expect(() =>
      interpretarRssInmet('<?xml version="1.0"?><rss version="2.0"><channel><title>Avisos</title></channel></rss>'),
    ).toThrow(/sem nenhum aviso/);
  });
});

describe("consolidarAvisos (cancelamentos e duplicatas do feed)", () => {
  const base: AvisoInmetBruto = {
    id: "100",
    evento: "Acumulado de Chuva",
    severidade: "perigo",
    severidadeRotulo: "Perigo",
    inicio: "2026-10-03T03:00:00.000Z",
    fim: "2026-10-04T02:59:00.000Z",
    descricao: null,
    areas: ["Zona da Mata", "Campo das Vertentes"],
    link: null,
    publicadoEm: null,
    status: "Alert",
  };

  it("mantém só um entre itens idênticos (o de ID mais recente)", () => {
    const r = consolidarAvisos([base, { ...base, id: "108" }]);
    expect(r.map((a) => a.id)).toEqual(["108"]);
  });

  it("fica com o item de mais áreas quando um contém o outro", () => {
    const maior = { ...base, id: "99", areas: [...base.areas, "Sul Fluminense"] };
    expect(consolidarAvisos([base, maior]).map((a) => a.id)).toEqual(["99"]);
  });

  it("separa avisos com período ou severidade diferentes", () => {
    const outroFim = { ...base, id: "101", fim: "2026-10-04T15:00:00.000Z" };
    const outraSev = { ...base, id: "102", severidade: "grande-perigo" as const };
    expect(consolidarAvisos([base, outroFim, outraSev])).toHaveLength(3);
  });

  it("remove o aviso cancelado e o próprio cancelamento", () => {
    const cancel = { ...base, id: "140", status: "Cancel" };
    const outro = { ...base, id: "141", evento: "Tempestade" };
    expect(consolidarAvisos([base, cancel, outro]).map((a) => a.id)).toEqual(["141"]);
  });
});
