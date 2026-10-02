import { Info } from "lucide-react";

import { formatarNumero, formatoPercentual } from "@/components/graficos/medidas";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SEM_COB, type Indicadores } from "@/lib/dominio/tipos";
import { corDoCob } from "@/lib/mapa/cores-cob";
import { cn } from "@/lib/utils";

import { descreverPeriodo, REGRA_PENDENCIA } from "./formatos";

function percentual(pendentes: number, alertas: number): string {
  return alertas > 0 ? formatoPercentual.format(pendentes / alertas) : "—";
}

/**
 * "Resumo por COB" (.dash-tbl): COB | Alertas | Ações RRD | Pendentes | % pendentes.
 * A linha "Sem COB" (registros sem COB nos formulários) fica destacada no fim;
 * o rodapé traz o período e a regra de pendência.
 */
export function TabelaResumoCob({ indicadores }: { indicadores: Indicadores }) {
  const { porCob, periodo } = indicadores;
  return (
    <div className="min-w-0">
      <Table
        aria-labelledby="resumo-cob-titulo"
        aria-describedby="resumo-cob-rodape"
        containerClassName="rounded-b-none"
      >
        <TableHeader>
          <TableRow>
            <TableHead>COB</TableHead>
            <TableHead className="text-right">Alertas</TableHead>
            <TableHead className="text-right">Ações RRD</TableHead>
            <TableHead className="text-right">Pendentes</TableHead>
            <TableHead className="text-right">% pendentes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {porCob.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-mut">
                Nenhum alerta nem ação RRD no período
              </TableCell>
            </TableRow>
          ) : (
            porCob.map((linha) => {
              const semCob = linha.cob === SEM_COB;
              return (
                <TableRow
                  key={linha.cob}
                  className={cn(semCob && "border-t border-dashed border-linha/20 bg-linha/4 even:bg-linha/4")}
                >
                  <TableCell className="min-w-[150px]">
                    <span className="flex items-center gap-2 font-semibold text-ink">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "inline-block size-2.5 shrink-0 rounded-[3px]",
                          semCob && "border border-dashed border-linha/60 bg-transparent",
                        )}
                        style={semCob ? undefined : { backgroundColor: corDoCob(linha.cob, "escuro", "preenchimento") }}
                      />
                      {linha.cob}
                    </span>
                    {semCob ? (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] font-normal text-mut">
                        <Info aria-hidden="true" className="size-3 shrink-0" />
                        registros sem COB nos formulários
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">{formatarNumero(linha.alertas)}</TableCell>
                  <TableCell className="text-right">{formatarNumero(linha.acoesRrd)}</TableCell>
                  <TableCell className={cn("text-right", linha.pendentes > 0 && "font-semibold text-ink")}>
                    {formatarNumero(linha.pendentes)}
                  </TableCell>
                  <TableCell className="text-right">{percentual(linha.pendentes, linha.alertas)}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
        {porCob.length > 0 ? (
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell className="font-bold text-ink">Total</TableCell>
              <TableCell className="text-right font-bold text-ink">
                {formatarNumero(indicadores.totalAlertas)}
              </TableCell>
              <TableCell className="text-right font-bold text-ink">
                {formatarNumero(indicadores.totalAcoesRrd)}
              </TableCell>
              <TableCell className="text-right font-bold text-ink">
                {formatarNumero(indicadores.alertasPendentes)}
              </TableCell>
              <TableCell className="text-right font-bold text-ink">
                {percentual(indicadores.alertasPendentes, indicadores.totalAlertas)}
              </TableCell>
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
      {/* Rodapé .dash-foot fora da tabela: não rola junto com ela no celular. */}
      <p
        id="resumo-cob-rodape"
        className="rounded-b-[14px] border border-t-0 border-border bg-superficie px-3.5 py-2 text-[11px] leading-snug text-mut"
      >
        <span className="block">{descreverPeriodo(periodo)}.</span>
        <span className="block">{REGRA_PENDENCIA}</span>
      </p>
    </div>
  );
}
