import { CABECALHOS_SEM_CACHE, respostaDeErroAuth } from "@/lib/auth/http";
import { obterSessaoDaRequisicao } from "@/lib/auth/sessao";
import { sessaoPublica, type RespostaSessao } from "@/lib/auth/tipos";

/**
 * GET /api/auth/sessao — sessão do navegador → `RespostaSessao`
 * (`{ok: true, sessao: SessaoPublica | null}`): nome, posto, papel, COBs,
 * capacidades e validade. Sem o sid e sem CPF. Sempre `no-store`.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const atual = obterSessaoDaRequisicao(request);
    const corpo: RespostaSessao = { ok: true, sessao: atual ? sessaoPublica(atual.sessao) : null };
    return Response.json(corpo, { headers: CABECALHOS_SEM_CACHE });
  } catch (erro) {
    return respostaDeErroAuth(erro);
  }
}
