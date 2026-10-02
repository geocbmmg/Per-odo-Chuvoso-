import { useId } from "react";
import { CloudRain } from "lucide-react";

import { CarimboAtualizacao } from "@/components/layout/carimbo-atualizacao";
import { AvisoUltimaValida } from "@/components/status/aviso-ultima-valida";
import { formatarMm } from "@/components/status/formatos";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarData, formatarDiaSemana } from "@/lib/datas";
import type { PrevisaoDia, PrevisaoLocal } from "@/lib/dominio/tipos";
import type { OrigemLeitura } from "@/lib/fontes/tipos";
import { cn } from "@/lib/utils";

import { CabecalhoBloco } from "./cabecalho-bloco";
import { GraficoChuva72h } from "./grafico-chuva-72h";
import { MarcaSeveridade } from "./marca-severidade";
import { classificarChuva24h, LIMIARES_CHUVA_24H } from "./severidade";
import type { LinhaChuvaCob } from "./tipos";

export const TITULO_BLOCO_PREVISAO = "Previsão de chuva por COB (Open-Meteo)";

/** Amostra de cor do COB (cor-dado) — só AO LADO do texto, nunca no lugar dele. */
const AMOSTRA_COB: Record<number, string> = {
  1: "bg-cob-1",
  2: "bg-cob-2",
  3: "bg-cob-3",
  4: "bg-cob-4",
  5: "bg-cob-5",
  6: "bg-cob-6",
};

/** "AAAA-MM-DD" (dia de Brasília) → instante no meio do dia, para formatar sem cair no dia anterior. */
function meioDia(data: string): string {
  return `${data}T12:00:00-03:00`;
}

function mm(valor: number | null): string {
  return valor === null ? "—" : `${formatarMm(valor)} mm`;
}

function CelulaDia({ dia }: { dia: PrevisaoDia | undefined }) {
  if (!dia || (dia.precipitacaoMm === null && dia.probabilidadeMax === null)) {
    return <span className="text-mut">—</span>;
  }
  return (
    <span className="flex flex-col leading-tight">
      <span className="whitespace-nowrap font-semibold text-ink">{mm(dia.precipitacaoMm)}</span>
      {dia.probabilidadeMax !== null ? (
        <span className="whitespace-nowrap text-[11.5px] text-mut">
          <span aria-hidden="true">prob. </span>
          <span className="sr-only">probabilidade máxima de </span>
          {dia.probabilidadeMax}%
        </span>
      ) : null}
    </span>
  );
}

function NotaLimiares() {
  return (
    <div className="rounded-[9px] border border-info/30 bg-info/8 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
      <p>
        <span className="font-bold text-info-txt">Destaque do acumulado em 24 h. </span>
        Aplica ao acumulado <em>previsto</em> os limiares diários do INMET para chuvas intensas. É uma leitura
        indicativa da previsão numérica, não um aviso oficial — os avisos oficiais estão no bloco acima.
      </p>
      <ul className="mt-2 grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 sm:flex sm:flex-wrap sm:gap-x-4">
        <li className="col-span-2 grid grid-cols-subgrid items-center sm:flex sm:gap-1.5">
          <MarcaSeveridade severidade="perigo-potencial" />
          <span className="tabular-nums">
            {LIMIARES_CHUVA_24H.perigoPotencial} a {LIMIARES_CHUVA_24H.perigo} mm
          </span>
        </li>
        <li className="col-span-2 grid grid-cols-subgrid items-center sm:flex sm:gap-1.5">
          <MarcaSeveridade severidade="perigo" />
          <span className="tabular-nums">
            {LIMIARES_CHUVA_24H.perigo} a {LIMIARES_CHUVA_24H.grandePerigo} mm
          </span>
        </li>
        <li className="col-span-2 grid grid-cols-subgrid items-center sm:flex sm:gap-1.5">
          <MarcaSeveridade severidade="grande-perigo" />
          <span className="tabular-nums">acima de {LIMIARES_CHUVA_24H.grandePerigo} mm</span>
        </li>
        <li className="col-span-2 text-mut sm:flex sm:items-center">
          <span className="tabular-nums">Abaixo de {LIMIARES_CHUVA_24H.perigoPotencial} mm: sem destaque</span>
        </li>
      </ul>
    </div>
  );
}

/** Bloco "Previsão de chuva por COB (Open-Meteo)": tabela + gráfico + nota + crédito. */
export function BlocoPrevisao({
  previsoes,
  atualizadoEm,
  origem,
  erro,
  agora = new Date(),
}: {
  previsoes: PrevisaoLocal[];
  atualizadoEm: string;
  origem: OrigemLeitura;
  erro?: string;
  agora?: Date;
}) {
  const idTitulo = useId();
  const hoje = formatarData(agora);
  const dias = Array.from(new Set(previsoes.flatMap((p) => p.diaria.map((d) => d.data)))).sort();

  const linhasGrafico: LinhaChuvaCob[] = previsoes.map((p) => ({
    cob: p.cob ?? p.local,
    municipio: p.municipio,
    rotulo: `${p.cob ?? p.local} · ${p.municipio}`,
    mm: p.acumulado72hMm,
  }));

  return (
    <section aria-labelledby={idTitulo}>
      <Card className="gap-4">
        <CabecalhoBloco
          id={idTitulo}
          titulo={TITULO_BLOCO_PREVISAO}
          icone={CloudRain}
          descricao="Precipitação prevista nas sedes dos seis COBs: acumulados a partir da hora atual e totais por dia."
          carimbo={
            <CarimboAtualizacao
              atualizadoEm={atualizadoEm}
              origem={origem}
              erro={erro}
              fonte="Previsão Open-Meteo"
            />
          }
        />

        <CardContent className="flex flex-col gap-4">
          <AvisoUltimaValida origem={origem} atualizadoEm={atualizadoEm} erro={erro} />

          {previsoes.length === 0 ? (
            <p className="rounded-[12px] border border-dashed border-linha/20 px-4 py-5 text-[13px] text-mut">
              A previsão não trouxe nenhum ponto. Tente atualizar em instantes.
            </p>
          ) : (
            <>
              <Table>
                <TableCaption className="sr-only">
                  Chuva prevista por COB, em milímetros: próximas 24 h, próximas 72 h e total de cada dia, com a
                  probabilidade máxima de chuva no dia.
                </TableCaption>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="left-0 z-[2]">COB</TableHead>
                    <TableHead className="max-sm:hidden">Sede</TableHead>
                    <TableHead>Próximas 24 h</TableHead>
                    <TableHead>Próximas 72 h</TableHead>
                    {dias.map((d) => {
                      const ehHoje = formatarData(meioDia(d)) === hoje;
                      return (
                        <TableHead key={d}>
                          <span className="tabular-nums">{formatarDiaSemana(meioDia(d))}</span>
                          {ehHoje ? <span className="ml-1 normal-case tracking-normal text-mut">(hoje)</span> : null}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previsoes.map((p) => {
                    const numero = Number.parseInt(p.cob ?? "", 10);
                    const nivel = classificarChuva24h(p.acumulado24hMm);
                    const porDia = new Map(p.diaria.map((d) => [d.data, d]));
                    return (
                      <TableRow key={p.local} className="group/linha">
                        <TableCell
                          className={cn(
                            "sticky left-0 z-[1] whitespace-nowrap bg-sup-1",
                            // Coluna fixa é opaca: repete por cima a zebra e o hover da linha.
                            "group-even/linha:bg-[image:linear-gradient(var(--zebra),var(--zebra))]",
                            "group-hover/linha:bg-[image:linear-gradient(rgba(var(--acc-rgb),.08),rgba(var(--acc-rgb),.08))]",
                          )}
                        >
                          <span className="inline-flex items-center gap-2 font-bold text-ink">
                            {AMOSTRA_COB[numero] ? (
                              <span
                                aria-hidden="true"
                                className={cn("inline-block size-2.5 rounded-[2px]", AMOSTRA_COB[numero])}
                              />
                            ) : null}
                            {p.cob ?? "—"}
                          </span>
                          {/* No celular a sede vem sob o COB, na coluna fixa, para sobrar espaço aos números. */}
                          <span className="block max-w-[118px] whitespace-normal pl-[18px] text-[11.5px] leading-tight text-mut sm:hidden">
                            {p.municipio}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap max-sm:hidden">{p.municipio}</TableCell>
                        <TableCell>
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="whitespace-nowrap font-semibold text-ink">{mm(p.acumulado24hMm)}</span>
                            {nivel ? <MarcaSeveridade severidade={nivel} prefixoSr="Destaque:" /> : null}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-semibold text-ink">
                          {mm(p.acumulado72hMm)}
                        </TableCell>
                        {dias.map((d) => (
                          <TableCell key={d}>
                            <CelulaDia dia={porDia.get(d)} />
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="-mt-2 text-[11.5px] leading-snug text-mut">
                <span className="sm:hidden">Deslize a tabela para o lado para ver os próximos dias. </span>
                Valores em milímetros. 24 h e 72 h contam a partir da hora atual; os dias vão de 0 h a 24 h
                (horário de Brasília), e o de hoje inclui horas já passadas. Prob. = probabilidade máxima de chuva no
                dia.
              </p>

              <NotaLimiares />

              <div className="rounded-[14px] border border-border bg-linha/2 p-4 max-sm:p-3">
                <GraficoChuva72h linhas={linhasGrafico} />
              </div>
            </>
          )}
        </CardContent>

        <CardFooter className="justify-between text-mut">
          <span>
            Previsão:{" "}
            <a
              href="https://open-meteo.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="relative alvo-toque rounded-[6px] font-semibold text-acc-txt underline-offset-4 hover:underline"
            >
              Open-Meteo.com<span className="sr-only"> (abre em nova aba)</span>
            </a>{" "}
            (
            <a
              href="https://creativecommons.org/licenses/by/4.0/deed.pt-br"
              target="_blank"
              rel="noopener noreferrer"
              className="relative alvo-toque rounded-[6px] underline underline-offset-4 hover:text-ink-2"
            >
              CC BY 4.0<span className="sr-only"> — licença, abre em nova aba</span>
            </a>
            )
          </span>
          <span>Pontos: sedes municipais dos COBs (IBGE).</span>
        </CardFooter>
      </Card>
    </section>
  );
}
