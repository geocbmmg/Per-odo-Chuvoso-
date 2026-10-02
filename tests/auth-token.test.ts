import { describe, expect, it } from "vitest";

import {
  atributosCookieSessao,
  cookieSeguro,
  lerCookieDoCabecalho,
  NOME_COOKIE_SESSAO_DESENVOLVIMENTO,
  NOME_COOKIE_SESSAO_SEGURO,
  nomeCookieSessao,
} from "@/lib/auth/cookie";
import { chavePseudonimo, identificadorDaConta, pseudonimoUsuario } from "@/lib/auth/pseudonimo";
import { assinarSessao, DURACAO_MAXIMA_SESSAO_S, ErroSegredoSessao, segundosAteExpirar, verificarSessao } from "@/lib/auth/token";
import type { Sessao } from "@/lib/auth/tipos";

const SEGREDO = "s".repeat(40);
const OUTRO_SEGREDO = "t".repeat(40);
const AGORA = Date.parse("2026-10-02T12:00:00Z");
const CPF = "52998224725";

function sessao(extra: Partial<Sessao> = {}): Sessao {
  return {
    sid: "abcdefghijklmnopqrstuv",
    usuarioId: pseudonimoUsuario(identificadorDaConta({ cpf: CPF }), SEGREDO),
    nome: "Fulano de Tal",
    posto: "Sgt",
    bm: "123456-7",
    papel: "unidade",
    papelGeoRescue: "operacional",
    cobs: ["1º COB"],
    escopoGlobal: false,
    grupos: [],
    unidade: "1BBM (BELO HORIZONTE)",
    expiraEm: new Date(AGORA + 4 * 3600_000).toISOString(),
    demonstracao: false,
    ...extra,
  };
}

function decodificarCarga(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("token de sessão da Sala (HMAC-SHA256)", () => {
  it("assina e verifica: formato compacto base64url(carga).base64url(assinatura)", () => {
    const token = assinarSessao(sessao(), SEGREDO, AGORA);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    const lida = verificarSessao(token, SEGREDO, { agoraMs: AGORA + 1000, demonstracao: false });
    expect(lida).toEqual(sessao());
    const carga = decodificarCarga(token);
    expect(carga).toMatchObject({ typ: "sala-sessao", v: 1, iat: AGORA / 1000, exp: AGORA / 1000 + 4 * 3600 });
  });

  it("nunca carrega o CPF (só o pseudônimo de 32 hex)", () => {
    const token = assinarSessao(sessao(), SEGREDO, AGORA);
    const texto = Buffer.from(token.split(".")[0], "base64url").toString("utf8");
    expect(texto).not.toContain(CPF);
    expect(token).not.toContain(CPF);
    expect(decodificarCarga(token).usuarioId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("adulteração da carga ou da assinatura → null", () => {
    const token = assinarSessao(sessao(), SEGREDO, AGORA);
    const [carga, assinatura] = token.split(".");
    const promovida = Buffer.from(
      JSON.stringify({ ...decodificarCarga(token), papel: "admin", escopoGlobal: true }),
      "utf8",
    ).toString("base64url");
    const opcoes = { agoraMs: AGORA, demonstracao: false };
    expect(verificarSessao(`${promovida}.${assinatura}`, SEGREDO, opcoes)).toBeNull();
    const trocaUltimo = assinatura.slice(0, -1) + (assinatura.endsWith("A") ? "B" : "A");
    expect(verificarSessao(`${carga}.${trocaUltimo}`, SEGREDO, opcoes)).toBeNull();
    expect(verificarSessao(`${carga}.${assinatura}x`, SEGREDO, opcoes)).toBeNull();
    expect(verificarSessao(`${carga}.${assinatura}.extra`, SEGREDO, opcoes)).toBeNull();
    expect(verificarSessao(carga, SEGREDO, opcoes)).toBeNull();
    expect(verificarSessao("", SEGREDO, opcoes)).toBeNull();
    expect(verificarSessao("lixo.lixo", SEGREDO, opcoes)).toBeNull();
    // Assinado com outro segredo
    expect(verificarSessao(assinarSessao(sessao(), OUTRO_SEGREDO, AGORA), SEGREDO, opcoes)).toBeNull();
  });

  it("token de outro tipo assinado com o mesmo segredo não vira sessão", () => {
    // Mesmo HMAC sobre uma carga sem typ (o defeito do token de campo do GeoRescue).
    const token = assinarSessao(sessao(), SEGREDO, AGORA);
    const semTipo = { ...decodificarCarga(token) };
    delete semTipo.typ;
    const segmento = Buffer.from(JSON.stringify(semTipo), "utf8").toString("base64url");
    // Sem o segredo não há como reassinar; e mesmo uma carga bem assinada sem typ é recusada pelo esquema.
    expect(verificarSessao(`${segmento}.${token.split(".")[1]}`, SEGREDO, { agoraMs: AGORA, demonstracao: false })).toBeNull();
  });

  it("expiração: vale até o exp e não depois", () => {
    const token = assinarSessao(sessao(), SEGREDO, AGORA);
    const fim = AGORA + 4 * 3600_000;
    expect(verificarSessao(token, SEGREDO, { agoraMs: fim - 1000, demonstracao: false })).not.toBeNull();
    expect(verificarSessao(token, SEGREDO, { agoraMs: fim, demonstracao: false })).toBeNull();
    expect(verificarSessao(token, SEGREDO, { agoraMs: fim + 60_000, demonstracao: false })).toBeNull();
  });

  it("exp obrigatório: no futuro e no máximo 8 h", () => {
    expect(() => assinarSessao(sessao({ expiraEm: new Date(AGORA - 1000).toISOString() }), SEGREDO, AGORA)).toThrow();
    expect(() =>
      assinarSessao(sessao({ expiraEm: new Date(AGORA + (DURACAO_MAXIMA_SESSAO_S + 60) * 1000).toISOString() }), SEGREDO, AGORA),
    ).toThrow(/8 h/);
    expect(() => assinarSessao(sessao({ expiraEm: "nao-e-data" }), SEGREDO, AGORA)).toThrow();
    expect(() =>
      assinarSessao(sessao({ expiraEm: new Date(AGORA + DURACAO_MAXIMA_SESSAO_S * 1000).toISOString() }), SEGREDO, AGORA),
    ).not.toThrow();
  });

  it("emitido no futuro (relógio adiantado além da folga) → null", () => {
    const token = assinarSessao(sessao({ expiraEm: new Date(AGORA + 3 * 3600_000).toISOString() }), SEGREDO, AGORA + 3600_000);
    expect(verificarSessao(token, SEGREDO, { agoraMs: AGORA, demonstracao: false })).toBeNull();
    expect(verificarSessao(token, SEGREDO, { agoraMs: AGORA + 3600_000, demonstracao: false })).not.toBeNull();
  });

  it("segredo ausente ou curto → falha fechada (não assina, não verifica)", () => {
    expect(() => assinarSessao(sessao(), undefined, AGORA)).toThrow(ErroSegredoSessao);
    expect(() => assinarSessao(sessao(), "", AGORA)).toThrow(ErroSegredoSessao);
    expect(() => assinarSessao(sessao(), "curto-demais", AGORA)).toThrow(ErroSegredoSessao);
    const token = assinarSessao(sessao(), SEGREDO, AGORA);
    expect(verificarSessao(token, undefined, { agoraMs: AGORA, demonstracao: false })).toBeNull();
    expect(verificarSessao(token, null, { agoraMs: AGORA, demonstracao: false })).toBeNull();
    expect(verificarSessao(token, "", { agoraMs: AGORA, demonstracao: false })).toBeNull();
  });

  it("sessão de demonstração só vale no modo demonstração (e a real só fora dele)", () => {
    const demo = assinarSessao(sessao({ demonstracao: true }), SEGREDO, AGORA);
    const real = assinarSessao(sessao(), SEGREDO, AGORA);
    expect(verificarSessao(demo, SEGREDO, { agoraMs: AGORA, demonstracao: false })).toBeNull();
    expect(verificarSessao(demo, SEGREDO, { agoraMs: AGORA, demonstracao: true })).not.toBeNull();
    expect(verificarSessao(real, SEGREDO, { agoraMs: AGORA, demonstracao: true })).toBeNull();
  });

  it("carga fora do esquema é recusada ao assinar (papel desconhecido, pseudônimo inválido)", () => {
    expect(() => assinarSessao(sessao({ papel: "root" as Sessao["papel"] }), SEGREDO, AGORA)).toThrow();
    expect(() => assinarSessao(sessao({ usuarioId: CPF }), SEGREDO, AGORA)).toThrow();
  });

  it("segundosAteExpirar dá o Max-Age do cookie", () => {
    expect(segundosAteExpirar(sessao(), AGORA)).toBe(4 * 3600);
    expect(segundosAteExpirar(sessao({ expiraEm: new Date(AGORA - 1).toISOString() }), AGORA)).toBe(0);
  });
});

describe("pseudônimo do usuário", () => {
  it("estável, 32 hex, muda com a chave e nunca contém o CPF", () => {
    const a = pseudonimoUsuario(identificadorDaConta({ cpf: "529.982.247-25" }), SEGREDO);
    expect(a).toBe(pseudonimoUsuario(identificadorDaConta({ cpf: CPF }), SEGREDO));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain(CPF);
    expect(pseudonimoUsuario(identificadorDaConta({ cpf: CPF }), OUTRO_SEGREDO)).not.toBe(a);
    expect(pseudonimoUsuario(identificadorDaConta({ administrador: "Admin" }), SEGREDO)).toBe(
      pseudonimoUsuario(identificadorDaConta({ administrador: "admin" }), SEGREDO),
    );
  });

  it("sem SALA_PSEUDO_SEGREDO, a chave é derivada do segredo da sessão com rótulo (nunca o segredo cru)", () => {
    expect(chavePseudonimo("p".repeat(40), SEGREDO)).toBe("p".repeat(40));
    const derivada = chavePseudonimo(undefined, SEGREDO);
    expect(derivada).not.toBe(SEGREDO);
    expect(derivada).toMatch(/^[0-9a-f]{64}$/);
    expect(chavePseudonimo(undefined, SEGREDO)).toBe(derivada);
  });
});

describe("cookie da sessão", () => {
  it("produção: __Host-sala_sessao, HttpOnly, Secure, SameSite=Lax, Path=/", () => {
    expect(cookieSeguro("production")).toBe(true);
    expect(nomeCookieSessao(true)).toBe(NOME_COOKIE_SESSAO_SEGURO);
    expect(NOME_COOKIE_SESSAO_SEGURO).toBe("__Host-sala_sessao");
    expect(atributosCookieSessao(3600, true)).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 3600 });
  });

  it("desenvolvimento (http://localhost): sala_sessao sem Secure", () => {
    expect(cookieSeguro("development")).toBe(false);
    expect(cookieSeguro("test")).toBe(false);
    expect(nomeCookieSessao(false)).toBe(NOME_COOKIE_SESSAO_DESENVOLVIMENTO);
    expect(atributosCookieSessao(10, false).secure).toBe(false);
  });

  it("lê o cookie pelo nome exato no cabeçalho Cookie", () => {
    const cabecalho = "sala-trilho=mini; sala_sessao=abc.def; __Host-sala_sessao=xyz.uvw";
    expect(lerCookieDoCabecalho(cabecalho, "sala_sessao")).toBe("abc.def");
    expect(lerCookieDoCabecalho(cabecalho, "__Host-sala_sessao")).toBe("xyz.uvw");
    expect(lerCookieDoCabecalho(cabecalho, "outro")).toBeUndefined();
    expect(lerCookieDoCabecalho(null, "sala_sessao")).toBeUndefined();
  });
});
