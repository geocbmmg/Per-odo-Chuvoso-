import type { Problema } from "@/lib/alertas/dominio";
import type { AlertaFila, RespostaFila } from "@/lib/alertas/servico";

/**
 * Cliente de /api/alertas (contrato do módulo INSARAG do GeoRescue,
 * docs/fase-1.md §4.5) para a tela da fila. Sem React. O navegador só fala
 * com a rota da própria Sala (mesma origem, cookie de sessão HttpOnly);
 * nenhum segredo passa por aqui.
 */

export const URL_API_ALERTAS = "/api/alertas";

/** Releitura da fila com a aba visível (dado do usuário: sem cache no servidor). */
export const INTERVALO_FILA_MS = 60_000;

/** Erro do contrato: `{ok: false, erro, motivo[, campos, alteradoEmAtual]}` + status HTTP. */
export class ErroApiAlertas extends Error {
  constructor(
    public readonly status: number,
    public readonly motivo: string,
    mensagem: string,
    public readonly campos: Problema[] = [],
    public readonly alteradoEmAtual: string | null = null,
  ) {
    super(mensagem);
    this.name = "ErroApiAlertas";
  }
}

/** Sessão ausente ou expirada (a tela troca a fila pelo cartão "Entre com seu usuário"). */
export function ehSemSessao(erro: unknown): boolean {
  return erro instanceof ErroApiAlertas && erro.status === 401;
}

/** Outra pessoa alterou o alerta depois que a tela o leu (409 de concorrência). */
export function ehConflito(erro: unknown): boolean {
  return erro instanceof ErroApiAlertas && erro.status === 409 && erro.motivo === "conflito";
}

export const MENSAGEM_CONFLITO = "Alguém alterou este alerta depois que você o abriu — recarregue para ver a versão atual. O que você digitou foi mantido.";

/** Mensagem de status sem corpo legível (proxy, queda de rede, 500). */
function mensagemPadrao(status: number): string {
  if (status === 401) return "Sua sessão terminou. Entre de novo com o seu usuário do GeoRescue.";
  if (status === 403) return "O seu perfil não permite esta operação.";
  if (status === 404) return "Alerta não encontrado no seu escopo.";
  if (status === 409) return MENSAGEM_CONFLITO;
  if (status >= 500) return "O servidor da Sala não conseguiu atender agora. Tente de novo em instantes.";
  return "Pedido recusado pelo servidor.";
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Corpo de erro do contrato → ErroApiAlertas (corpo estranho vira mensagem padrão do status). */
export function interpretarErro(status: number, corpo: unknown): ErroApiAlertas {
  if (!ehObjeto(corpo)) return new ErroApiAlertas(status, status === 409 ? "conflito" : "desconhecido", mensagemPadrao(status));
  const motivo = typeof corpo.motivo === "string" ? corpo.motivo : "desconhecido";
  const campos = Array.isArray(corpo.campos)
    ? corpo.campos.filter(
        (c): c is Problema => ehObjeto(c) && typeof c.campo === "string" && typeof c.mensagem === "string",
      )
    : [];
  const mensagem =
    status === 409 && motivo === "conflito"
      ? MENSAGEM_CONFLITO
      : typeof corpo.erro === "string" && corpo.erro.trim()
        ? corpo.erro
        : mensagemPadrao(status);
  const versao = typeof corpo.alteradoEmAtual === "string" ? corpo.alteradoEmAtual : null;
  return new ErroApiAlertas(status, motivo, mensagem, campos, versao);
}

/** Resposta de GET /api/alertas, conferida no formato (o resto confia no contrato tipado). */
export function interpretarFila(corpo: unknown): RespostaFila {
  if (!ehObjeto(corpo) || corpo.ok !== true || !Array.isArray(corpo.alertas) || !ehObjeto(corpo.capacidades) || !ehObjeto(corpo.perfil)) {
    throw new ErroApiAlertas(502, "formato", "Resposta inesperada da fila de alertas.");
  }
  return corpo as unknown as RespostaFila;
}

async function lerJson(resposta: Response): Promise<unknown> {
  try {
    return await resposta.json();
  } catch {
    return null;
  }
}

export interface ConsultaFilaCliente {
  /** Um alerta só, com o histórico. */
  id?: string;
  signal?: AbortSignal;
}

/** GET /api/alertas?so=fila (toda a fila do escopo; abas e filtros são da tela). */
export async function carregarFila({ id, signal }: ConsultaFilaCliente = {}): Promise<RespostaFila> {
  const busca = new URLSearchParams({ so: "fila" });
  if (id) busca.set("id", id);
  let resposta: Response;
  try {
    resposta = await fetch(`${URL_API_ALERTAS}?${busca}`, { cache: "no-store", credentials: "same-origin", signal });
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === "AbortError") throw erro;
    throw new ErroApiAlertas(0, "rede", "Sem conexão com o servidor da Sala. Verifique a rede e tente de novo.");
  }
  const corpo = await lerJson(resposta);
  if (!resposta.ok) throw interpretarErro(resposta.status, corpo);
  return interpretarFila(corpo);
}

/** Resposta de sucesso de POST /api/alertas. */
export interface RespostaAcao {
  ok: true;
  id: string;
  alerta: AlertaFila | null;
  avisos: string[];
  acaoId?: string;
}

/** POST /api/alertas com `{acao, ...}`. Lança ErroApiAlertas no contrato de erro. */
export async function enviarAcao(corpo: Record<string, unknown>): Promise<RespostaAcao> {
  let resposta: Response;
  try {
    resposta = await fetch(URL_API_ALERTAS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify(corpo),
    });
  } catch {
    throw new ErroApiAlertas(0, "rede", "Sem conexão com o servidor da Sala. Nada foi gravado; tente de novo.");
  }
  const dados = await lerJson(resposta);
  if (!resposta.ok || !ehObjeto(dados) || dados.ok !== true) throw interpretarErro(resposta.status, dados);
  return {
    ok: true,
    id: String(dados.id ?? ""),
    alerta: (dados.alerta as AlertaFila | null) ?? null,
    avisos: Array.isArray(dados.avisos) ? dados.avisos.filter((a): a is string => typeof a === "string") : [],
    ...(typeof dados.acaoId === "string" ? { acaoId: dados.acaoId } : {}),
  };
}
