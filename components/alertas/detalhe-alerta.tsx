"use client";

import {
  Ban,
  CheckCheck,
  CircleCheck,
  ClipboardPlus,
  Info,
  Pencil,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Capacidades } from "@/lib/auth/tipos";
import { CAP_CERTEZAS, CAP_RESPOSTAS, CAP_URGENCIAS, RESULTADOS_ACAO, TIPOS_ACAO, rotuloDe } from "@/lib/alertas/codigos";
import { aceitaCienciaOuAcao, podeApagar, podeEditar, transicao, type Destinatario, type EventoHistorico } from "@/lib/alertas/dominio";
import type { AlertaFila, PerfilFila } from "@/lib/alertas/servico";
import { formatarDataHora } from "@/lib/datas";
import { cn } from "@/lib/utils";

import { ehConflito, ErroApiAlertas, type RespostaAcao } from "./api";
import {
  detalheLegivel,
  prazoRelativo,
  rotuloAutoria,
  rotuloDestinatario,
  rotuloEvento,
  rotuloEventoHistorico,
  rotuloFonte,
  rotuloResultado,
  rotuloSituacao,
  rotuloSituacaoDestinatario,
  rotuloTipo,
  rotuloTipoAcao,
  unidadeDoAlerta,
  validadeRelativa,
} from "./apresentacao";
import { CLASSE_ENTRADA, CLASSE_OPCAO_CHIP, CLASSE_RADIO_OCULTO, CLASSE_SELECAO, CLASSE_TEXTO_LONGO, Campo, ErroCampo } from "./campos";
import {
  CONTAGENS_ACAO,
  errosDoCorpo,
  formularioAcaoVazio,
  MINIMO_MOTIVO_CANCELAMENTO,
  montarCorpoAcao,
  montarCorpoCancelar,
  montarCorpoCiencia,
  montarCorpoSimples,
  validarAcao,
  type FormularioAcaoRrd,
} from "./formulario";
import { FaixaNivel, MarcaNatureza, MarcaPrazo, MarcaValidade, SeloSituacao } from "./marcas";

/**
 * Detalhe de um alerta (painel lateral no desktop, tela cheia no celular):
 * todos os campos, destinatários com a ciência, ações RRD, a linha do tempo
 * do histórico (horário de Brasília) e as ações que a sessão pode usar.
 *
 * Os formulários das ações vivem AQUI e não são limpos por uma recarga: um
 * 409 ("alguém alterou este alerta") mostra o aviso e o botão de recarregar,
 * e o que foi digitado continua no lugar para reenviar.
 */

type Painel = "emitir" | "ciencia" | "acao" | "encerrar" | "cancelar" | "apagar" | null;

export interface PropsDetalhe {
  alerta: AlertaFila;
  /** Linha do tempo (null = carregando). */
  historico: readonly EventoHistorico[] | null;
  erroDetalhe: string | null;
  capacidades: Capacidades;
  perfil: Pick<PerfilFila, "cobs" | "escopoGlobal" | "pseudonimo">;
  agora: Date;
  /** Avisos do servidor na última gravação deste alerta (não bloqueiam). */
  avisos: readonly string[];
  /** Confirmação vinda do formulário ("Alerta AL-… emitido."), mostrada ao abrir. */
  mensagemInicial?: string | null;
  /** Envia {acao, ...} e recarrega a fila e o detalhe; lança ErroApiAlertas. */
  onEnviar: (corpo: Record<string, unknown>, sucesso: string) => Promise<RespostaAcao>;
  onRecarregar: () => Promise<void>;
  /** Abre o formulário com este alerta (editar rascunho ou atualizar emitido). */
  onEditar: (errosDoServidor?: ErroApiAlertas) => void;
}

function noEscopo(d: Pick<Destinatario, "cob">, capacidades: Capacidades, perfil: PropsDetalhe["perfil"]): boolean {
  return capacidades.verTodosCobs || perfil.escopoGlobal || (d.cob !== null && perfil.cobs.includes(d.cob));
}

export function DetalheAlerta(props: PropsDetalhe) {
  const { alerta: a, capacidades, perfil, agora } = props;
  const [painel, setPainel] = useState<Painel>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<ErroApiAlertas | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(props.mensagemInicial ?? null);
  const refSucesso = useRef<HTMLParagraphElement>(null);

  const candidatosCiencia = a.destinatarios.filter((d) => d.situacaoDest === "AGUARDANDO" && noEscopo(d, capacidades, perfil));
  const pode = {
    emitir: capacidades.emitir && a.situacao === "RASCUNHO",
    editar: capacidades.emitir && podeEditar(a.situacao),
    apagar: capacidades.emitir && podeApagar(a.situacao),
    ciencia: capacidades.darCiencia && aceitaCienciaOuAcao(a.situacao) && candidatosCiencia.length > 0,
    acao: capacidades.registrarAcao && aceitaCienciaOuAcao(a.situacao),
    encerrar: capacidades.encerrar && transicao(a.situacao, "encerrar") !== null,
    cancelar: capacidades.encerrar && transicao(a.situacao, "cancelar") !== null,
  };

  const abrir = (p: Painel) => {
    setPainel(p);
    setErro(null);
    setSucesso(null);
  };

  /** Envia e trata o contrato: sucesso fecha o painel; erro fica visível com o que foi digitado. */
  const enviar = async (corpo: Record<string, unknown>, mensagemSucesso: string): Promise<boolean> => {
    setEnviando(true);
    setErro(null);
    try {
      await props.onEnviar(corpo, mensagemSucesso);
      setPainel(null);
      setSucesso(mensagemSucesso);
      // O painel em que estava o foco some: o foco vai para a confirmação.
      requestAnimationFrame(() => refSucesso.current?.focus());
      return true;
    } catch (e) {
      setErro(e instanceof ErroApiAlertas ? e : new ErroApiAlertas(0, "desconhecido", "Não foi possível gravar agora."));
      return false;
    } finally {
      setEnviando(false);
    }
  };

  const recarregar = async () => {
    setEnviando(true);
    try {
      await props.onRecarregar();
      setErro(null);
    } finally {
      setEnviando(false);
    }
  };

  const prazo = prazoRelativo(a, agora);
  const validade = validadeRelativa(a, agora);
  const unidade = unidadeDoAlerta(a);
  const versao = a.alteradoEm ?? "";

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Resumo */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SeloSituacao situacao={a.situacao} />
          <MarcaNatureza natureza={a.natureza} />
          {a.capMsgType === "Update" ? <Badge variant="info">Atualizado (CAP Update)</Badge> : null}
        </div>
        <FaixaNivel nivel={a.nivelAlerta} complemento={rotuloTipo(a.tipoRisco)} />
        <div className="grid grid-cols-1 gap-2 rounded-[12px] border border-border bg-linha/3 p-3 text-[13px] sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-[.09em] text-mut">Prazo da ação RRD</p>
            <MarcaPrazo prazo={prazo} className="mt-1 text-[13.5px]" />
          </div>
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-[.09em] text-mut">Validade</p>
            <MarcaValidade texto={validade.texto} expirada={validade.expirada} className="mt-1 text-[13.5px]" />
            {a.validoAte ? <p className="text-[11px] text-mut tabular-nums">{formatarDataHora(a.validoAte)}</p> : null}
          </div>
        </div>
      </div>

      {/* Mensagens */}
      <div aria-live="polite" className="empty:hidden">
        {sucesso ? (
          <p ref={refSucesso} tabIndex={-1} className="flex items-start gap-2 rounded-[10px] border border-ok/40 bg-ok/12 px-3 py-2.5 text-[13px] font-semibold text-ok-txt">
            <CircleCheck aria-hidden="true" className="mt-px size-4 shrink-0" />
            {sucesso}
          </p>
        ) : null}
      </div>
      {props.avisos.length > 0 ? (
        <div className="rounded-[10px] border border-alerta/40 bg-alerta/10 px-3 py-2.5 text-[12.5px] text-ink-2">
          <p className="mb-1 flex items-center gap-1.5 font-bold text-alerta-txt">
            <Info aria-hidden="true" className="size-4" /> Avisos da última gravação
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {props.avisos.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Ações da sessão */}
      {Object.values(pode).some(Boolean) ? (
        <section aria-label="Ações" className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {pode.emitir ? (
              <Button onClick={() => abrir("emitir")} aria-expanded={painel === "emitir"}>
                <Send aria-hidden="true" /> Emitir
              </Button>
            ) : null}
            {pode.ciencia ? (
                <Button variant={pode.emitir ? "outline" : "default"} onClick={() => abrir("ciencia")} aria-expanded={painel === "ciencia"}>
                  <CheckCheck aria-hidden="true" /> Dar ciência
                </Button>
            ) : null}
            {pode.acao ? (
                <Button variant="outline" onClick={() => abrir("acao")} aria-expanded={painel === "acao"}>
                  <ClipboardPlus aria-hidden="true" /> Registrar ação RRD
                </Button>
            ) : null}
            {pode.encerrar ? (
              <Button variant="outline" onClick={() => abrir("encerrar")} aria-expanded={painel === "encerrar"}>
                <ShieldCheck aria-hidden="true" /> Encerrar
              </Button>
            ) : null}
            {pode.editar ? (
              <Button variant="secondary" onClick={() => props.onEditar()}>
                <Pencil aria-hidden="true" /> {a.situacao === "RASCUNHO" ? "Editar" : "Atualizar"}
              </Button>
            ) : null}
            {pode.cancelar ? (
                <Button variant="secondary" onClick={() => abrir("cancelar")} aria-expanded={painel === "cancelar"}>
                  <Ban aria-hidden="true" /> Cancelar alerta
                </Button>
            ) : null}
            {pode.apagar ? (
              <Button variant="secondary" onClick={() => abrir("apagar")} aria-expanded={painel === "apagar"}>
                <Trash2 aria-hidden="true" /> Apagar rascunho
              </Button>
            ) : null}
          </div>

          {painel === "emitir" ? (
            <Confirmacao
              titulo="Emitir este alerta?"
              texto={`As unidades destinatárias são notificadas agora e o prazo da ação RRD começa a correr${a.prazoAcao ? "" : " (padrão pelo nível)"}.`}
              confirmar="Emitir agora"
              icone={Send}
              enviando={enviando}
              onConfirmar={() => enviar(montarCorpoSimples("emitir", a.alertaId, versao), `Alerta ${a.alertaId} emitido.`)}
              onVoltar={() => abrir(null)}
            />
          ) : null}
          {painel === "encerrar" ? (
            <Confirmacao
              titulo="Encerrar este alerta?"
              texto="A ação RRD foi registrada. Encerrado, o alerta sai da fila de pendências."
              confirmar="Encerrar alerta"
              icone={ShieldCheck}
              enviando={enviando}
              onConfirmar={() => enviar(montarCorpoSimples("encerrar", a.alertaId, versao), `Alerta ${a.alertaId} encerrado.`)}
              onVoltar={() => abrir(null)}
            />
          ) : null}
          {painel === "apagar" ? (
            <Confirmacao
              titulo="Apagar este rascunho?"
              texto="O rascunho some da fila; o histórico guarda que ele existiu. Não dá para desfazer."
              confirmar="Apagar rascunho"
              icone={Trash2}
              destrutivo
              enviando={enviando}
              onConfirmar={() => enviar(montarCorpoSimples("apagar", a.alertaId, versao), `Rascunho ${a.alertaId} apagado.`)}
              onVoltar={() => abrir(null)}
            />
          ) : null}
          {/* Os formulários ficam montados (escondidos) para não perder o que foi digitado ao trocar de painel;
              só os que a sessão pode usar. */}
          {pode.ciencia ? (
            <PainelCiencia
              visivel={painel === "ciencia"}
              alerta={a}
              candidatos={candidatosCiencia}
              enviando={enviando}
              onEnviar={(corpo) => enviar(corpo, "Ciência registrada.")}
              onVoltar={() => abrir(null)}
            />
          ) : null}
          {pode.acao ? (
            <PainelAcaoRrd
              visivel={painel === "acao"}
              alerta={a}
              agora={agora}
              enviando={enviando}
              onEnviar={(corpo) => enviar(corpo, "Ação RRD registrada.")}
              onVoltar={() => abrir(null)}
            />
          ) : null}
          {pode.cancelar ? (
            <PainelCancelar
              visivel={painel === "cancelar"}
              alerta={a}
              enviando={enviando}
              onEnviar={(corpo) => enviar(corpo, `Alerta ${a.alertaId} cancelado.`)}
              onVoltar={() => abrir(null)}
            />
          ) : null}
          {/* O erro aparece logo abaixo do painel em que a pessoa agiu (perto do botão que usou). */}
          {erro ? <AvisoErro erro={erro} enviando={enviando} onRecarregar={recarregar} onEditar={pode.editar ? () => props.onEditar(erro) : undefined} /> : null}
        </section>
      ) : capacidades.emitir || capacidades.darCiencia || capacidades.registrarAcao ? null : (
        <p className="rounded-[10px] border border-border bg-linha/4 px-3 py-2.5 text-[12.5px] text-ink-2">
          O seu perfil é de leitura: você acompanha o alerta, mas não registra ciência nem ação.
        </p>
      )}

      {/* Campos */}
      <Secao titulo="Território">
        <Dados>
          <Dado rotulo="Município">
            {a.municipio ?? "—"}
            {a.codIbge ? <span className="ml-1.5 text-[11.5px] text-mut tabular-nums">IBGE {a.codIbge}</span> : null}
          </Dado>
          <Dado rotulo="COB · UEOp">{unidade.linha1}</Dado>
          <Dado rotulo="Fração">{unidade.linha2 ?? "—"}</Dado>
          <Dado rotulo="Local de referência">{a.localReferencia ?? "—"}</Dado>
          <Dado rotulo="Área do alerta" largo>
            {a.areaDesc ??
              (a.situacao === "RASCUNHO" && a.municipio ? `${a.municipio}/MG${a.localReferencia ? ` — ${a.localReferencia}` : ""} (padrão, na emissão)` : "—")}
          </Dado>
        </Dados>
      </Secao>

      <Secao titulo="Risco">
        <Dados>
          <Dado rotulo="Tipo de risco">{rotuloTipo(a.tipoRisco)}</Dado>
          <Dado rotulo="Evento">{rotuloEvento(a.evento) ?? "—"}</Dado>
          {a.tipoRisco === "METEOROLOGICO" ? (
            <>
              <Dado rotulo="Chuva por hora">{a.mmHora !== null ? `${numero(a.mmHora)} mm/h` : "—"}</Dado>
              <Dado rotulo="Chuva em 24 h">{a.mm24h !== null ? `${numero(a.mm24h)} mm` : "—"}</Dado>
            </>
          ) : null}
          {a.tipoRisco === "HIDROLOGICO" ? (
            <>
              <Dado rotulo="Bacia">{a.bacia ?? "—"}</Dado>
              <Dado rotulo="Rio">{a.rio ?? "—"}</Dado>
              <Dado rotulo="Cota">{a.cota !== null ? `${numero(a.cota)} cm` : "—"}</Dado>
              <Dado rotulo="Estação">{a.estacaoCodigo ?? "—"}</Dado>
            </>
          ) : null}
          {a.tipoRisco === "GEOLOGICO" ? <Dado rotulo="Índice de risco">{a.indiceRisco !== null ? numero(a.indiceRisco) : "—"}</Dado> : null}
          <Dado rotulo="Fonte que motivou">{rotuloFonte(a.fonteGatilho) ?? "—"}</Dado>
          <Dado rotulo="Referência da fonte">{a.fonteRef ?? "—"}</Dado>
        </Dados>
      </Secao>

      <Secao titulo="Mensagem do alerta (CAP)">
        <Dados>
          <Dado rotulo="Título" largo>
            {a.titulo ?? "—"}
          </Dado>
          <Dado rotulo="Descrição" largo>
            <span className="whitespace-pre-line">{a.descricao ?? "—"}</span>
          </Dado>
          <Dado rotulo="Ação esperada" largo>
            <span className="whitespace-pre-line">{a.instrucao ?? "—"}</span>
          </Dado>
          <Dado rotulo="Urgência">{rotuloDe(CAP_URGENCIAS, a.capUrgencia) ?? "—"}</Dado>
          <Dado rotulo="Certeza">{rotuloDe(CAP_CERTEZAS, a.capCerteza) ?? "—"}</Dado>
          <Dado rotulo="Resposta">{rotuloDe(CAP_RESPOSTAS, a.capResposta) ?? "—"}</Dado>
          <Dado rotulo="Nº da chamada CAD">{a.numeroChamada ?? "—"}</Dado>
          <Dado rotulo="Identificador CAP" largo>
            <span className="break-all font-mono text-[12px]">{a.capIdentifier ?? "— (gerado na emissão)"}</span>
          </Dado>
        </Dados>
      </Secao>

      <Secao titulo="Datas (horário de Brasília)">
        <Dados>
          <Dado rotulo="Emitido em">{data(a.dataEmissao)}</Dado>
          <Dado rotulo="Início da vigência">{data(a.inicioVigencia)}</Dado>
          <Dado rotulo="Válido até">{data(a.validoAte)}</Dado>
          <Dado rotulo="Prazo da ação RRD">{a.prazoAcao ? data(a.prazoAcao) : a.situacao === "RASCUNHO" ? "pelo nível, ao emitir" : "—"}</Dado>
          {a.encerradoEm ? <Dado rotulo={a.situacao === "CANCELADO" ? "Cancelado em" : "Encerrado em"}>{data(a.encerradoEm)}</Dado> : null}
          {a.motivoCancelamento ? (
            <Dado rotulo="Motivo do cancelamento" largo>
              {a.motivoCancelamento}
            </Dado>
          ) : null}
          <Dado rotulo="Criado em">{data(a.criadoEm)}</Dado>
          <Dado rotulo="Última alteração">{data(a.alteradoEm)}</Dado>
        </Dados>
      </Secao>

      <Secao titulo={`Destinatários (${a.destinatarios.length})`}>
        {a.destinatarios.length === 0 ? (
          <p className="text-[13px] text-mut">Nenhuma unidade notificada ainda (a principal sai da fração ao emitir).</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {a.destinatarios.map((d, i) => (
              <li key={d.objectid ?? `${d.cob}-${d.ueop}-${d.fracao}-${i}`} className="rounded-[10px] border border-border bg-linha/3 px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 text-[13px] font-semibold text-ink">
                    {rotuloDestinatario(d)}
                    {d.principal ? <span className="ml-1.5 text-[11.5px] font-bold uppercase tracking-[.06em] text-acc-txt">principal</span> : null}
                  </p>
                  <Badge variant={d.situacaoDest === "CIENTE" ? "ok" : d.situacaoDest === "AGUARDANDO" ? "alerta" : "neutro"} marcador>
                    {rotuloSituacaoDestinatario(d.situacaoDest)}
                  </Badge>
                </div>
                <p className="mt-1 text-[12px] leading-snug text-mut tabular-nums">
                  {d.notificadoEm ? `Notificada em ${formatarDataHora(d.notificadoEm)}` : "Ainda não notificada"}
                  {d.cienteEm ? ` · ciente em ${formatarDataHora(d.cienteEm)} por ${rotuloAutoria(d.cientePorId, d.cientePorDominio, perfil.pseudonimo)}` : ""}
                </p>
                {d.observacao ? <p className="mt-1 text-[12.5px] text-ink-2">“{d.observacao}”</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo={`Ações RRD (${a.acoes.length})`}>
        {a.acoes.length === 0 ? (
          <p className="text-[13px] text-mut">Nenhuma ação RRD registrada.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {a.acoes.map((ac) => (
              <li key={ac.acaoId} className="rounded-[10px] border border-border bg-linha/3 px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 text-[13px] font-semibold text-ink">{rotuloTipoAcao(ac.tipoAcao)}</p>
                  <Badge variant={ac.resultado === "CONCLUIDA" ? "ok" : ac.resultado === "NAO_REALIZADA" ? "neutro" : "info"} marcador>
                    {rotuloResultado(ac.resultado)}
                  </Badge>
                </div>
                <p className="mt-1 text-[12px] text-mut tabular-nums">
                  <span className="font-mono">{ac.acaoId}</span> · {data(ac.dataAcao)} · {rotuloAutoria(ac.registradoPorId, ac.registradoPorDominio, perfil.pseudonimo)}
                </p>
                {ac.acaoExecutada ? <p className="mt-1.5 whitespace-pre-line text-[13px] text-ink-2">{ac.acaoExecutada}</p> : null}
                <ContagensAcao acao={ac} />
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Histórico">
        {props.erroDetalhe ? (
          <p className="text-[13px] text-alerta-txt">Não foi possível carregar o histórico: {props.erroDetalhe}</p>
        ) : props.historico === null ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            <span className="sr-only">Carregando o histórico…</span>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <LinhaDoTempo eventos={props.historico} proprio={perfil.pseudonimo} />
        )}
      </Secao>
    </div>
  );
}

function numero(v: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v);
}

function data(iso: string | null): string {
  return iso ? formatarDataHora(iso) : "—";
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="min-w-0 border-t border-border pt-3.5">
      <h3 id={id} className="mb-2.5 text-[11.5px] font-bold uppercase tracking-[.18em] text-faint">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Dados({ children }: { children: ReactNode }) {
  return <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">{children}</dl>;
}

function Dado({ rotulo, children, largo = false }: { rotulo: string; children: ReactNode; largo?: boolean }) {
  return (
    <div className={cn("min-w-0", largo && "sm:col-span-2")}>
      <dt className="text-[11px] font-bold uppercase tracking-[.06em] text-mut">{rotulo}</dt>
      <dd className="mt-0.5 break-words text-[13.5px] leading-snug text-ink">{children}</dd>
    </div>
  );
}

function ContagensAcao({ acao }: { acao: AlertaFila["acoes"][number] }) {
  const itens = CONTAGENS_ACAO.map(([campo, rotulo]) => [rotulo, acao[campo]] as const).filter(([, v]) => v !== null);
  if (itens.length === 0 && acao.compdecAcionada === null) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-2 tabular-nums">
      {itens.map(([rotulo, v]) => (
        <li key={rotulo}>
          {rotulo}: <strong className="text-ink">{v}</strong>
        </li>
      ))}
      {acao.compdecAcionada !== null ? (
        <li>
          COMPDEC acionada: <strong className="text-ink">{acao.compdecAcionada ? "sim" : "não"}</strong>
        </li>
      ) : null}
    </ul>
  );
}

function LinhaDoTempo({ eventos, proprio }: { eventos: readonly EventoHistorico[]; proprio: string | null }) {
  if (eventos.length === 0) return <p className="text-[13px] text-mut">Sem eventos registrados.</p>;
  const ordenados = [...eventos].sort((x, y) => x.quando.localeCompare(y.quando));
  return (
    <ol className="relative flex flex-col gap-3 pl-5 before:absolute before:inset-y-1 before:left-[5px] before:w-px before:bg-linha/16">
      {ordenados.map((e, i) => (
        <li key={e.objectid ?? `${e.evento}-${e.quando}-${i}`} className="relative">
          <span
            aria-hidden="true"
            className={cn(
              "absolute -left-5 top-1 size-[11px] rounded-full border-2 border-sup-1",
              e.evento === "CANCELADO" ? "bg-perigo" : e.evento === "ENCERRADO" ? "bg-ok" : e.situacaoPara ? "bg-primary" : "bg-linha/40",
            )}
          />
          <p className="text-[13px] font-semibold leading-tight text-ink">
            {rotuloEventoHistorico(e.evento)}
            {e.situacaoDe && e.situacaoPara ? (
              <span className="ml-1.5 text-[12px] font-normal text-mut">
                {rotuloSituacao(e.situacaoDe)} → {rotuloSituacao(e.situacaoPara)}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-[12px] text-mut tabular-nums">
            <time dateTime={e.quando}>{formatarDataHora(e.quando)}</time> · {rotuloAutoria(e.porId, e.porDominio, proprio)}
            {e.capMsgType ? ` · CAP ${e.capMsgType}` : ""}
          </p>
          {e.detalhe ? <p className="mt-0.5 break-words text-[12.5px] text-ink-2">{detalheLegivel(e.detalhe)}</p> : null}
        </li>
      ))}
    </ol>
  );
}

// ── Erro, confirmação e formulários das ações ──────────────────────────────

function AvisoErro({
  erro,
  enviando,
  onRecarregar,
  onEditar,
}: {
  erro: ErroApiAlertas;
  enviando: boolean;
  onRecarregar: () => void;
  onEditar?: () => void;
}) {
  const conflito = ehConflito(erro);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
  }, [erro]);
  return (
    <div ref={ref} role="alert" className="rounded-[10px] border border-perigo/40 bg-perigo/10 px-3 py-2.5 text-[13px] text-ink">
      <p className="flex items-start gap-2 font-semibold">
        <TriangleAlert aria-hidden="true" className="mt-px size-4 shrink-0 text-perigo-txt" />
        <span>{erro.message}</span>
      </p>
      {erro.campos.length > 0 ? (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-9 text-[12.5px] text-ink-2">
          {erro.campos.map((c) => (
            <li key={`${c.campo}-${c.mensagem}`}>{c.mensagem}</li>
          ))}
        </ul>
      ) : null}
      {conflito || erro.campos.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-2 pl-6">
          {conflito ? (
            <Button size="sm" variant="outline" onClick={onRecarregar} disabled={enviando}>
              <RefreshCw aria-hidden="true" /> Recarregar alerta
            </Button>
          ) : null}
          {!conflito && onEditar ? (
            <Button size="sm" variant="outline" onClick={onEditar}>
              <Pencil aria-hidden="true" /> Completar no formulário
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CaixaPainel({ titulo, children, visivel = true }: { titulo: string; children: ReactNode; visivel?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Ao abrir, o foco vai para o primeiro controle do painel.
    if (visivel) ref.current?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea, button")?.focus();
  }, [visivel]);
  return (
    <div ref={ref} role="group" aria-labelledby={id} hidden={!visivel} className="rounded-[12px] border border-acc/30 bg-acc/5 p-3.5">
      <h3 id={id} className="mb-3 text-[13px] font-bold uppercase tracking-[.06em] text-ink-forte">
        {titulo}
      </h3>
      {children}
    </div>
  );
}

function Confirmacao({
  titulo,
  texto,
  confirmar,
  icone: Icone,
  destrutivo = false,
  enviando,
  onConfirmar,
  onVoltar,
}: {
  titulo: string;
  texto: string;
  confirmar: string;
  icone: typeof Send;
  destrutivo?: boolean;
  enviando: boolean;
  onConfirmar: () => void;
  onVoltar: () => void;
}) {
  return (
    <CaixaPainel titulo={titulo}>
      <p className="text-[13px] leading-snug text-ink-2">{texto}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant={destrutivo ? "destructive" : "default"} onClick={onConfirmar} disabled={enviando}>
          <Icone aria-hidden="true" /> {enviando ? "Enviando…" : confirmar}
        </Button>
        <Button variant="ghost" onClick={onVoltar} disabled={enviando}>
          <Undo2 aria-hidden="true" /> Voltar
        </Button>
      </div>
    </CaixaPainel>
  );
}

function PainelCiencia({
  visivel,
  alerta,
  candidatos,
  enviando,
  onEnviar,
  onVoltar,
}: {
  visivel: boolean;
  alerta: AlertaFila;
  candidatos: readonly Destinatario[];
  enviando: boolean;
  onEnviar: (corpo: Record<string, unknown>) => Promise<boolean>;
  onVoltar: () => void;
}) {
  const [destinatario, setDestinatario] = useState<string>("");
  const [observacao, setObservacao] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  // A escolha some se a unidade já deu ciência (recarga): volta para "minha unidade".
  const escolhido = candidatos.some((d) => String(d.objectid) === destinatario) ? destinatario : "";

  const confirmar = async () => {
    // Uma unidade só: vai explícita (é a que o texto mostra); várias: a escolhida ou a da sessão.
    const unica = candidatos.length === 1 ? candidatos[0].objectid : null;
    const corpo = montarCorpoCiencia(alerta.alertaId, alerta.alteradoEm, escolhido ? Number(escolhido) : unica, observacao);
    const e = errosDoCorpo(corpo);
    setErros(e);
    if (Object.keys(e).length) return;
    if (await onEnviar(corpo)) {
      setObservacao("");
      setDestinatario("");
    }
  };

  return (
    <CaixaPainel titulo="Dar ciência" visivel={visivel}>
      <div className="grid gap-3">
        {candidatos.length > 1 ? (
          <Campo nome="ciencia-destinatario" rotulo="Unidade que dá ciência" ajuda="Sem escolha, vale a unidade da sua sessão (ou a principal).">
            {(at) => (
              <select {...at} className={CLASSE_SELECAO} value={escolhido} onChange={(e) => setDestinatario(e.target.value)}>
                <option value="">Minha unidade</option>
                {candidatos.map((d) => (
                  <option key={d.objectid ?? rotuloDestinatario(d)} value={d.objectid ?? ""} disabled={d.objectid === null}>
                    {rotuloDestinatario(d)}
                    {d.principal ? " (principal)" : ""}
                  </option>
                ))}
              </select>
            )}
          </Campo>
        ) : (
          <p className="text-[13px] text-ink-2">
            Ciência de <strong className="text-ink">{candidatos[0] ? rotuloDestinatario(candidatos[0]) : "sua unidade"}</strong>.
          </p>
        )}
        <Campo nome="ciencia-observacao" rotulo="Observação (opcional)" erro={erros.observacao}>
          {(at) => (
            <textarea {...at} className={cn(CLASSE_TEXTO_LONGO, "min-h-16")} maxLength={1000} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          )}
        </Campo>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={confirmar} disabled={enviando}>
          <CheckCheck aria-hidden="true" /> {enviando ? "Enviando…" : "Confirmar ciência"}
        </Button>
        <Button variant="ghost" onClick={onVoltar} disabled={enviando}>
          <Undo2 aria-hidden="true" /> Voltar
        </Button>
      </div>
    </CaixaPainel>
  );
}

function PainelAcaoRrd({
  visivel,
  alerta,
  agora,
  enviando,
  onEnviar,
  onVoltar,
}: {
  visivel: boolean;
  alerta: AlertaFila;
  agora: Date;
  enviando: boolean;
  onEnviar: (corpo: Record<string, unknown>) => Promise<boolean>;
  onVoltar: () => void;
}) {
  const [f, setF] = useState<FormularioAcaoRrd>(() => formularioAcaoVazio(agora));
  const [erros, setErros] = useState<Record<string, string>>({});
  const nomeResultado = useId();
  const mudar = <K extends keyof FormularioAcaoRrd>(campo: K, valor: FormularioAcaoRrd[K]) => setF((x) => ({ ...x, [campo]: valor }));

  const confirmar = async () => {
    const corpo = montarCorpoAcao(alerta.alertaId, alerta.alteradoEm, f);
    const e = validarAcao(corpo, f, new Date());
    setErros(e);
    const primeiro = ["tipoAcao", "resultado", "acaoExecutada", "dataAcao", ...CONTAGENS_ACAO.map(([c]) => c)].find((c) => e[c]);
    if (primeiro) {
      document.getElementById(`campo-acao-${primeiro}`)?.focus();
      return;
    }
    if (await onEnviar(corpo)) setF(formularioAcaoVazio(new Date()));
  };

  return (
    <CaixaPainel titulo="Registrar ação RRD" visivel={visivel}>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Campo nome="acao-tipoAcao" rotulo="Tipo de ação" obrigatorio erro={erros.tipoAcao} className="sm:col-span-2">
          {(at) => (
            <select {...at} className={CLASSE_SELECAO} value={f.tipoAcao} onChange={(e) => mudar("tipoAcao", e.target.value as FormularioAcaoRrd["tipoAcao"])}>
              <option value="">Escolha…</option>
              {TIPOS_ACAO.map((t) => (
                <option key={t.codigo} value={t.codigo}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          )}
        </Campo>
        {/* radiogroup: papel em que a ARIA 1.2 prevê aria-invalid; a mensagem de erro liga no grupo E em cada rádio. */}
        <fieldset
          role="radiogroup"
          className="min-w-0 sm:col-span-2"
          aria-invalid={erros.resultado ? true : undefined}
          aria-describedby={erros.resultado ? "erro-acao-resultado" : undefined}
        >
          <legend className="mb-1.5 text-[12.5px] font-bold text-ink">
            Resultado <span className="font-semibold text-mut" aria-hidden="true">*</span>
          </legend>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {RESULTADOS_ACAO.map((r, i) => (
              <label key={r.codigo} className={CLASSE_OPCAO_CHIP}>
                {/* Além do grupo, cada rádio leva aria-invalid e a mensagem: em modo de formulário o leitor
                    de tela chega direto na opção e anuncia "inválido" + "Obrigatório". (A ARIA 1.2 não lista
                    aria-invalid para "radio", mas Chrome e Firefox expõem o estado e NVDA, JAWS e VoiceOver o anunciam.) */}
                {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props */}
                <input
                  type="radio"
                  id={i === 0 ? "campo-acao-resultado" : undefined}
                  name={nomeResultado}
                  value={r.codigo}
                  checked={f.resultado === r.codigo}
                  onChange={() => mudar("resultado", r.codigo)}
                  className={CLASSE_RADIO_OCULTO}
                  aria-invalid={erros.resultado ? true : undefined}
                  aria-describedby={erros.resultado ? "erro-acao-resultado" : undefined}
                />
                {r.rotulo}
              </label>
            ))}
          </div>
          <ErroCampo id="erro-acao-resultado" mensagem={erros.resultado} />
          <p className="mt-1.5 text-[12px] text-mut">
            Concluída ou parcial leva o alerta a “Ação RRD registrada”; em andamento, a “Em ação”; não realizada só registra.
          </p>
        </fieldset>
        <Campo nome="acao-acaoExecutada" rotulo="Descrição da ação" obrigatorio erro={erros.acaoExecutada} className="sm:col-span-2">
          {(at) => (
            <textarea
              {...at}
              className={CLASSE_TEXTO_LONGO}
              maxLength={2000}
              value={f.acaoExecutada}
              onChange={(e) => mudar("acaoExecutada", e.target.value)}
              placeholder="O que foi feito, onde e com quem."
            />
          )}
        </Campo>
        <Campo nome="acao-dataAcao" rotulo="Data e hora da ação (Brasília)" obrigatorio erro={erros.dataAcao}>
          {(at) => <input {...at} type="datetime-local" className={CLASSE_ENTRADA} value={f.dataAcao} onChange={(e) => mudar("dataAcao", e.target.value)} />}
        </Campo>
        <Campo nome="acao-ocorrenciaCad" rotulo="Ocorrência no CAD (opcional)" erro={erros.ocorrenciaCad}>
          {(at) => <input {...at} className={CLASSE_ENTRADA} maxLength={30} value={f.ocorrenciaCad} onChange={(e) => mudar("ocorrenciaCad", e.target.value)} />}
        </Campo>
        <Campo nome="acao-localReferencia" rotulo="Local de referência (opcional)" erro={erros.localReferencia} className="sm:col-span-2">
          {(at) => <input {...at} className={CLASSE_ENTRADA} maxLength={255} value={f.localReferencia} onChange={(e) => mudar("localReferencia", e.target.value)} />}
        </Campo>
        <details className="group min-w-0 sm:col-span-2" open={CONTAGENS_ACAO.some(([c]) => erros[c])}>
          <summary className="relative alvo-toque w-fit cursor-pointer rounded-[6px] text-[13px] font-semibold text-acc-txt">
            Contagens (opcional)
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {CONTAGENS_ACAO.map(([campo, rotulo]) => (
              <Campo key={campo} nome={`acao-${campo}`} rotulo={rotulo} erro={erros[campo]}>
                {(at) => (
                  <input {...at} inputMode="numeric" className={CLASSE_ENTRADA} value={f[campo]} onChange={(e) => mudar(campo, e.target.value.replace(/[^\d]/g, ""))} />
                )}
              </Campo>
            ))}
            <Campo nome="acao-compdec" rotulo="COMPDEC acionada?">
              {(at) => (
                <select {...at} className={CLASSE_SELECAO} value={f.compdecAcionada} onChange={(e) => mudar("compdecAcionada", e.target.value as FormularioAcaoRrd["compdecAcionada"])}>
                  <option value="">Não respondido</option>
                  <option value="S">Sim</option>
                  <option value="N">Não</option>
                </select>
              )}
            </Campo>
          </div>
        </details>
      </div>
      <div className="mt-3.5 flex flex-wrap gap-2">
        <Button onClick={confirmar} disabled={enviando}>
          <ClipboardPlus aria-hidden="true" /> {enviando ? "Enviando…" : "Registrar ação"}
        </Button>
        <Button variant="ghost" onClick={onVoltar} disabled={enviando}>
          <Undo2 aria-hidden="true" /> Voltar
        </Button>
      </div>
    </CaixaPainel>
  );
}

function PainelCancelar({
  visivel,
  alerta,
  enviando,
  onEnviar,
  onVoltar,
}: {
  visivel: boolean;
  alerta: AlertaFila;
  enviando: boolean;
  onEnviar: (corpo: Record<string, unknown>) => Promise<boolean>;
  onVoltar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | undefined>();

  const pedir = () => {
    if (motivo.trim().length < MINIMO_MOTIVO_CANCELAMENTO) {
      setErro("Informe o motivo do cancelamento (pelo menos 5 caracteres).");
      document.getElementById("campo-cancelar-motivo")?.focus();
      return;
    }
    setErro(undefined);
    setConfirmando(true);
  };

  const confirmar = async () => {
    const corpo = montarCorpoCancelar(alerta.alertaId, alerta.alteradoEm ?? "", motivo);
    const e = errosDoCorpo(corpo);
    if (e.motivo) {
      setErro(e.motivo);
      setConfirmando(false);
      return;
    }
    if (await onEnviar(corpo)) {
      setMotivo("");
      setConfirmando(false);
    } else setConfirmando(false);
  };

  return (
    <CaixaPainel titulo="Cancelar alerta" visivel={visivel}>
      <p className="mb-3 text-[12.5px] leading-snug text-ink-2">
        O cancelamento avisa as unidades (CAP Cancel) e tira o alerta do mapa e da fila. Use quando o alerta não vale mais ou foi emitido por engano.
      </p>
      <Campo nome="cancelar-motivo" rotulo="Motivo do cancelamento" obrigatorio erro={erro}>
        {(at) => (
          <textarea
            {...at}
            className={CLASSE_TEXTO_LONGO}
            maxLength={500}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              setConfirmando(false);
            }}
          />
        )}
      </Campo>
      {confirmando ? (
        <div role="alert" className="mt-3 rounded-[10px] border border-perigo/40 bg-perigo/10 p-3">
          <p className="text-[13px] font-semibold text-ink">Confirmar o cancelamento de {alerta.alertaId}? Não dá para desfazer.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button variant="destructive" onClick={confirmar} disabled={enviando}>
              <Ban aria-hidden="true" /> {enviando ? "Enviando…" : "Sim, cancelar o alerta"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={enviando}>
              Não
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="destructive" onClick={pedir} disabled={enviando}>
            <Ban aria-hidden="true" /> Cancelar alerta…
          </Button>
          <Button variant="ghost" onClick={onVoltar} disabled={enviando}>
            <Undo2 aria-hidden="true" /> Voltar
          </Button>
        </div>
      )}
    </CaixaPainel>
  );
}
