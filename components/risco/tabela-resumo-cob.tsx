"use client";

import { MapPin } from "lucide-react";

import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CORES_NIVEL } from "@/lib/dominio/matrizes";
import type { ResumoCobTabela } from "@/lib/mapa/risco";

import { AmostraNivel, SeloNivel } from "./selo-nivel";

/**
 * "Resumo por COB" como tabela (alternativa textual ao mapa): pior nível e
 * quantos municípios em cada nível da camada. O botão no nome do COB
 * enquadra o mapa no COB e abre o balão dele.
 */
export function TabelaResumoCob({
  resumo,
  legenda,
  idTitulo,
  onVerNoMapa,
}: {
  resumo: ResumoCobTabela;
  /** Legenda da tabela (camada e janela). */
  legenda: string;
  idTitulo: string;
  onVerNoMapa: ((cob: string, origem: HTMLElement) => void) | null;
}) {
  return (
    <Table aria-labelledby={idTitulo} className="min-w-[640px]">
      <TableCaption className="text-left">{legenda}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">COB</TableHead>
          <TableHead scope="col">Pior nível</TableHead>
          {resumo.niveis.map((nivel) => (
            <TableHead key={nivel} scope="col" className="text-right">
              <span className="inline-flex items-center gap-1.5">
                <AmostraNivel nivel={nivel} className="size-2.5 rounded-[2px]" />
                {CORES_NIVEL[nivel].nome}
              </span>
            </TableHead>
          ))}
          <TableHead scope="col" className="text-right">
            <span className="inline-flex items-center gap-1.5">
              <AmostraNivel nivel={null} className="size-2.5 rounded-[2px]" />
              {resumo.semDado}
            </span>
          </TableHead>
          <TableHead scope="col" className="text-right">
            Total
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {resumo.linhas.map((linha) => (
          <TableRow key={linha.cob}>
            <TableCell className="whitespace-nowrap">
              {onVerNoMapa ? (
                <button
                  type="button"
                  onClick={(e) => onVerNoMapa(linha.cob, e.currentTarget)}
                  className="relative alvo-toque inline-flex items-center gap-1.5 rounded-[6px] font-bold text-ink underline-offset-4 hover:text-acc-txt hover:underline"
                  aria-label={`${linha.cob}: ver no mapa`}
                >
                  <MapPin aria-hidden="true" className="size-3.5 text-acc-txt" />
                  {linha.cob}
                </button>
              ) : (
                <span className="font-bold text-ink">{linha.cob}</span>
              )}
            </TableCell>
            <TableCell>
              <SeloNivel nivel={linha.nivel} texto={linha.rotuloNivel} />
            </TableCell>
            {linha.quantidades.map((n, i) => (
              <TableCell key={resumo.niveis[i]} className="text-right tabular-nums">
                {n > 0 ? <span className="font-bold text-ink">{n}</span> : <span className="text-faint">0</span>}
              </TableCell>
            ))}
            <TableCell className="text-right tabular-nums text-ink-2">{linha.semDado}</TableCell>
            <TableCell className="text-right font-semibold tabular-nums text-ink">{linha.total}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
