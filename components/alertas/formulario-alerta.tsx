"use client";

import { Lightbulb, Lock, Plus, RefreshCw, Save, Send, TriangleAlert, Undo2, X } from "lucide-react";
import { useEffect, useId, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { AmostraNivel } from "@/components/risco/selo-nivel";
import { Button } from "@/components/ui/button";
import {
  CAP_CERTEZAS,
  CAP_RESPOSTAS,
  CAP_URGENCIAS,
  COBS_FEICAO,
  FONTES_GATILHO,
  NATUREZAS,
  TIPOS_RISCO_SALA,
  type TipoRiscoSala,
} from "@/lib/alertas/codigos";
import { PRAZO_PADRAO_HORAS } from "@/lib/alertas/dominio";
import { CORES_NIVEL, MATRIZ_HIDROLOGICA, NIVEIS_HIDROLOGICOS, NIVEIS_RISCO, type NivelRisco } from "@/lib/dominio/matrizes";
import { buscarFracao, FRACOES_CBMMG } from "@/lib/territorio/fracoes";
import { cn } from "@/lib/utils";

import { ehConflito, ErroApiAlertas, type RespostaAcao } from "./api";
import { rotuloFracao } from "./apresentacao";
import {
  AJUDA_CERTEZA,
  AJUDA_URGENCIA,
  avisosDoFormulario,
  errosPorCampo,
  eventosDoTipo,
  fracaoDoMunicipio,
  fracoesDoCob,
  mascararNumeroChamada,
  montarCorpoAlerta,
  municipioDaFracao,
  nivelAjustado,
  nivelEfetivo,
  NOMES_MUNICIPIOS,
  ORDEM_CAMPOS,
  primeiroErro,
  resolverMunicipio,
  sugestaoDoFormulario,
  territorioTravado,
  validarFormulario,
  type AcaoFormulario,
  type CampoFormulario,
  type DestinoAdicional,
  type ErrosFormulario,
  type FormularioAlerta,
} from "./formulario";
import {
  CLASSE_ENTRADA,
  CLASSE_OPCAO_CHIP,
  CLASSE_RADIO_OCULTO,
  CLASSE_SELECAO,
  CLASSE_TEXTO_LONGO,
  Campo,
  ErroCampo,
  SecaoFormulario,
} from "./campos";

/**
 * Formulário de emissão de alerta (só para quem tem capacidades.emitir).
 * Território em cascata COB → fração → município, tipo de risco com os
 * campos do tipo, NÍVEL SUGERIDO pela matriz ao vivo (o operador confirma ou
 * ajusta com justificativa), nº da chamada com máscara, validade e prazo,
 * texto CAP e destinatários.
 *
 * O estado mora no painel pai: fechar a gaveta não perde o que foi digitado.
 * A validação é a do servidor (formulario.ts); erros por campo com
 * aria-describedby e foco no primeiro erro.
 */

const ROTULOS_ERRO: Partial<Record<CampoFormulario, string>> = {
  geral: "Alerta",
  cob: "COB",
  fracao: "Fração",
  municipio: "Município",
  tipoRisco: "Tipo de risco",
  evento: "Evento",
  fonteGatilho: "Fonte que motivou",
  mmHora: "Chuva por hora",
  mm24h: "Chuva em 24 h",
  bacia: "Bacia",
  rio: "Rio",
  cota: "Cota",
  indiceRisco: "Índice de risco",
  nivel: "Nível",
  justificativaNivel: "Justificativa do nível",
  numeroChamada: "Nº da chamada CAD",
  validoAte: "Válido até",
  prazoAcao: "Prazo da ação RRD",
  titulo: "Título",
  descricao: "Descrição",
  instrucao: "Ação esperada",
  areaDesc: "Área do alerta",
  capUrgencia: "Urgência",
  capCerteza: "Certeza",
  destinatarios: "Destinatários",
};

function focarCampo(campo: CampoFormulario) {
  const el = document.getElementById(`campo-${campo}`);
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "center" });
}

/**
 * Depois de um envio recusado: o resumo dos erros sobe para o topo da área
 * rolável e o foco vai para o primeiro campo com erro (sem tirar o resumo da
 * tela quando o campo já está visível).
 */
function mostrarErros(campo: CampoFormulario) {
  requestAnimationFrame(() => {
    const resumo = document.getElementById("campo-geral");
    resumo?.scrollIntoView({ block: "start" });
    const el = document.getElementById(`campo-${campo}`);
    if (!el || campo === "geral") {
      resumo?.focus({ preventScroll: true });
      return;
    }
    const caixa = el.getBoundingClientRect();
    if (caixa.top >= 0 && caixa.bottom <= window.innerHeight - 80) el.focus({ preventScroll: true });
    else focarCampo(campo);
  });
}

export function FormularioEmissao({
  valor: f,
  onMudar,
  onEnviar,
  onConcluido,
  onDescartar,
  onRecarregarVersao,
  errosIniciais,
}: {
  valor: FormularioAlerta;
  onMudar: Dispatch<SetStateAction<FormularioAlerta>>;
  /** POST /api/alertas; lança ErroApiAlertas. */
  onEnviar: (corpo: Record<string, unknown>) => Promise<RespostaAcao>;
  onConcluido: (resposta: RespostaAcao, acao: AcaoFormulario) => void;
  onDescartar: () => void;
  /** 409: relê a versão gravada (mantendo o que foi digitado). */
  onRecarregarVersao: () => Promise<void>;
  /** Erros do servidor trazidos do detalhe ("Completar no formulário"). */
  errosIniciais?: ErroApiAlertas | null;
}) {
  // Vindo de um "emitir" recusado no detalhe: os erros são os da validação da tela (o espelho
  // do servidor) sobre o formulário já com os padrões (ex.: validade de 24 h preenchida).
  const [errosEnvio, setErros] = useState<ErrosFormulario>(() => (errosIniciais ? validarFormulario(f, "emitir", new Date()) : {}));
  /** Erros do servidor depois de um envio (a tela não os previu): somem quando o campo muda. */
  const [errosFixos, setErrosFixos] = useState<ErrosFormulario>({});
  /** Ação do último envio recusado: os erros somem da tela assim que o campo fica válido. */
  const [ultimaAcao, setUltimaAcao] = useState<AcaoFormulario>(errosIniciais ? "emitir" : "salvar");
  const [erroEnvio, setErroEnvio] = useState<ErroApiAlertas | null>(null);
  const [enviando, setEnviando] = useState<AcaoFormulario | null>(null);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const idLista = useId();
  const idResumo = useId();

  const vivos = useMemo(() => (Object.keys(errosEnvio).length ? validarFormulario(f, ultimaAcao, new Date()) : {}), [f, ultimaAcao, errosEnvio]);
  const erros = useMemo(() => {
    const visiveis: ErrosFormulario = { ...errosFixos };
    for (const [campo, mensagem] of Object.entries(errosEnvio) as [CampoFormulario, string | undefined][]) {
      if (mensagem && vivos[campo]) visiveis[campo] ??= mensagem;
    }
    return visiveis;
  }, [errosEnvio, errosFixos, vivos]);

  useEffect(() => {
    // Aberto por "Completar no formulário": o foco vai ao primeiro erro (depois do foco automático da gaveta).
    const p = primeiroErro(errosEnvio);
    if (errosIniciais && p) mostrarErros(p);
    // Só na montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const travado = territorioTravado(f);
  const sugestao = useMemo(() => sugestaoDoFormulario(f), [f]);
  const nivel = nivelEfetivo(f, sugestao);
  const ajustado = nivelAjustado(f, sugestao);
  const avisos = useMemo(() => avisosDoFormulario(f), [f]);
  const fracaoAtual = buscarFracao(f.fracao);
  const municipio = resolverMunicipio(f.municipio);
  const municipioSugerido = fracaoAtual ? municipioDaFracao(fracaoAtual) : null;
  const fracaoSugerida = !f.fracao && municipio ? fracaoDoMunicipio(municipio) : null;

  const limparFixos = (...campos: CampoFormulario[]) => {
    if (campos.some((c) => errosFixos[c])) {
      setErrosFixos((atual) => {
        const novo = { ...atual };
        for (const c of campos) delete novo[c];
        return novo;
      });
    }
  };

  const mudar = <K extends keyof FormularioAlerta>(campo: K, valor: FormularioAlerta[K]) => {
    onMudar((atual) => ({ ...atual, [campo]: valor }));
    limparFixos((campo === "nivelEscolhido" ? "nivel" : campo) as CampoFormulario);
  };

  const escolherCob = (cob: string) => {
    limparFixos("cob", "fracao");
    onMudar((atual) => {
      const manterFracao = buscarFracao(atual.fracao)?.cob === cob;
      return { ...atual, cob, fracao: manterFracao ? atual.fracao : "" };
    });
  };

  const escolherFracao = (codigo: string) => {
    limparFixos("fracao", "municipio", "destinatarios");
    onMudar((atual) => {
      const nova = buscarFracao(codigo);
      const anterior = buscarFracao(atual.fracao);
      const sugeridoAntes = anterior ? municipioDaFracao(anterior)?.nome : null;
      // O município acompanha a fração enquanto o operador não escolheu outro.
      const seguir = !atual.municipio.trim() || atual.municipio === sugeridoAntes;
      const sugerido = nova ? municipioDaFracao(nova) : null;
      return {
        ...atual,
        fracao: codigo,
        cob: nova?.cob ?? atual.cob,
        municipio: seguir && sugerido ? sugerido.nome : atual.municipio,
        // A principal muda: tira dos adicionais se repetida.
        destinatarios: atual.destinatarios.filter((d) => !(d.tipo === "fracao" && d.codigo === codigo)),
      };
    });
  };

  const usarFracaoSugerida = () => {
    if (!fracaoSugerida) return;
    limparFixos("cob", "fracao");
    onMudar((atual) => ({ ...atual, cob: fracaoSugerida.cob, fracao: fracaoSugerida.codigo }));
  };

  const escolherNivel = (n: NivelRisco) => mudar("nivelEscolhido", n === sugestao.nivel ? "" : n);

  const escolherTipo = (t: TipoRiscoSala) => {
    limparFixos("tipoRisco", "evento");
    onMudar((atual) => {
      const evento = eventosDoTipo(t).some((e) => e.codigo === atual.evento) ? atual.evento : "";
      return { ...atual, tipoRisco: t, evento };
    });
  };

  const enviar = async (acao: AcaoFormulario) => {
    setErroEnvio(null);
    const e = validarFormulario(f, acao, new Date());
    setErros(e);
    setErrosFixos({});
    setUltimaAcao(acao);
    const primeiro = primeiroErro(e);
    if (primeiro) {
      // Espera o resumo e as mensagens entrarem na tela antes de mover o foco.
      mostrarErros(primeiro);
      return;
    }
    setEnviando(acao);
    try {
      const resposta = await onEnviar(montarCorpoAlerta(f, acao));
      onConcluido(resposta, acao);
    } catch (erro) {
      const e2 = erro instanceof ErroApiAlertas ? erro : new ErroApiAlertas(0, "desconhecido", "Não foi possível gravar agora.");
      setErroEnvio(e2);
      if (e2.campos.length) {
        // A tela já tinha aprovado: o que o servidor recusou fica à vista até o campo mudar.
        const doServidor = errosPorCampo(e2.campos);
        setErros({});
        setErrosFixos(doServidor);
        const p = primeiroErro(doServidor);
        if (p) mostrarErros(p);
      }
    } finally {
      setEnviando(null);
    }
  };

  const recarregarVersao = async () => {
    await onRecarregarVersao();
    setErroEnvio(null);
  };

  const listaErros = ORDEM_CAMPOS.filter((c) => erros[c]).map((c) => [c, erros[c] as string] as const);
  const idDatalist = `${idLista}-municipios`;
  const nomeTipo = `${idLista}-tipo`;
  const nomeNivel = `${idLista}-nivel`;
  const nomePrazo = `${idLista}-prazo`;

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        // Enter num campo usa o primeiro botão de envio ("Salvar"): emitir só com clique no botão.
        void enviar(submitter?.value === "emitir" ? "emitir" : "salvar");
      }}
    >
      <div className="rolagem-fina min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-5">
        {listaErros.length > 0 ? (
          <div id="campo-geral" tabIndex={-1} role="alert" aria-labelledby={idResumo} className="mb-4 rounded-[12px] border border-perigo/40 bg-perigo/10 p-3.5">
            <p id={idResumo} className="flex items-center gap-2 text-[13.5px] font-bold text-ink">
              <TriangleAlert aria-hidden="true" className="size-4 text-perigo-txt" />
              {listaErros.length === 1 ? "Corrija 1 campo" : `Corrija ${listaErros.length} campos`}
            </p>
            <ul className="mt-2 space-y-1 pl-6 text-[13px]">
              {listaErros.map(([campo, mensagem]) => (
                <li key={campo} className="list-disc text-ink-2">
                  {campo === "geral" ? (
                    mensagem
                  ) : (
                    <a
                      href={`#campo-${campo}`}
                      className="font-semibold text-acc-txt underline underline-offset-2"
                      onClick={(ev) => {
                        ev.preventDefault();
                        focarCampo(campo);
                      }}
                    >
                      {ROTULOS_ERRO[campo] ?? campo}
                    </a>
                  )}
                  {campo === "geral" ? null : `: ${mensagem}`}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {travado ? (
          <p className="mb-4 flex items-start gap-2 rounded-[10px] border border-info/40 bg-info/10 px-3 py-2.5 text-[12.5px] leading-snug text-ink-2">
            <Lock aria-hidden="true" className="mt-px size-4 shrink-0 text-info-txt" />
            <span>
              Alerta já emitido: a atualização vai às unidades como <strong>CAP Update</strong>. Território, natureza e destinatários não mudam —
              para isso, cancele este alerta e emita outro.
            </span>
          </p>
        ) : null}

        <div className="flex flex-col gap-6">
          {/* ── Território ── */}
          <SecaoFormulario titulo="Território" descricao="COB → fração → município. A fração define a unidade principal (responsável pela ação RRD).">
            <Campo nome="cob" rotulo="COB" obrigatorio erro={erros.cob}>
              {(at) => (
                <select {...at} className={CLASSE_SELECAO} value={f.cob} disabled={travado} onChange={(e) => escolherCob(e.target.value)}>
                  <option value="">Escolha o COB…</option>
                  {COBS_FEICAO.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
            <Campo
              nome="fracao"
              rotulo="Fração (unidade principal)"
              obrigatorio
              erro={erros.fracao}
              ajuda={!f.cob ? "Escolha o COB primeiro." : fracaoAtual ? `${fracaoAtual.cob} · ${rotuloFracao(fracaoAtual)}` : undefined}
            >
              {(at) => (
                <select
                  {...at}
                  className={CLASSE_SELECAO}
                  value={f.fracao}
                  disabled={travado || !f.cob}
                  onChange={(e) => escolherFracao(e.target.value)}
                >
                  <option value="">{f.cob ? "Escolha a fração…" : "—"}</option>
                  {f.cob
                    ? fracoesDoCob(f.cob).map((g) => (
                        <optgroup key={g.ueop} label={g.ueop}>
                          {g.fracoes.map((fr) => (
                            <option key={fr.codigo} value={fr.codigo}>
                              {rotuloFracao(fr)}
                            </option>
                          ))}
                        </optgroup>
                      ))
                    : null}
                </select>
              )}
            </Campo>
            <Campo
              nome="municipio"
              rotulo="Município"
              obrigatorio
              erro={erros.municipio}
              ajuda={
                municipio
                  ? `IBGE ${municipio.ibge} · ${municipio.cob} (atribuição aproximada).`
                  : "Digite para buscar pelo nome (com ou sem acento)."
              }
            >
              {(at) => (
                <>
                  <input
                    {...at}
                    className={CLASSE_ENTRADA}
                    list={idDatalist}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={travado}
                    value={f.municipio}
                    placeholder="Ex.: Ouro Preto"
                    onChange={(e) => mudar("municipio", e.target.value)}
                  />
                  <datalist id={idDatalist}>
                    {NOMES_MUNICIPIOS.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </>
              )}
            </Campo>
            <Campo nome="localReferencia" rotulo="Local de referência" ajuda="Bairro, comunidade ou trecho (opcional).">
              {(at) => (
                <input {...at} className={CLASSE_ENTRADA} maxLength={255} value={f.localReferencia} onChange={(e) => mudar("localReferencia", e.target.value)} />
              )}
            </Campo>
            {!travado && (municipioSugerido || fracaoSugerida) ? (
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                {municipioSugerido && municipioSugerido.nome !== f.municipio ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => mudar("municipio", municipioSugerido.nome)}>
                    <Lightbulb aria-hidden="true" /> Usar {municipioSugerido.nome} (cidade da fração)
                  </Button>
                ) : null}
                {fracaoSugerida ? (
                  <Button type="button" size="sm" variant="outline" onClick={usarFracaoSugerida} className="h-auto min-h-[30px] whitespace-normal py-1.5 text-left">
                    <Lightbulb aria-hidden="true" /> Usar a fração {fracaoSugerida.cob} · {rotuloFracao(fracaoSugerida)} (mais próxima, aproximada)
                  </Button>
                ) : null}
              </div>
            ) : null}
            {avisos.length > 0 ? (
              <p className="flex items-start gap-2 rounded-[10px] border border-alerta/40 bg-alerta/10 px-3 py-2 text-[12.5px] leading-snug text-ink-2 sm:col-span-2">
                <TriangleAlert aria-hidden="true" className="mt-px size-4 shrink-0 text-alerta-txt" />
                <span>{avisos.join(" ")}</span>
              </p>
            ) : null}
            <Campo nome="natureza" rotulo="Natureza" ajuda="Exercício e teste não entram no mapa nem nos indicadores.">
              {(at) => (
                <select {...at} className={CLASSE_SELECAO} value={f.natureza} disabled={travado} onChange={(e) => mudar("natureza", e.target.value as FormularioAlerta["natureza"])}>
                  {NATUREZAS.map((n) => (
                    <option key={n.codigo} value={n.codigo}>
                      {n.rotulo}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
          </SecaoFormulario>

          {/* ── Risco ── */}
          <SecaoFormulario titulo="Risco">
            {/* radiogroup: papel em que a ARIA 1.2 prevê aria-invalid; a mensagem de erro liga no grupo E em cada rádio. */}
            <fieldset
              role="radiogroup"
              className="min-w-0 sm:col-span-2"
              aria-invalid={erros.tipoRisco ? true : undefined}
              aria-describedby={erros.tipoRisco ? "erro-tipoRisco" : undefined}
            >
              <legend className="mb-1.5 text-[12.5px] font-bold text-ink">
                Tipo de risco <span className="font-semibold text-mut" aria-hidden="true">*</span>
              </legend>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {TIPOS_RISCO_SALA.map((t, i) => (
                  <label key={t.codigo} className={CLASSE_OPCAO_CHIP}>
                    {/* Além do grupo, cada rádio leva aria-invalid e a mensagem: em modo de formulário o
                        leitor de tela chega direto na opção e anuncia "inválido" + "Obrigatório para emitir".
                        (A ARIA 1.2 não lista aria-invalid para "radio", mas Chrome e Firefox expõem o
                        estado e NVDA, JAWS e VoiceOver o anunciam.) */}
                    {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props */}
                    <input
                      type="radio"
                      id={i === 0 ? "campo-tipoRisco" : undefined}
                      name={nomeTipo}
                      value={t.codigo}
                      checked={f.tipoRisco === t.codigo}
                      onChange={() => escolherTipo(t.codigo)}
                      className={CLASSE_RADIO_OCULTO}
                      aria-invalid={erros.tipoRisco ? true : undefined}
                      aria-describedby={erros.tipoRisco ? "erro-tipoRisco" : undefined}
                    />
                    {t.rotulo}
                  </label>
                ))}
              </div>
              <ErroCampo id="erro-tipoRisco" mensagem={erros.tipoRisco} />
            </fieldset>
            <Campo nome="evento" rotulo="Evento" obrigatorio erro={erros.evento} ajuda={f.tipoRisco ? undefined : "Escolha o tipo de risco para ver os eventos."}>
              {(at) => (
                <select {...at} className={CLASSE_SELECAO} value={f.evento} onChange={(e) => mudar("evento", e.target.value as FormularioAlerta["evento"])}>
                  <option value="">Escolha o evento…</option>
                  {eventosDoTipo(f.tipoRisco).map((e) => (
                    <option key={e.codigo} value={e.codigo}>
                      {e.rotulo}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
            <Campo nome="fonteGatilho" rotulo="Fonte que motivou" obrigatorio erro={erros.fonteGatilho}>
              {(at) => (
                <select {...at} className={CLASSE_SELECAO} value={f.fonteGatilho} onChange={(e) => mudar("fonteGatilho", e.target.value as FormularioAlerta["fonteGatilho"])}>
                  <option value="">Escolha a fonte…</option>
                  {FONTES_GATILHO.map((o) => (
                    <option key={o.codigo} value={o.codigo}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
            <Campo nome="fonteRef" rotulo="Referência da fonte" ajuda="Ex.: nº do aviso do INMET, boletim do SACE (opcional)." erro={erros.fonteRef} className="sm:col-span-2">
              {(at) => <input {...at} className={CLASSE_ENTRADA} maxLength={255} value={f.fonteRef} onChange={(e) => mudar("fonteRef", e.target.value)} />}
            </Campo>

            {f.tipoRisco === "METEOROLOGICO" ? (
              <>
                <Campo nome="mmHora" rotulo="Chuva por hora (mm/h)" erro={erros.mmHora} ajuda="Informe mm/h, mm em 24 h ou os dois.">
                  {(at) => <input {...at} inputMode="decimal" className={CLASSE_ENTRADA} value={f.mmHora} onChange={(e) => mudar("mmHora", e.target.value)} placeholder="Ex.: 45" />}
                </Campo>
                <Campo nome="mm24h" rotulo="Chuva em 24 h (mm)" erro={erros.mm24h}>
                  {(at) => <input {...at} inputMode="decimal" className={CLASSE_ENTRADA} value={f.mm24h} onChange={(e) => mudar("mm24h", e.target.value)} placeholder="Ex.: 100" />}
                </Campo>
              </>
            ) : null}
            {f.tipoRisco === "HIDROLOGICO" ? (
              <>
                <Campo nome="bacia" rotulo="Bacia" obrigatorio erro={erros.bacia}>
                  {(at) => <input {...at} className={CLASSE_ENTRADA} maxLength={120} value={f.bacia} onChange={(e) => mudar("bacia", e.target.value)} placeholder="Ex.: Rio Doce" />}
                </Campo>
                <Campo nome="rio" rotulo="Rio" obrigatorio erro={erros.rio}>
                  {(at) => <input {...at} className={CLASSE_ENTRADA} maxLength={120} value={f.rio} onChange={(e) => mudar("rio", e.target.value)} placeholder="Ex.: Rio Piracicaba" />}
                </Campo>
                <Campo nome="cota" rotulo="Cota do rio (cm)" obrigatorio erro={erros.cota}>
                  {(at) => <input {...at} inputMode="decimal" className={CLASSE_ENTRADA} value={f.cota} onChange={(e) => mudar("cota", e.target.value)} placeholder="Ex.: 420" />}
                </Campo>
                <Campo nome="estacaoCodigo" rotulo="Código da estação" ajuda="Opcional (SACE/ANA)." erro={erros.estacaoCodigo}>
                  {(at) => <input {...at} className={CLASSE_ENTRADA} maxLength={30} value={f.estacaoCodigo} onChange={(e) => mudar("estacaoCodigo", e.target.value)} />}
                </Campo>
                <Campo
                  nome="situacaoSace"
                  rotulo="Situação da estação no SACE"
                  ajuda="Só para a sugestão do nível: cada estação tem as próprias cotas de referência."
                  className="sm:col-span-2"
                >
                  {(at) => (
                    <select {...at} className={CLASSE_SELECAO} value={f.situacaoSace} onChange={(e) => mudar("situacaoSace", e.target.value as FormularioAlerta["situacaoSace"])}>
                      <option value="">Não informada</option>
                      {NIVEIS_HIDROLOGICOS.map((n) => (
                        <option key={n} value={n}>
                          {MATRIZ_HIDROLOGICA[n].rotulo}
                        </option>
                      ))}
                    </select>
                  )}
                </Campo>
              </>
            ) : null}
            {f.tipoRisco === "GEOLOGICO" ? (
              <Campo nome="indiceRisco" rotulo="Índice de risco (GeoRisk/CEMADEN)" obrigatorio erro={erros.indiceRisco}>
                {(at) => <input {...at} inputMode="decimal" className={CLASSE_ENTRADA} value={f.indiceRisco} onChange={(e) => mudar("indiceRisco", e.target.value)} placeholder="Ex.: 2,1" />}
              </Campo>
            ) : null}
            {f.tipoRisco === "TECNOLOGICO" ? (
              <p className="text-[12.5px] text-mut sm:col-span-2">Risco tecnológico não tem matriz: escolha o nível abaixo.</p>
            ) : null}
          </SecaoFormulario>

          {/* ── Nível ── */}
          <SecaoFormulario titulo="Nível do alerta">
            <div aria-live="polite" className="rounded-[12px] border border-acc/30 bg-acc/6 px-3.5 py-3 sm:col-span-2">
              {sugestao.nivel ? (
                <>
                  <p className="flex items-start gap-2 text-[14px] font-bold text-ink">
                    <AmostraNivel nivel={sugestao.nivel} className="mt-0.5 size-4 rounded-[4px]" />
                    <span>
                      Sugerido: {sugestao.titulo}
                      {sugestao.porque ? <span className="font-semibold text-ink-2">, porque {sugestao.porque}</span> : null}
                    </span>
                  </p>
                  <p className="mt-1 text-[12px] leading-snug text-mut">{sugestao.fundamento}</p>
                </>
              ) : (
                <p className="flex items-start gap-2 text-[12.5px] leading-snug text-ink-2">
                  <Lightbulb aria-hidden="true" className="mt-px size-4 shrink-0 text-acc-txt" />
                  <span>Sem sugestão da matriz: {sugestao.fundamento}</span>
                </p>
              )}
            </div>
            <fieldset
              role="radiogroup"
              className="min-w-0 sm:col-span-2"
              aria-invalid={erros.nivel ? true : undefined}
              aria-describedby={erros.nivel ? "erro-nivel" : undefined}
            >
              <legend className="mb-1.5 text-[12.5px] font-bold text-ink">
                {sugestao.nivel ? "Confirme ou ajuste o nível" : "Escolha o nível"}{" "}
                <span className="font-semibold text-mut" aria-hidden="true">*</span>
              </legend>
              <div className="grid grid-cols-2 gap-1.5 min-[440px]:grid-cols-3 sm:grid-cols-5">
                {NIVEIS_RISCO.map((n, i) => (
                  <label key={n} className={CLASSE_OPCAO_CHIP}>
                    {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props -- ver o grupo "Tipo de risco" */}
                    <input
                      type="radio"
                      id={i === 0 ? "campo-nivel" : undefined}
                      name={nomeNivel}
                      value={n}
                      checked={nivel === n}
                      onChange={() => escolherNivel(n)}
                      className={CLASSE_RADIO_OCULTO}
                      aria-invalid={erros.nivel ? true : undefined}
                      aria-describedby={erros.nivel ? "erro-nivel" : undefined}
                    />
                    <AmostraNivel nivel={n} className="size-3.5 rounded-[3px]" />
                    <span className="flex flex-col leading-tight">
                      <span>{CORES_NIVEL[n].nome}</span>
                      {sugestao.nivel === n ? (
                        // Marcado, a tinta é a do chip (text-acc-txt): text-mut sobre bg-acc/16 dava 4,06:1 no escuro.
                        <span className={cn("text-[10.5px] font-bold uppercase tracking-[.06em]", nivel === n ? "text-acc-txt" : "text-mut")}>
                          sugerido
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
              <ErroCampo id="erro-nivel" mensagem={erros.nivel} />
              {nivel ? (
                <p className="mt-1.5 text-[12px] text-mut">
                  Prazo padrão da ação RRD para {CORES_NIVEL[nivel].nome.toLowerCase()}: {PRAZO_PADRAO_HORAS[nivel]} h após a emissão.
                </p>
              ) : null}
            </fieldset>
            {ajustado ? (
              <Campo
                nome="justificativaNivel"
                rotulo="Por que o nível difere do sugerido?"
                obrigatorio
                erro={erros.justificativaNivel}
                ajuda="Frase curta. Vai no fim da descrição, para a unidade saber o motivo."
                className="sm:col-span-2"
              >
                {(at) => (
                  <>
                    <input
                      {...at}
                      className={CLASSE_ENTRADA}
                      maxLength={300}
                      value={f.justificativaNivel}
                      onChange={(e) => mudar("justificativaNivel", e.target.value)}
                      placeholder="Ex.: solo encharcado após três dias de chuva"
                    />
                    <Button type="button" variant="link" size="sm" className="mt-1 px-0" onClick={() => mudar("nivelEscolhido", "")}>
                      <Undo2 aria-hidden="true" /> Usar o nível sugerido
                    </Button>
                  </>
                )}
              </Campo>
            ) : null}
          </SecaoFormulario>

          {/* ── Chamada, validade e prazo ── */}
          <SecaoFormulario titulo="Chamada, validade e prazo">
            <Campo nome="numeroChamada" rotulo="Nº da chamada CAD" obrigatorio erro={erros.numeroChamada} ajuda="Formato AAAA-NNNNNNNN-N. Os hífens entram sozinhos.">
              {(at) => (
                <input
                  {...at}
                  inputMode="numeric"
                  autoComplete="off"
                  className={cn(CLASSE_ENTRADA, "tabular-nums")}
                  value={f.numeroChamada}
                  placeholder="2026-12345678-9"
                  onChange={(e) => mudar("numeroChamada", mascararNumeroChamada(e.target.value))}
                />
              )}
            </Campo>
            <Campo nome="validoAte" rotulo="Válido até (Brasília)" obrigatorio erro={erros.validoAte} ajuda={travado ? undefined : "Padrão: 24 h a partir de agora."}>
              {(at) => <input {...at} type="datetime-local" className={CLASSE_ENTRADA} value={f.validoAte} onChange={(e) => mudar("validoAte", e.target.value)} />}
            </Campo>
            <fieldset className="min-w-0 sm:col-span-2">
              <legend className="mb-1.5 text-[12.5px] font-bold text-ink">Prazo da ação RRD</legend>
              {travado ? null : (
                <div className="mb-2.5 grid grid-cols-1 gap-1.5 min-[440px]:grid-cols-2">
                  <label className={CLASSE_OPCAO_CHIP}>
                    <input
                      type="radio"
                      name={nomePrazo}
                      checked={f.prazoModo === "padrao"}
                      onChange={() => mudar("prazoModo", "padrao")}
                      className={CLASSE_RADIO_OCULTO}
                    />
                    Pelo nível{nivel ? ` (${PRAZO_PADRAO_HORAS[nivel]} h após emitir)` : ""}
                  </label>
                  <label className={CLASSE_OPCAO_CHIP}>
                    <input
                      type="radio"
                      name={nomePrazo}
                      checked={f.prazoModo === "definido"}
                      onChange={() => mudar("prazoModo", "definido")}
                      className={CLASSE_RADIO_OCULTO}
                    />
                    Definir data e hora
                  </label>
                </div>
              )}
              {f.prazoModo === "definido" || travado ? (
                <Campo nome="prazoAcao" rotulo="Prazo (Brasília)" erro={erros.prazoAcao}>
                  {(at) => <input {...at} type="datetime-local" className={CLASSE_ENTRADA} value={f.prazoAcao} onChange={(e) => mudar("prazoAcao", e.target.value)} />}
                </Campo>
              ) : (
                <ErroCampo id="erro-prazoAcao" mensagem={erros.prazoAcao} />
              )}
            </fieldset>
          </SecaoFormulario>

          {/* ── Mensagem CAP ── */}
          <SecaoFormulario titulo="Mensagem do alerta (CAP)" descricao="O texto que a unidade recebe. Escreva para quem vai agir.">
            <Campo nome="titulo" rotulo="Título" obrigatorio erro={erros.titulo} className="sm:col-span-2">
              {(at) => (
                <input {...at} className={CLASSE_ENTRADA} maxLength={160} value={f.titulo} onChange={(e) => mudar("titulo", e.target.value)} placeholder="Ex.: Chuva forte em Ouro Preto nas próximas 6 h" />
              )}
            </Campo>
            <Campo nome="descricao" rotulo="Descrição" obrigatorio erro={erros.descricao} className="sm:col-span-2">
              {(at) => <textarea {...at} className={CLASSE_TEXTO_LONGO} maxLength={3600} value={f.descricao} onChange={(e) => mudar("descricao", e.target.value)} placeholder="O que está previsto ou acontecendo, onde e quando." />}
            </Campo>
            <Campo nome="instrucao" rotulo="Ação esperada da unidade" obrigatorio erro={erros.instrucao} className="sm:col-span-2">
              {(at) => <textarea {...at} className={CLASSE_TEXTO_LONGO} maxLength={2000} value={f.instrucao} onChange={(e) => mudar("instrucao", e.target.value)} placeholder="Ex.: vistoria nas áreas de risco R3/R4 e orientação aos moradores." />}
            </Campo>
            <Campo
              nome="areaDesc"
              rotulo="Área do alerta"
              erro={erros.areaDesc}
              ajuda={municipio ? `Em branco, vai "${municipio.nome}/MG${f.localReferencia.trim() ? ` — ${f.localReferencia.trim()}` : ""}".` : "Em branco, vai o município (e o local de referência)."}
              className="sm:col-span-2"
            >
              {(at) => <input {...at} className={CLASSE_ENTRADA} maxLength={500} value={f.areaDesc} onChange={(e) => mudar("areaDesc", e.target.value)} />}
            </Campo>
            <Campo nome="capUrgencia" rotulo="Urgência" obrigatorio erro={erros.capUrgencia} ajuda={AJUDA_URGENCIA}>
              {(at) => (
                <select {...at} className={CLASSE_SELECAO} value={f.capUrgencia} onChange={(e) => mudar("capUrgencia", e.target.value as FormularioAlerta["capUrgencia"])}>
                  {CAP_URGENCIAS.map((o) => (
                    <option key={o.codigo} value={o.codigo}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
            <Campo nome="capCerteza" rotulo="Certeza" obrigatorio erro={erros.capCerteza} ajuda={AJUDA_CERTEZA}>
              {(at) => (
                <select {...at} className={CLASSE_SELECAO} value={f.capCerteza} onChange={(e) => mudar("capCerteza", e.target.value as FormularioAlerta["capCerteza"])}>
                  {CAP_CERTEZAS.map((o) => (
                    <option key={o.codigo} value={o.codigo}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
            <Campo nome="capResposta" rotulo="Resposta esperada (opcional)" erro={erros.capResposta} ajuda="O tipo de ação recomendada, no vocabulário CAP.">
              {(at) => (
                <select {...at} className={CLASSE_SELECAO} value={f.capResposta} onChange={(e) => mudar("capResposta", e.target.value as FormularioAlerta["capResposta"])}>
                  <option value="">Não informar</option>
                  {CAP_RESPOSTAS.map((o) => (
                    <option key={o.codigo} value={o.codigo}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
          </SecaoFormulario>

          {/* ── Destinatários ── */}
          <Destinatarios f={f} travado={travado} erro={erros.destinatarios} onMudar={(d) => mudar("destinatarios", d)} />
        </div>
      </div>

      {/* Rodapé fixo com os botões */}
      <div className="border-t border-border bg-sup-1 px-4 py-3 sm:px-5">
        {erroEnvio && (ehConflito(erroEnvio) || erroEnvio.campos.length === 0) ? (
          <div role="alert" className="mb-3 rounded-[10px] border border-perigo/40 bg-perigo/10 px-3 py-2.5 text-[13px] text-ink">
            <p className="flex items-start gap-2 font-semibold">
              <TriangleAlert aria-hidden="true" className="mt-px size-4 shrink-0 text-perigo-txt" />
              {erroEnvio.message}
            </p>
            {ehConflito(erroEnvio) ? (
              <Button type="button" size="sm" variant="outline" className="mt-2 ml-6" onClick={recarregarVersao}>
                <RefreshCw aria-hidden="true" /> Recarregar alerta
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {travado ? (
            <Button type="submit" value="salvar" disabled={enviando !== null}>
              <Save aria-hidden="true" /> {enviando ? "Salvando…" : "Salvar atualização"}
            </Button>
          ) : (
            <>
              <Button type="submit" value="salvar" variant="secondary" disabled={enviando !== null}>
                <Save aria-hidden="true" /> {enviando === "salvar" ? "Salvando…" : "Salvar rascunho"}
              </Button>
              <Button type="submit" value="emitir" disabled={enviando !== null}>
                <Send aria-hidden="true" /> {enviando === "emitir" ? "Emitindo…" : "Emitir alerta"}
              </Button>
            </>
          )}
          <span className="ml-auto" />
          {confirmarDescarte ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-ink-2">Descartar o que não foi salvo?</span>
              <Button type="button" variant="destructive" size="sm" onClick={onDescartar}>
                Descartar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmarDescarte(false)}>
                Não
              </Button>
            </span>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setConfirmarDescarte(true)} disabled={enviando !== null}>
              <X aria-hidden="true" /> Descartar
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

// ── Destinatários ──────────────────────────────────────────────────────────

function rotuloDestino(d: DestinoAdicional): string {
  if (d.tipo === "cob") return `${d.cob} (COB inteiro)`;
  const fr = buscarFracao(d.codigo);
  return fr ? `${fr.cob} · ${rotuloFracao(fr)}` : d.codigo;
}

function mesmoDestino(a: DestinoAdicional, b: DestinoAdicional): boolean {
  return a.tipo === b.tipo && (a.tipo === "cob" ? a.cob === (b as typeof a).cob : a.codigo === (b as typeof a).codigo);
}

function Destinatarios({
  f,
  travado,
  erro,
  onMudar,
}: {
  f: FormularioAlerta;
  travado: boolean;
  erro?: string;
  onMudar: (d: DestinoAdicional[]) => void;
}) {
  const [escolha, setEscolha] = useState("");
  const principal = buscarFracao(f.fracao);
  const lista = f.destinatarios;

  const adicionar = (d: DestinoAdicional) => {
    if (principal && d.tipo === "fracao" && d.codigo === principal.codigo) return;
    if (lista.some((x) => mesmoDestino(x, d))) return;
    onMudar([...lista, d]);
  };

  const adicionarEscolha = () => {
    if (!escolha) return;
    adicionar(escolha.startsWith("cob:") ? { tipo: "cob", cob: escolha.slice(4) } : { tipo: "fracao", codigo: escolha });
    setEscolha("");
  };

  // Atalhos: a sede da UEOp e o COB da fração principal acompanham o alerta.
  const sedeUeop = principal?.fracao ? FRACOES_CBMMG.find((x) => x.cob === principal.cob && x.ueop === principal.ueop && x.fracao === null) : null;
  const atalhos: DestinoAdicional[] = [];
  if (sedeUeop) atalhos.push({ tipo: "fracao", codigo: sedeUeop.codigo });
  if (principal && principal.ueop !== principal.cob) atalhos.push({ tipo: "cob", cob: principal.cob });
  const atalhosLivres = atalhos.filter((a) => !lista.some((x) => mesmoDestino(x, a)));

  return (
    <SecaoFormulario titulo="Destinatários" descricao="A unidade principal é a fração escolhida; ela responde pela ação RRD. Acrescente quem também deve ser notificado.">
      <div className="min-w-0 sm:col-span-2">
        <p className="text-[12.5px] font-bold text-ink">Unidade principal</p>
        <p className="mt-1 text-[13px] text-ink-2">
          {principal ? (
            <>
              {principal.cob} · {rotuloFracao(principal)}
            </>
          ) : (
            <span className="text-mut">Escolha a fração no território.</span>
          )}
        </p>
      </div>
      <div className="min-w-0 sm:col-span-2">
        <p className="text-[12.5px] font-bold text-ink">Outras unidades notificadas ({lista.length})</p>
        {lista.length === 0 ? (
          <p className="mt-1 text-[12.5px] text-mut">Nenhuma.</p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {lista.map((d) => (
              <li key={d.tipo === "cob" ? `cob:${d.cob}` : d.codigo} className="flex min-w-0 items-center justify-between gap-2 rounded-[9px] border border-border bg-linha/3 py-1 pr-1 pl-3">
                <span className="min-w-0 text-[13px] text-ink">{rotuloDestino(d)}</span>
                {travado ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remover ${rotuloDestino(d)}`}
                    onClick={() => onMudar(lista.filter((x) => !mesmoDestino(x, d)))}
                  >
                    <X aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {travado ? null : (
        <>
          {atalhosLivres.length > 0 ? (
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              {atalhosLivres.map((a) => (
                <Button key={a.tipo === "cob" ? a.cob : a.codigo} type="button" size="sm" variant="outline" onClick={() => adicionar(a)}>
                  <Plus aria-hidden="true" /> {rotuloDestino(a)}
                </Button>
              ))}
            </div>
          ) : null}
          <Campo nome="destinatarios" rotulo="Acrescentar unidade" erro={erro} className="sm:col-span-2">
            {(at) => (
              <div className="flex min-w-0 gap-2">
                <select {...at} className={cn(CLASSE_SELECAO, "flex-1")} value={escolha} onChange={(e) => setEscolha(e.target.value)}>
                  <option value="">Escolha a unidade…</option>
                  {COBS_FEICAO.map((cob) => (
                    <optgroup key={cob} label={cob}>
                      <option value={`cob:${cob}`}>{cob} (COB inteiro)</option>
                      {FRACOES_CBMMG.filter((x) => x.cob === cob && x.codigo !== principal?.codigo).map((x) => (
                        <option key={x.codigo} value={x.codigo}>
                          {rotuloFracao(x)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <Button type="button" variant="outline" onClick={adicionarEscolha} disabled={!escolha} className="h-10 pointer-coarse:h-11">
                  <Plus aria-hidden="true" /> Adicionar
                </Button>
              </div>
            )}
          </Campo>
        </>
      )}
    </SecaoFormulario>
  );
}
