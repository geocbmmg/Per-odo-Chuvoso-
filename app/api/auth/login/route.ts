import { configAuth, mensagemLoginIndisponivel } from "@/lib/auth/config";
import { perfilDemonstracaoValido, sessaoDemonstracao } from "@/lib/auth/demonstracao";
import { ErroAutenticacao } from "@/lib/auth/erros";
import { exigirMesmaOrigem, ipDaRequisicao, lerCorpoJson, respostaComSessao, respostaDeErroAuth } from "@/lib/auth/http";
import { entrarComGeoRescue, novoSid } from "@/lib/auth/servico";

/**
 * POST /api/auth/login — login federado no GeoRescue (docs/fase-1.md §3.2).
 *
 * Corpo: `{cpf, senha}` (ou `{usuario, senha}` para o administrador de
 * emergência do GeoRescue). No modo demonstração: `{perfilDemonstracao}`
 * ("operador-sala" | "unidade" | "leitura"), sem GeoRescue.
 *
 * → 200 `{ok: true, sessao: SessaoPublica}` + cookie `__Host-sala_sessao`.
 * → `{ok: false, erro, motivo}` com 400, 401, 403 (origem, conta, troca de
 *   senha, sem acesso), 429 (muitas tentativas), 502/504 (GeoRescue) ou 503
 *   (login desligado: falta GEORESCUE_BASE_URL ou SALA_SESSION_SECRET).
 *
 * Sempre `no-store`. Só aceita Origin da própria Sala (CSRF). O CPF e a senha
 * não são registrados em log nem devolvidos.
 */
export const dynamic = "force-dynamic";

function textoDoCampo(corpo: Record<string, unknown>, ...campos: string[]): string | null {
  for (const campo of campos) {
    const valor = corpo[campo];
    if (typeof valor === "string") return valor;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    exigirMesmaOrigem(request);
    const config = configAuth();
    if (config.modo === "indisponivel") {
      throw new ErroAutenticacao(503, "indisponivel", mensagemLoginIndisponivel(config.faltando));
    }
    const corpo = await lerCorpoJson(request);
    const agoraMs = Date.now();

    if (config.modo === "demonstracao") {
      const perfil = corpo.perfilDemonstracao;
      if (perfil === undefined) {
        throw new ErroAutenticacao(
          400,
          "entrada_invalida",
          "No modo de demonstração o login do GeoRescue fica desligado: escolha um perfil de demonstração.",
        );
      }
      if (!perfilDemonstracaoValido(perfil)) {
        throw new ErroAutenticacao(400, "entrada_invalida", "Perfil de demonstração desconhecido.");
      }
      const sessao = sessaoDemonstracao(perfil, {
        sid: novoSid(),
        chavePseudonimo: config.chavePseudonimo,
        grupoOperador: config.grupoOperador,
        agoraMs,
      });
      return respostaComSessao(sessao, config.segredoSessao, agoraMs);
    }

    if (corpo.perfilDemonstracao !== undefined) {
      throw new ErroAutenticacao(400, "entrada_invalida", "Perfis de demonstração só existem no modo de demonstração.");
    }
    const identificador = textoDoCampo(corpo, "cpf", "usuario");
    const senha = textoDoCampo(corpo, "senha");
    if (identificador === null || identificador.length > 80) {
      throw new ErroAutenticacao(400, "entrada_invalida", "Informe o CPF.");
    }
    if (senha === null || senha.length === 0 || senha.length > 256) {
      throw new ErroAutenticacao(400, "entrada_invalida", "Informe a senha.");
    }

    const sessao = await entrarComGeoRescue({ identificador, senha }, { config, ip: ipDaRequisicao(request), agoraMs });
    return respostaComSessao(sessao, config.segredoSessao, agoraMs);
  } catch (erro) {
    return respostaDeErroAuth(erro);
  }
}
