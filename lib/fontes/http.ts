/**
 * fetch com timeout e mensagens de erro em português, usado por todos os
 * clientes de fontes externas. Sempre `cache: "no-store"`: o cache e o
 * fallback são responsabilidade de `obterLeitura` (lib/fontes/leituras.ts).
 *
 * GET por padrão. Com `corpo`, a requisição vira POST (ou o `metodo` informado):
 * usado quando a consulta não cabe numa URL (ex.: 853 coordenadas na Open-Meteo).
 */

export class ErroHttpFonte extends Error {
  constructor(
    mensagem: string,
    public readonly status?: number,
    /** Início do corpo da resposta de erro (até 1.000 caracteres), para o cliente extrair o motivo. */
    public readonly corpo?: string,
  ) {
    super(mensagem);
    this.name = "ErroHttpFonte";
  }
}

export interface OpcoesBusca {
  timeoutMs?: number;
  cabecalhos?: Record<string, string>;
  /** Padrão: "POST" quando há `corpo`; "GET" sem corpo. */
  metodo?: "GET" | "POST";
  /**
   * Corpo da requisição. URLSearchParams vai como formulário
   * (application/x-www-form-urlencoded; charset=UTF-8, definido pelo fetch).
   */
  corpo?: string | URLSearchParams;
  /** Content-Type do corpo em texto (ex.: "application/json"). */
  tipoConteudo?: string;
}

const USER_AGENT = "SalaSituacao-CBMMG/0.1 (+https://www.bombeiros.mg.gov.br)";

export async function buscar(url: string, opcoes: OpcoesBusca = {}): Promise<Response> {
  const timeoutMs = opcoes.timeoutMs ?? 15000;
  const metodo = opcoes.metodo ?? (opcoes.corpo !== undefined ? "POST" : "GET");
  const cabecalhos: Record<string, string> = { "User-Agent": USER_AGENT, ...opcoes.cabecalhos };
  if (opcoes.tipoConteudo) cabecalhos["Content-Type"] = opcoes.tipoConteudo;
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: metodo,
      cache: "no-store",
      headers: cabecalhos,
      ...(opcoes.corpo !== undefined ? { body: opcoes.corpo } : {}),
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
    const corpo = await resposta.text().then(
      (texto) => texto.slice(0, 1000),
      () => undefined,
    );
    throw new ErroHttpFonte(`HTTP ${resposta.status} ${resposta.statusText}`.trim(), resposta.status, corpo);
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
