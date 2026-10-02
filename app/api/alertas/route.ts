import { CODIGOS_SITUACAO, TIPOS_RISCO_SALA, type TipoRiscoSala } from "@/lib/alertas/codigos";
import { PADRAO_ALERTA_ID } from "@/lib/alertas/dominio";
import { ErroAlertas } from "@/lib/alertas/erros";
import { CABECALHOS_SEM_CACHE, MAXIMO_CORPO_BYTES, origemPermitida, respostaDeErro } from "@/lib/alertas/http";
import { executar, FILTROS_DERIVADOS, listarFila, type ConsultaFila, type FiltroSituacao } from "@/lib/alertas/servico";
import { obterSessao } from "@/lib/auth/sessao";
import { normalizarRotuloCob } from "@/lib/territorio";

/**
 * /api/alertas — fila e emissão de alertas da Sala (docs/fase-1.md §4.5), no
 * contrato do módulo INSARAG do GeoRescue:
 *
 * GET  ?so=fila|contagem [&situacao=EMITIDO,PENDENTE,VENCIDO…] [&cob=1º COB] [&tipo=GEOLOGICO] [&id=AL-…]
 *      → {ok, perfil, capacidades, alertas, resumo, truncado}
 * POST {acao: "salvar"|"emitir"|"ciencia"|"registrar_acao"|"encerrar"|"cancelar"|"apagar", ...}
 *      → {ok, id, alerta, avisos[, acaoId]}
 * Erros → {ok: false, erro, motivo[, campos]} com 400, 401, 403, 404, 409, 502 ou 503.
 *
 * Sempre `Cache-Control: no-store` (dado recortado por usuário). O POST só
 * vale com Origin da própria aplicação (CSRF). Toda regra fica no serviço
 * (lib/alertas/servico.ts); aqui só HTTP.
 */
export const dynamic = "force-dynamic";

function lerConsulta(url: URL): ConsultaFila {
  const p = url.searchParams;
  const problemas: { campo: string; mensagem: string }[] = [];

  const so = p.get("so") ?? "fila";
  if (so !== "fila" && so !== "contagem") problemas.push({ campo: "so", mensagem: "Use so=fila ou so=contagem." });

  const situacoes: FiltroSituacao[] = [];
  for (const s of (p.get("situacao") ?? "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean)) {
    if ((CODIGOS_SITUACAO as readonly string[]).includes(s) || (FILTROS_DERIVADOS as readonly string[]).includes(s)) {
      situacoes.push(s as FiltroSituacao);
    } else {
      problemas.push({ campo: "situacao", mensagem: `Situação desconhecida: ${s.slice(0, 30)}.` });
    }
  }

  const cobBruto = p.get("cob");
  const cob = cobBruto ? normalizarRotuloCob(cobBruto) : null;
  if (cobBruto && !cob) problemas.push({ campo: "cob", mensagem: "COB desconhecido." });

  const tipoBruto = p.get("tipo")?.toUpperCase() ?? null;
  const tipo = TIPOS_RISCO_SALA.find((t) => t.codigo === tipoBruto)?.codigo ?? null;
  if (tipoBruto && !tipo) problemas.push({ campo: "tipo", mensagem: "Tipo de risco desconhecido." });

  const id = p.get("id");
  if (id && !PADRAO_ALERTA_ID.test(id)) problemas.push({ campo: "id", mensagem: "Código de alerta inválido." });

  if (problemas.length) throw new ErroAlertas(400, "entrada_invalida", "Parâmetros da consulta inválidos.", problemas);
  return { so: so as "fila" | "contagem", situacoes, cob, tipo: tipo as TipoRiscoSala | null, id: id || null };
}

export async function GET(request: Request) {
  try {
    const consulta = lerConsulta(new URL(request.url));
    const fila = await listarFila(await obterSessao(), consulta);
    return Response.json({ ok: true, ...fila }, { headers: CABECALHOS_SEM_CACHE });
  } catch (erro) {
    return respostaDeErro(erro);
  }
}

export async function POST(request: Request) {
  try {
    if (!origemPermitida(request)) {
      throw new ErroAlertas(403, "origem", "Origem da requisição não permitida.");
    }
    // Sessão antes de olhar o corpo: quem não entrou não recebe detalhe de validação.
    const sessao = await obterSessao();
    if (!sessao) throw new ErroAlertas(401, "sessao", "Entre com o seu usuário do GeoRescue para emitir ou atualizar alertas.");

    if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
      throw new ErroAlertas(400, "formato", "Envie o pedido como JSON (Content-Type: application/json).");
    }
    const texto = await request.text();
    if (new TextEncoder().encode(texto).length > MAXIMO_CORPO_BYTES) {
      throw new ErroAlertas(400, "corpo_grande", "Pedido grande demais.");
    }
    let corpo: unknown;
    try {
      corpo = JSON.parse(texto);
    } catch {
      throw new ErroAlertas(400, "formato", "JSON inválido.");
    }
    if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
      throw new ErroAlertas(400, "formato", "O pedido deve ser um objeto JSON com o campo acao.");
    }
    const { acao, ...dados } = corpo as Record<string, unknown>;
    const resultado = await executar(acao, dados, sessao);
    return Response.json(
      {
        ok: true,
        id: resultado.id,
        alerta: resultado.alerta,
        avisos: resultado.avisos,
        ...(resultado.acaoId ? { acaoId: resultado.acaoId } : {}),
      },
      { headers: CABECALHOS_SEM_CACHE },
    );
  } catch (erro) {
    return respostaDeErro(erro);
  }
}
