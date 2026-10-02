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
  CRON_SECRET: z.string().min(16).optional(),
  DADOS_EXEMPLO: z.enum(["0", "1"]).default("0"),
  FONTES_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
});

export type Env = z.infer<typeof esquema>;

let cache: Env | null = null;

function vazioParaIndefinido(fonte: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(fonte).map(([chave, valor]) => [chave, valor === "" ? undefined : valor]),
  );
}

export function env(): Env {
  if (!cache) {
    const resultado = esquema.safeParse(vazioParaIndefinido(process.env));
    if (!resultado.success) {
      const campos = resultado.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Variáveis de ambiente inválidas: ${campos}. Veja .env.example.`);
    }
    cache = resultado.data;
  }
  return cache;
}

/** DADOS_EXEMPLO=1: as fontes devolvem dados fictícios (desenvolvimento/demonstração). */
export function modoExemplo(): boolean {
  return env().DADOS_EXEMPLO === "1";
}
