/**
 * fetch com timeout e mensagens de erro em português, usado por todos os
 * clientes de fontes externas. Sempre `cache: "no-store"`: o cache e o
 * fallback são responsabilidade de `obterLeitura` (lib/fontes/leituras.ts).
 */

export class ErroHttpFonte extends Error {
  constructor(
    mensagem: string,
    public readonly status?: number,
  ) {
    super(mensagem);
    this.name = "ErroHttpFonte";
  }
}

export interface OpcoesBusca {
  timeoutMs?: number;
  cabecalhos?: Record<string, string>;
}

const USER_AGENT = "SalaSituacao-CBMMG/0.1 (+https://www.bombeiros.mg.gov.br)";

export async function buscar(url: string, opcoes: OpcoesBusca = {}): Promise<Response> {
  const timeoutMs = opcoes.timeoutMs ?? 15000;
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": USER_AGENT, ...opcoes.cabecalhos },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (erro) {
    if (erro instanceof DOMException && (erro.name === "TimeoutError" || erro.name === "AbortError")) {
      throw new ErroHttpFonte(`Tempo esgotado após ${Math.round(timeoutMs / 1000)} s`);
    }
    const causa = erro instanceof Error ? (erro.cause instanceof Error ? erro.cause.message : erro.message) : String(erro);
    throw new ErroHttpFonte(`Falha de rede: ${causa}`);
  }
  if (!resposta.ok) {
    throw new ErroHttpFonte(`HTTP ${resposta.status} ${resposta.statusText}`.trim(), resposta.status);
  }
  return resposta;
}

export async function buscarJson<T = unknown>(url: string, opcoes: OpcoesBusca = {}): Promise<T> {
  const resposta = await buscar(url, opcoes);
  try {
    return (await resposta.json()) as T;
  } catch {
    throw new ErroHttpFonte("Resposta não é JSON válido");
  }
}

export async function buscarTexto(url: string, opcoes: OpcoesBusca = {}): Promise<string> {
  const resposta = await buscar(url, opcoes);
  return resposta.text();
}
