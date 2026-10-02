import { useId } from "react";
import { ShieldCheck, TriangleAlert } from "lucide-react";

import { CarimboAtualizacao } from "@/components/layout/carimbo-atualizacao";
import { AvisoUltimaValida } from "@/components/status/aviso-ultima-valida";
import { formatarDuracao } from "@/components/status/formatos";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { CATALOGO_FONTES } from "@/lib/fontes/catalogo";
import type { OrigemLeitura } from "@/lib/fontes/tipos";

import { CabecalhoBloco } from "./cabecalho-bloco";
import { ListaAvisos } from "./lista-avisos";
import type { AvisoVisao } from "./tipos";

export const TITULO_BLOCO_AVISOS = "Avisos do INMET para Minas Gerais";

/** Bloco "Avisos do INMET para Minas Gerais" com carimbo próprio e crédito da fonte. */
export function BlocoAvisos({
  avisos,
  atualizadoEm,
  origem,
  erro,
}: {
  avisos: AvisoVisao[];
  atualizadoEm: string;
  origem: OrigemLeitura;
  erro?: string;
}) {
  const idTitulo = useId();
  const fonte = CATALOGO_FONTES["inmet-avisos"];

  return (
    <section aria-labelledby={idTitulo}>
      <Card className="gap-4">
        <CabecalhoBloco
          id={idTitulo}
          titulo={TITULO_BLOCO_AVISOS}
          icone={TriangleAlert}
          descricao="Avisos oficiais vigentes e programados que atingem mesorregiões de MG, do mais grave ao menos grave."
          carimbo={
            <CarimboAtualizacao atualizadoEm={atualizadoEm} origem={origem} erro={erro} fonte="Avisos do INMET" />
          }
        />
        <CardContent className="flex flex-col gap-3">
          <AvisoUltimaValida origem={origem} atualizadoEm={atualizadoEm} erro={erro} />
          {avisos.length > 0 ? (
            <ListaAvisos avisos={avisos} />
          ) : (
            <div className="flex flex-wrap items-start gap-3 rounded-[12px] border border-dashed border-linha/20 bg-linha/3 px-4 py-5">
              <span
                aria-hidden="true"
                className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-ok/40 bg-ok/12 text-ok-txt"
              >
                <ShieldCheck className="size-5" />
              </span>
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-[14px] font-bold text-ink-forte">Nenhum aviso vigente ou programado para MG</p>
                <p className="mt-1 text-[12.5px] leading-snug text-mut">
                  O INMET não tem, neste momento, aviso meteorológico que atinja mesorregiões de Minas Gerais. A
                  lista é conferida a cada {formatarDuracao(fonte.ttlSegundos)}; avisos já vencidos não aparecem.
                </p>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="justify-between text-mut">
          <span>{fonte.credito}</span>
          <a
            href="https://avisos.inmet.gov.br/"
            target="_blank"
            rel="noopener noreferrer"
            className="relative alvo-toque rounded-[6px] font-semibold text-acc-txt underline-offset-4 hover:underline"
          >
            Painel de avisos do INMET<span className="sr-only"> (abre em nova aba)</span>
          </a>
        </CardFooter>
      </Card>
    </section>
  );
}
