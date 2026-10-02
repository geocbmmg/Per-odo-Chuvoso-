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
import {
  assinarSessao,
  cifrarCarga,
  decifrarCarga,
  DURACAO_MAXIMA_SESSAO_S,
  ErroSegredoSessao,
  segundosAteExpirar,
  verificarSessao,
} from "@/lib/auth/token";
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

function carga(token: string): Record<string, unknown> {
  return decifrarCarga(token, SEGREDO) as Record<string, unknown>;
}

/** Troca um caractere base64url de um segmento do token (adulteração). */
function adulterar(segmento: string, posicao = 3): string {
  const c = segmento[posicao] === "A" ? "B" : "A";
  return segmento.slice(0, posicao) + c + segmento.slice(posicao + 1);
}

describe("token de sessão da Sala (AES-256-GCM)", () => {
  it("cifra e verifica: formato base64url(iv).base64url(cifrado).base64url(tag)", () => {
    const token = assinarSessao(sessao(), SEGREDO, AGORA);
    expect(token).toMatch(/^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/);
    const lida = verificarSessao(token, SEGREDO, { agoraMs: AGORA + 1000, demonstracao: false });
    expect(lida).toEqual(sessao());
    expect(carga(token)).toMatchObject({ typ: "sala-sessao", v: 2, iat: AGORA / 1000, exp: AGORA / 1000 + 4 * 3600 });
    // Dois tokens da mesma sessão nunca são iguais (iv aleatório).
    expect(assinarSessao(sessao(), SEGREDO, AGORA)).not.toBe(token);
  });

  it("o cookie é opaco: nem CPF, nem nome, nº BM ou unidade legíveis sem o segredo", () => {
    const token = assinarSessao(sessao(), SEGREDO, AGORA);
    const legivel = token.split(".").map((p) => Buffer.from(p, "base64url").toString("latin1")).join(" ") + " " + token;
    for (const dado of [CPF, "Fulano", "123456-7", "BELO HORIZONTE", "sala-sessao", "unidade"]) {
      expect(legivel).not.toContain(dado);
    }
    expect(carga(token).usuarioId).toMatch(/^[0-9a-f]{32}$/);
    expect(decifrarCarga(token, OUTRO_SEGREDO)).toBeNull();
  });

  it("adulteração do iv, do conteúdo ou da tag → null", () => {
    const token = assinarSessao(sessao(), SEGREDO, AGORA);
    const [iv, cifrado, tag] = token.split(".");
    const opcoes = { agoraMs: AGORA, demonstracao: false };
    expect(verificarSessao(`${adulterar(iv)}.${cifrado}.${tag}`, SEGREDO, opcoes)).toBeNull();
    expect(verificarSessao(`${iv}.${adulterar(cifrado)}.${tag}`, SEGREDO, opcoes)).toBeNull();
    expect(verificarSessao(`${iv}.${cifrado}.${adulterar(tag)}`, SEGREDO, opcoes)).toBeNull();
    expect(verificarSessao(`${iv}.${cifrado}.${tag}.extra`, SEGREDO, opcoes)).toBeNull();
    expect(verificarSessao(`${iv}.${cifrado}`, SEGREDO, opcoes)).toBeNull();
    expect(verificarSessao("", SEGREDO, opcoes)).toBeNull();
    expect(verificarSessao("lixo.lixo.lixo", SEGREDO, opcoes)).toBeNull();
    // Cifrado com outro segredo
    expect(verificarSessao(assinarSessao(sessao(), OUTRO_SEGREDO, AGORA), SEGREDO, opcoes)).toBeNull();
  });

  it("carga de outro tipo cifrada com o mesmo segredo não vira sessão (esquema conferido após decifrar)", () => {
    const base = carga(assinarSessao(sessao(), SEGREDO, AGORA));
    const opcoes = { agoraMs: AGORA, demonstracao: false };
    const semTipo = { ...base };
    delete semTipo.typ;
    expect(verificarSessao(cifrarCarga(semTipo, SEGREDO), SEGREDO, opcoes)).toBeNull();
    expect(verificarSessao(cifrarCarga({ ...base, typ: "campo" }, SEGREDO), SEGREDO, opcoes)).toBeNull();
    expect(verificarSessao(cifrarCarga({ ...base, v: 1 }, SEGREDO), SEGREDO, opcoes)).toBeNull();
    expect(verificarSessao(cifrarCarga({ ...base, papel: "root" }, SEGREDO), SEGREDO, opcoes)).toBeNull();
    expect(verificarSessao(cifrarCarga({ ...base, usuarioId: CPF }, SEGREDO), SEGREDO, opcoes)).toBeNull();
    expect(verificarSessao(cifrarCarga("texto", SEGREDO), SEGREDO, opcoes)).toBeNull();
    // A mesma carga intacta continua valendo.
    expect(verificarSessao(cifrarCarga(base, SEGREDO), SEGREDO, opcoes)).toEqual(sessao());
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
