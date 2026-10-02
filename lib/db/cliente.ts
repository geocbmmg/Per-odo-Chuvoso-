import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type BancoDados = ReturnType<typeof criar>;

function criar(url: string) {
  return drizzle({ client: neon(url), schema });
}

let instancia: BancoDados | null = null;

/**
 * Cliente Drizzle sob demanda. Retorna null quando DATABASE_URL não está
 * definido — na Fase 0 a aplicação funciona sem banco.
 */
export function obterBanco(): BancoDados | null {
  const url = env().DATABASE_URL;
  if (!url) return null;
  instancia ??= criar(url);
  return instancia;
}
