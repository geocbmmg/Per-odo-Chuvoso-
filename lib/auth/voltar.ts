/**
 * Destino depois do login (`/entrar?voltar=…`), à prova de open redirect:
 * só caminhos RELATIVOS da própria Sala. Recusa (e devolve o padrão):
 * - URL absoluta ("https://…") e esquemas ("javascript:…");
 * - caminho de protocolo relativo ("//outro.site", "/\outro.site");
 * - caracteres de controle e barra invertida em qualquer posição (o navegador
 *   descarta TAB/quebra de linha e troca "\" por "/", o que reabriria o "//");
 * - a própria /entrar e as rotas /api/*.
 * PURO: usado na página (servidor) e no formulário (navegador).
 */
const BASE_FICTICIA = "http://sala.invalid";

export function caminhoDeVolta(valor: unknown, padrao = "/"): string {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  if (typeof bruto !== "string") return padrao;
  const v = bruto.trim();
  if (v.length === 0 || v.length > 512) return padrao;
  if (!v.startsWith("/") || v.startsWith("//")) return padrao;
  if (/[\p{Cc}\\]/u.test(v)) return padrao;
  let url: URL;
  try {
    url = new URL(v, BASE_FICTICIA);
  } catch {
    return padrao;
  }
  if (url.origin !== BASE_FICTICIA) return padrao;
  if (url.pathname === "/entrar" || url.pathname.startsWith("/entrar/") || url.pathname.startsWith("/api/")) {
    return padrao;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
