"use client";

import { ChevronRight } from "lucide-react";

import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AlertaFila } from "@/lib/alertas/servico";
import { cn } from "@/lib/utils";

import { prazoRelativo, rotuloEvento, rotuloNivel, rotuloTipo, unidadeDoAlerta, validadeRelativa } from "./apresentacao";
import { MarcaNatureza, MarcaPrazo, MarcaValidade, SeloNivelAlerta, SeloSituacao } from "./marcas";

/**
 * A fila de alertas em dois desenhos com o MESMO conteúdo: cartões no
 * celular e tablet (< 1280px) e tabela densa .dash-tbl no desktop. Cada
 * alerta abre o detalhe por um botão de verdade (teclado e leitor de tela);
 * no desktop a linha inteira também é clicável com o mouse.
 */

export interface PropsFila {
  alertas: readonly AlertaFila[];
  agora: Date;
  /** Abre o detalhe; `origem` recebe o foco de volta quando o painel fecha. */
  onAbrir: (alertaId: string, origem: HTMLElement) => void;
  /** Alerta aberto no painel (linha marcada). */
  selecionado: string | null;
  /** Legenda da tabela (ex.: "3 alertas pendentes · vencidos primeiro"). */
  legenda: string;
}

function rotuloAcessivel(a: AlertaFila): string {
  const municipio = a.municipio ?? "município não informado";
  return `Abrir alerta ${a.alertaId}: ${rotuloNivel(a.nivelAlerta)}, ${rotuloTipo(a.tipoRisco)}, ${municipio}`;
}

export function FilaAlertas(props: PropsFila) {
  return (
    <>
      <CartoesFila {...props} />
      <TabelaFila {...props} />
    </>
  );
}

function CartoesFila({ alertas, agora, onAbrir, selecionado }: PropsFila) {
  return (
    <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:hidden" aria-label="Alertas">
      {alertas.map((a) => {
        const prazo = prazoRelativo(a, agora);
        const validade = validadeRelativa(a, agora);
        const unidade = unidadeDoAlerta(a);
        const evento = rotuloEvento(a.evento);
        return (
          <li key={a.alertaId} className="min-w-0">
            <button
              type="button"
              onClick={(e) => onAbrir(a.alertaId, e.currentTarget)}
              aria-label={rotuloAcessivel(a)}
              data-selecionado={selecionado === a.alertaId || undefined}
              className={cn(
                "relative flex w-full min-w-0 flex-col gap-2 rounded-[14px] border border-border bg-superficie p-3.5 text-left",
                "transition-[background-color,border-color] hover:border-acc/34 hover:bg-acc/6",
                "data-selecionado:border-acc/45 data-selecionado:bg-acc/10",
                prazo.estado === "vencido" && "border-l-[3px] border-l-perigo",
              )}
            >
              <span className="flex w-full flex-wrap items-center gap-1.5">
                <SeloNivelAlerta nivel={a.nivelAlerta} />
                <SeloSituacao situacao={a.situacao} />
                <MarcaNatureza natureza={a.natureza} />
                <ChevronRight aria-hidden="true" className="ml-auto size-4 text-mut" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-bold leading-tight text-ink-forte">
                  {a.municipio ?? "Município não informado"}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-2">
                  {rotuloTipo(a.tipoRisco)}
                  {evento ? ` · ${evento}` : ""}
                </span>
              </span>
              <span className="block text-[12px] leading-snug text-mut">
                {unidade.texto}
              </span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-mut">
                <span className="tabular-nums">
                  <span className="sr-only">Nº da chamada </span>
                  {a.numeroChamada ?? "sem nº de chamada"}
                </span>
                <span className="font-mono text-[11px]">{a.alertaId}</span>
              </span>
              <span className="flex w-full flex-wrap items-start justify-between gap-x-3 gap-y-1 border-t border-border pt-2 text-[12.5px]">
                <MarcaPrazo prazo={prazo} compacto />
                <MarcaValidade texto={validade.texto} expirada={validade.expirada} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function TabelaFila({ alertas, agora, onAbrir, selecionado, legenda }: PropsFila) {
  return (
    <Table containerClassName="max-xl:hidden" className="[&_td]:px-2.5 [&_th]:px-2.5">
      <TableCaption className="text-left">{legenda}</TableCaption>
      <TableHeader>
        <tr>
          <TableHead>Nível</TableHead>
          <TableHead>Alerta</TableHead>
          <TableHead>Município</TableHead>
          <TableHead>COB · UEOp · fração</TableHead>
          <TableHead>Nº chamada</TableHead>
          <TableHead>Situação</TableHead>
          <TableHead>Prazo da ação</TableHead>
          <TableHead>Validade</TableHead>
        </tr>
      </TableHeader>
      <TableBody>
        {alertas.map((a) => {
          const prazo = prazoRelativo(a, agora);
          const validade = validadeRelativa(a, agora);
          const unidade = unidadeDoAlerta(a);
          const evento = rotuloEvento(a.evento);
          return (
            <TableRow
              key={a.alertaId}
              data-state={selecionado === a.alertaId ? "selected" : undefined}
              className={cn("cursor-pointer", prazo.estado === "vencido" && "shadow-[inset_3px_0_0_var(--perigo)]")}
              onClick={(e) => {
                // A linha inteira abre o detalhe com o mouse; o teclado usa o botão da 2ª coluna.
                if ((e.target as HTMLElement).closest("button, a")) return;
                const botao = e.currentTarget.querySelector<HTMLButtonElement>("button[data-abrir]");
                if (botao) onAbrir(a.alertaId, botao);
              }}
            >
              <TableCell className="w-[1%] whitespace-nowrap">
                <SeloNivelAlerta nivel={a.nivelAlerta} />
              </TableCell>
              <TableCell className="min-w-[160px]">
                <button
                  type="button"
                  data-abrir
                  onClick={(e) => onAbrir(a.alertaId, e.currentTarget)}
                  aria-label={rotuloAcessivel(a)}
                  className="relative alvo-toque -mx-1 rounded-[6px] px-1 text-left font-bold text-ink-forte underline-offset-4 hover:text-acc-txt hover:underline"
                >
                  {rotuloTipo(a.tipoRisco)}
                </button>
                {evento ? <span className="block text-[11.5px] text-ink-2">{evento}</span> : null}
                <span className="block whitespace-nowrap font-mono text-[11px] text-mut">{a.alertaId}</span>
                <MarcaNatureza natureza={a.natureza} />
              </TableCell>
              <TableCell className="min-w-[104px] font-semibold text-ink">{a.municipio ?? "—"}</TableCell>
              <TableCell className="min-w-[148px] text-[12px]">
                <span className="block text-ink-2">{unidade.linha1}</span>
                {unidade.linha2 ? <span className="block text-mut">{unidade.linha2}</span> : null}
              </TableCell>
              <TableCell className="whitespace-nowrap">{a.numeroChamada ?? <span className="text-mut">—</span>}</TableCell>
              <TableCell className="whitespace-nowrap">
                <SeloSituacao situacao={a.situacao} />
              </TableCell>
              <TableCell className="whitespace-nowrap text-[12.5px]">
                <MarcaPrazo prazo={prazo} />
              </TableCell>
              <TableCell className="whitespace-nowrap text-[12.5px]">
                <MarcaValidade texto={validade.texto} expirada={validade.expirada} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
