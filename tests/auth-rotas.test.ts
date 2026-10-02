import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as sessaoGet } from "@/app/api/auth/sessao/route";
import { SEGREDO_SESSAO_DEMONSTRACAO } from "@/lib/auth/config";
import { reiniciarLimitesLogin } from "@/lib/auth/servico";
import { obterSessao, sessaoDosCookies } from "@/lib/auth/sessao";
import { verificarSessao } from "@/lib/auth/token";
import { reiniciarEnv } from "@/lib/env";

/*
 * Rotas /api/auth/* chamadas direto (sem servidor), com o fetch global
 * simulado no lugar do GeoRescue. Em teste NODE_ENV=test, então o cookie é o
 * de desenvolvimento ("sala_sessao", sem Secure); o de produção é conferido
 * no fim com NODE_ENV=production.
 */

const ORIGEM = "http://localhost:3000";
const GEORESCUE = "https://georescue.exemplo.gov.br";
const SEGREDO = "segredo-de-teste-da-sessao-com-32-caracteres-ou-mais";
const CPF = "52998224725";
const CPF_MASCARADO = "529.982.247-25";
const OUTRO_CPF = "11144477735";
const SENHA = "senha-secreta-123";

function b64u(texto: string): string {
  return Buffer.from(texto, "utf8").toString("base64url");
}

function respostaGeoRescue(extra: Record<string, unknown> = {}, claims: Record<string, unknown> = {}): Response {
  const iat = Math.floor(Date.now() / 1000);
  const token = `${b64u(
    JSON.stringify({
      iss: "georescue",
      sub: CPF,
      iat,
      exp: iat + 8 * 3600,
      gr_bm: "123456-7",
      gr_nome: "FULANO DE TAL",
      gr_pg: "2º Sgt",
      gr_papel: "operacional",
      gr_dominios: ["1COB"],
      gr_dgrupo: ["SALA"],
      gr_optotal: false,
      gr_situacao: "ativo",
      gr_troca: false,
      u: "FULANO DE TAL",
      ...claims,
    }),
  )}.${b64u("assinatura-falsa")}`;
  return Response.json({
    ok: true,
    usuario: "FULANO DE TAL",
    nome: "FULANO DE TAL",
    cpf: CPF_MASCARADO,
    bm: "123456-7",
    unidade: "1BBM (BELO HORIZONTE)",
    papel: "operacional",
    dominios: ["1COB"],
    escopo_global: false,
    troca_senha: false,
    token,
    expira_em_horas: 8,
    ...extra,
  });
}

function pedidoLogin(corpo: unknown, cabecalhos: Record<string, string> = {}): Request {
  return new Request(`${ORIGEM}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGEM, "x-real-ip": "203.0.113.7", ...cabecalhos },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

function pedidoLogout(cabecalhos: Record<string, string> = {}): Request {
  return new Request(`${ORIGEM}/api/auth/logout`, { method: "POST", headers: { Origin: ORIGEM, ...cabecalhos } });
}

function pedidoSessao(cookie?: string): Request {
  return new Request(`${ORIGEM}/api/auth/sessao`, { headers: cookie ? { Cookie: cookie } : {} });
}

/** "nome=valor" de cada Set-Cookie. */
function cookiesDefinidos(resposta: Response): Record<string, { valor: string; bruto: string }> {
  const saida: Record<string, { valor: string; bruto: string }> = {};
  for (const bruto of resposta.headers.getSetCookie()) {
    const [par] = bruto.split(";");
    const i = par.indexOf("=");
    saida[par.slice(0, i)] = { valor: par.slice(i + 1), bruto };
  }
  return saida;
}

function modoReal(extra: Record<string, string> = {}) {
  vi.stubEnv("DADOS_EXEMPLO", "0");
  vi.stubEnv("GEORESCUE_BASE_URL", GEORESCUE);
  vi.stubEnv("SALA_SESSION_SECRET", SEGREDO);
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
  reiniciarEnv();
}

function modoExemplo(extra: Record<string, string> = {}) {
  vi.stubEnv("DADOS_EXEMPLO", "1");
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
  reiniciarEnv();
}

let fetchSimulado: ReturnType<typeof vi.fn>;

beforeEach(() => {
  reiniciarLimitesLogin();
  vi.stubEnv("GEORESCUE_BASE_URL", "");
  vi.stubEnv("SALA_SESSION_SECRET", "");
  vi.stubEnv("SALA_PSEUDO_SEGREDO", "");
  vi.stubEnv("SALA_GRUPO_OPERADOR", "");
  fetchSimulado = vi.fn(async () => respostaGeoRescue());
  vi.stubGlobal("fetch", fetchSimulado);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  reiniciarEnv();
  reiniciarLimitesLogin();
});

describe("POST /api/auth/login — login real (GeoRescue simulado)", () => {
  beforeEach(() => modoReal());

  it("sucesso: cookie assinado HttpOnly/SameSite=Lax/Path=/, {ok, sessao} sem sid e sem CPF, no-store", async () => {
    const resposta = await login(pedidoLogin({ cpf: CPF_MASCARADO, senha: SENHA }));
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("Cache-Control")).toBe("no-store");

    // O GeoRescue recebeu {usuario: CPF só dígitos, senha}.
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${GEORESCUE}/api/login`);
    expect(JSON.parse(String(init.body))).toEqual({ usuario: CPF, senha: SENHA });

    const corpo = await resposta.json();
    expect(corpo.ok).toBe(true);
    expect(corpo.sessao).toMatchObject({
      nome: "FULANO DE TAL",
      posto: "2º Sgt",
      bm: "123456-7",
      papel: "operador-sala",
      papelGeoRescue: "operacional",
      cobs: ["1º COB"],
      escopoGlobal: true,
      grupos: ["SALA"],
      unidade: "1BBM (BELO HORIZONTE)",
      demonstracao: false,
      capacidades: { emitir: true, encerrar: true },
    });
    expect(corpo.sessao).not.toHaveProperty("sid");
    expect(corpo.sessao.usuarioId).toMatch(/^[0-9a-f]{32}$/);

    const cookies = cookiesDefinidos(resposta);
    const sessao = cookies.sala_sessao;
    expect(sessao).toBeDefined();
    expect(sessao.bruto).toMatch(/HttpOnly/i);
    expect(sessao.bruto).toMatch(/SameSite=lax/i);
    expect(sessao.bruto).toMatch(/Path=\//);
    expect(sessao.bruto).toMatch(/Max-Age=28[0-9]{3}/);
    expect(sessao.bruto).not.toMatch(/Secure/i); // desenvolvimento/teste

    // Nenhum CPF (com ou sem máscara) no cookie nem no corpo.
    const tudo = `${JSON.stringify(corpo)} ${resposta.headers.getSetCookie().join(" ")}`;
    const cargaCookie = Buffer.from(sessao.valor.split(".")[0], "base64url").toString("utf8");
    for (const texto of [tudo, cargaCookie]) {
      expect(texto).not.toContain(CPF);
      expect(texto).not.toContain(CPF_MASCARADO);
      expect(texto).not.toContain(SENHA);
    }
    expect(JSON.stringify(corpo)).not.toContain("token");

    // A sessão lida de volta pelo GET /api/auth/sessao.
    const lida = await sessaoGet(pedidoSessao(`sala_sessao=${sessao.valor}`));
    expect(lida.headers.get("Cache-Control")).toBe("no-store");
    const corpoLido = await lida.json();
    expect(corpoLido).toEqual({ ok: true, sessao: corpo.sessao });
  });

  it("sem cookie, ou com cookie adulterado, GET /api/auth/sessao devolve sessao: null", async () => {
    expect(await (await sessaoGet(pedidoSessao())).json()).toEqual({ ok: true, sessao: null });
    const resposta = await login(pedidoLogin({ cpf: CPF, senha: SENHA }));
    const valor = cookiesDefinidos(resposta).sala_sessao.valor;
    const adulterado = `${valor.slice(0, -2)}xx`;
    expect(await (await sessaoGet(pedidoSessao(`sala_sessao=${adulterado}`))).json()).toEqual({ ok: true, sessao: null });
    // O nome de produção não vale em desenvolvimento (e vice-versa).
    expect(await (await sessaoGet(pedidoSessao(`__Host-sala_sessao=${valor}`))).json()).toEqual({ ok: true, sessao: null });
  });

  it("unidade: Gestor de um COB entra como unidade, só com aquele COB", async () => {
    fetchSimulado.mockResolvedValueOnce(respostaGeoRescue({ papel: "operador", dominios: ["3º COB"] }, { gr_dgrupo: [] }));
    const corpo = await (await login(pedidoLogin({ cpf: CPF, senha: SENHA }))).json();
    expect(corpo.sessao).toMatchObject({ papel: "unidade", cobs: ["3º COB"], escopoGlobal: false, grupos: [] });
    expect(corpo.sessao.capacidades).toMatchObject({ emitir: false, darCiencia: true, verTodosCobs: false });
  });

  it("texto longo do GeoRescue é cortado no teto do cookie (não derruba o login)", async () => {
    fetchSimulado.mockResolvedValueOnce(respostaGeoRescue({ unidade: "U".repeat(450), nome: "N".repeat(450) }));
    const resposta = await login(pedidoLogin({ cpf: CPF, senha: SENHA }));
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.sessao.unidade).toHaveLength(200);
    expect(corpo.sessao.nome).toHaveLength(200);
  });

  it("401 do GeoRescue → 401 'credenciais', sem cookie", async () => {
    fetchSimulado.mockResolvedValueOnce(Response.json({ ok: false, erro: "CPF ou senha inválidos." }, { status: 401 }));
    const resposta = await login(pedidoLogin({ cpf: CPF, senha: "errada" }));
    expect(resposta.status).toBe(401);
    expect(await resposta.json()).toEqual({ ok: false, erro: "CPF ou senha inválidos.", motivo: "credenciais" });
    expect(resposta.headers.getSetCookie()).toEqual([]);
  });

  it("troca de senha pendente → 403 pedindo para trocar no GeoRescue, sem cookie", async () => {
    fetchSimulado.mockResolvedValueOnce(respostaGeoRescue({ troca_senha: true }, { gr_troca: true }));
    const resposta = await login(pedidoLogin({ cpf: CPF, senha: SENHA }));
    expect(resposta.status).toBe(403);
    const corpo = await resposta.json();
    expect(corpo.motivo).toBe("troca_senha");
    expect(corpo.erro).toMatch(/troque a senha no GeoRescue/i);
    expect(resposta.headers.getSetCookie()).toEqual([]);
  });

  it("sem domínio nem grupo → 403 'negado' (falha fechada)", async () => {
    fetchSimulado.mockResolvedValueOnce(respostaGeoRescue({ dominios: [] }, { gr_dgrupo: [] }));
    const resposta = await login(pedidoLogin({ cpf: CPF, senha: SENHA }));
    expect(resposta.status).toBe(403);
    expect((await resposta.json()).motivo).toBe("negado");
  });

  it("CPF inválido ou faltando → 400 sem chamar o GeoRescue", async () => {
    for (const corpo of [{ cpf: "123", senha: SENHA }, { cpf: "529.982.247-24", senha: SENHA }, { senha: SENHA }, { cpf: CPF }]) {
      const resposta = await login(pedidoLogin(corpo));
      expect(resposta.status).toBe(400);
      expect((await resposta.json()).motivo).toBe("entrada_invalida");
    }
    for (const corpo of ["não é json", "[]"]) {
      expect((await login(pedidoLogin(corpo))).status).toBe(400);
    }
    expect((await login(pedidoLogin(JSON.stringify({ cpf: CPF, senha: SENHA }), { "Content-Type": "text/plain" }))).status).toBe(400);
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("perfil de demonstração fora do modo demonstração → 400", async () => {
    const resposta = await login(pedidoLogin({ perfilDemonstracao: "operador-sala" }));
    expect(resposta.status).toBe(400);
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("GeoRescue fora do ar → 502; o erro não conta no limite", async () => {
    fetchSimulado.mockImplementation(async () => {
      throw new TypeError("fetch failed");
    });
    for (let i = 0; i < 7; i++) {
      const resposta = await login(pedidoLogin({ cpf: CPF, senha: SENHA }));
      expect(resposta.status).toBe(502);
    }
  });
});

describe("limite de tentativas na rota", () => {
  beforeEach(() => modoReal());

  it("por CPF: 5 senhas erradas em 10 min → 429 com Retry-After (sem chamar o GeoRescue)", async () => {
    fetchSimulado.mockImplementation(async () => Response.json({ ok: false, erro: "CPF ou senha inválidos." }, { status: 401 }));
    for (let i = 0; i < 5; i++) {
      expect((await login(pedidoLogin({ cpf: CPF, senha: `errada-${i}` }, { "x-real-ip": `198.51.100.${i}` }))).status).toBe(401);
    }
    const bloqueado = await login(pedidoLogin({ cpf: CPF, senha: SENHA }, { "x-real-ip": "198.51.100.99" }));
    expect(bloqueado.status).toBe(429);
    expect((await bloqueado.json()).motivo).toBe("limite");
    expect(Number(bloqueado.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(fetchSimulado).toHaveBeenCalledTimes(5);
    // Outro CPF segue liberado.
    expect((await login(pedidoLogin({ cpf: OUTRO_CPF, senha: "x" }, { "x-real-ip": "198.51.100.100" }))).status).toBe(401);
  });

  it("por IP: 10 tentativas erradas em 10 min → 429 para qualquer CPF desse IP", async () => {
    fetchSimulado.mockImplementation(async () => Response.json({ ok: false, erro: "CPF ou senha inválidos." }, { status: 401 }));
    const cpfs = [CPF, OUTRO_CPF];
    for (let i = 0; i < 10; i++) {
      expect((await login(pedidoLogin({ cpf: cpfs[i % 2], senha: `errada-${i}` }))).status).toBe(i < 10 ? 401 : 429);
    }
    // 5 por CPF já estouraria o limite por conta; o terceiro CPF mostra o limite por IP.
    const terceiro = await login(pedidoLogin({ cpf: "39053344705", senha: SENHA }));
    expect(terceiro.status).toBe(429);
    // Outro IP continua (o terceiro CPF não tem tentativas).
    expect((await login(pedidoLogin({ cpf: "39053344705", senha: SENHA }, { "x-real-ip": "192.0.2.1" }))).status).toBe(401);
  });

  it("login certo não consome vaga", async () => {
    for (let i = 0; i < 12; i++) {
      expect((await login(pedidoLogin({ cpf: CPF, senha: SENHA }))).status).toBe(200);
    }
  });
});

describe("Origin (CSRF)", () => {
  beforeEach(() => modoReal());

  it.each<[string, Record<string, string>]>([
    ["sem Origin", { Origin: "" }],
    ["Origin de outro site", { Origin: "https://evil.example" }],
    ["Origin null", { Origin: "null" }],
    ["Sec-Fetch-Site cross-site", { "Sec-Fetch-Site": "cross-site" }],
  ])("login %s → 403 'origem', sem chamar o GeoRescue", async (_d, cabecalhos) => {
    const pedido = pedidoLogin({ cpf: CPF, senha: SENHA }, cabecalhos);
    if (cabecalhos.Origin === "") pedido.headers.delete("Origin");
    const resposta = await login(pedido);
    expect(resposta.status).toBe(403);
    expect((await resposta.json()).motivo).toBe("origem");
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("logout de outro site → 403 (o cookie fica)", async () => {
    const resposta = await logout(pedidoLogout({ Origin: "https://evil.example" }));
    expect(resposta.status).toBe(403);
    expect(resposta.headers.getSetCookie()).toEqual([]);
  });
});

describe("login desligado por configuração (fora do modo demonstração)", () => {
  it.each([
    ["sem SALA_SESSION_SECRET", { GEORESCUE_BASE_URL: GEORESCUE }, /SALA_SESSION_SECRET/],
    ["sem GEORESCUE_BASE_URL", { SALA_SESSION_SECRET: SEGREDO }, /GEORESCUE_BASE_URL/],
    ["SALA_SESSION_SECRET curto (descartado)", { GEORESCUE_BASE_URL: GEORESCUE, SALA_SESSION_SECRET: "curto" }, /SALA_SESSION_SECRET/],
  ])("%s → 503 'login indisponível: configure …'", async (_d, variaveis, nome) => {
    vi.stubEnv("DADOS_EXEMPLO", "0");
    for (const [k, v] of Object.entries(variaveis)) vi.stubEnv(k, v);
    reiniciarEnv();
    const resposta = await login(pedidoLogin({ cpf: CPF, senha: SENHA }));
    expect(resposta.status).toBe(503);
    const corpo = await resposta.json();
    expect(corpo.motivo).toBe("indisponivel");
    expect(corpo.erro).toMatch(/^Login indisponível: configure /);
    expect(corpo.erro).toMatch(nome);
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("sem segredo nenhuma sessão é aceita (falha fechada)", async () => {
    modoReal();
    const valor = cookiesDefinidos(await login(pedidoLogin({ cpf: CPF, senha: SENHA }))).sala_sessao.valor;
    vi.stubEnv("SALA_SESSION_SECRET", "");
    reiniciarEnv();
    expect(await (await sessaoGet(pedidoSessao(`sala_sessao=${valor}`))).json()).toEqual({ ok: true, sessao: null });
  });
});

describe("modo demonstração (DADOS_EXEMPLO=1)", () => {
  beforeEach(() => modoExemplo());

  it.each([
    ["operador-sala", { papel: "operador-sala", escopoGlobal: true, grupos: ["SALA"] }],
    ["unidade", { papel: "unidade", cobs: ["3º COB"], unidade: "4BBM (JUIZ DE FORA)", escopoGlobal: false }],
    ["leitura", { papel: "leitura", cobs: ["1º COB"], papelGeoRescue: "visualizador" }],
  ])("perfil %s: mesma sessão assinada, demonstracao=true, sem GeoRescue", async (perfil, esperado) => {
    const resposta = await login(pedidoLogin({ perfilDemonstracao: perfil }));
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.sessao).toMatchObject({ ...esperado, demonstracao: true, bm: null });
    const valor = cookiesDefinidos(resposta).sala_sessao.valor;
    // Sem SALA_SESSION_SECRET, assina com a chave fixa de demonstração.
    expect(verificarSessao(valor, SEGREDO_SESSAO_DEMONSTRACAO, { demonstracao: true })).toMatchObject({ papel: perfil });
    expect(await (await sessaoGet(pedidoSessao(`sala_sessao=${valor}`))).json()).toEqual({ ok: true, sessao: corpo.sessao });
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("CPF e senha no modo demonstração → 400, sem chamar o GeoRescue", async () => {
    vi.stubEnv("GEORESCUE_BASE_URL", GEORESCUE);
    vi.stubEnv("SALA_SESSION_SECRET", SEGREDO);
    reiniciarEnv();
    const resposta = await login(pedidoLogin({ cpf: CPF, senha: SENHA }));
    expect(resposta.status).toBe(400);
    expect((await resposta.json()).erro).toMatch(/perfil de demonstração/);
    expect((await login(pedidoLogin({ perfilDemonstracao: "root" }))).status).toBe(400);
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("sem cookie vale o Operador de demonstração (compatível com a fila); depois de Sair, ninguém", async () => {
    const implicita = await (await sessaoGet(pedidoSessao())).json();
    expect(implicita.sessao).toMatchObject({ papel: "operador-sala", nome: "Operador de demonstração", demonstracao: true });
    expect(await obterSessao()).toMatchObject({ sid: "demonstracao", papel: "operador-sala" });

    const saida = await logout(pedidoLogout());
    expect(saida.status).toBe(200);
    expect(await saida.json()).toEqual({ ok: true });
    const cookies = cookiesDefinidos(saida);
    expect(cookies.sala_sessao.valor).toBe("");
    expect(cookies.sala_sessao.bruto).toMatch(/Max-Age=0/);
    expect(cookies.sala_demo_saiu.valor).toBe("1");

    expect(await (await sessaoGet(pedidoSessao("sala_demo_saiu=1"))).json()).toEqual({ ok: true, sessao: null });
    // Escolher um perfil apaga a marca.
    const entrada = await login(pedidoLogin({ perfilDemonstracao: "leitura" }));
    expect(cookiesDefinidos(entrada).sala_demo_saiu.bruto).toMatch(/Max-Age=0/);
  });

  it("sessão de demonstração não vale quando o modo demonstração é desligado", async () => {
    vi.stubEnv("SALA_SESSION_SECRET", SEGREDO);
    reiniciarEnv();
    const valor = cookiesDefinidos(await login(pedidoLogin({ perfilDemonstracao: "operador-sala" }))).sala_sessao.valor;
    modoReal();
    expect(await (await sessaoGet(pedidoSessao(`sala_sessao=${valor}`))).json()).toEqual({ ok: true, sessao: null });
  });

  it("SALA_GRUPO_OPERADOR configurado aparece no perfil de operador", async () => {
    vi.stubEnv("SALA_GRUPO_OPERADOR", "SALA_SITUACAO");
    reiniciarEnv();
    const corpo = await (await login(pedidoLogin({ perfilDemonstracao: "operador-sala" }))).json();
    expect(corpo.sessao.grupos).toEqual(["SALA_SITUACAO"]);
  });
});

describe("obterSessao fora de uma requisição (testes, scripts)", () => {
  it("fora do modo demonstração: null", async () => {
    modoReal();
    expect(await obterSessao()).toBeNull();
  });

  it("sessaoDosCookies lê o cookie pelo nome do ambiente", async () => {
    modoReal();
    const valor = cookiesDefinidos(await login(pedidoLogin({ cpf: CPF, senha: SENHA }))).sala_sessao.valor;
    const lida = sessaoDosCookies((nome) => (nome === "sala_sessao" ? valor : undefined));
    expect(lida).toMatchObject({ origem: "cookie", sessao: { papel: "operador-sala", demonstracao: false } });
    expect(lida?.sessao.sid).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});

describe("produção (NODE_ENV=production)", () => {
  it("cookie __Host-sala_sessao com Secure; o nome de desenvolvimento é ignorado", async () => {
    vi.stubEnv("NODE_ENV", "production");
    modoReal();
    const resposta = await login(pedidoLogin({ cpf: CPF, senha: SENHA }));
    const cookies = cookiesDefinidos(resposta);
    expect(cookies["__Host-sala_sessao"]).toBeDefined();
    expect(cookies["__Host-sala_sessao"].bruto).toMatch(/Secure/i);
    expect(cookies["__Host-sala_sessao"].bruto).toMatch(/HttpOnly/i);
    expect(cookies["__Host-sala_sessao"].bruto).not.toMatch(/Domain=/i);
    expect(cookies.sala_sessao).toBeUndefined();
    const valor = cookies["__Host-sala_sessao"].valor;
    expect((await (await sessaoGet(pedidoSessao(`__Host-sala_sessao=${valor}`))).json()).sessao).not.toBeNull();
    expect((await (await sessaoGet(pedidoSessao(`sala_sessao=${valor}`))).json()).sessao).toBeNull();

    const saida = cookiesDefinidos(await logout(pedidoLogout()));
    expect(saida["__Host-sala_sessao"].bruto).toMatch(/Max-Age=0/);
    expect(saida["__Host-sala_sessao"].bruto).toMatch(/Secure/i);
  });
});
