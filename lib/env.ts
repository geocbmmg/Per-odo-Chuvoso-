import "server-only";
import { z } from "zod";

/**
 * Variáveis de ambiente do servidor. Nada aqui chega ao navegador:
 * este módulo importa "server-only" e nenhuma variável usa o prefixo NEXT_PUBLIC_.
 * Documentação de cada variável: .env.example.
 */
const esquema = z.object({
  ARCGIS_SERVICES_URL: z
    .url()
    .default("https://geoprocessamento.bombeiros.mg.gov.br/server/rest/services/Hosted"),
  ARCGIS_PORTAL: z.url().optional(),
  ARCGIS_USER: z.string().min(1).optional(),
  ARCGIS_PASS: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  ANA_IDENTIFICADOR: z.string().min(1).optional(),
  ANA_TOKEN: z.string().min(1).optional(),
  // O comprimento mínimo (16) é exigido na rota /api/ingest, que recusa o cron;
  // aqui só o formato, para um segredo fraco não derrubar as outras rotas.
  CRON_SECRET: z.string().min(1).optional(),
  DADOS_EXEMPLO: z.enum(["0", "1"]).default("0"),
  FONTES_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  ARMAZEM_LEITURAS: z.enum(["memoria", "postgres"]).default("memoria"),
  // Fila de alertas da Sala (docs/fase-1.md §4.4). "arcgis" só lê: escrita desligada nesta fase.
  ALERTAS_ARMAZEM: z.enum(["memoria", "postgres", "arcgis"]).default("memoria"),
  // Segredo do pseudônimo de autoria (HMAC-SHA256). 32+ caracteres aleatórios.
  SALA_PSEUDO_SEGREDO: z.string().min(32).optional(),
  // Login federado (docs/fase-1.md §3). URL do GeoRescue (não é segredo); sem
  // ela, ou sem SALA_SESSION_SECRET, o login real fica desligado (503).
  GEORESCUE_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
  // Assina o cookie de sessão da Sala (HMAC-SHA256). 32+ caracteres; segredo
  // curto é descartado (login desligado: falha fechada, nunca sessão fraca).
  SALA_SESSION_SECRET: z.string().min(32).optional(),
  // Domínio de GRUPO do GeoRescue que faz o "Operador da Sala".
  SALA_GRUPO_OPERADOR: z.string().trim().min(1).max(60).default("SALA"),
});

export type Env = z.infer<typeof esquema>;

/** /api/ingest recusa o cron com CRON_SECRET abaixo disto (falha fechada só para o cron). */
export const TAMANHO_MINIMO_CRON_SECRET = 16;

let cache: Env | null = null;
let invalidas: string[] = [];

function vazioParaIndefinido(fonte: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(fonte).map(([chave, valor]) => [chave, valor === "" ? undefined : valor]),
  );
}

/**
 * Lê e valida as variáveis uma vez. Uma variável inválida NÃO derruba a
 * aplicação: ela é descartada (vale o padrão/ausência), o nome vai para o log
 * — nunca o valor — e fica listado em variaveisInvalidas() para /status.
 */
export function env(): Env {
  if (!cache) {
    const entrada = vazioParaIndefinido(process.env);
    let resultado = esquema.safeParse(entrada);
    if (!resultado.success) {
      invalidas = [...new Set(resultado.error.issues.map((i) => String(i.path[0])))];
      console.error(
        `[env] variáveis inválidas ignoradas: ${invalidas.join(", ")}. Veja .env.example.`,
      );
      const semInvalidas = { ...entrada };
      for (const nome of invalidas) delete semInvalidas[nome];
      resultado = esquema.safeParse(semInvalidas);
      if (!resultado.success) throw new Error("Falha inesperada ao validar variáveis de ambiente.");
    }
    cache = resultado.data;
  }
  return cache;
}

/** Nomes das variáveis de ambiente descartadas por formato inválido. */
export function variaveisInvalidas(): string[] {
  env();
  return invalidas;
}

/** Só para testes: força a releitura de process.env. */
export function reiniciarEnv(): void {
  cache = null;
  invalidas = [];
}

/** DADOS_EXEMPLO=1: as fontes devolvem dados fictícios (desenvolvimento/demonstração). */
export function modoExemplo(): boolean {
  return env().DADOS_EXEMPLO === "1";
}
