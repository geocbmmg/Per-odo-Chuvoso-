import { afterEach, describe, expect, it, vi } from "vitest";

import { ErroAutenticacao } from "@/lib/auth/erros";
import {
  entrarNoGeoRescue,
  erroDaRecusa,
  interpretarRespostaLogin,
  lerCargaTokenGeoRescue,
  urlLoginGeoRescue,
} from "@/lib/auth/georescue";

/*
 * Adaptador do POST /api/login do GeoRescue com fetch simulado. As respostas
 * reproduzem o webapp/api/login.py (origin/homolog) campo a campo: é o teste
 * de CONTRATO — se o GeoRescue mudar o formato, é aqui que quebra.
 */

const BASE = "https://georescue.exemplo.gov.br";
const CPF = "52998224725";
const SENHA = "senha-secreta-123";
const AGORA = Date.parse("2026-10-02T12:00:00Z");
const IAT = AGORA / 1000;

function b64u(texto: string): string {
  return Buffer.from(texto, "utf8").toString("base64url");
}

/** Token no formato do GeoRescue: base64url(JSON).base64url(HMAC) — a assinatura aqui é falsa (a Sala não confere). */
function tokenGeoRescue(claims: Record<string, unknown>): string {
  return `${b64u(JSON.stringify(claims))}.${b64u("assinatura-que-a-sala-nao-confere!")}`;
}

/** claims_da_sessao (acesso.py:752-782). */
function claimsGeoRescue(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: "georescue",
    sub: CPF,
    iat: IAT,
    exp: IAT + 8 * 3600,
    gr_bm: "123456-7",
    gr_nome: "FULANO DE TAL",
    gr_pg: "2º Sgt",
    gr_papel: "operacional",
    gr_dominios: ["1º COB"],
    gr_dgrupo: ["SALA"],
    gr_optotal: false,
    gr_situacao: "ativo",
    gr_troca: false,
    u: "FULANO DE TAL",
    ...extra,
  };
}

/** Corpo 200 do login.py para CPF + senha. */
function respostaGeoRescue(extra: Record<string, unknown> = {}, claims: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ok: true,
    usuario: "FULANO DE TAL",
    nome: "FULANO DE TAL",
    cpf: "529.982.247-25",
    bm: "123456-7",
    unidade: "1BBM (BELO HORIZONTE)",
    papel: "operacional",
    dominios: ["1º COB"],
    escopo_global: false,
    troca_senha: false,
    token: tokenGeoRescue(claimsGeoRescue(claims)),
    expira_em_horas: 8,
    ...extra,
  };
}

function jsonResposta(status: number, corpo: unknown): Response {
  return new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST <GeoRescue>/api/login (fetch simulado)", () => {
  it("sucesso: envia {usuario, senha} por POST, sem seguir redirecionamento, e lê grupos/posto do token", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => jsonResposta(200, respostaGeoRescue()));
    const login = await entrarNoGeoRescue({ usuario: CPF, senha: SENHA }, { baseUrl: BASE, fetch, agoraMs: AGORA });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${BASE}/api/login`);
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("error");
    expect(init?.cache).toBe("no-store");
    expect(JSON.parse(String(init?.body))).toEqual({ usuario: CPF, senha: SENHA });
    expect(init?.signal).toBeInstanceOf(AbortSignal);

    expect(login).toEqual({
      nome: "FULANO DE TAL",
      bm: "123456-7",
      unidade: "1BBM (BELO HORIZONTE)",
      papel: "operacional",
      dominios: ["1º COB"],
      grupos: ["SALA"],
      posto: "2º Sgt",
      situacao: "ativo",
      operacoesTotal: false,
      trocaSenha: false,
      cpf: CPF,
      administrador: null,
      expiraEmMs: AGORA + 8 * 3600_000,
    });
  });

  it("administrador de emergência (token {u, exp}, sem CPF): papel administrador, identificado pelo usuário", async () => {
    const corpo = {
      ok: true,
      usuario: "admin",
      nome: "admin",
      papel: "administrador",
      dominios: [],
      escopo_global: true,
      troca_senha: false,
      token: tokenGeoRescue({ u: "admin", exp: IAT + 8 * 3600 }),
      expira_em_horas: 8,
    };
    const login = await entrarNoGeoRescue(
      { usuario: "admin", senha: SENHA },
      { baseUrl: BASE, fetch: async () => jsonResposta(200, corpo), agoraMs: AGORA },
    );
    expect(login).toMatchObject({ papel: "administrador", cpf: null, administrador: "admin", nome: "admin", grupos: [], bm: null });
  });

  it("validade: a menor entre o exp do token e expira_em_horas", () => {
    const curto = interpretarRespostaLogin(200, JSON.stringify(respostaGeoRescue({}, { exp: IAT + 3600 })), AGORA);
    expect(curto.expiraEmMs).toBe(AGORA + 3600_000);
    const horas = interpretarRespostaLogin(200, JSON.stringify(respostaGeoRescue({ expira_em_horas: 2 })), AGORA);
    expect(horas.expiraEmMs).toBe(AGORA + 2 * 3600_000);
  });

  it("troca_senha vem marcada (quem chama recusa); gr_troca do token também conta", () => {
    expect(interpretarRespostaLogin(200, JSON.stringify(respostaGeoRescue({ troca_senha: true })), AGORA).trocaSenha).toBe(true);
    expect(interpretarRespostaLogin(200, JSON.stringify(respostaGeoRescue({}, { gr_troca: true })), AGORA).trocaSenha).toBe(true);
  });

  it("nome vazio: nunca usa o `usuario` (que o GeoRescue preenche com o CPF)", () => {
    const login = interpretarRespostaLogin(200, JSON.stringify(respostaGeoRescue({ nome: "", usuario: CPF })), AGORA);
    expect(login.nome).toBe("Usuário do GeoRescue");
    expect(JSON.stringify({ ...login, cpf: null })).not.toContain(CPF);
  });

  it("401: senha errada → 401 'credenciais' com mensagem genérica", async () => {
    const erro = await entrarNoGeoRescue(
      { usuario: CPF, senha: "errada" },
      { baseUrl: BASE, fetch: async () => jsonResposta(401, { ok: false, erro: "CPF ou senha inválidos." }), agoraMs: AGORA },
    ).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroAutenticacao);
    expect(erro).toMatchObject({ status: 401, motivo: "credenciais", message: "CPF ou senha inválidos." });
  });

  it("recusas conhecidas viram mensagens FIXAS da Sala (o texto do GeoRescue nunca é repassado)", () => {
    expect(erroDaRecusa("Conta bloqueada. Procure o administrador.")).toMatchObject({ status: 403, motivo: "conta" });
    expect(erroDaRecusa("Conta suspensa. Procure o administrador.").message).toMatch(/suspensa no GeoRescue/);
    expect(erroDaRecusa("Este acesso tinha prazo e ele venceu. Procure o administrador.").message).toMatch(/prazo/);
    expect(erroDaRecusa("Acesso restrito para a sua unidade de lotação. Procure o administrador do GeoRescue.").message).toMatch(
      /restrito/,
    );
    expect(erroDaRecusa("Sua conta existe, mas está sem papel definido. Procure o administrador.").message).toMatch(/sem papel/);
    expect(erroDaRecusa("Não foi possível apurar seu domínio de acesso agora. HTTP 500")).toMatchObject({
      status: 502,
      motivo: "georescue",
    });
    const estranho = erroDaRecusa("<script>alert(1)</script> CPF 529.982.247-25 inválido");
    expect(estranho).toMatchObject({ status: 401, motivo: "credenciais", message: "CPF ou senha inválidos." });
    expect(erroDaRecusa(undefined)).toMatchObject({ status: 401 });
  });

  it("timeout (15 s por padrão; aqui 20 ms) → 504 'tempo'", async () => {
    const pendurado = (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const erro = await entrarNoGeoRescue({ usuario: CPF, senha: SENHA }, { baseUrl: BASE, fetch: pendurado, timeoutMs: 20 }).catch(
      (e: unknown) => e,
    );
    expect(erro).toMatchObject({ status: 504, motivo: "tempo" });
  });

  it("falha de rede → 502 'georescue'; 500/502/429 do GeoRescue → 502", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const rede = await entrarNoGeoRescue(
      { usuario: CPF, senha: SENHA },
      {
        baseUrl: BASE,
        fetch: async () => {
          throw new TypeError("fetch failed");
        },
      },
    ).catch((e: unknown) => e);
    expect(rede).toMatchObject({ status: 502, motivo: "georescue" });
    for (const status of [500, 502, 503, 429]) {
      expect(() =>
        interpretarRespostaLogin(status, JSON.stringify({ ok: false, erro: "Backend sem variáveis de ambiente no Vercel: X" }), AGORA),
      ).toThrow(expect.objectContaining({ status: 502, motivo: "georescue" }));
    }
  });

  it.each([
    ["corpo não-JSON (página de erro)", 200, "<html>Deployment protection</html>"],
    ["sem papel", 200, JSON.stringify({ ...respostaGeoRescue(), papel: undefined })],
    ["dominios não é lista", 200, JSON.stringify(respostaGeoRescue({ dominios: "1COB" }))],
    ["troca_senha ausente", 200, JSON.stringify({ ...respostaGeoRescue(), troca_senha: undefined })],
    ["token ilegível", 200, JSON.stringify(respostaGeoRescue({ token: "%%%%%%%%%%%%.abc" }))],
    ["token sem exp", 200, JSON.stringify(respostaGeoRescue({ token: tokenGeoRescue({ ...claimsGeoRescue(), exp: undefined }) }))],
    ["token de campo (typ)", 200, JSON.stringify(respostaGeoRescue({ token: tokenGeoRescue({ ...claimsGeoRescue(), typ: "campo" }) }))],
    ["token já vencido", 200, JSON.stringify(respostaGeoRescue({}, { exp: IAT - 10 }))],
    ["usuário comum sem CPF no sub", 200, JSON.stringify(respostaGeoRescue({}, { sub: "" }))],
    ["status inesperado", 404, JSON.stringify({ ok: false })],
    ["400 do GeoRescue", 400, JSON.stringify({ ok: false, erro: "JSON inválido no corpo da requisição." })],
  ])("contrato inválido: %s → 502 'contrato'", (_d, status, corpo) => {
    expect(() => interpretarRespostaLogin(status, corpo, AGORA)).toThrow(expect.objectContaining({ status: 502, motivo: "contrato" }));
  });

  it("lê só a carga do token (sem verificar a assinatura) e recusa o que não é JSON", () => {
    expect(lerCargaTokenGeoRescue(tokenGeoRescue(claimsGeoRescue()))).toMatchObject({ sub: CPF, gr_dgrupo: ["SALA"], gr_pg: "2º Sgt" });
    expect(lerCargaTokenGeoRescue("")).toBeNull();
    expect(lerCargaTokenGeoRescue(`${b64u("não é json")}.x`)).toBeNull();
  });

  it("URL: só https (http apenas em localhost) e preserva o caminho da base", () => {
    expect(urlLoginGeoRescue("https://projeto-geo-rescue.vercel.app")).toBe("https://projeto-geo-rescue.vercel.app/api/login");
    expect(urlLoginGeoRescue("https://exemplo.gov.br/georescue/")).toBe("https://exemplo.gov.br/georescue/api/login");
    expect(urlLoginGeoRescue("http://localhost:3001")).toBe("http://localhost:3001/api/login");
    expect(() => urlLoginGeoRescue("http://georescue.exemplo.gov.br")).toThrow(expect.objectContaining({ status: 503 }));
  });

  it("não registra CPF, senha nem corpo em log, mesmo nas falhas", async () => {
    const avisos = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const erros = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logs = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const respostas = [
      jsonResposta(500, { ok: false, erro: `falha com ${CPF} e ${SENHA}` }),
      jsonResposta(200, `{"ok":true,"cpf":"${CPF}","senha":"${SENHA}"}`),
      jsonResposta(401, { ok: false, erro: "CPF ou senha inválidos." }),
    ];
    for (const r of respostas) {
      await entrarNoGeoRescue({ usuario: CPF, senha: SENHA }, { baseUrl: BASE, fetch: async () => r }).catch(() => undefined);
    }
    await entrarNoGeoRescue(
      { usuario: CPF, senha: SENHA },
      {
        baseUrl: BASE,
        fetch: async () => {
          throw new Error(`conexão recusada ${CPF} ${SENHA}`);
        },
      },
    ).catch(() => undefined);
    const tudo = JSON.stringify([...avisos.mock.calls, ...erros.mock.calls, ...logs.mock.calls]);
    expect(tudo).not.toContain(CPF);
    expect(tudo).not.toContain(SENHA);
  });
});
