import "server-only";
import { and, eq } from "drizzle-orm";
import { obterBanco, type BancoDados } from "@/lib/db/cliente";
import { leiturasFontes } from "@/lib/db/schema";
import { env, modoExemplo } from "@/lib/env";
import {
  criarArmazemMemoria,
  definirArmazem,
  obterLeitura,
  type ArmazemLeituras,
  type LeituraGuardada,
  type OpcoesLeitura,
} from "./leituras";
import type { FonteId, Leitura } from "./tipos";

/**
 * Configuração do armazém de leituras no servidor.
 *
 * - padrão (ARMAZEM_LEITURAS=memoria): memória da instância;
 * - ARMAZEM_LEITURAS=postgres + DATABASE_URL: memória na frente e a tabela
 *   leituras_fontes atrás. A última leitura válida sobrevive a cold starts e é
 *   compartilhada entre instâncias. Requer `npm run db:push` uma vez.
 *
 * Falha do banco nunca derruba a leitura: o erro vai para o log e o fluxo
 * segue só com a memória.
 */

function separarChave(chaveCompleta: string): { fonte: string; chave: string } {
  const i = chaveCompleta.indexOf(":");
  return i < 0
    ? { fonte: chaveCompleta, chave: "" }
    : { fonte: chaveCompleta.slice(0, i), chave: chaveCompleta.slice(i + 1) };
}

export function criarArmazemPostgres(banco: BancoDados): ArmazemLeituras {
  return {
    async ler(chaveCompleta) {
      const { fonte, chave } = separarChave(chaveCompleta);
      const linhas = await banco
        .select()
        .from(leiturasFontes)
        .where(and(eq(leiturasFontes.fonte, fonte), eq(leiturasFontes.chave, chave)))
        .limit(1);
      const linha = linhas[0];
      return linha ? { dados: linha.dados, atualizadoEm: linha.atualizadoEm.toISOString() } : undefined;
    },
    async gravar(chaveCompleta, leitura) {
      const { fonte, chave } = separarChave(chaveCompleta);
      const valores = { fonte, chave, dados: leitura.dados, atualizadoEm: new Date(leitura.atualizadoEm) };
      await banco
        .insert(leiturasFontes)
        .values(valores)
        .onConflictDoUpdate({
          target: [leiturasFontes.fonte, leiturasFontes.chave],
          set: { dados: valores.dados, atualizadoEm: valores.atualizadoEm },
        });
    },
  };
}

/** Memória na frente, armazém persistente atrás; erros do persistente só vão para o log. */
export function criarArmazemEmCamadas(rapido: ArmazemLeituras, persistente: ArmazemLeituras): ArmazemLeituras {
  return {
    async ler(chave) {
      const local = await rapido.ler(chave);
      if (local) return local;
      try {
        const remoto: LeituraGuardada | undefined = await persistente.ler(chave);
        if (remoto) await rapido.gravar(chave, remoto);
        return remoto;
      } catch (erro) {
        console.error("[leituras] falha ao ler o armazém persistente", erro);
        return undefined;
      }
    },
    async gravar(chave, leitura) {
      await rapido.gravar(chave, leitura);
      try {
        await persistente.gravar(chave, leitura);
      } catch (erro) {
        console.error("[leituras] falha ao gravar no armazém persistente", erro);
      }
    },
  };
}

let configurado = false;

function configurarArmazem(): void {
  if (configurado) return;
  configurado = true;
  if (env().ARMAZEM_LEITURAS !== "postgres") return;
  const banco = obterBanco();
  if (!banco) {
    console.error("[leituras] ARMAZEM_LEITURAS=postgres sem DATABASE_URL; usando só a memória.");
    return;
  }
  definirArmazem(criarArmazemEmCamadas(criarArmazemMemoria(), criarArmazemPostgres(banco)));
}

/**
 * obterLeitura com o armazém do servidor configurado e o modo exemplo do
 * ambiente. Assíncrona de ponta a ponta: nenhum erro escapa de forma síncrona.
 */
export async function obterLeituraServidor<T>(
  fonte: FonteId,
  chave: string,
  carregar: () => Promise<T>,
  opcoes: Omit<OpcoesLeitura<T>, "modoExemplo"> = {},
): Promise<Leitura<T>> {
  configurarArmazem();
  return obterLeitura(fonte, chave, carregar, { ...opcoes, modoExemplo: modoExemplo() });
}
