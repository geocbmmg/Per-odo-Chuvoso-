import { useId } from "react";
import { CloudSun, Database, ExternalLink, Mountain, Waves, type LucideIcon } from "lucide-react";

import { IdadeRelativa } from "@/components/layout/idade-relativa";
import { CabecalhoBloco } from "@/components/monitoramento/cabecalho-bloco";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { StatusFonteDetalhado } from "@/lib/dados/status";
import { formatarData, formatarDataHora, formatarHora } from "@/lib/datas";
import type { DefinicaoFonte, EstadoFonte, GrupoFonte } from "@/lib/fontes/tipos";
import { cn } from "@/lib/utils";

import { DiagnosticoArcgis } from "./diagnostico-camada";
import { formatarDuracao, formatarLatencia } from "./formatos";
import { ORDEM_ESTADOS, PilulaEstado } from "./pilula-estado";

export const GRUPOS_FONTES: readonly { grupo: GrupoFonte; icone: LucideIcon; descricao: string }[] = [
  {
    grupo: "ArcGIS CBMMG",
    icone: Database,
    descricao: "Formulários Survey123 e camadas do portal de geoprocessamento do CBMMG.",
  },
  { grupo: "Meteorologia", icone: CloudSun, descricao: "Avisos oficiais, previsão de chuva e radar." },
  {
    grupo: "Risco geo-hidrológico",
    icone: Mountain,
    descricao: "Alertas de deslizamento e de inundação por município monitorado.",
  },
  { grupo: "Hidrologia", icone: Waves, descricao: "Nível e vazão de rios, observados e previstos." },
];

/** Faixa lateral do cartão (celular) na cor do estado — acompanha a pílula, nunca a substitui. */
const BORDA_ESTADO: Record<EstadoFonte, string> = {
  ok: "border-l-ok",
  atrasada: "border-l-alerta",
  "fora-do-ar": "border-l-perigo",
  "nao-implementada": "border-l-linha/30",
  exemplo: "border-l-info",
  desconhecida: "border-l-linha/30",
};

function textoTolerancia(d: DefinicaoFonte): string {
  return `Tolerância ${formatarDuracao(d.toleranciaSegundos)} · fora do ar após ${formatarDuracao(
    d.limiteForaDoArSegundos,
  )} · reconsulta a cada ${formatarDuracao(d.ttlSegundos)}`;
}

/** "às 14:35" (hoje) ou "02/10 às 14:35", mais a idade relativa. */
function Horario({ iso, agora, vazio }: { iso: string | null; agora: Date; vazio: string }) {
  if (!iso) return <span className="text-mut">{vazio}</span>;
  const outroDia = formatarData(iso) !== formatarData(agora);
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5" title={`${formatarDataHora(iso)} (horário de Brasília)`}>
      <span className="whitespace-nowrap">
        {outroDia ? `${formatarData(iso).slice(0, 5)} ` : ""}às{" "}
        <time dateTime={iso} className="font-semibold text-ink tabular-nums">
          {formatarHora(iso)}
        </time>
      </span>
      <IdadeRelativa iso={iso} className="whitespace-nowrap text-[11.5px] text-mut" />
    </span>
  );
}

function LinkReferencia({ fonte }: { fonte: DefinicaoFonte }) {
  return (
    <a
      href={fonte.referencia}
      target="_blank"
      rel="noopener noreferrer"
      className="relative alvo-toque inline-flex items-center gap-1 rounded-[6px] whitespace-nowrap text-[12.5px] font-semibold text-acc-txt underline-offset-4 hover:underline"
    >
      Referência
      <ExternalLink aria-hidden="true" className="size-3.5" />
      <span className="sr-only">{` de ${fonte.nome} (abre em nova aba)`}</span>
    </a>
  );
}

function UltimoErro({ erro }: { erro: string | null }) {
  if (!erro) return <span className="text-mut">—</span>;
  return <span className="break-words text-perigo-txt [overflow-wrap:anywhere]">{erro}</span>;
}

const CONTAGEM_ESTADO: Record<EstadoFonte, [singular: string, plural: string]> = {
  ok: ["ok", "ok"],
  atrasada: ["atrasada", "atrasadas"],
  "fora-do-ar": ["fora do ar", "fora do ar"],
  "nao-implementada": ["não implementada", "não implementadas"],
  exemplo: ["em exemplo", "em exemplo"],
  desconhecida: ["sem leitura", "sem leitura"],
};

function resumoDoGrupo(fontes: StatusFonteDetalhado[]): string {
  const partes = ORDEM_ESTADOS.map((estado) => {
    const n = fontes.filter((f) => f.estado === estado).length;
    return n > 0 ? `${n} ${CONTAGEM_ESTADO[estado][n === 1 ? 0 : 1]}` : null;
  }).filter(Boolean);
  return `${fontes.length} ${fontes.length === 1 ? "fonte" : "fontes"} · ${partes.join(" · ")}`;
}

/** Tabela (≥ 1024px) — uma linha por fonte, com o diagnóstico ArcGIS na própria célula da fonte. */
function TabelaFontes({ fontes, agora, grupo }: { fontes: StatusFonteDetalhado[]; agora: Date; grupo: string }) {
  return (
    <Table containerClassName="hidden lg:block" aria-label={`Fontes do grupo ${grupo}`}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[34%]">Fonte</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Atualizado</TableHead>
          <TableHead>Última tentativa</TableHead>
          <TableHead className="text-right">Latência</TableHead>
          <TableHead className="w-[22%]">Último erro</TableHead>
          <TableHead>
            <span className="sr-only">Referência</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fontes.map((f) => (
          <TableRow key={f.definicao.id} data-estado={f.estado} className="[&>td]:align-top">
            <TableCell className="min-w-[280px]">
              <p className="font-bold text-ink-forte">{f.definicao.nome}</p>
              <p className="mt-0.5 text-[12px] leading-snug text-mut">{f.definicao.descricao}</p>
              <p className="mt-1 text-[11px] leading-snug text-mut tabular-nums">{textoTolerancia(f.definicao)}</p>
              {f.diagnostico ? <DiagnosticoArcgis diagnostico={f.diagnostico} className="mt-2.5" /> : null}
            </TableCell>
            <TableCell>
              <PilulaEstado estado={f.estado} />
            </TableCell>
            <TableCell>
              <Horario iso={f.atualizadoEm} agora={agora} vazio="Sem leitura válida" />
            </TableCell>
            <TableCell>
              <Horario iso={f.ultimaTentativaEm} agora={agora} vazio="Nenhuma ainda" />
            </TableCell>
            <TableCell className="whitespace-nowrap text-right">{formatarLatencia(f.latenciaMs)}</TableCell>
            <TableCell className="max-w-[260px] whitespace-normal">
              <UltimoErro erro={f.ultimoErro} />
            </TableCell>
            <TableCell>
              <LinkReferencia fonte={f.definicao} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Cartões (< 1024px) — mesmos dados da tabela, um cartão por fonte. */
function CartoesFontes({ fontes, agora }: { fontes: StatusFonteDetalhado[]; agora: Date }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2 lg:hidden">
      {fontes.map((f) => (
        <li key={f.definicao.id} className="min-w-0">
          <Card
            data-estado={f.estado}
            className={cn("h-full gap-3 border-l-[3px]", BORDA_ESTADO[f.estado], f.estado === "nao-implementada" && "border-dashed")}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="min-w-0 flex-1 basis-40 text-[14px] font-bold leading-snug text-ink-forte">{f.definicao.nome}</h3>
              <PilulaEstado estado={f.estado} />
            </div>
            <p className="-mt-1 text-[12.5px] leading-snug text-mut">{f.definicao.descricao}</p>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[12.5px] leading-snug">
              <div className="min-w-0">
                <dt className="text-[10px] font-bold uppercase tracking-[.09em] text-mut">Atualizado</dt>
                <dd className="mt-0.5 text-ink-2">
                  <Horario iso={f.atualizadoEm} agora={agora} vazio="Sem leitura válida" />
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] font-bold uppercase tracking-[.09em] text-mut">Última tentativa</dt>
                <dd className="mt-0.5 text-ink-2">
                  <Horario iso={f.ultimaTentativaEm} agora={agora} vazio="Nenhuma ainda" />
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] font-bold uppercase tracking-[.09em] text-mut">Latência</dt>
                <dd className="mt-0.5 text-ink-2 tabular-nums">{formatarLatencia(f.latenciaMs)}</dd>
              </div>
              {f.ultimoErro ? (
                <div className="col-span-2 min-w-0">
                  <dt className="text-[10px] font-bold uppercase tracking-[.09em] text-mut">Último erro</dt>
                  <dd className="mt-0.5">
                    <UltimoErro erro={f.ultimoErro} />
                  </dd>
                </div>
              ) : null}
            </dl>

            <p className="text-[11px] leading-snug text-mut tabular-nums">{textoTolerancia(f.definicao)}</p>
            {f.diagnostico ? <DiagnosticoArcgis diagnostico={f.diagnostico} /> : null}
            <div className="mt-auto">
              <LinkReferencia fonte={f.definicao} />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/** Um grupo do catálogo (ArcGIS CBMMG / Meteorologia / Hidrologia): tabela no desktop, cartões no celular. */
export function GrupoFontes({
  grupo,
  icone,
  descricao,
  fontes,
  agora,
}: {
  grupo: GrupoFonte;
  icone: LucideIcon;
  descricao: string;
  fontes: StatusFonteDetalhado[];
  agora: Date;
}) {
  const idTitulo = useId();
  if (fontes.length === 0) return null;
  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-3">
      <CabecalhoBloco
        id={idTitulo}
        titulo={grupo}
        icone={icone}
        descricao={
          <>
            {descricao} <span className="tabular-nums">{resumoDoGrupo(fontes)}.</span>
          </>
        }
      />
      <TabelaFontes fontes={fontes} agora={agora} grupo={grupo} />
      <CartoesFontes fontes={fontes} agora={agora} />
    </section>
  );
}
