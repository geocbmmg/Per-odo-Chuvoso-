import { NextResponse } from "next/server";

import { configAuth } from "@/lib/auth/config";
import { apagarCookieSessao, CABECALHOS_SEM_CACHE, exigirMesmaOrigem, respostaDeErroAuth } from "@/lib/auth/http";

/**
 * POST /api/auth/logout — apaga o cookie de sessão da Sala → `{ok: true}`.
 *
 * Só POST com Origin da própria Sala (um GET deslogaria por <img> de outro
 * site). A sessão é sem estado: apagar o cookie encerra a sessão neste
 * navegador; um token copiado antes continua válido até o `exp` (no máximo
 * 8 h) — a revogação em massa é trocar o SALA_SESSION_SECRET.
 *
 * No modo demonstração grava a marca `sala_demo_saiu`, para o visitante deixar
 * de ser o Operador de demonstração implícito até escolher um perfil.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    exigirMesmaOrigem(request);
    const resposta = NextResponse.json({ ok: true }, { headers: CABECALHOS_SEM_CACHE });
    apagarCookieSessao(resposta, { marcarSaidaDemonstracao: configAuth().modo === "demonstracao" });
    return resposta;
  } catch (erro) {
    return respostaDeErroAuth(erro);
  }
}
