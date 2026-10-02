import { deslocamentoAte } from "@/lib/sources/exemplos/deslocar";
import { camposDaCamada, type AtributosEsri, type CamadaSala, type FeicaoPontoEsri } from "./feicao";
import type { ConteudoSala } from "./memoria";

/**
 * Dados de EXEMPLO da fila de alertas (modo DADOS_EXEMPLO=1 e testes).
 *
 * Estão no FORMATO BRUTO das camadas SalaSituacao_AlertasRRD — atributos com
 * os nomes exatos do script, datas em epoch ms, ponto em WGS84 — e passam pela
 * MESMA conversão da produção (feicao.ts) dentro do armazém em memória.
 *
 * Dez alertas em todos os estados do fluxo (rascunho, emitido no prazo e
 * vencido, ciente, em ação, ação registrada, encerrado, cancelado, exercício
 * e vigência expirada), em municípios reais com a fração oficial do mesmo COB.
 * Nº de chamada, textos e pseudônimos são fictícios; o de Governador
 * Valadares repete de propósito a chamada de um alerta do Survey123 de
 * exemplo, para mostrar a deduplicação da camada "Alertas do CBMMG" (§4.6).
 * Sem `cap_json` (a mensagem CAP é montada nas emissões reais).
 *
 * Determinístico: as datas são relativas a REFERENCIA_ALERTAS_EXEMPLO e são
 * deslocadas para "agora"; os códigos AL-/AC- são renumerados pelo dia de
 * Brasília da criação já deslocada, como o servidor faria.
 */

/** 02/10/2026 12:00 em Brasília: a mesma referência dos outros exemplos. */
export const REFERENCIA_ALERTAS_EXEMPLO = "2026-10-02T15:00:00.000Z";

const R = Date.parse(REFERENCIA_ALERTAS_EXEMPLO);
const H = 3_600_000;
const M = 60_000;

// Pseudônimos FICTÍCIOS (32 hex), como o servidor gravaria. Nenhum nome, CPF ou nº BM.
const SALA_1 = "3f6c1a9e0b7d4f2a8c5e1b3d7f9a0c2e";
const SALA_2 = "a81d5e3c7b9f2046d1e8c3a5b7f90d24";
const UN_MURIAE = "5be0c47a19d36f82e0a4c6b8d2f1e937";
const UN_OURO_PRETO = "c7a3e9f15b2d4086a1c3e5f7b9d0284f";
const UN_UBERABA = "9d1f3b5a7c0e2468ace0b2d4f6a8c13e";
const UN_GV = "e4c2a0f8d6b4927e5c3a1f9d7b5e30c8";

interface Destino {
  nivel: "COB" | "UEOP" | "FRACAO";
  cob: string;
  ueop: string | null;
  fracao: string | null;
  principal: boolean;
  ciente?: { em: number; por: string; dominio: string };
}

interface Exemplo {
  alerta: AtributosEsri;
  ponto: { x: number; y: number };
  destinos: Destino[];
  /** [evento, instante, por, domínio, de, para, extras]. */
  historico: [string, number, string, string, string | null, string | null, Partial<AtributosEsri>?][];
  acoes?: AtributosEsri[];
}

function alerta(a: AtributosEsri): AtributosEsri {
  return {
    lote_id: a.alerta_id,
    natureza: "REAL",
    origem_registro: "SALA",
    cap_escopo: "Restricted",
    cap_msg_type: a.data_emissao ? "Alert" : null,
    cap_identifier: a.data_emissao ? `BR-MG-CBMMG-SALA-${a.alerta_id}` : null,
    ...a,
  };
}

const EXEMPLOS: Exemplo[] = [
  {
    // Encerrado: ação concluída e alerta fechado pela Sala.
    alerta: alerta({
      alerta_id: "AL-20260930-0001",
      situacao: "ENCERRADO",
      fonte_gatilho: "SGB_SACE",
      fonte_ref: "SACE — boletim do Rio Muriaé",
      tipo_risco: "HIDROLOGICO",
      evento: "ALAGAMENTO",
      nivel_alerta: "AMARELO",
      numero_chamada: "2026-12290117-4",
      bacia: "Rio Paraíba do Sul",
      rio: "Rio Muriaé",
      cota: 410,
      cob: "3º COB",
      ueop: "4º BBM",
      fracao: "2ª Cia/2º Pel (Muriaé)",
      municipio: "Muriaé",
      cod_ibge: "3143906",
      local_referencia: "Bairro Barra e Avenida Beira Rio",
      titulo: "Alagamento previsto em vias marginais do Rio Muriaé",
      descricao: "Cota do Rio Muriaé em elevação após chuva persistente na cabeceira. Possível alagamento de vias marginais.",
      instrucao: "Vistoriar pontos críticos da Avenida Beira Rio e orientar moradores das áreas baixas.",
      area_desc: "Muriaé/MG — Bairro Barra e Avenida Beira Rio",
      cap_urgencia: "Expected",
      cap_certeza: "Likely",
      cap_resposta: "Monitor",
      data_emissao: R - 48 * H,
      inicio_vigencia: R - 48 * H,
      valido_ate: R - 24 * H,
      prazo_acao: R - 36 * H,
      encerrado_em: R - 30 * H,
      criado_por_id: SALA_1,
      criado_em: R - 49 * H,
      emitido_por_id: SALA_1,
      emitido_por_dominio: "SALA",
      alterado_por_id: SALA_2,
      alterado_em: R - 30 * H,
    }),
    ponto: { x: -42.3693, y: -21.13 },
    destinos: [
      {
        nivel: "FRACAO",
        cob: "3º COB",
        ueop: "4º BBM",
        fracao: "2ª Cia/2º Pel (Muriaé)",
        principal: true,
        ciente: { em: R - 47 * H, por: UN_MURIAE, dominio: "3º COB" },
      },
    ],
    acoes: [
      {
        acao_id: "AC-20260930-0001",
        tipo_acao: "VISTORIA",
        resultado: "CONCLUIDA",
        acao_executada: "Vistoria nos pontos críticos da Avenida Beira Rio; 2 vias interditadas pela prefeitura.",
        data_acao: R - 40 * H,
        pessoas_orientadas: 42,
        imoveis_vistoriados: 15,
        efetivo_empregado: 6,
        viaturas_empregadas: 2,
        compdec_acionada: "S",
        registrado_por_id: UN_MURIAE,
        registrado_por_dominio: "3º COB",
        criado_em: R - 40 * H,
      },
    ],
    historico: [
      ["CRIADO", R - 49 * H, SALA_1, "SALA", null, "RASCUNHO"],
      ["EMITIDO", R - 48 * H, SALA_1, "SALA", "RASCUNHO", "EMITIDO", { cap_msg_type: "Alert" }],
      ["NOTIFICADO", R - 48 * H, SALA_1, "SALA", null, null, { alvo_tipo: "DESTINATARIO", detalhe: "3º COB · 4º BBM · 2ª Cia/2º Pel (Muriaé) (principal) · SISTEMA" }],
      ["CIENTE", R - 47 * H, UN_MURIAE, "3º COB", "EMITIDO", "CIENTE", { alvo_tipo: "DESTINATARIO" }],
      ["ACAO_REGISTRADA", R - 40 * H, UN_MURIAE, "3º COB", "CIENTE", "ACAO_REGISTRADA", { alvo_tipo: "ACAO", detalhe: "VISTORIA · CONCLUIDA" }],
      ["ENCERRADO", R - 30 * H, SALA_2, "SALA", "ACAO_REGISTRADA", "ENCERRADO"],
    ],
  },
  {
    // Emitido há 30 h: prazo vencido e vigência expirada, sem ciência.
    alerta: alerta({
      alerta_id: "AL-20261001-0001",
      situacao: "EMITIDO",
      fonte_gatilho: "INMET",
      fonte_ref: "INMET — aviso de acumulado de chuva",
      tipo_risco: "METEOROLOGICO",
      evento: "CHUVA_INTENSA",
      nivel_alerta: "LARANJA",
      numero_chamada: "2026-12318842-0",
      mm_hora: 42,
      mm_24h: 95,
      cob: "4º COB",
      ueop: "7º BBM",
      fracao: null,
      municipio: "Montes Claros",
      cod_ibge: "3143302",
      titulo: "Chuva forte em Montes Claros",
      descricao: "Previsão de chuva forte, com até 42 mm/h e acumulado de 95 mm em 24 h.",
      instrucao: "Intensificar vistorias em áreas vulneráveis e manter equipes de prontidão.",
      area_desc: "Montes Claros/MG",
      cap_urgencia: "Expected",
      cap_certeza: "Likely",
      cap_resposta: "Prepare",
      data_emissao: R - 30 * H,
      inicio_vigencia: R - 30 * H,
      valido_ate: R - 6 * H,
      prazo_acao: R - 24 * H,
      criado_por_id: SALA_2,
      criado_em: R - 30 * H - 10 * M,
      emitido_por_id: SALA_2,
      emitido_por_dominio: "SALA",
      alterado_por_id: SALA_2,
      alterado_em: R - 30 * H,
    }),
    ponto: { x: -43.8578, y: -16.7282 },
    destinos: [{ nivel: "UEOP", cob: "4º COB", ueop: "7º BBM", fracao: null, principal: true }],
    historico: [
      ["CRIADO", R - 30 * H - 10 * M, SALA_2, "SALA", null, "RASCUNHO"],
      ["EMITIDO", R - 30 * H, SALA_2, "SALA", "RASCUNHO", "EMITIDO", { cap_msg_type: "Alert" }],
      ["NOTIFICADO", R - 30 * H, SALA_2, "SALA", null, null, { alvo_tipo: "DESTINATARIO", detalhe: "4º COB · 7º BBM (principal) · SISTEMA" }],
    ],
  },
  {
    // Ação RRD concluída, aguardando a Sala encerrar.
    alerta: alerta({
      alerta_id: "AL-20261001-0002",
      situacao: "ACAO_REGISTRADA",
      fonte_gatilho: "CEMADEN",
      fonte_ref: "CEMADEN — movimento de massa, risco alto",
      tipo_risco: "GEOLOGICO",
      evento: "DESLIZAMENTO",
      nivel_alerta: "LARANJA",
      numero_chamada: "2026-12333015-2",
      indice_risco: 1.9,
      cob: "1º COB",
      ueop: "1º BBM",
      fracao: "2ª Cia/1º Pel (Ouro Preto)",
      municipio: "Ouro Preto",
      cod_ibge: "3146107",
      local_referencia: "Morro da Queimada e Taquaral",
      titulo: "Risco alto de deslizamento em encostas de Ouro Preto",
      descricao: "Índice GeoRisk 1,9 (alto) após acumulado elevado. Encostas com histórico de escorregamento.",
      instrucao: "Vistoria preventiva nas encostas e orientação porta a porta aos moradores.",
      area_desc: "Ouro Preto/MG — Morro da Queimada e Taquaral",
      cap_urgencia: "Expected",
      cap_certeza: "Likely",
      cap_resposta: "Assess",
      data_emissao: R - 20 * H,
      inicio_vigencia: R - 20 * H,
      valido_ate: R + 4 * H,
      prazo_acao: R - 14 * H,
      criado_por_id: SALA_1,
      criado_em: R - 20 * H - 30 * M,
      emitido_por_id: SALA_1,
      emitido_por_dominio: "SALA",
      alterado_por_id: UN_OURO_PRETO,
      alterado_em: R - 16 * H,
    }),
    ponto: { x: -43.5047, y: -20.3858 },
    destinos: [
      {
        nivel: "FRACAO",
        cob: "1º COB",
        ueop: "1º BBM",
        fracao: "2ª Cia/1º Pel (Ouro Preto)",
        principal: true,
        ciente: { em: R - 19 * H, por: UN_OURO_PRETO, dominio: "1º COB" },
      },
    ],
    acoes: [
      {
        acao_id: "AC-20261001-0001",
        tipo_acao: "ORIENTACAO",
        resultado: "CONCLUIDA",
        acao_executada: "Orientação porta a porta no Morro da Queimada; 3 famílias encaminhadas à casa de parentes.",
        data_acao: R - 16 * H,
        local_referencia: "Morro da Queimada",
        pessoas_orientadas: 35,
        pessoas_removidas: 9,
        imoveis_vistoriados: 12,
        imoveis_interditados: 1,
        efetivo_empregado: 8,
        viaturas_empregadas: 2,
        compdec_acionada: "S",
        registrado_por_id: UN_OURO_PRETO,
        registrado_por_dominio: "1º COB",
        criado_em: R - 16 * H,
      },
    ],
    historico: [
      ["CRIADO", R - 20 * H - 30 * M, SALA_1, "SALA", null, "RASCUNHO"],
      ["EMITIDO", R - 20 * H, SALA_1, "SALA", "RASCUNHO", "EMITIDO", { cap_msg_type: "Alert" }],
      ["NOTIFICADO", R - 20 * H, SALA_1, "SALA", null, null, { alvo_tipo: "DESTINATARIO", detalhe: "1º COB · 1º BBM · 2ª Cia/1º Pel (Ouro Preto) (principal) · SISTEMA" }],
      ["CIENTE", R - 19 * H, UN_OURO_PRETO, "1º COB", "EMITIDO", "CIENTE", { alvo_tipo: "DESTINATARIO" }],
      ["ACAO_REGISTRADA", R - 16 * H, UN_OURO_PRETO, "1º COB", "CIENTE", "ACAO_REGISTRADA", { alvo_tipo: "ACAO", detalhe: "ORIENTACAO · CONCLUIDA" }],
    ],
  },
  {
    // Emitido há 14 h, sem ciência: prazo (12 h, amarelo) vencido; ainda vigente.
    alerta: alerta({
      alerta_id: "AL-20261001-0003",
      situacao: "EMITIDO",
      fonte_gatilho: "PREVISAO",
      fonte_ref: "Open-Meteo — acumulado previsto em 24 h",
      tipo_risco: "METEOROLOGICO",
      evento: "CHUVA_INTENSA",
      nivel_alerta: "AMARELO",
      numero_chamada: "2026-12339981-5",
      mm_hora: 18,
      mm_24h: 72,
      cob: "1º COB",
      ueop: "5ª Cia Ind",
      fracao: null,
      municipio: "Sete Lagoas",
      cod_ibge: "3167202",
      titulo: "Chuva moderada com acumulado relevante",
      descricao: "Previsão de 72 mm em 24 h, com picos de 18 mm/h.",
      instrucao: "Acompanhar pontos de alagamento conhecidos e manter contato com a COMPDEC.",
      area_desc: "Sete Lagoas/MG",
      cap_urgencia: "Expected",
      cap_certeza: "Possible",
      cap_resposta: "Monitor",
      data_emissao: R - 14 * H,
      inicio_vigencia: R - 14 * H,
      valido_ate: R + 10 * H,
      prazo_acao: R - 2 * H,
      criado_por_id: SALA_2,
      criado_em: R - 14 * H - 10 * M,
      emitido_por_id: SALA_2,
      emitido_por_dominio: "SALA",
      alterado_por_id: SALA_2,
      alterado_em: R - 14 * H,
    }),
    ponto: { x: -44.2413, y: -19.4569 },
    destinos: [{ nivel: "UEOP", cob: "1º COB", ueop: "5ª Cia Ind", fracao: null, principal: true }],
    historico: [
      ["CRIADO", R - 14 * H - 10 * M, SALA_2, "SALA", null, "RASCUNHO"],
      ["EMITIDO", R - 14 * H, SALA_2, "SALA", "RASCUNHO", "EMITIDO", { cap_msg_type: "Alert" }],
      ["NOTIFICADO", R - 14 * H, SALA_2, "SALA", null, null, { alvo_tipo: "DESTINATARIO", detalhe: "1º COB · 5ª Cia Ind (principal) · SISTEMA" }],
    ],
  },
  {
    // Cancelado pela Sala (CAP Cancel), com motivo.
    alerta: alerta({
      alerta_id: "AL-20261002-0001",
      situacao: "CANCELADO",
      fonte_gatilho: "INMET",
      fonte_ref: "INMET — tempestade, perigo potencial",
      tipo_risco: "METEOROLOGICO",
      evento: "GRANIZO",
      nivel_alerta: "AMARELO",
      numero_chamada: "2026-12342755-1",
      mm_hora: 12,
      cob: "6º COB",
      ueop: "9º BBM",
      fracao: null,
      municipio: "Varginha",
      cod_ibge: "3170701",
      titulo: "Possibilidade de granizo em Varginha",
      descricao: "Tempestade com possibilidade de granizo isolado no fim da tarde.",
      instrucao: "Orientar a população sobre abrigo durante a tempestade.",
      area_desc: "Varginha/MG",
      cap_msg_type: "Cancel",
      cap_urgencia: "Future",
      cap_certeza: "Possible",
      cap_resposta: "Monitor",
      data_emissao: R - 6 * H,
      inicio_vigencia: R - 6 * H,
      valido_ate: R + 18 * H,
      prazo_acao: R + 6 * H,
      encerrado_em: R - 5 * H,
      motivo_cancelamento: "Aviso do INMET revogado; previsão revista pela Sala.",
      criado_por_id: SALA_1,
      criado_em: R - 6 * H - 20 * M,
      emitido_por_id: SALA_1,
      emitido_por_dominio: "SALA",
      alterado_por_id: SALA_1,
      alterado_em: R - 5 * H,
    }),
    ponto: { x: -45.4364, y: -21.5556 },
    destinos: [{ nivel: "UEOP", cob: "6º COB", ueop: "9º BBM", fracao: null, principal: true }],
    historico: [
      ["CRIADO", R - 6 * H - 20 * M, SALA_1, "SALA", null, "RASCUNHO"],
      ["EMITIDO", R - 6 * H, SALA_1, "SALA", "RASCUNHO", "EMITIDO", { cap_msg_type: "Alert" }],
      ["NOTIFICADO", R - 6 * H, SALA_1, "SALA", null, null, { alvo_tipo: "DESTINATARIO", detalhe: "6º COB · 9º BBM (principal) · SISTEMA" }],
      ["CANCELADO", R - 5 * H, SALA_1, "SALA", "EMITIDO", "CANCELADO", { cap_msg_type: "Cancel", cap_identifier: "BR-MG-CBMMG-SALA-AL-20261002-0001-C", detalhe: "Motivo: Aviso do INMET revogado; previsão revista pela Sala." }],
    ],
  },
  {
    // Em ação: prontidão em andamento, dentro do prazo.
    alerta: alerta({
      alerta_id: "AL-20261002-0002",
      situacao: "EM_ACAO",
      fonte_gatilho: "INMET",
      fonte_ref: "INMET — tempestade, perigo",
      tipo_risco: "METEOROLOGICO",
      evento: "VENDAVAL",
      nivel_alerta: "LARANJA",
      numero_chamada: "2026-12344410-9",
      mm_hora: 35,
      cob: "2º COB",
      ueop: "8º BBM",
      fracao: null,
      municipio: "Uberaba",
      cod_ibge: "3170107",
      titulo: "Tempestade com rajadas de vento em Uberaba",
      descricao: "Tempestade com chuva de até 35 mm/h e rajadas de vento acima de 60 km/h.",
      instrucao: "Pré-posicionar equipes para corte de árvores e manter contato com a COMPDEC.",
      area_desc: "Uberaba/MG",
      cap_urgencia: "Immediate",
      cap_certeza: "Likely",
      cap_resposta: "Prepare",
      data_emissao: R - 5 * H,
      inicio_vigencia: R - 5 * H,
      valido_ate: R + 19 * H,
      prazo_acao: R + 1 * H,
      criado_por_id: SALA_2,
      criado_em: R - 5 * H - 10 * M,
      emitido_por_id: SALA_2,
      emitido_por_dominio: "SALA",
      alterado_por_id: UN_UBERABA,
      alterado_em: R - 3 * H,
    }),
    ponto: { x: -47.9381, y: -19.7472 },
    destinos: [
      {
        nivel: "UEOP",
        cob: "2º COB",
        ueop: "8º BBM",
        fracao: null,
        principal: true,
        ciente: { em: R - 4 * H - 30 * M, por: UN_UBERABA, dominio: "2º COB" },
      },
    ],
    acoes: [
      {
        acao_id: "AC-20261002-0001",
        tipo_acao: "PRONTIDAO",
        resultado: "EM_ANDAMENTO",
        acao_executada: "Duas guarnições de prontidão com motosserra nos bairros com mais queda de árvores.",
        data_acao: R - 3 * H,
        efetivo_empregado: 10,
        viaturas_empregadas: 3,
        registrado_por_id: UN_UBERABA,
        registrado_por_dominio: "2º COB",
        criado_em: R - 3 * H,
      },
    ],
    historico: [
      ["CRIADO", R - 5 * H - 10 * M, SALA_2, "SALA", null, "RASCUNHO"],
      ["EMITIDO", R - 5 * H, SALA_2, "SALA", "RASCUNHO", "EMITIDO", { cap_msg_type: "Alert" }],
      ["NOTIFICADO", R - 5 * H, SALA_2, "SALA", null, null, { alvo_tipo: "DESTINATARIO", detalhe: "2º COB · 8º BBM (principal) · SISTEMA" }],
      ["CIENTE", R - 4 * H - 30 * M, UN_UBERABA, "2º COB", "EMITIDO", "CIENTE", { alvo_tipo: "DESTINATARIO" }],
      ["EM_ACAO", R - 3 * H, UN_UBERABA, "2º COB", "CIENTE", "EM_ACAO", { alvo_tipo: "ACAO", detalhe: "PRONTIDAO · EM_ANDAMENTO" }],
    ],
  },
  {
    // Ciente (principal), COB ainda sem ciência. Mesma chamada de um alerta do Survey123 de exemplo.
    alerta: alerta({
      alerta_id: "AL-20261002-0003",
      situacao: "CIENTE",
      fonte_gatilho: "SGB_SACE",
      fonte_ref: "SACE — Rio Doce em Governador Valadares",
      tipo_risco: "HIDROLOGICO",
      evento: "INUNDACAO",
      nivel_alerta: "VERMELHO",
      numero_chamada: "2026-12347223-0",
      bacia: "Rio Doce",
      rio: "Rio Doce",
      cota: 520,
      cob: "5º COB",
      ueop: "6º BBM",
      fracao: null,
      municipio: "Governador Valadares",
      cod_ibge: "3127701",
      local_referencia: "Bairros ribeirinhos (Santa Terezinha, São Paulo e Ilha dos Araújos)",
      titulo: "Inundação: Rio Doce acima da cota de inundação",
      descricao: "Cota do Rio Doce em 520 cm e subindo. Cota de inundação ultrapassada na estação de referência.",
      instrucao: "Remoção preventiva de moradores das áreas ribeirinhas e apoio aos abrigos da COMPDEC.",
      area_desc: "Governador Valadares/MG — bairros ribeirinhos",
      cap_urgencia: "Immediate",
      cap_certeza: "Observed",
      cap_resposta: "Evacuate",
      data_emissao: R - 90 * M,
      inicio_vigencia: R - 90 * M,
      valido_ate: R + 22 * H + 30 * M,
      prazo_acao: R + 30 * M,
      criado_por_id: SALA_1,
      criado_em: R - 100 * M,
      emitido_por_id: SALA_1,
      emitido_por_dominio: "SALA",
      alterado_por_id: UN_GV,
      alterado_em: R - 80 * M,
    }),
    ponto: { x: -41.9493, y: -18.8571 },
    destinos: [
      {
        nivel: "UEOP",
        cob: "5º COB",
        ueop: "6º BBM",
        fracao: null,
        principal: true,
        ciente: { em: R - 80 * M, por: UN_GV, dominio: "5º COB" },
      },
      { nivel: "COB", cob: "5º COB", ueop: null, fracao: null, principal: false },
    ],
    historico: [
      ["CRIADO", R - 100 * M, SALA_1, "SALA", null, "RASCUNHO"],
      ["EMITIDO", R - 90 * M, SALA_1, "SALA", "RASCUNHO", "EMITIDO", { cap_msg_type: "Alert" }],
      ["NOTIFICADO", R - 90 * M, SALA_1, "SALA", null, null, { alvo_tipo: "DESTINATARIO", detalhe: "5º COB · 6º BBM (principal) · SISTEMA" }],
      ["NOTIFICADO", R - 90 * M, SALA_1, "SALA", null, null, { alvo_tipo: "DESTINATARIO", detalhe: "5º COB · SISTEMA" }],
      ["CIENTE", R - 80 * M, UN_GV, "5º COB", "EMITIDO", "CIENTE", { alvo_tipo: "DESTINATARIO" }],
    ],
  },
  {
    // Emitido há 1 h: pendente, dentro do prazo.
    alerta: alerta({
      alerta_id: "AL-20261002-0004",
      situacao: "EMITIDO",
      fonte_gatilho: "CEMADEN",
      fonte_ref: "CEMADEN — movimento de massa, risco alto",
      tipo_risco: "GEOLOGICO",
      evento: "DESLIZAMENTO",
      nivel_alerta: "LARANJA",
      numero_chamada: "2026-12348120-6",
      indice_risco: 2.1,
      cob: "5º COB",
      ueop: "11º BBM",
      fracao: "2ª Cia/3º Pel (Ponte Nova)",
      municipio: "Ponte Nova",
      cod_ibge: "3152105",
      titulo: "Risco alto de deslizamento em Ponte Nova",
      descricao: "Índice GeoRisk 2,1 (alto). Encostas urbanas com ocupação irregular.",
      instrucao: "Vistoria preventiva nas encostas mapeadas pela COMPDEC.",
      area_desc: "Ponte Nova/MG",
      cap_urgencia: "Expected",
      cap_certeza: "Likely",
      cap_resposta: "Assess",
      data_emissao: R - 1 * H,
      inicio_vigencia: R - 1 * H,
      valido_ate: R + 23 * H,
      prazo_acao: R + 5 * H,
      criado_por_id: SALA_2,
      criado_em: R - 70 * M,
      emitido_por_id: SALA_2,
      emitido_por_dominio: "SALA",
      alterado_por_id: SALA_2,
      alterado_em: R - 1 * H,
    }),
    ponto: { x: -42.8978, y: -20.4111 },
    destinos: [{ nivel: "FRACAO", cob: "5º COB", ueop: "11º BBM", fracao: "2ª Cia/3º Pel (Ponte Nova)", principal: true }],
    historico: [
      ["CRIADO", R - 70 * M, SALA_2, "SALA", null, "RASCUNHO"],
      ["EMITIDO", R - 1 * H, SALA_2, "SALA", "RASCUNHO", "EMITIDO", { cap_msg_type: "Alert" }],
      ["NOTIFICADO", R - 1 * H, SALA_2, "SALA", null, null, { alvo_tipo: "DESTINATARIO", detalhe: "5º COB · 11º BBM · 2ª Cia/3º Pel (Ponte Nova) (principal) · SISTEMA" }],
    ],
  },
  {
    // Exercício (simulado): fora do mapa e dos indicadores.
    alerta: alerta({
      alerta_id: "AL-20261002-0005",
      situacao: "EMITIDO",
      natureza: "EXERCICIO",
      fonte_gatilho: "SALA",
      tipo_risco: "TECNOLOGICO",
      evento: "BARRAGEM",
      nivel_alerta: "VERMELHO",
      numero_chamada: "2026-12348530-2",
      cob: "1º COB",
      ueop: "2º BBM",
      fracao: "1ª Cia/5º Pel/PA (Brumadinho)",
      municipio: "Brumadinho",
      cod_ibge: "3109006",
      titulo: "EXERCÍCIO — simulado de rompimento de barragem",
      descricao: "Exercício simulado do plano de ação de emergência. Nenhuma barragem em risco real.",
      instrucao: "Executar o plano de evacuação do simulado e registrar o tempo de resposta.",
      area_desc: "Brumadinho/MG",
      cap_urgencia: "Immediate",
      cap_certeza: "Observed",
      cap_resposta: "Execute",
      data_emissao: R - 30 * M,
      inicio_vigencia: R - 30 * M,
      valido_ate: R + 6 * H,
      prazo_acao: R + 90 * M,
      criado_por_id: SALA_1,
      criado_em: R - 40 * M,
      emitido_por_id: SALA_1,
      emitido_por_dominio: "SALA",
      alterado_por_id: SALA_1,
      alterado_em: R - 30 * M,
    }),
    ponto: { x: -44.2007, y: -20.151 },
    destinos: [{ nivel: "FRACAO", cob: "1º COB", ueop: "2º BBM", fracao: "1ª Cia/5º Pel/PA (Brumadinho)", principal: true }],
    historico: [
      ["CRIADO", R - 40 * M, SALA_1, "SALA", null, "RASCUNHO"],
      ["EMITIDO", R - 30 * M, SALA_1, "SALA", "RASCUNHO", "EMITIDO", { cap_msg_type: "Alert" }],
      ["NOTIFICADO", R - 30 * M, SALA_1, "SALA", null, null, { alvo_tipo: "DESTINATARIO", detalhe: "1º COB · 2º BBM · 1ª Cia/5º Pel/PA (Brumadinho) (principal) · SISTEMA" }],
    ],
  },
  {
    // Rascunho em preparação (sem emissão, sem CAP).
    alerta: alerta({
      alerta_id: "AL-20261002-0006",
      situacao: "RASCUNHO",
      fonte_gatilho: "CEMADEN",
      tipo_risco: "GEOLOGICO",
      evento: "DESLIZAMENTO",
      nivel_alerta: "VERMELHO",
      indice_risco: 2.9,
      cob: "3º COB",
      ueop: "4º BBM",
      fracao: null,
      municipio: "Juiz de Fora",
      cod_ibge: "3136702",
      titulo: "Risco muito alto de deslizamento em Juiz de Fora",
      descricao: "Índice GeoRisk 2,9 (muito alto) previsto para a madrugada.",
      cap_urgencia: "Expected",
      cap_certeza: "Likely",
      criado_por_id: SALA_2,
      criado_em: R - 20 * M,
      alterado_por_id: SALA_2,
      alterado_em: R - 10 * M,
    }),
    ponto: { x: -43.3398, y: -21.7595 },
    destinos: [{ nivel: "UEOP", cob: "3º COB", ueop: "4º BBM", fracao: null, principal: true }],
    historico: [
      ["CRIADO", R - 20 * M, SALA_2, "SALA", null, "RASCUNHO"],
      ["ATUALIZADO", R - 10 * M, SALA_2, "SALA", "RASCUNHO", "RASCUNHO", { campos_alterados: "nivelAlerta,indiceRisco", detalhe: "nivelAlerta: laranja → vermelho; indiceRisco: 2.4 → 2.9" }],
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// Montagem do conteúdo bruto
// ---------------------------------------------------------------------------------------------

function camposDeData(camada: CamadaSala): string[] {
  return camposDaCamada(camada)
    .filter((c) => c.tipo === "data")
    .map((c) => c.nome);
}

/** Atributos com TODOS os campos da camada (o ArcGIS devolve null nos vazios). */
function completo(camada: CamadaSala, atributos: AtributosEsri): AtributosEsri {
  const base: AtributosEsri = {};
  for (const c of camposDaCamada(camada)) base[c.nome] = null;
  return { ...base, ...atributos };
}

/** Conteúdo bruto na referência (sem deslocar). */
function conteudoNaReferencia(): ConteudoSala {
  const conteudo: ConteudoSala = { alertas: [], acoes: [], destinatarios: [], historico: [] };
  for (const ex of EXEMPLOS) {
    const a = completo("Sala_Alertas", ex.alerta);
    const id = a.alerta_id as string;
    conteudo.alertas.push({ attributes: a, geometry: { ...ex.ponto, spatialReference: { wkid: 4326 } } });
    const notificado = a.data_emissao as number | null;
    for (const d of ex.destinos) {
      conteudo.destinatarios.push(
        completo("Sala_Alertas_Destinatarios", {
          alerta_id: id,
          dest_nivel: d.nivel,
          cob: d.cob,
          ueop: d.ueop,
          fracao: d.fracao,
          principal: d.principal ? "S" : "N",
          situacao_dest: d.ciente ? "CIENTE" : "AGUARDANDO",
          canal_notificacao: notificado === null ? null : "SISTEMA",
          notificado_em: notificado,
          ciente_em: d.ciente?.em ?? null,
          ciente_por_id: d.ciente?.por ?? null,
          ciente_por_dominio: d.ciente?.dominio ?? null,
          criado_em: a.criado_em,
          alterado_em: d.ciente?.em ?? notificado ?? a.criado_em,
        }),
      );
    }
    for (const acao of ex.acoes ?? []) {
      conteudo.acoes.push({
        attributes: completo("Sala_Acoes_RRD", {
          alerta_id: id,
          numero_chamada: a.numero_chamada,
          natureza: a.natureza,
          origem_registro: "SALA",
          tipo_risco: a.tipo_risco,
          cob: a.cob,
          ueop: a.ueop,
          fracao: a.fracao,
          municipio: a.municipio,
          cod_ibge: a.cod_ibge,
          alterado_por_id: acao.registrado_por_id,
          alterado_em: acao.criado_em,
          ...acao,
        }),
        geometry: { ...ex.ponto, spatialReference: { wkid: 4326 } },
      });
    }
    const acaoId = (ex.acoes ?? [])[0]?.acao_id ?? null;
    for (const [evento, quando, por, dominio, de, para, extras] of ex.historico) {
      const alvo = (extras?.alvo_tipo as string | undefined) ?? "ALERTA";
      conteudo.historico.push(
        completo("Sala_Alertas_Historico", {
          alerta_id: id,
          alvo_tipo: alvo,
          alvo_id: alvo === "ACAO" ? acaoId : alvo === "ALERTA" ? id : null,
          evento,
          situacao_de: de,
          situacao_para: para,
          quando,
          por_id: por,
          por_dominio: dominio,
          cap_identifier: extras?.cap_msg_type === "Alert" ? `BR-MG-CBMMG-SALA-${id}` : null,
          ...extras,
        }),
      );
    }
  }
  return conteudo;
}

/** "AAAAMMDD" de Brasília (UTC−3). */
function dia(epochMs: number): string {
  return new Date(epochMs - 3 * H).toISOString().slice(0, 10).replace(/-/g, "");
}

/** Renumera os códigos pelo dia (deslocado) da criação: AL-/AC-AAAAMMDD-NNNN. */
function renumerar(registros: AtributosEsri[], campoId: string, prefixo: "AL" | "AC"): Map<string, string> {
  const ordenados = [...registros].sort((a, b) => (a.criado_em as number) - (b.criado_em as number));
  const porDia = new Map<string, number>();
  const mapa = new Map<string, string>();
  for (const r of ordenados) {
    const d = dia(r.criado_em as number);
    const n = (porDia.get(d) ?? 0) + 1;
    porDia.set(d, n);
    mapa.set(r[campoId] as string, `${prefixo}-${d}-${String(n).padStart(4, "0")}`);
  }
  return mapa;
}

/** Troca os códigos numa passada só (sem encadear: o novo de um pode ser o antigo de outro). */
function trocarIds(texto: unknown, mapa: Map<string, string>): unknown {
  if (typeof texto !== "string") return texto;
  return texto.replace(/A[LC]-\d{8}-\d{4}/g, (id) => mapa.get(id) ?? id);
}

/**
 * Conteúdo de exemplo para o armazém em memória, com as datas deslocadas para
 * que a referência vire `agora` e os códigos renumerados pelo dia deslocado.
 */
export function conteudoExemplo(agora: Date = new Date()): ConteudoSala {
  const delta = deslocamentoAte(REFERENCIA_ALERTAS_EXEMPLO, agora);
  const conteudo = conteudoNaReferencia();
  const deslocar = (camada: CamadaSala, atributos: AtributosEsri) => {
    for (const nome of camposDeData(camada)) {
      const v = atributos[nome];
      if (typeof v === "number") atributos[nome] = v + delta;
    }
  };
  conteudo.alertas.forEach((f) => deslocar("Sala_Alertas", f.attributes));
  conteudo.acoes.forEach((f) => deslocar("Sala_Acoes_RRD", f.attributes));
  conteudo.destinatarios.forEach((d) => deslocar("Sala_Alertas_Destinatarios", d));
  conteudo.historico.forEach((h) => deslocar("Sala_Alertas_Historico", h));

  const ids = new Map([
    ...renumerar(conteudo.alertas.map((f) => f.attributes), "alerta_id", "AL"),
    ...renumerar(conteudo.acoes.map((f) => f.attributes), "acao_id", "AC"),
  ]);
  const camposComId = ["alerta_id", "lote_id", "acao_id", "alvo_id", "cap_identifier"];
  const aplicar = (atributos: AtributosEsri) => {
    for (const campo of camposComId) {
      if (campo in atributos) atributos[campo] = trocarIds(atributos[campo], ids) as AtributosEsri[string];
    }
  };
  conteudo.alertas.forEach((f: FeicaoPontoEsri) => aplicar(f.attributes));
  conteudo.acoes.forEach((f) => aplicar(f.attributes));
  conteudo.destinatarios.forEach(aplicar);
  conteudo.historico.forEach(aplicar);
  return conteudo;
}
