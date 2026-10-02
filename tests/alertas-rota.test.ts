import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/alertas/route";
import { reiniciarAlertas } from "@/lib/alertas/config";
import { origemPermitida } from "@/lib/alertas/http";
import { fontesAlertasCbmmg, obterRisco } from "@/lib/dados/risco";
import { reiniciarEnv } from "@/lib/env";
import { reiniciarLeituras } from "@/lib/fontes/leituras";

const BASE = "http://localhost:3000/api/alertas";
const MESMA_ORIGEM = "http://localhost:3000";

const GOVERNADOR_VALADARES = "3127701";
const PONTE_NOVA = "3152105";
const BRUMADINHO = "3109006";
const JUIZ_DE_FORA = "3136702";
const OURO_PRETO = "3146107";

function pedido(corpo: unknown, cabecalhos: Record<string, string> = {}): Request {
  return new Request(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: MESMA_ORIGEM, ...cabecalhos },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

function alertaNovo(): Record<string, unknown> {
  return {
    acao: "emitir",
    fonteGatilho: "PREVISAO",
    tipoRisco: "METEOROLOGICO",
    evento: "CHUVA_INTENSA",
    nivelAlerta: "laranja",
    mmHora: 40,
    mm24h: 100,
    numeroChamada: "2026-12399999-9",
    fracao: "10 BBM - Divinopolis (Sede)",
    codIbge: "3122306",
    titulo: "Chuva forte em Divinópolis",
    descricao: "Previsão de 40 mm/h e 100 mm em 24 h.",
    instrucao: "Prontidão das equipes.",
    capUrgencia: "Expected",
    capCerteza: "Likely",
    validoAte: new Date(Date.now() + 12 * 3_600_000).toISOString(),
  };
}

beforeEach(() => {
  reiniciarAlertas();
  reiniciarLeituras();
  vi.stubEnv("ARMAZEM_LEITURAS", "memoria");
  vi.stubEnv("ALERTAS_ARMAZEM", "memoria");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  reiniciarEnv();
  reiniciarAlertas();
  reiniciarLeituras();
});

describe("GET/POST /api/alertas no modo exemplo (sessão provisória = operador da Sala)", () => {
  beforeEach(() => {
    vi.stubEnv("DADOS_EXEMPLO", "1");
    reiniciarEnv();
  });

  it("GET: 200, no-store, contrato {ok, perfil, capacidades, alertas, resumo, truncado}; sem rede", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const resposta = await GET(new Request(BASE));
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("Cache-Control")).toBe("no-store");
    const corpo = await resposta.json();
    expect(Object.keys(corpo).sort()).toEqual(["alertas", "capacidades", "ok", "perfil", "resumo", "truncado"]);
    expect(corpo).toMatchObject({ ok: true, truncado: false, perfil: { papel: "operador-sala", demonstracao: true } });
    expect(corpo.alertas).toHaveLength(10);
    expect(corpo.resumo.total).toBe(10);
    expect(corpo.resumo.vencidos).toBeGreaterThanOrEqual(2);
    // Vencidos no topo, com os estados derivados calculados na leitura.
    expect(corpo.alertas[0]).toMatchObject({ pendente: true, vencido: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("GET ?so=contagem e filtros; parâmetro inválido → 400", async () => {
    const contagem = await (await GET(new Request(`${BASE}?so=contagem`))).json();
    expect(contagem.alertas).toEqual([]);
    expect(contagem.resumo.porSituacao.RASCUNHO).toBe(1);
    const cob5 = await (await GET(new Request(`${BASE}?cob=5%C2%BA%20COB&situacao=PENDENTE`))).json();
    expect(cob5.alertas.length).toBeGreaterThan(0);
    expect(cob5.alertas.every((a: { cob: string; pendente: boolean }) => a.cob === "5º COB" && a.pendente)).toBe(true);
    const ruim = await GET(new Request(`${BASE}?situacao=APAGADO_DE_VEZ`));
    expect(ruim.status).toBe(400);
    expect(ruim.headers.get("Cache-Control")).toBe("no-store");
    expect(await ruim.json()).toMatchObject({ ok: false, motivo: "entrada_invalida" });
  });

  it("POST com Origin da própria aplicação: emite; o alerta entra na fila", async () => {
    const resposta = await POST(pedido(alertaNovo()));
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("Cache-Control")).toBe("no-store");
    const corpo = await resposta.json();
    expect(corpo).toMatchObject({ ok: true, alerta: { situacao: "EMITIDO", cob: "1º COB", ueop: "10º BBM" } });
    expect(corpo.id).toMatch(/^AL-\d{8}-\d{4}$/);
    const fila = await (await GET(new Request(BASE))).json();
    expect(fila.alertas).toHaveLength(11);
  });

  it("POST com Origin de outro site, sem Origin ou cross-site → 403 e nada é gravado (CSRF)", async () => {
    const casos: Record<string, string>[] = [
      { Origin: "https://malicioso.example" },
      { Origin: "null" },
      { Origin: "http://localhost:3000.malicioso.example" },
      { "Sec-Fetch-Site": "cross-site" },
    ];
    for (const cabecalhos of casos) {
      const resposta = await POST(pedido(alertaNovo(), cabecalhos));
      expect(resposta.status, JSON.stringify(cabecalhos)).toBe(403);
      expect(await resposta.json()).toMatchObject({ ok: false, motivo: "origem" });
    }
    const semOrigem = new Request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alertaNovo()),
    });
    expect((await POST(semOrigem)).status).toBe(403);
    expect((await (await GET(new Request(BASE))).json()).alertas).toHaveLength(10);
  });

  it("Origin pelo X-Forwarded-Host do proxy (Vercel) é aceita", () => {
    const r = new Request("http://interno:3000/api/alertas", {
      method: "POST",
      headers: { Origin: "https://sala.exemplo.gov.br", "X-Forwarded-Host": "sala.exemplo.gov.br" },
    });
    expect(origemPermitida(r)).toBe(true);
  });

  it("POST: corpo que não é JSON → 400; ação desconhecida → 400; 404; 409 com versão velha", async () => {
    expect((await POST(pedido("{não é json"))).status).toBe(400);
    expect((await POST(pedido(alertaNovo(), { "Content-Type": "text/plain" }))).status).toBe(400);
    const desconhecida = await POST(pedido({ acao: "applyEdits" }));
    expect(desconhecida.status).toBe(400);
    expect(await desconhecida.json()).toMatchObject({ ok: false, motivo: "entrada_invalida", campos: [{ campo: "acao" }] });
    expect((await POST(pedido({ acao: "ciencia", alertaId: "AL-19990101-0001" }))).status).toBe(404);

    const criado = await (await POST(pedido(alertaNovo()))).json();
    const versao = criado.alerta.alteradoEm;
    const ok = await POST(pedido({ acao: "salvar", alertaId: criado.id, alteradoEm: versao, titulo: "Novo título" }));
    expect(ok.status).toBe(200);
    const conflito = await POST(pedido({ acao: "cancelar", alertaId: criado.id, alteradoEm: versao, motivo: "Previsão revista." }));
    expect(conflito.status).toBe(409);
    expect(await conflito.json()).toMatchObject({ ok: false, motivo: "conflito" });
  });
});

describe("/api/alertas sem sessão (fora do modo exemplo)", () => {
  it("GET e POST → 401 (com Origin válida)", async () => {
    vi.stubEnv("DADOS_EXEMPLO", "0");
    reiniciarEnv();
    const get = await GET(new Request(BASE));
    expect(get.status).toBe(401);
    expect(get.headers.get("Cache-Control")).toBe("no-store");
    expect(await get.json()).toMatchObject({ ok: false, motivo: "sessao" });
    const post = await POST(pedido(alertaNovo()));
    expect(post.status).toBe(401);
  });
});

describe("mapa de risco: alertas vigentes da Sala na camada 'Alertas do CBMMG'", () => {
  it("modo exemplo: entram EMITIDO/CIENTE/EM_AÇÃO reais; deduplica com o Survey123 pelo nº da chamada", async () => {
    vi.stubEnv("DADOS_EXEMPLO", "1");
    reiniciarEnv();
    vi.stubGlobal("fetch", vi.fn());
    expect(fontesAlertasCbmmg()).toHaveLength(2);
    const risco = await obterRisco(new Date());
    const camada = risco.camadas["alertas-cbmmg"];
    const nivel = (ibge: string) => camada.camada!.municipios.find((m) => m.ibge === ibge);
    // Governador Valadares: o Survey123 tem laranja com a mesma chamada; vale o da Sala (mais recente, vermelho).
    expect(nivel(GOVERNADOR_VALADARES)).toMatchObject({ nivel: "vermelho" });
    expect(nivel(GOVERNADOR_VALADARES)!.itens).toHaveLength(1);
    expect(camada.descartados.repetidos).toBeGreaterThanOrEqual(1);
    expect(nivel(PONTE_NOVA)).toMatchObject({ nivel: "laranja" });
    expect(nivel(BRUMADINHO)).toBeUndefined(); // exercício
    // Rascunho de Juiz de Fora (vermelho) não entra: JF fica com o alerta do Survey123.
    expect(nivel(JUIZ_DE_FORA)!.itens.every((i) => i.ref !== null && !i.ref.startsWith("AL-"))).toBe(true);
    expect(nivel(OURO_PRETO)?.itens.some((i) => i.ref === "2026-12333015-2")).toBeFalsy(); // ação registrada: fora
    expect(camada.meta?.fontes).toEqual(["arcgis-alertas"]);

    // Um alerta emitido agora aparece no mapa na leitura seguinte (sem cache).
    const emitido = await POST(pedido(alertaNovo()));
    expect(emitido.status).toBe(200);
    const depois = await obterRisco(new Date());
    expect(depois.camadas["alertas-cbmmg"].camada!.municipios.find((m) => m.ibge === "3122306")).toMatchObject({ nivel: "laranja" });
  });

  it("fora do modo exemplo com ALERTAS_ARMAZEM=memoria, a fila não entra no mapa", () => {
    vi.stubEnv("DADOS_EXEMPLO", "0");
    reiniciarEnv();
    expect(fontesAlertasCbmmg()).toHaveLength(1);
  });
});
