import { ChevronRight, Lightbulb } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { DiagnosticoCamada } from "@/lib/dados/status";
import { cn } from "@/lib/utils";

import { formatarInteiro } from "./formatos";

/**
 * Diagnóstico de uma camada ArcGIS (bloco recolhível "Campos do formulário"):
 * camada do serviço efetivamente lida (e se a escolha automática divergiu do
 * índice configurado), atributo lógico → campo resolvido no formulário
 * Survey123, tabela de repetição, total de feições e quantas vieram sem
 * geometria. Abre sozinho quando algum campo não foi encontrado ou quando a
 * camada lida não é a configurada.
 */
export function DiagnosticoArcgis({ diagnostico, className }: { diagnostico: DiagnosticoCamada; className?: string }) {
  const repeticao = diagnostico.repeticao;
  const campos: [string, string | null][] = [
    ...Object.entries(diagnostico.campos),
    ...(repeticao ? Object.entries(repeticao.campos).map(([a, c]): [string, string | null] => [`ações › ${a}`, c]) : []),
  ];
  const faltando = campos.filter(([, campo]) => campo === null).length;
  const encontrados = campos.length - faltando;
  const origem = diagnostico.origem;
  const trocada = !!origem && origem.id !== origem.configurada;

  return (
    <details
      open={faltando > 0 || trocada}
      className={cn(
        "group rounded-[10px] border border-linha/12 bg-linha/3",
        (faltando > 0 || trocada) && "border-alerta/40",
        className,
      )}
    >
      <summary
        className={cn(
          "relative alvo-toque flex cursor-pointer select-none flex-wrap items-center gap-x-2 gap-y-1 rounded-[10px] px-3 py-2",
          "text-[12.5px] font-semibold text-ink-2 marker:content-none hover:text-ink-forte [&::-webkit-details-marker]:hidden",
        )}
      >
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-mut transition-transform group-open:rotate-90" />
        <span>Campos do formulário</span>
        <span className="font-normal text-mut tabular-nums">
          {encontrados} de {campos.length} {campos.length === 1 ? "encontrado" : "encontrados"}
        </span>
        {faltando > 0 ? (
          <Badge variant="alerta" marcador>
            {faltando === 1 ? "1 não encontrado" : `${faltando} não encontrados`}
          </Badge>
        ) : null}
        {trocada ? (
          <Badge variant="alerta" marcador>
            Camada {origem.id} em vez da {origem.configurada}
          </Badge>
        ) : null}
      </summary>

      <div className="flex flex-col gap-3 border-t border-linha/9 px-3 pb-3 pt-2.5">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px] leading-snug">
          <dt className="text-mut">Camada</dt>
          <dd className="min-w-0 break-words text-ink-2">{diagnostico.camada}</dd>
          <dt className="text-mut">Nome no servidor</dt>
          <dd className="min-w-0 break-words font-mono text-[12px] text-ink-2">
            {diagnostico.nomeNoServidor ?? <span className="font-sans text-mut">não informado</span>}
          </dd>
          {origem ? (
            <>
              <dt className="text-mut">Camada lida</dt>
              <dd className="min-w-0 break-words text-ink-2">
                <span className="font-mono text-[12px]">FeatureServer/{origem.id}</span>
                {" · "}
                {origem.tipo === "tabela" ? "tabela" : "camada"} com {origem.pontuacao} de {origem.total} campos-chave
                {trocada ? (
                  <span className="block text-alerta-txt">
                    Escolhida automaticamente: a camada {origem.configurada}, configurada, tem menos campos do formulário.
                  </span>
                ) : null}
              </dd>
            </>
          ) : null}
          {repeticao && origem?.repeticao ? (
            <>
              <dt className="text-mut">Ações (repetição)</dt>
              <dd className="min-w-0 break-words text-ink-2 tabular-nums">
                <span className="font-mono text-[12px]">FeatureServer/{origem.repeticao.id}</span>
                {" · "}
                {formatarInteiro(repeticao.totalRegistros)} registros, {formatarInteiro(repeticao.vinculados)} ligados a uma ação RRD
              </dd>
            </>
          ) : null}
          <dt className="text-mut">Feições</dt>
          <dd className="text-ink-2 tabular-nums">
            {formatarInteiro(diagnostico.totalFeicoes)}
            {" · "}
            <span className={cn(diagnostico.semGeometria > 0 && "font-semibold text-alerta-txt")}>
              {formatarInteiro(diagnostico.semGeometria)} sem geometria
            </span>
          </dd>
        </dl>

        {campos.length > 0 ? (
          <table className="w-full border-collapse text-[12.5px]">
            <caption className="sr-only">Atributo lógico e campo resolvido no formulário</caption>
            <thead>
              <tr className="border-b border-acc/34 text-left text-[10px] font-bold uppercase tracking-[.09em] text-faint">
                <th scope="col" className="py-1.5 pr-3 font-bold">
                  Atributo
                </th>
                <th scope="col" className="py-1.5 font-bold">
                  Campo no formulário
                </th>
              </tr>
            </thead>
            <tbody>
              {campos.map(([atributo, campo]) => (
                <tr key={atributo} className="border-b border-linha/5 last:border-b-0">
                  <th scope="row" className="py-1.5 pr-3 text-left align-top font-mono text-[12px] font-normal text-ink-2">
                    {atributo}
                  </th>
                  <td className="min-w-0 break-all py-1.5 align-top">
                    {campo === null ? (
                      <Badge variant="alerta" marcador>
                        Não encontrado
                      </Badge>
                    ) : (
                      <span className="font-mono text-[12px] text-ink">{campo}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {faltando > 0 ? (
          <p className="flex items-start gap-2 rounded-[9px] border border-alerta/30 bg-alerta/9 px-3 py-2 text-[12px] leading-snug text-ink-2">
            <Lightbulb aria-hidden="true" className="mt-px size-4 shrink-0 text-alerta-txt" />
            <span>
              <span className="font-bold text-alerta-txt">Dica: </span>
              ajuste os nomes candidatos em <code className="font-mono text-[11.5px] text-ink">lib/sources/arcgis/camadas.ts</code>{" "}
              para o campo usado no formulário. Sem ele, o dado correspondente fica vazio nos painéis.
            </span>
          </p>
        ) : null}
      </div>
    </details>
  );
}
