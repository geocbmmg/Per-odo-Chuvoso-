import "server-only";
import { CATALOGO_FONTES } from "@/lib/fontes/catalogo";
import { FonteIndisponivelError, type Leitura, type OrigemLeitura } from "@/lib/fontes/tipos";

/**
 * Respostas padronizadas dos Route Handlers.
 *
 * Cache-Control: o CDN da Vercel guarda a resposta por `s-maxage`; depois disso
 * pode servir a cópia velha por no máximo mais `s-maxage` enquanto revalida
 * (`stale-while-revalidate` curto, para o mapa não mostrar pontos de horas atrás
 * ao lado de indicadores atuais) e por até um dia SÓ se a função falhar
 * (`stale-if-error`). Leituras de "última válida" ficam pouco tempo no CDN para a
 * recuperação da fonte aparecer logo.
 */

export interface MetaLeitura {
  fonte: Leitura<unknown>["fonte"];
  atualizadoEm: string;
  origem: OrigemLeitura;
  erro?: string;
}

export function metaDaLeitura(leitura: Leitura<unknown>): MetaLeitura {
  const meta: MetaLeitura = {
    fonte: leitura.fonte,
    atualizadoEm: leitura.atualizadoEm,
    origem: leitura.origem,
  };
  if (leitura.erro) meta.erro = leitura.erro;
  return meta;
}

export function cabecalhoCache(sMaxAgeSegundos: number, origem: OrigemLeitura): string {
  if (origem === "exemplo") return "no-store";
  const sMaxAge = origem === "ultima-valida" ? Math.min(30, sMaxAgeSegundos) : sMaxAgeSegundos;
  return `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge}, stale-if-error=86400`;
}

export function respostaJson(corpo: unknown, opcoes: { sMaxAge: number; origem: OrigemLeitura }): Response {
  return Response.json(corpo, {
    headers: { "Cache-Control": cabecalhoCache(opcoes.sMaxAge, opcoes.origem) },
  });
}

/** 503 quando não há nenhuma leitura válida; 500 para erros inesperados (sem detalhes internos). */
export function respostaErro(erro: unknown): Response {
  if (erro instanceof FonteIndisponivelError) {
    return Response.json(
      {
        erro: `${CATALOGO_FONTES[erro.fonte].nome} indisponível no momento e sem leitura anterior.`,
        detalhe: erro.message,
        fonte: erro.fonte,
      },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
    );
  }
  console.error("[api] erro inesperado", erro);
  return Response.json(
    { erro: "Erro interno ao montar a resposta." },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

const PESO_ORIGEM: Record<OrigemLeitura, number> = {
  "ao-vivo": 0,
  cache: 1,
  "ultima-valida": 2,
  exemplo: 3,
};

/**
 * Carimbo combinado de várias leituras: vale a leitura MAIS ANTIGA e a pior
 * origem — um painel é tão atual quanto a sua fonte mais atrasada.
 */
export function combinarMetas(metas: MetaLeitura[]): Pick<MetaLeitura, "atualizadoEm" | "origem"> & {
  erro?: string;
} {
  const atualizadoEm = metas
    .map((m) => m.atualizadoEm)
    .sort()[0] ?? new Date().toISOString();
  const origem = metas.reduce<OrigemLeitura>(
    (pior, m) => (PESO_ORIGEM[m.origem] > PESO_ORIGEM[pior] ? m.origem : pior),
    "ao-vivo",
  );
  const erros = metas.filter((m) => m.erro).map((m) => `${CATALOGO_FONTES[m.fonte].nome}: ${m.erro}`);
  return erros.length ? { atualizadoEm, origem, erro: erros.join(" · ") } : { atualizadoEm, origem };
}
