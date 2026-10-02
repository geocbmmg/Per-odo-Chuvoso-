"use client";

import { FlaskConical, Inbox, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CarimboAtualizacao } from "@/components/layout/carimbo-atualizacao";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COBS_FEICAO } from "@/lib/alertas/codigos";
import type { EventoHistorico } from "@/lib/alertas/dominio";
import type { AlertaFila } from "@/lib/alertas/servico";
import { ROTULOS_PAPEL_SALA, type SessaoPublica } from "@/lib/auth/tipos";
import { itemDaRota } from "@/lib/navegacao";
import { cn } from "@/lib/utils";

import { carregarFila, ehSemSessao, enviarAcao, ErroApiAlertas, type RespostaAcao } from "./api";
import {
  abasVisiveis,
  contadores as calcularContadores,
  contarAbas,
  contarAlertas,
  ehAbaFila,
  filaDaAba,
  FILTROS_VAZIOS,
  filtrosAtivos,
  rotuloNivel,
  rotuloTipo,
  type AbaFila,
  type FiltrosFila,
} from "./apresentacao";
import { CartaoEntrar } from "./cartao-entrar";
import { DetalheAlerta } from "./detalhe-alerta";
import { EsqueletoFilaAlertas, EsqueletoListaAlertas } from "./esqueletos";
import { FilaAlertas } from "./fila-alertas";
import { ContadoresTopo, FiltrosFilaAlertas } from "./filtros-fila";
import { formularioDoAlerta, formularioVazio, type AcaoFormulario, type FormularioAlerta } from "./formulario";
import { FormularioEmissao } from "./formulario-alerta";
import { tiqueAgora, useAgoraMs, useFilaAlertas } from "./hooks";
import { SeloSituacao } from "./marcas";

const modulo = itemDaRota("/alertas-acoes-rrd");

const SUBTITULO = "Emissão de alertas às unidades e acompanhamento da ciência e das ações de Redução do Risco de Desastres.";

interface EstadoDetalhe {
  id: string;
  alerta: AlertaFila | null;
  historico: EventoHistorico[] | null;
  erro: string | null;
}

/** ?alerta=…&aba=… na URL (substitui a entrada do histórico; nada recarrega). */
function gravarNaUrl(alerta: string | null, aba: AbaFila) {
  try {
    const url = new URL(window.location.href);
    if (alerta) url.searchParams.set("alerta", alerta);
    else url.searchParams.delete("alerta");
    if (aba !== "pendentes") url.searchParams.set("aba", aba);
    else url.searchParams.delete("aba");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Sem acesso ao histórico: o estado vale só nesta tela.
  }
}

/**
 * Fila e emissão de alertas (/alertas-acoes-rrd). A fila vem inteira do
 * escopo da sessão (o servidor recorta por COB); abas, filtros e contadores
 * são da tela, com o relógio dela. O detalhe abre numa gaveta lateral (tela
 * cheia no celular); o formulário de emissão, noutra.
 */
export function PainelAlertas({
  sessao,
  alertaInicial,
  abaInicial,
}: {
  sessao: SessaoPublica;
  alertaInicial: string | null;
  abaInicial: AbaFila | null;
}) {
  const fila = useFilaAlertas();
  const agoraMs = useAgoraMs();
  const agora = useMemo(() => (agoraMs ? new Date(agoraMs) : null), [agoraMs]);

  const capacidades = fila.resposta?.capacidades ?? sessao.capacidades;
  const perfil = fila.resposta?.perfil ?? {
    cobs: sessao.cobs,
    escopoGlobal: sessao.escopoGlobal,
    pseudonimo: null,
    demonstracao: sessao.demonstracao,
    rotulo: ROTULOS_PAPEL_SALA[sessao.papel],
    unidade: sessao.unidade,
    papel: sessao.papel,
  };
  const abas = abasVisiveis(capacidades);
  const [abaEscolhida, setAba] = useState<AbaFila>(abaInicial ?? "pendentes");
  const aba = abas.some((a) => a.id === abaEscolhida) ? abaEscolhida : "pendentes";
  const [filtros, setFiltros] = useState<FiltrosFila>(FILTROS_VAZIOS);

  // ── Detalhe ────────────────────────────────────────────────────────────
  const [selecionado, setSelecionado] = useState<string | null>(alertaInicial);
  const [detalhe, setDetalhe] = useState<EstadoDetalhe | null>(null);
  const [avisos, setAvisos] = useState<Record<string, string[]>>({});
  /** Confirmação do formulário para o detalhe que abre em seguida. */
  const [confirmacao, setConfirmacao] = useState<{ id: string; texto: string } | null>(null);
  const origemRef = useRef<HTMLElement | null>(null);
  const seqDetalhe = useRef(0);

  const carregarDetalhe = useCallback(async (id: string) => {
    const seq = ++seqDetalhe.current;
    await Promise.resolve();
    setDetalhe((atual) => (atual?.id === id ? { ...atual, erro: null } : { id, alerta: null, historico: null, erro: null }));
    try {
      const r = await carregarFila({ id });
      if (seq !== seqDetalhe.current) return;
      const alerta = r.alertas[0] ?? null;
      setDetalhe({ id, alerta, historico: alerta?.historico ?? [], erro: alerta ? null : "Alerta não encontrado no seu escopo." });
    } catch (e) {
      if (seq !== seqDetalhe.current) return;
      setDetalhe((atual) => ({
        id,
        alerta: atual?.id === id ? atual.alerta : null,
        historico: atual?.id === id ? atual.historico : null,
        erro: e instanceof Error ? e.message : "Falha ao carregar o alerta.",
      }));
    }
  }, []);

  useEffect(() => {
    // Link direto (?alerta=…): carrega o detalhe com o histórico.
    if (alertaInicial) void carregarDetalhe(alertaInicial);
  }, [alertaInicial, carregarDetalhe]);

  const abrirDetalhe = (id: string, origem: HTMLElement | null) => {
    origemRef.current = origem;
    setConfirmacao(null);
    setSelecionado(id);
    gravarNaUrl(id, aba);
    void carregarDetalhe(id);
  };

  const fecharDetalhe = () => {
    setSelecionado(null);
    setConfirmacao(null);
    gravarNaUrl(null, aba);
  };

  const escolherAba = (valor: string) => {
    if (!ehAbaFila(valor)) return;
    setAba(valor);
    gravarNaUrl(selecionado, valor);
  };

  // ── Formulário de emissão ──────────────────────────────────────────────
  const [formulario, setFormulario] = useState<FormularioAlerta | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [errosForm, setErrosForm] = useState<ErroApiAlertas | null>(null);
  const [anuncio, setAnuncio] = useState<string | null>(null);

  const abrirNovo = (origem: HTMLElement) => {
    origemRef.current = origem;
    // Rascunho não salvo de um alerta novo continua (fechar a gaveta não perde nada).
    setFormulario((atual) => (atual && atual.alertaId === null ? atual : formularioVazio(new Date())));
    setErrosForm(null);
    setFormAberto(true);
  };

  const abrirEdicao = (alerta: AlertaFila, erros?: ErroApiAlertas) => {
    setFormulario((atual) => (atual && atual.alertaId === alerta.alertaId ? atual : formularioDoAlerta(alerta, new Date())));
    setErrosForm(erros ?? null);
    setSelecionado(null);
    gravarNaUrl(null, aba);
    setFormAberto(true);
  };

  const anunciar = (texto: string) => {
    setAnuncio(texto);
    tiqueAgora();
  };

  /** POST que, se a sessão tiver acabado (401), relê a fila para trocar a tela pelo cartão de entrar. */
  const enviar = async (corpo: Record<string, unknown>): Promise<RespostaAcao> => {
    try {
      return await enviarAcao(corpo);
    } catch (e) {
      if (ehSemSessao(e)) void fila.recarregar();
      throw e;
    }
  };

  const enviarDoDetalhe = async (corpo: Record<string, unknown>, sucesso: string): Promise<RespostaAcao> => {
    const r = await enviar(corpo);
    setAvisos((atual) => ({ ...atual, [r.id]: r.avisos }));
    anunciar(sucesso);
    if (r.alerta === null) {
      // Rascunho apagado: some da fila e o painel fecha.
      fecharDetalhe();
      await fila.recarregar();
    } else {
      await Promise.all([fila.recarregar(), carregarDetalhe(r.id)]);
    }
    return r;
  };

  const concluirFormulario = (r: RespostaAcao, acao: AcaoFormulario) => {
    const situacao = r.alerta?.situacao;
    setAvisos((atual) => ({ ...atual, [r.id]: r.avisos }));
    setFormAberto(false);
    setFormulario(null);
    setErrosForm(null);
    const texto =
      acao === "emitir" ? `Alerta ${r.id} emitido.` : situacao && situacao !== "RASCUNHO" ? `Alerta ${r.id} atualizado.` : `Rascunho ${r.id} salvo.`;
    anunciar(texto);
    setConfirmacao({ id: r.id, texto });
    void fila.recarregar();
    origemRef.current = null;
    setSelecionado(r.id);
    gravarNaUrl(r.id, aba);
    void carregarDetalhe(r.id);
  };

  const recarregarVersaoFormulario = async () => {
    const id = formulario?.alertaId;
    if (!id) return;
    const r = await carregarFila({ id });
    const a = r.alertas[0];
    if (!a) return;
    // Só a versão e o estado mudam: o que foi digitado fica.
    setFormulario((atual) =>
      atual
        ? { ...atual, alteradoEm: a.alteradoEm, situacao: a.situacao, dataEmissao: a.dataEmissao, inicioVigencia: a.inicioVigencia }
        : atual,
    );
    void fila.recarregar();
  };

  // ── Dados da tela ──────────────────────────────────────────────────────
  const alertas = useMemo(() => fila.resposta?.alertas ?? [], [fila.resposta]);
  const cobsEscopo = perfil.escopoGlobal || capacidades.verTodosCobs ? [...COBS_FEICAO] : perfil.cobs;
  const lista = useMemo(() => (agora ? filaDaAba(alertas, aba, filtros, agora) : []), [alertas, aba, filtros, agora]);
  const contagemAbas = useMemo(() => (agora ? contarAbas(alertas, filtros, agora) : null), [alertas, filtros, agora]);
  const contadores = useMemo(() => (agora ? calcularContadores(alertas, agora) : null), [alertas, agora]);

  // O detalhe mostra a versão mais nova entre a da fila e a lida com o histórico.
  const alertaDetalhe = useMemo(() => {
    if (selecionado === null) return null;
    const daFila = alertas.find((a) => a.alertaId === selecionado) ?? null;
    const lido = detalhe?.id === selecionado ? detalhe.alerta : null;
    if (!lido) return daFila;
    if (!daFila) return lido;
    return (daFila.alteradoEm ?? "") > (lido.alteradoEm ?? "") ? daFila : lido;
  }, [selecionado, alertas, detalhe]);

  const tituloForm = !formulario?.alertaId
    ? "Novo alerta"
    : formulario.situacao === "RASCUNHO"
      ? `Editar rascunho ${formulario.alertaId}`
      : `Atualizar alerta ${formulario.alertaId}`;

  if (fila.semSessao) {
    return (
      <>
        <CabecalhoPagina titulo={modulo.rotulo} subtitulo={SUBTITULO} icone={modulo.icone} />
        <CartaoEntrar expirou />
      </>
    );
  }

  const definicaoAba = abas.find((a) => a.id === aba);
  const legenda = `${contarAlertas(lista.length)} · ${definicaoAba?.descricao ?? ""}`;

  return (
    <>
      <CabecalhoPagina
        titulo={modulo.rotulo}
        subtitulo={SUBTITULO}
        icone={modulo.icone}
        acoes={
          <>
            {fila.recebidoEm ? (
              <CarimboAtualizacao
                atualizadoEm={fila.recebidoEm}
                origem={perfil.demonstracao ? "exemplo" : "ao-vivo"}
                fonte="Fila de alertas da Sala"
              />
            ) : null}
            <Button variant="secondary" onClick={() => void fila.recarregar()} disabled={fila.carregando} aria-label="Atualizar a fila">
              <RefreshCw aria-hidden="true" className={cn(fila.carregando && "motion-safe:animate-spin")} />
              <span className="max-sm:sr-only">Atualizar</span>
            </Button>
            {capacidades.emitir ? (
              <Button onClick={(e) => abrirNovo(e.currentTarget)}>
                <Plus aria-hidden="true" />
                {formulario && formulario.alertaId === null ? "Continuar alerta" : "Novo alerta"}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-4">
        {perfil.demonstracao ? (
          <p role="note" className="flex items-start gap-1.5 text-[12.5px] leading-snug text-mut">
            <FlaskConical aria-hidden="true" className="mt-px size-3.5 shrink-0 text-info-txt" />
            <span>
              <strong className="font-bold text-info-txt">Sessão de demonstração</strong> · {perfil.rotulo} fictício; o que você gravar fica só na
              memória deste servidor.
            </span>
          </p>
        ) : (
          <p className="text-[12.5px] text-mut">
            Você entrou como <strong className="font-semibold text-ink-2">{perfil.rotulo}</strong>
            {perfil.escopoGlobal || capacidades.verTodosCobs ? " · todos os COBs" : perfil.cobs.length ? ` · ${perfil.cobs.join(", ")}` : ""}.
          </p>
        )}

        <div aria-live="polite" className="sr-only">
          {anuncio}
        </div>

        {fila.erro && fila.resposta ? (
          <p role="alert" className="flex items-start gap-2 rounded-[10px] border border-alerta/40 bg-alerta/10 px-3 py-2.5 text-[13px] text-ink-2">
            <TriangleAlert aria-hidden="true" className="mt-px size-4 shrink-0 text-alerta-txt" />
            <span>
              Não foi possível atualizar a fila: {fila.erro.message} A lista abaixo é a última leitura válida.
            </span>
          </p>
        ) : null}

        {!fila.resposta || !agora || !contadores || !contagemAbas ? (
          fila.erro ? (
            <FilaIndisponivel mensagem={fila.erro.message} onTentar={() => void fila.recarregar()} />
          ) : (
            <div role="status" aria-live="polite">
              <span className="sr-only">Carregando a fila de alertas…</span>
              <EsqueletoFilaAlertas />
            </div>
          )
        ) : (
          <>
            <ContadoresTopo contadores={contadores} mostrarAEncerrar={capacidades.encerrar} />

            <Tabs value={aba} onValueChange={escolherAba}>
              <TabsList variant="chip" aria-label="Situação dos alertas">
                {abas.map((a) => (
                  <TabsTrigger key={a.id} value={a.id} title={a.descricao}>
                    {a.rotulo}
                    <span
                      className={cn(
                        "min-w-6 rounded-full border px-1.5 py-px text-center text-[11px] font-bold tabular-nums",
                        a.id === aba ? "border-acc/40 bg-acc/14" : "border-linha/20 bg-linha/6 text-ink-2",
                      )}
                    >
                      <span className="sr-only">(</span>
                      {contagemAbas[a.id]}
                      <span className="sr-only">)</span>
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <FiltrosFilaAlertas filtros={filtros} cobs={cobsEscopo} onMudar={setFiltros} />

              {abas.map((a) => (
                <TabsContent key={a.id} value={a.id} className="mt-1">
                  {a.id !== aba ? null : lista.length === 0 ? (
                    <FilaVazia aba={a.rotulo} comFiltros={filtrosAtivos(filtros) > 0} onLimpar={() => setFiltros(FILTROS_VAZIOS)} />
                  ) : (
                    <FilaAlertas alertas={lista} agora={agora} onAbrir={abrirDetalhe} selecionado={selecionado} legenda={legenda} />
                  )}
                </TabsContent>
              ))}
            </Tabs>

            {fila.resposta.truncado ? (
              <p className="text-[12px] text-mut">
                A fila mostra os 500 alertas mais prioritários do seu escopo; os encerrados mais antigos podem não aparecer.
              </p>
            ) : null}
          </>
        )}
      </div>

      {/* Detalhe */}
      <Sheet open={selecionado !== null} onOpenChange={(aberto) => (aberto ? null : fecharDetalhe())}>
        <SheetContent
          side="right"
          rotuloFechar="Fechar o detalhe"
          className="w-full gap-0 sm:max-w-[640px]"
          onCloseAutoFocus={(e) => {
            const origem = origemRef.current;
            if (origem && origem.isConnected) {
              e.preventDefault();
              origem.focus();
            }
          }}
        >
          <SheetHeader className="border-b border-border">
            <SheetTitle className="pr-2">
              {alertaDetalhe ? alertaDetalhe.titulo || `${rotuloTipo(alertaDetalhe.tipoRisco)} — ${alertaDetalhe.municipio ?? "sem município"}` : "Alerta"}
            </SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono">{selecionado}</span>
              {alertaDetalhe ? (
                <span>
                  · {rotuloNivel(alertaDetalhe.nivelAlerta)} · {alertaDetalhe.municipio ?? "sem município"}
                </span>
              ) : null}
            </SheetDescription>
          </SheetHeader>
          <div className="rolagem-fina min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {alertaDetalhe && agora ? (
              <DetalheAlerta
                key={alertaDetalhe.alertaId}
                alerta={alertaDetalhe}
                historico={detalhe?.id === selecionado ? detalhe.historico : null}
                erroDetalhe={detalhe?.id === selecionado && detalhe.alerta ? detalhe.erro : null}
                capacidades={capacidades}
                perfil={perfil}
                agora={agora}
                avisos={avisos[alertaDetalhe.alertaId] ?? []}
                mensagemInicial={confirmacao?.id === alertaDetalhe.alertaId ? confirmacao.texto : null}
                onEnviar={enviarDoDetalhe}
                onRecarregar={() => carregarDetalhe(alertaDetalhe.alertaId).then(() => fila.recarregar())}
                onEditar={(erros) => abrirEdicao(alertaDetalhe, erros)}
              />
            ) : detalhe?.id === selecionado && detalhe.erro ? (
              <p role="alert" className="text-[13px] text-alerta-txt">
                {detalhe.erro}
              </p>
            ) : (
              <div role="status">
                <span className="sr-only">Carregando o alerta…</span>
                <EsqueletoListaAlertas />
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Formulário */}
      <Sheet open={formAberto && formulario !== null} onOpenChange={(aberto) => setFormAberto(aberto)}>
        <SheetContent
          side="right"
          rotuloFechar="Fechar o formulário (o que foi digitado fica guardado)"
          className="w-full gap-0 sm:max-w-[760px]"
          onCloseAutoFocus={(e) => {
            const origem = origemRef.current;
            if (origem && origem.isConnected) {
              e.preventDefault();
              origem.focus();
            }
          }}
        >
          <SheetHeader className="border-b border-border">
            <SheetTitle>{tituloForm}</SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-2">
              {formulario?.situacao ? <SeloSituacao situacao={formulario.situacao} /> : null}
              <span>Campos com * são obrigatórios para emitir. Datas no horário de Brasília.</span>
            </SheetDescription>
          </SheetHeader>
          {formulario ? (
            <FormularioEmissao
              key={formulario.alertaId ?? "novo"}
              valor={formulario}
              onMudar={(mudanca) => setFormulario((atual) => (atual ? (typeof mudanca === "function" ? mudanca(atual) : mudanca) : atual))}
              onEnviar={enviar}
              onConcluido={concluirFormulario}
              onDescartar={() => {
                setFormAberto(false);
                setFormulario(null);
                setErrosForm(null);
              }}
              onRecarregarVersao={recarregarVersaoFormulario}
              errosIniciais={errosForm}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function FilaVazia({ aba, comFiltros, onLimpar }: { aba: string; comFiltros: boolean; onLimpar: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-linha/20 px-4 py-10 text-center">
      <Inbox aria-hidden="true" className="size-7 text-mut" />
      <p className="text-[14px] font-semibold text-ink">
        Nenhum alerta em “{aba}”{comFiltros ? " com os filtros escolhidos" : ""}.
      </p>
      {comFiltros ? (
        <Button variant="link" onClick={onLimpar}>
          Limpar filtros
        </Button>
      ) : null}
    </div>
  );
}

function FilaIndisponivel({ mensagem, onTentar }: { mensagem: string; onTentar: () => void }) {
  return (
    <section
      aria-labelledby="fila-indisponivel"
      className="flex flex-col gap-3 rounded-[14px] border border-dashed border-alerta/45 bg-alerta/6 p-4"
    >
      <Badge variant="alerta" marcador>
        Indisponível
      </Badge>
      <h2 id="fila-indisponivel" className="text-[15px] font-bold uppercase tracking-[.03em] text-ink-forte">
        Fila de alertas indisponível
      </h2>
      <p className="text-[13px] text-ink-2">{mensagem}</p>
      <Button variant="outline" onClick={onTentar} className="w-fit">
        <RefreshCw aria-hidden="true" /> Tentar de novo
      </Button>
    </section>
  );
}
