/**
 * Origem das requisições que escrevem (POST): usada por /api/alertas e
 * /api/auth. Sem dependência de domínio, para servir a qualquer rota.
 */

/**
 * Proteção contra CSRF: o POST só é aceito se o cabeçalho Origin for o host
 * da própria aplicação (o navegador sempre manda Origin num POST; sem ele, ou
 * com "null", recusa). Compara com o Host da requisição, o host da URL e o
 * X-Forwarded-Host do proxy da Vercel. Um navegador não consegue forjar esses
 * cabeçalhos numa chamada de outro site sem passar por um preflight de CORS,
 * que esta rota não autoriza. Sec-Fetch-Site "cross-site" também recusa.
 */
export function origemPermitida(request: Request): boolean {
  const origem = request.headers.get("origin");
  if (!origem || origem === "null") return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  let hostDaOrigem: string;
  try {
    hostDaOrigem = new URL(origem).host;
  } catch {
    return false;
  }
  const hosts = new Set<string>();
  try {
    hosts.add(new URL(request.url).host);
  } catch {
    // URL relativa: fica só com os cabeçalhos.
  }
  const host = request.headers.get("host");
  if (host) hosts.add(host);
  const encaminhado = request.headers.get("x-forwarded-host");
  if (encaminhado) hosts.add(encaminhado.split(",")[0].trim());
  return hosts.has(hostDaOrigem);
}
