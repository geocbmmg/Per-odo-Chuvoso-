/**
 * Worker do MapLibre GL 6.
 *
 * A v6 é ESM e acha o worker por `import.meta.url` do próprio pacote, o que
 * não funciona depois do empacotamento do Next (Turbopack/webpack trocam o
 * `import.meta.url` por um caminho `file://`). Por isso a URL é definida aqui,
 * antes de criar o mapa:
 *
 * 1. Cópia local em /vendor/maplibre-gl/ (mesma origem, funciona offline),
 *    desde que seja da MESMA versão do pacote instalado — o worker conversa
 *    com a thread principal por um protocolo interno que muda entre versões.
 *    O worker importa "./maplibre-gl-shared.mjs", então os dois arquivos de
 *    node_modules/maplibre-gl/dist/ precisam estar lado a lado:
 *      public/vendor/maplibre-gl/maplibre-gl-worker.mjs
 *      public/vendor/maplibre-gl/maplibre-gl-shared.mjs
 * 2. Sem a cópia (ou com versão diferente), o mesmo arquivo da versão exata no
 *    CDN unpkg — o MapLibre carrega URLs de outra origem por um blob.
 */

export const CAMINHO_WORKER_LOCAL = "/vendor/maplibre-gl/maplibre-gl-worker.mjs";

export function urlWorkerCdn(versao: string): string {
  return `https://unpkg.com/maplibre-gl@${encodeURIComponent(versao)}/dist/maplibre-gl-worker.mjs`;
}

/** O cabeçalho de licença de cada arquivo da distribuição cita a versão. */
export function arquivoDaVersao(conteudo: string, versao: string): boolean {
  return conteudo.slice(0, 600).includes(`/blob/v${versao}/`);
}

type Buscar = (entrada: string, init?: RequestInit) => Promise<Response>;

export interface OpcoesWorker {
  buscar?: Buscar;
  /** Origem da página (para tornar o caminho local absoluto). */
  origem?: string;
}

/** Escolhe a URL do worker: local se existir e for da versão certa; senão, CDN. */
export async function resolverUrlWorker(versao: string, opcoes: OpcoesWorker = {}): Promise<string> {
  const buscar = opcoes.buscar ?? ((entrada, init) => fetch(entrada, init));
  const origem = opcoes.origem ?? (typeof location !== "undefined" ? location.origin : "");
  try {
    const resposta = await buscar(CAMINHO_WORKER_LOCAL, { cache: "force-cache" });
    if (resposta.ok && arquivoDaVersao(await resposta.text(), versao)) {
      return origem ? new URL(CAMINHO_WORKER_LOCAL, origem).href : CAMINHO_WORKER_LOCAL;
    }
  } catch {
    // Sem cópia local: segue para o CDN.
  }
  return urlWorkerCdn(versao);
}

export interface ApiWorkerMapLibre {
  getVersion(): string;
  getWorkerUrl(): string;
  setWorkerUrl(url: string): void;
}

let preparo: Promise<string> | null = null;

/**
 * Define a URL do worker uma única vez por página (o pool de workers do
 * MapLibre é global). Respeita uma URL que já tenha sido definida.
 */
export function prepararWorkerMapLibre(api: ApiWorkerMapLibre, opcoes: OpcoesWorker = {}): Promise<string> {
  if (!preparo) {
    preparo = (async () => {
      const atual = api.getWorkerUrl();
      if (atual) return atual;
      const url = await resolverUrlWorker(api.getVersion(), opcoes);
      api.setWorkerUrl(url);
      return url;
    })().catch((erro: unknown) => {
      preparo = null;
      throw erro;
    });
  }
  return preparo;
}

/** Só para testes: esquece a URL já resolvida. */
export function reiniciarPreparoWorker(): void {
  preparo = null;
}
