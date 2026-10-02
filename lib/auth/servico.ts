import "server-only";
import { randomBytes } from "node:crypto";

import type { ConfigAuth } from "./config";
import { cpfValido, interpretarIdentificador } from "./cpf";
import { contaComoTentativaErrada, ErroAutenticacao } from "./erros";
import { entrarNoGeoRescue } from "./georescue";
import { chaveDaConta, LIMITE_POR_CONTA, LIMITE_POR_IP, LimiteTentativas } from "./limite";
import { acessoNaSala } from "./papeis";
import { identificadorDaConta, pseudonimoUsuario } from "./pseudonimo";
import { DURACAO_MAXIMA_SESSAO_S } from "./token";
import type { Sessao } from "./tipos";

/**
 * Login real: valida o que foi digitado, aplica o limite de tentativas, chama
 * o GeoRescue, aplica a tabela de papéis e monta a Sessao da Sala (sem CPF).
 * Sem HTTP aqui: a rota /api/auth/login cuida de Origin, corpo e cookie.
 */

const limiteIp = new LimiteTentativas(LIMITE_POR_IP.maximo, LIMITE_POR_IP.janelaMs);
const limiteConta = new LimiteTentativas(LIMITE_POR_CONTA.maximo, LIMITE_POR_CONTA.janelaMs);

/** Só para testes. */
export function reiniciarLimitesLogin(): void {
  limiteIp.limpar();
  limiteConta.limpar();
}

/** Identificador aleatório da sessão (128 bits). */
export function novoSid(): string {
  return randomBytes(16).toString("base64url");
}

/** Sessão mínima da Sala: 60 s (um `exp` do GeoRescue já no fim não vira sessão inútil). */
const SESSAO_MINIMA_MS = 60_000;

export interface ContextoLogin {
  config: Extract<ConfigAuth, { modo: "real" }>;
  /** IP do cliente (para o limite de tentativas). */
  ip: string;
  agoraMs?: number;
  /** Injeção para testes. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Entra pelo GeoRescue. Devolve a Sessao pronta para assinar ou lança
 * ErroAutenticacao (400, 401, 403, 429, 502, 503, 504).
 */
export async function entrarComGeoRescue(
  entrada: { identificador: string; senha: string },
  ctx: ContextoLogin,
): Promise<Sessao> {
  const identificador = interpretarIdentificador(entrada.identificador);
  if (!identificador) {
    throw new ErroAutenticacao(400, "entrada_invalida", "Informe o CPF com 11 dígitos.");
  }
  if (identificador.tipo === "cpf" && !cpfValido(identificador.valor)) {
    throw new ErroAutenticacao(400, "entrada_invalida", "CPF inválido: confira os dígitos.");
  }
  if (!entrada.senha) throw new ErroAutenticacao(400, "entrada_invalida", "Informe a senha.");

  const agoraMs = ctx.agoraMs ?? Date.now();
  const chaveIp = `ip:${ctx.ip}`;
  const chaveConta = chaveDaConta(identificador.valor);
  const porIp = limiteIp.estado(chaveIp, agoraMs);
  const porConta = limiteConta.estado(chaveConta, agoraMs);
  if (!porIp.permitido || !porConta.permitido) {
    throw new ErroAutenticacao(
      429,
      "limite",
      "Muitas tentativas de entrar. Aguarde alguns minutos e tente de novo.",
      Math.max(porIp.tentarEmS, porConta.tentarEmS),
    );
  }
  // Reserva antes de chamar (pedidos em paralelo não furam o limite).
  limiteIp.registrar(chaveIp, agoraMs);
  limiteConta.registrar(chaveConta, agoraMs);

  try {
    const login = await entrarNoGeoRescue(
      { usuario: identificador.valor, senha: entrada.senha },
      { baseUrl: ctx.config.georescueUrl, fetch: ctx.fetch, timeoutMs: ctx.timeoutMs, agoraMs },
    );
    if (login.trocaSenha) {
      throw new ErroAutenticacao(
        403,
        "troca_senha",
        "Sua senha é temporária: troque a senha no GeoRescue e depois entre na Sala.",
      );
    }
    // Quem digitou um CPF tem de ser o dono da sessão devolvida.
    if (identificador.tipo === "cpf" && login.cpf !== null && login.cpf !== identificador.valor) {
      throw new ErroAutenticacao(502, "contrato", "O GeoRescue respondeu num formato inesperado. Tente de novo mais tarde.");
    }

    const acesso = acessoNaSala(
      {
        papel: login.papel,
        dominios: login.dominios,
        grupos: login.grupos,
        situacao: login.situacao,
        trocaSenha: login.trocaSenha,
        operacoesTotal: login.operacoesTotal,
      },
      { grupoOperador: ctx.config.grupoOperador },
    );
    if (!acesso.ok) throw new ErroAutenticacao(403, "negado", acesso.mensagem);

    const conta = login.cpf ? { cpf: login.cpf } : login.administrador ? { administrador: login.administrador } : null;
    if (!conta) throw new ErroAutenticacao(502, "contrato", "O GeoRescue respondeu num formato inesperado. Tente de novo mais tarde.");

    // No máximo 8 h e nunca além do fim da sessão do GeoRescue.
    // Em segundos inteiros, como o `exp` do cookie.
    const expiraEmMs = Math.floor(Math.min(agoraMs + DURACAO_MAXIMA_SESSAO_S * 1000, login.expiraEmMs) / 1000) * 1000;
    if (expiraEmMs - agoraMs < SESSAO_MINIMA_MS) {
      throw new ErroAutenticacao(502, "contrato", "A sessão do GeoRescue já está vencendo. Tente entrar de novo.");
    }

    // A senha conferiu: esta tentativa não conta no limite.
    limiteIp.devolver(chaveIp);
    limiteConta.devolver(chaveConta);

    // Tetos do esquema do cookie (lib/auth/token.ts): texto longo do GeoRescue é cortado, nunca derruba o login.
    return {
      sid: novoSid(),
      usuarioId: pseudonimoUsuario(identificadorDaConta(conta), ctx.config.chavePseudonimo),
      nome: login.nome.slice(0, 200),
      posto: login.posto?.slice(0, 60) ?? null,
      bm: login.bm?.slice(0, 30) ?? null,
      papel: acesso.papel,
      papelGeoRescue: login.papel.slice(0, 40),
      cobs: acesso.cobs,
      escopoGlobal: acesso.escopoGlobal,
      grupos: acesso.grupos.slice(0, 40).map((g) => g.slice(0, 60)),
      unidade: login.unidade?.slice(0, 200) ?? null,
      expiraEm: new Date(expiraEmMs).toISOString(),
      demonstracao: false,
    };
  } catch (erro) {
    // Só senha errada fica contada; falha do GeoRescue, conta recusada depois
    // da senha certa ou erro de contrato devolvem a vaga.
    if (!contaComoTentativaErrada(erro)) {
      limiteIp.devolver(chaveIp);
      limiteConta.devolver(chaveConta);
    }
    throw erro;
  }
}
