#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ============================================================================
# Sala de Situação · Período Chuvoso — ALERTAS & AÇÕES RRD (Fase 1)
# RASCUNHO — NÃO FOI EXECUTADO. Pré-desenho para revisão ("depois criamos as
# camadas"). Estilo e armadilhas copiados dos scripts do GeoRescue
# (scripts/criar_tabela_acidentes.py, criar_camadas_forcatarefa.py,
# criar_camadas_mensagens.py, criar_camadas_acesso.py, notebooks-canis/passo1).
#
# Cria DOIS serviços hospedados no Portal ArcGIS Enterprise do CBMMG:
#
#   SalaSituacao_AlertasRRD        RESTRITO (só o grupo de editores)
#     /0 Sala_Alertas                PONTO  — um alerta por município × unidade
#                                             principal; substitui o Survey123
#                                             "Emissão de Alertas"
#     /1 Sala_Acoes_RRD              PONTO  — uma linha por ação RRD executada;
#                                             substitui o Survey123 "Ações RRD"
#     /2 Sala_Alertas_Destinatarios  tabela — uma linha por unidade notificada
#                                             (notificação + ciência)
#     /3 Sala_Alertas_Historico      tabela — trilha de auditoria, SÓ ACRESCENTA
#
#   SalaSituacao_Referencia        catálogo, sem dado pessoal
#     /0 Sala_Territorio             tabela — município (IBGE) → fração → UEOp → COB
#
# ---------------------------------------------------------------------------
# ⚠️ POR QUE DOIS SERVIÇOS: compartilhamento é do ITEM. O catálogo territorial
#    pode um dia ser lido pela organização inteira (painéis, NAC); os alertas
#    não. No mesmo item, abrir um abriria o outro sem ninguém perceber
#    ("serviço separado é raio de explosão separado" — criar_camadas_mensagens.py).
#
# ⚠️ AS CAMADAS DE PONTO VÊM ANTES DAS TABELAS: este portal numera as de ponto
#    primeiro e as tabelas depois (criar_camadas_acesso.py). Os ids pedidos
#    abaixo já seguem essa ordem e, mesmo assim, são RELIDOS e comparados.
#
# ⚠️ A CHAVE ENTRE AS CAMADAS É `alerta_id` (TEXTO, gerado pelo servidor da
#    Sala), e não o GlobalID. É o padrão `id_op` do GeoRescue: sobrevive a
#    cópia/clone de serviço (GlobalID é regenerado em append/cópia sem
#    preserveGlobalIds), é legível por telefone/rádio e dispensa relationship
#    class. O `globalid` nasce mesmo assim (Field Maps, sincronização,
#    relationship class futura) — mas NENHUMA tabela liga por ele.
#
# ⚠️ DOMÍNIO CODIFICADO SÓ ONDE O CÓDIGO DECIDE: valor fora do domínio faz o
#    serviço RECUSAR A FEIÇÃO INTEIRA (liberar_tipos_de_equipe.py; canis). Por
#    isso UEOp, fração e município NÃO têm domínio (mudam; vêm do catálogo
#    Sala_Territorio) e a tabela de histórico não tem domínio nenhum (um log
#    não pode recusar um valor antigo que saiu da lista).
#
# ⚠️ NOME DE DOMÍNIO É ÚNICO NO SERVIÇO INTEIRO ("Domain used beyond scope" —
#    criar_camadas_canis.py). Os nomes são montados por camada (dom_sala_<sigla>_<campo>).
#
# ⚠️ O `add_to_definition` DESCARTA `indexes` (e `hasAttachments`) EM SILÊNCIO,
#    com success: True. Índices vão numa SEGUNDA chamada, no manager da camada,
#    e são RELIDOS (garantir_indices).
#
# ⚠️ `capabilities` em CADA camada — sem elas a camada nasce só com Query e o
#    primeiro applyEdits responde 10667, semanas depois. EXCEÇÃO DELIBERADA:
#    o histórico pede "Query,Create,Editing" (sem Update/Delete) para ser
#    só-acréscimo NO SERVIÇO, não só no backend. ⚠️ Nunca medido neste portal:
#    o script relê e AVISA se o portal impuser outra coisa.
#
# ⚠️ TAMANHOS FOLGADOS: aumentar campo publicado o portal ignora calado.
#
# ⚠️ DATAS: esriFieldTypeDate (epoch ms UTC). O applyEdits SÓ aceita epoch ms
#    em campo de data (o texto dd/mm/aaaa faz o portal recusar a feição — caso
#    do cadastro de operação pelo app, GeoRescue set/2026). O DIA operacional
#    se conta no relógio de Minas, nunca no do aparelho.
#
# ⚠️ EDITOR TRACKING É LIGADO, MAS NÃO DIZ QUEM FOI: o backend grava como a
#    conta de serviço (creator.1 ou a que vier), então created_user será sempre
#    ela. Quem emitiu/registrou de verdade vai nos campos *_por_id, preenchidos
#    PELO SERVIDOR a partir da sessão do GeoRescue — nunca pelo corpo do pedido.
#
# ⚠️ LGPD: nenhum campo guarda nome, Nº BM, CPF ou telefone. *_por_id é um
#    PSEUDÔNIMO: HMAC-SHA256(CPF do token do GeoRescue, SALA_PSEUDO_SEGREDO),
#    32 hex. Quem tem o segredo e a tabela de contas reidentifica (auditoria);
#    quem lê a camada, não.
#
# ⚠️ XSS: o serviço nasce com xssPreventionInfo rejectInvalid (padrão GeoRescue).
#    Texto com "<" ou ">" (ex.: "< 50 mm") é RECUSADO pelo portal — o backend
#    troca por "menor que"/"maior que" antes de gravar. É também por isso que o
#    histórico guarda a mensagem CAP como JSON (`cap_json`), não como XML.
#
# É IDEMPOTENTE: rodar de novo não recria nem apaga nada; completa o que falta.
#
#   python3 criar_camadas_sala.py --conferir   # só confere o schema, offline
#   python3 criar_camadas_sala.py              # cria no portal (conta DONA/ADMIN)
#
# Depois de rodar: confira /status da Sala (resolução de campos) e semeie a
# Sala_Territorio com a articulação operacional oficial (EMBM/3).
# ============================================================================
import os
import re
import sys
import unicodedata

# -------------------- CONFIG (edite estas linhas) --------------------
PORTAL      = "https://geoprocessamento.bombeiros.mg.gov.br/portal"
USUARIO     = "SEU_ADMIN"   # conta DONA/ADMIN (Publisher). Editor de dados não cria serviço.
SENHA       = "SUA_SENHA"
# Alternativa preferida: caminho de um credenciais_portal.txt (portal=, usuario=,
# senha=). Lido em tempo de execução; a senha nunca é impressa.
CREDENCIAIS = os.environ.get("ARCGIS_CREDENCIAIS", "")
VERIFY_CERT = True          # padrão do repositório; não troque por causa de uma máquina

# Quem o backend da Sala usa para gravar (applyEdits). Não pode ser dono de
# item: enxerga e edita PELO GRUPO. Grupo próprio da Sala = trocar a conta de
# serviço no futuro sem mexer nas camadas.
GRUPO_EDITORES = "SalaSituacao_Editores"
EDITOR         = "creator.1"       # 🔔 decisão: conta própria da Sala ou a do GeoRescue
CRIAR_GRUPO_SE_FALTAR = True

COM_GLOBALID          = True       # se o portal recusar, rode de novo com False
LIGAR_EDITOR_TRACKING = True
# -----------------------------------------------------------------------

SERVICO_ALERTAS = "SalaSituacao_AlertasRRD"
SERVICO_REFER   = "SalaSituacao_Referencia"

CAPS          = "Query,Editing,Create,Update,Delete"
CAPS_SO_ACRES = "Query,Editing,Create"     # histórico: sem Update/Delete

# Minas Gerais em WGS84 — só o enquadramento inicial.
EXTENT_MG = {"xmin": -51.1, "ymin": -22.95, "xmax": -39.8, "ymax": -14.2,
             "spatialReference": {"wkid": 4326, "latestWkid": 4326}}

XSS = {"xssPreventionEnabled": True, "xssPreventionRule": "InputOnly",
       "xssInputRule": "rejectInvalid"}


# ============================================================ helpers ======
def oid():
    return {"name": "objectid", "type": "esriFieldTypeOID", "alias": "OBJECTID",
            "sqlType": "sqlTypeOther", "nullable": False, "editable": False}


def gid():
    return {"name": "globalid", "type": "esriFieldTypeGlobalID", "alias": "GlobalID",
            "sqlType": "sqlTypeOther", "length": 38, "nullable": False, "editable": False}


def txt(nome, alias, tam, dominio=None, padrao=None):
    f = {"name": nome, "type": "esriFieldTypeString", "alias": alias,
         "sqlType": "sqlTypeOther", "length": tam, "nullable": True, "editable": True}
    if dominio:
        f["domain"] = dominio
    if padrao is not None:
        f["defaultValue"] = padrao
    return f


def data(nome, alias):
    return {"name": nome, "type": "esriFieldTypeDate", "alias": alias,
            "sqlType": "sqlTypeOther", "length": 8, "nullable": True, "editable": True}


def inteiro(nome, alias):
    return {"name": nome, "type": "esriFieldTypeInteger", "alias": alias,
            "sqlType": "sqlTypeInteger", "nullable": True, "editable": True}


def dbl(nome, alias):
    return {"name": nome, "type": "esriFieldTypeDouble", "alias": alias,
            "sqlType": "sqlTypeDouble", "nullable": True, "editable": True}


def dom(sigla, campo, pares):
    """Domínio codificado. `pares` = [(código, rótulo)]. O nome é montado por
    camada para ser único no SERVIÇO."""
    return {"type": "codedValue", "name": "dom_sala_{}_{}".format(sigla, campo),
            "codedValues": [{"code": c, "name": n} for c, n in pares]}


def idx(nome, campos, unico, descricao):
    return {"name": nome, "fields": campos, "isAscending": True,
            "isUnique": unico, "description": descricao}


def _base(id_, nome, descricao, display, campos, indices, caps=CAPS,
          ponto=False, renderer=None):
    campos = [oid()] + ([gid()] if COM_GLOBALID else []) + campos
    d = {
        "id": id_, "name": nome, "description": descricao, "displayField": display,
        "objectIdField": "objectid", "fields": campos, "indexes": indices,
        "templates": [{"name": nome, "description": "",
                       "drawingTool": "esriFeatureEditToolNone",
                       "prototype": {"attributes": {}}}],
        "types": [], "hasAttachments": False, "hasM": False, "hasZ": False,
        "hasGeometryProperties": False, "supportsAdvancedQueries": True,
        "supportedQueryFormats": "JSON", "maxRecordCount": 4000,
        "capabilities": caps,
    }
    if COM_GLOBALID:
        d["globalIdField"] = "globalid"
    if ponto:
        d.update({"type": "Feature Layer", "geometryType": "esriGeometryPoint",
                  "extent": EXTENT_MG, "allowGeometryUpdates": True,
                  "drawingInfo": {"renderer": renderer or {
                      "type": "simple", "symbol": {
                          "type": "esriSMS", "style": "esriSMSCircle", "size": 8,
                          "color": [78, 134, 196, 220],
                          "outline": {"color": [10, 14, 20, 255], "width": 1}}}}})
        d["templates"][0]["drawingTool"] = "esriFeatureEditToolPoint"
    else:
        d.update({"type": "Table", "allowGeometryUpdates": False})
    return d


# ============================================================ domínios =====
# Códigos ASCII estáveis; o RÓTULO é o que Dashboards e a Sala exibem (a Sala
# traduz código→rótulo pelo domínio: lib/sources/arcgis/campos.ts, lerAtributo).
#
# COB: código == rótulo, como o GeoRescue grava `Operacoes.cob` e como o
# `where_do_escopo` do acesso.py compara ("cob IN ('1º COB')"). Assim o recorte
# por domínio do GeoRescue serve a estas camadas sem tradução.
# 🔔 CEB fora por ora: a Sala agruparia "CEB" em "Sem COB" (normalizarRotuloCob).
COBS = [("{}º COB".format(n), "{}º COB".format(n)) for n in range(1, 7)]

# Situação do FLUXO do alerta (o "status" da linha). VENCIDO e PENDENTE NÃO
# existem aqui: são DERIVADOS na leitura (prazo_acao × agora; situação aberta).
# Dado que muda sozinho com o relógio não se grava.
SITUACOES = [
    ("RASCUNHO",        "Rascunho"),
    ("EMITIDO",         "Emitido"),
    ("CIENTE",          "Ciente"),
    ("EM_ACAO",         "Em ação"),
    ("ACAO_REGISTRADA", "Ação RRD registrada"),
    ("ENCERRADO",       "Encerrado"),
    ("CANCELADO",       "Cancelado"),
]

# Real × simulado. Fora dos indicadores tudo que não for REAL (regra do
# GeoRescue para TREINAMENTO). Mapeia 1:1 no CAP <status>:
# REAL→Actual, EXERCICIO→Exercise, TESTE→Test.
NATUREZAS = [("REAL", "Real"), ("EXERCICIO", "Exercício/simulado"), ("TESTE", "Teste")]

# Grupo do risco — os MESMOS rótulos do formulário Survey123 atual
# (Meteorológico/Hidrológico/Geológico), para o gráfico "por tipo de risco"
# juntar legado e novo, e para o mapa de risco por tipo (decisão 3).
TIPOS_RISCO = [
    ("METEOROLOGICO", "Meteorológico"),
    ("HIDROLOGICO",   "Hidrológico"),
    ("GEOLOGICO",     "Geológico"),
    ("TECNOLOGICO",   "Tecnológico"),     # 🔔 barragem; não existe no formulário atual
]

# Evento (o fenômeno) → grupo, COBRADE e categoria CAP. A cascata do
# formulário é tipo_risco → evento; o servidor confere que o par é válido.
# ⚠️ Esta tabela é a SEGUNDA CÓPIA assumida da que o backend da Sala terá
#    (mapa evento→COBRADE/CAP): um teste lá compara as duas.
EVENTOS = [
    # código           rótulo                                       grupo            COBRADE      CAP category
    ("CHUVA_INTENSA",  "Chuvas intensas",                           "METEOROLOGICO", "1.3.2.1.4", "Met"),
    ("VENDAVAL",       "Vendaval",                                  "METEOROLOGICO", "1.3.2.1.5", "Met"),
    ("GRANIZO",        "Granizo",                                   "METEOROLOGICO", "1.3.2.1.3", "Met"),
    ("RAIOS",          "Tempestade de raios",                       "METEOROLOGICO", "1.3.2.1.2", "Met"),
    ("INUNDACAO",      "Inundação",                                 "HIDROLOGICO",   "1.2.1.0.0", "Met"),
    ("ENXURRADA",      "Enxurrada",                                 "HIDROLOGICO",   "1.2.2.0.0", "Met"),
    ("ALAGAMENTO",     "Alagamento",                                "HIDROLOGICO",   "1.2.3.0.0", "Met"),
    ("DESLIZAMENTO",   "Deslizamento / movimento de massa",         "GEOLOGICO",     "1.1.3.2.1", "Geo"),
    ("CORRIDA_MASSA",  "Corrida de massa (lama/detritos)",          "GEOLOGICO",     "1.1.3.3.1", "Geo"),
    ("QUEDA_BLOCOS",   "Queda/rolamento de blocos",                 "GEOLOGICO",     "1.1.3.1.1", "Geo"),
    ("SOLAPAMENTO",    "Solapamento / erosão de margem fluvial",    "GEOLOGICO",     "1.1.4.2.0", "Geo"),
    ("BARRAGEM",       "Rompimento/colapso de barragem",            "TECNOLOGICO",   "2.4.2.0.0", "Infra"),
    ("OUTRO",          "Outro (descrever)",                         "",              "",          "Other"),
]

# Escala única das matrizes do CBMMG (lib/dominio/matrizes.ts → NIVEIS_RISCO):
# verde, amarelo, laranja, vermelho e roxo. As três matrizes (chuva, geológica e
# hidrológica) convertem para ela; ver docs/metricas-risco.md.
# Severidade CAP DERIVADA (não gravada): alinhada à régua do INMET já usada na
# Sala (Perigo Potencial=Moderate, Perigo=Severe, Grande Perigo=Extreme).
NIVEIS = [("VERDE", "Verde"), ("AMARELO", "Amarelo"), ("LARANJA", "Laranja"),
          ("VERMELHO", "Vermelho"), ("ROXO", "Roxo")]
NIVEL_PARA_SEVERIDADE = {"VERDE": "Minor", "AMARELO": "Moderate",
                         "LARANJA": "Severe", "VERMELHO": "Extreme", "ROXO": "Extreme"}
# Sugestão de prazo padrão para a ação RRD (o operador pode mudar).
# 🔔 A definir pela 3ª Seção do EMBM.
PRAZO_PADRAO_HORAS = {"ROXO": 2, "VERMELHO": 2, "LARANJA": 6, "AMARELO": 12, "VERDE": 24}

ORIGENS_REGISTRO = [("SALA", "Formulário da Sala"),
                    ("SURVEY123", "Migrado do Survey123"),
                    ("INTEGRACAO", "Sugerido por integração (rascunho)")]

FONTES_GATILHO = [
    ("INMET",     "Aviso INMET"),
    ("CEMADEN",   "Alerta CEMADEN"),
    ("SGB_SACE",  "SGB/SACE (cotas)"),
    ("ANA",       "ANA — telemetria"),
    ("PREVISAO",  "Previsão numérica (Open-Meteo/outros)"),
    ("CEDEC",     "Defesa Civil (CEDEC/COMPDEC)"),
    ("COBOM_CAD", "Chamada/ocorrência no CAD"),
    ("UNIDADE",   "Solicitação de unidade (UEOp)"),
    ("SALA",      "Análise da Sala de Situação"),
    ("OUTRA",     "Outra"),
]

# CAP 1.2 (OASIS) — enumerações do próprio padrão.
CAP_MSG_TYPES = [("Alert", "Alerta"), ("Update", "Atualização"), ("Cancel", "Cancelamento")]
CAP_ESCOPOS   = [("Restricted", "Restrito"), ("Private", "Privado"), ("Public", "Público")]
CAP_URGENCIAS = [("Immediate", "Imediata"), ("Expected", "Esperada (próxima hora)"),
                 ("Future", "Futura"), ("Past", "Passada"), ("Unknown", "Desconhecida")]
CAP_CERTEZAS  = [("Observed", "Observado"), ("Likely", "Provável (≥50%)"),
                 ("Possible", "Possível (<50%)"), ("Unlikely", "Improvável"),
                 ("Unknown", "Desconhecida")]
CAP_RESPOSTAS = [("Prepare", "Preparar"), ("Monitor", "Monitorar"), ("Assess", "Avaliar"),
                 ("Avoid", "Evitar a área"), ("Evacuate", "Evacuar"), ("Shelter", "Abrigar"),
                 ("Execute", "Executar plano"), ("AllClear", "Fim do perigo"),
                 ("None", "Nenhuma")]

TIPOS_ACAO = [
    ("VISTORIA",      "Vistoria preventiva em área de risco"),
    ("MONITORAMENTO", "Monitoramento de área / cota de rio"),
    ("ORIENTACAO",    "Orientação à população (porta a porta)"),
    ("DIVULGACAO",    "Divulgação (rádio, carro de som, redes)"),
    ("INTERDICAO",    "Interdição / isolamento de área"),
    ("EVACUACAO",     "Remoção / evacuação preventiva"),
    ("COMPDEC",       "Articulação com COMPDEC/Defesa Civil"),
    ("PRONTIDAO",     "Prontidão / pré-posicionamento de recursos"),
    ("APOIO_ABRIGO",  "Apoio a abrigo temporário"),
    ("SINALIZACAO",   "Sinalização"),
    ("OUTRA",         "Outra (descrever)"),
]
RESULTADOS = [("CONCLUIDA", "Concluída"), ("PARCIAL", "Parcial"),
              ("EM_ANDAMENTO", "Em andamento"), ("NAO_REALIZADA", "Não realizada")]
SIM_NAO = [("S", "Sim"), ("N", "Não")]      # vazio = NÃO RESPONDIDO, nunca "Não"
NIVEIS_DEST = [("COB", "COB"), ("UEOP", "BBM/Cia Ind (UEOp)"), ("FRACAO", "Fração (Cia/Pel/posto)")]
SITUACOES_DEST = [("AGUARDANDO", "Aguardando ciência"), ("CIENTE", "Ciente"),
                  ("REDIRECIONADO", "Redirecionado")]
CANAIS = [("SISTEMA", "Tela da Sala/GeoRescue"), ("TELEGRAM", "Telegram"),
          ("PUSH", "Notificação push"), ("CAD", "CAD"), ("TELEFONE", "Telefone"),
          ("RADIO", "Rádio"), ("EMAIL", "E-mail")]

# Tamanhos (folgados de propósito)
T_ID, T_PSEUDO, T_DOMINIO = 40, 64, 60
T_COB, T_UEOP, T_FRACAO, T_MUN = 30, 80, 120, 120


def territorio(sigla):
    """Os quatro níveis + IBGE, com os nomes que a Sala já lê como 1º candidato
    (lib/sources/arcgis/camadas.ts: cob, ueop, fracao, municipio)."""
    return [
        txt("cob", "COB", T_COB, dom(sigla, "cob", COBS)),
        txt("ueop", "BBM/Cia Ind (UEOp)", T_UEOP),
        txt("fracao", "Fração (Cia/Pel/posto)", T_FRACAO),
        txt("municipio", "Município", T_MUN),
        txt("cod_ibge", "Código IBGE do município (7 dígitos)", 7),
    ]


# ============================================================ camadas ======
def renderer_nivel():
    # Cores de CORES_NIVEL (lib/dominio/matrizes.ts).
    cor = {"VERDE": [136, 196, 133, 230], "AMARELO": [239, 233, 33, 230],
           "LARANJA": [248, 152, 43, 230], "VERMELHO": [238, 49, 45, 230],
           "ROXO": [95, 77, 159, 230]}
    return {"type": "uniqueValue", "field1": "nivel_alerta",
            "defaultSymbol": {"type": "esriSMS", "style": "esriSMSCircle", "size": 8,
                              "color": [154, 160, 172, 200],
                              "outline": {"color": [10, 14, 20, 255], "width": 1}},
            "defaultLabel": "Sem nível",
            "uniqueValueInfos": [
                {"value": c, "label": n,
                 "symbol": {"type": "esriSMS", "style": "esriSMSCircle", "size": 10,
                            "color": cor[c],
                            "outline": {"color": [10, 14, 20, 255], "width": 1}}}
                for c, n in NIVEIS]}


SALA_ALERTAS = _base(
    0, "Sala_Alertas",
    "Alertas emitidos pela Sala de Situação para as unidades (substitui o "
    "Survey123 Emissão de Alertas). Um registro por município × unidade principal.",
    "titulo", [
        # ── identidade e fluxo ───────────────────────────────────────────
        txt("alerta_id", "Código do alerta", T_ID),
        txt("lote_id", "Lote de emissão (CAP incidents)", T_ID),
        txt("situacao", "Situação", 20, dom("al", "situacao", SITUACOES), "RASCUNHO"),
        txt("natureza", "Natureza (real/exercício/teste)", 12,
            dom("al", "natureza", NATUREZAS), "REAL"),
        txt("origem_registro", "Canal de origem do registro", 12,
            dom("al", "origem", ORIGENS_REGISTRO), "SALA"),
        txt("fonte_gatilho", "Fonte que motivou o alerta", 12,
            dom("al", "fonte", FONTES_GATILHO)),
        txt("fonte_ref", "Referência da fonte (id/link do aviso)", 255),
        # ── o risco ──────────────────────────────────────────────────────
        txt("tipo_risco", "Tipo de risco", 20, dom("al", "tipo", TIPOS_RISCO)),
        txt("evento", "Evento (fenômeno)", 20,
            dom("al", "evento", [(c, n) for c, n, _g, _cb, _ct in EVENTOS])),
        txt("nivel_alerta", "Nível do alerta", 10, dom("al", "nivel", NIVEIS)),
        txt("numero_chamada", "Nº da chamada CAD", 30),
        # meteorológico
        dbl("mm_hora", "Chuva (mm/h)"),
        dbl("mm_24h", "Chuva acumulada em 24 h (mm)"),
        # hidrológico — cota em CENTÍMETROS, como no formulário atual
        txt("bacia", "Bacia", 120),
        txt("rio", "Rio", 120),
        dbl("cota", "Cota do rio (cm)"),
        txt("estacao_codigo", "Código da estação (ANA/SACE)", 20),
        # geológico
        dbl("indice_risco", "Índice de risco (GeoRisk/CEMADEN)"),
        # ── território (nomes = 1º candidato da Sala) ────────────────────
    ] + territorio("al") + [
        txt("local_referencia", "Local de referência (bairro, curso d'água)", 255),
        # ── conteúdo do alerta (CAP info) ────────────────────────────────
        txt("titulo", "Título (CAP headline)", 160),
        txt("descricao", "Descrição (CAP description)", 4000),
        txt("instrucao", "Ação RRD esperada (CAP instruction)", 2000),
        txt("area_desc", "Área afetada (CAP areaDesc)", 500),
        # ── CAP (o que NÃO é derivável de outro campo) ───────────────────
        txt("cap_identifier", "CAP identifier (mensagem original)", 120),
        txt("cap_msg_type", "CAP msgType (última mensagem)", 10,
            dom("al", "capmsg", CAP_MSG_TYPES)),
        txt("cap_escopo", "CAP scope", 12, dom("al", "capesc", CAP_ESCOPOS), "Restricted"),
        txt("cap_urgencia", "CAP urgency", 12, dom("al", "capurg", CAP_URGENCIAS)),
        txt("cap_certeza", "CAP certainty", 12, dom("al", "capcer", CAP_CERTEZAS)),
        txt("cap_resposta", "CAP responseType", 12, dom("al", "capres", CAP_RESPOSTAS)),
        # ── tempos ───────────────────────────────────────────────────────
        data("data_emissao", "Data/hora de emissão (CAP sent)"),
        data("inicio_vigencia", "Início da vigência (CAP onset)"),
        data("valido_ate", "Válido até (CAP expires)"),
        data("prazo_acao", "Prazo para a ação RRD"),
        data("encerrado_em", "Encerrado/cancelado em"),
        txt("motivo_cancelamento", "Motivo do cancelamento", 500),
        # ── ponte com o GeoRescue (opcional) ─────────────────────────────
        txt("id_op", "Operação no GeoRescue (id_op)", 50),
        # ── rastro: PREENCHIDO PELO SERVIDOR, pela sessão (pseudônimo) ───
        txt("criado_por_id", "Criado por (pseudônimo)", T_PSEUDO),
        data("criado_em", "Criado em"),
        txt("emitido_por_id", "Emitido por (pseudônimo)", T_PSEUDO),
        txt("emitido_por_dominio", "Domínio/grupo GeoRescue de quem emitiu", T_DOMINIO),
        txt("alterado_por_id", "Alterado por (pseudônimo)", T_PSEUDO),
        data("alterado_em", "Alterado em"),
    ], [
        idx("idx_sala_al_id", "alerta_id", True, "um registro por alerta"),
        idx("idx_sala_al_cap", "cap_identifier", True, "CAP identifier é único"),
        idx("idx_sala_al_cham", "numero_chamada", False, "alerta → ação → ocorrência"),
        idx("idx_sala_al_sit", "situacao", False, "fila de pendências"),
        idx("idx_sala_al_cob", "cob", False, "recorte por domínio (COB)"),
        idx("idx_sala_al_ibge", "cod_ibge", False, "mapa e boletim por município"),
        idx("idx_sala_al_emis", "data_emissao", False, "período dos indicadores"),
        idx("idx_sala_al_lote", "lote_id", False, "alertas do mesmo lote"),
    ], ponto=True, renderer=renderer_nivel())

SALA_ACOES = _base(
    1, "Sala_Acoes_RRD",
    "Ações de Redução do Risco de Desastres executadas pelas unidades "
    "(substitui o Survey123 Ações RRD). Uma linha por ação.",
    "tipo_acao", [
        txt("acao_id", "Código da ação", T_ID),
        txt("alerta_id", "Alerta de origem", T_ID),         # vazio = ação sem alerta
        txt("numero_chamada", "Nº da chamada CAD", 30),     # copiado do alerta PELO SERVIDOR
        txt("ocorrencia_cad", "Nº CAD da ocorrência gerada (se houve)", 30),
        txt("natureza", "Natureza (real/exercício/teste)", 12,
            dom("ac", "natureza", NATUREZAS), "REAL"),
        txt("origem_registro", "Canal de origem do registro", 12,
            dom("ac", "origem", ORIGENS_REGISTRO), "SALA"),
        txt("tipo_risco", "Tipo de risco", 20, dom("ac", "tipo", TIPOS_RISCO)),
        txt("tipo_acao", "Tipo de ação RRD", 20, dom("ac", "tipoacao", TIPOS_ACAO)),
        txt("resultado", "Resultado", 16, dom("ac", "resultado", RESULTADOS)),
        txt("acao_executada", "Ação executada (descrição)", 2000),
        data("data_acao", "Data/hora da ação"),
    ] + territorio("ac") + [
        txt("local_referencia", "Local de referência (bairro, curso d'água)", 255),
        inteiro("pessoas_orientadas", "Pessoas orientadas"),
        inteiro("pessoas_removidas", "Pessoas removidas preventivamente"),
        inteiro("imoveis_vistoriados", "Imóveis vistoriados"),
        inteiro("imoveis_interditados", "Imóveis interditados"),
        inteiro("efetivo_empregado", "Efetivo empregado"),
        inteiro("viaturas_empregadas", "Viaturas empregadas"),
        # vazio = NÃO RESPONDIDO (regra do `em_servico` do GeoRescue)
        txt("compdec_acionada", "COMPDEC acionada?", 1, dom("ac", "compdec", SIM_NAO)),
        txt("registrado_por_id", "Registrado por (pseudônimo)", T_PSEUDO),
        txt("registrado_por_dominio", "Domínio/grupo GeoRescue de quem registrou", T_DOMINIO),
        data("criado_em", "Criado em"),
        txt("alterado_por_id", "Alterado por (pseudônimo)", T_PSEUDO),
        data("alterado_em", "Alterado em"),
    ], [
        idx("idx_sala_ac_id", "acao_id", True, "um registro por ação"),
        idx("idx_sala_ac_alerta", "alerta_id", False, "ações de um alerta"),
        idx("idx_sala_ac_cham", "numero_chamada", False, "vínculo legado por chamada"),
        idx("idx_sala_ac_cob", "cob", False, "recorte por domínio (COB)"),
        idx("idx_sala_ac_data", "data_acao", False, "período dos indicadores"),
    ], ponto=True)

SALA_DESTINATARIOS = _base(
    2, "Sala_Alertas_Destinatarios",
    "Uma linha por unidade notificada de um alerta: notificação e ciência.",
    "ueop", [
        txt("alerta_id", "Alerta", T_ID),
        txt("dest_nivel", "Nível do destinatário", 10, dom("de", "nivel", NIVEIS_DEST)),
        txt("cob", "COB", T_COB, dom("de", "cob", COBS)),
        txt("ueop", "BBM/Cia Ind (UEOp)", T_UEOP),
        txt("fracao", "Fração (Cia/Pel/posto)", T_FRACAO),
        txt("principal", "Responsável pela ação RRD?", 1, dom("de", "principal", SIM_NAO), "N"),
        txt("situacao_dest", "Situação", 16, dom("de", "situacao", SITUACOES_DEST),
            "AGUARDANDO"),
        txt("canal_notificacao", "Canal da notificação", 10, dom("de", "canal", CANAIS)),
        data("notificado_em", "Notificado em"),
        data("ciente_em", "Ciente em"),
        txt("ciente_por_id", "Ciente por (pseudônimo)", T_PSEUDO),
        txt("ciente_por_dominio", "Domínio/grupo GeoRescue de quem deu ciência", T_DOMINIO),
        txt("redirecionado_para", "Redirecionado para (unidade)", 120),
        txt("observacao", "Observação (sem dado pessoal)", 1000),
        data("criado_em", "Criado em"),
        data("alterado_em", "Alterado em"),
    ], [
        idx("idx_sala_de_alerta", "alerta_id", False, "destinatários de um alerta"),
        idx("idx_sala_de_cob", "cob", False, "caixa de entrada por COB"),
        idx("idx_sala_de_ueop", "ueop", False, "caixa de entrada por UEOp"),
    ])

# SEM DOMÍNIO NENHUM, de propósito: um log não pode recusar valor antigo.
SALA_HISTORICO = _base(
    3, "Sala_Alertas_Historico",
    "Trilha de auditoria do alerta: uma linha por mudança. Só acrescenta.",
    "evento", [
        txt("alerta_id", "Alerta", T_ID),
        txt("alvo_tipo", "Registro afetado (ALERTA/DESTINATARIO/ACAO)", 12),
        txt("alvo_id", "Id do registro afetado", T_ID),
        txt("evento", "Evento", 30),
        txt("situacao_de", "Situação anterior", 20),
        txt("situacao_para", "Situação nova", 20),
        data("quando", "Quando"),
        txt("por_id", "Por (pseudônimo)", T_PSEUDO),
        txt("por_dominio", "Domínio/grupo GeoRescue", T_DOMINIO),
        txt("cap_identifier", "CAP identifier desta mensagem", 120),
        txt("cap_msg_type", "CAP msgType desta mensagem", 10),
        # a mensagem CAP como foi enviada, em JSON (XML seria recusado pelo filtro XSS)
        txt("cap_json", "Mensagem CAP enviada (JSON)", 20000),
        txt("campos_alterados", "Campos alterados", 1000),
        txt("detalhe", "Detalhe (antes → depois, sem dado pessoal)", 2000),
    ], [
        idx("idx_sala_hi_alerta", "alerta_id", False, "linha do tempo de um alerta"),
        idx("idx_sala_hi_quando", "quando", False, "auditoria por período"),
    ], caps=CAPS_SO_ACRES)

SALA_TERRITORIO = _base(
    0, "Sala_Territorio",
    "Articulação operacional: município (IBGE) → fração → UEOp → COB. Uma linha "
    "por município × fração (municípios divididos, como BH, têm mais de uma).",
    "municipio", [
        txt("cod_ibge", "Código IBGE (7 dígitos)", 7),
        txt("municipio", "Município", T_MUN),
        txt("cob", "COB", T_COB, dom("te", "cob", COBS)),
        txt("ueop", "BBM/Cia Ind (UEOp) — como em Unidades_COB", T_UEOP),
        txt("fracao", "Fração (Cia/Pel/posto) — como no unidadelotacao", T_FRACAO),
        txt("area_atuacao", "Área de atuação (quando o município é dividido)", 255),
        txt("sede_fracao", "Município é sede da fração?", 1, dom("te", "sede", SIM_NAO)),
        dbl("latitude", "Latitude da sede municipal (WGS84)"),
        dbl("longitude", "Longitude da sede municipal (WGS84)"),
        txt("ativo", "Ativo", 1, dom("te", "ativo", SIM_NAO), "S"),
        data("vigente_desde", "Vigente desde"),
        txt("fonte", "Documento de origem (ato/BGBM)", 255),
        data("atualizado_em", "Atualizado em"),
        txt("atualizado_por_id", "Atualizado por (pseudônimo)", T_PSEUDO),
    ], [
        idx("idx_sala_te_chave", "cod_ibge,fracao", True, "um par município × fração"),
        idx("idx_sala_te_ibge", "cod_ibge", False, "frações de um município"),
        idx("idx_sala_te_ueop", "ueop", False, "cascata UEOp → fração"),
    ])

SERVICOS = [
    {"nome": SERVICO_ALERTAS,
     "descricao": ("Sala de Situação — Alertas & Ações RRD. RESTRITO: compartilhar só "
                   "com o grupo de editores; nunca com a organização ou público."),
     "snippet": "Alertas emitidos pela Sala de Situação, ciência das unidades, ações RRD e auditoria.",
     "tags": "CBMMG,Sala de Situação,Período Chuvoso,Alertas,RRD,CAP",
     "camadas": [SALA_ALERTAS, SALA_ACOES, SALA_DESTINATARIOS, SALA_HISTORICO],
     "prova": ("Sala_Alertas", ("alerta_id", "cap_identifier"))},
    {"nome": SERVICO_REFER,
     "descricao": "Sala de Situação — catálogo territorial (município → fração → UEOp → COB).",
     "snippet": "Articulação operacional do CBMMG por município (IBGE).",
     "tags": "CBMMG,Sala de Situação,Território,COB,UEOp",
     "camadas": [SALA_TERRITORIO],
     "prova": ("Sala_Territorio", ("cod_ibge", "fracao"))},
]


# ================================================= conferência offline =====
def _norm(t):
    """A MESMA normalização da Sala (campos.ts normalizarIdentificador)."""
    t = unicodedata.normalize("NFD", str(t or ""))
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    t = re.sub(r"[º°ª]", "", t)
    return re.sub(r"[^a-z0-9]", "", t)


# Candidatos que a Sala testa ANTES do campo escolhido (camadas.ts). Se algum
# campo novo tiver esse nome/alias, a Sala resolveria o atributo para ELE.
PROIBIDOS = {
    "Sala_Alertas": ["datain", "mmh", "milimetros", "mmpor", "mmporhora", "indice", "ind",
                     "validade", "data_validade", "inundacao", "nivel_inundacao", "inund",
                     "deslizamento", "desliz", "data", "data_hora", "nivel", "tipo", "risco"],
    "Sala_Acoes_RRD": ["datain", "data", "data_hora", "acao", "acoes", "descricao"],
}


def _conferir_schema():
    erros = []
    for sv in SERVICOS:
        camadas = sv["camadas"]
        ids = [c["id"] for c in camadas]
        if ids != list(range(len(camadas))):
            erros.append("{}: ids não são 0..n-1: {}".format(sv["nome"], ids))
        tipos = ["P" if c.get("geometryType") else "T" for c in camadas]
        if "".join(tipos) != "".join(sorted(tipos)):     # 'P' < 'T'
            erros.append("{}: camada de ponto depois de tabela".format(sv["nome"]))
        doms = set()
        for c in camadas:
            nomes = [f["name"] for f in c["fields"]]
            if len(set(nomes)) != len(nomes):
                erros.append("{}: campo repetido".format(c["name"]))
            if c["displayField"] not in nomes:
                erros.append("{}: displayField inexistente".format(c["name"]))
            for f in c["fields"]:
                if not re.fullmatch(r"[a-z][a-z0-9_]{0,29}", f["name"]):
                    erros.append("{}.{}: nome fora do padrão".format(c["name"], f["name"]))
                d = f.get("domain")
                if d:
                    if d["name"] in doms:
                        erros.append("{}.{}: domínio '{}' repetido no serviço"
                                     .format(c["name"], f["name"], d["name"]))
                    doms.add(d["name"])
                    codigos = [v["code"] for v in d["codedValues"]]
                    longos = [x for x in codigos if len(x) > f.get("length", 0)]
                    if longos:
                        erros.append("{}.{}: código maior que o campo: {}"
                                     .format(c["name"], f["name"], longos))
                    if f.get("defaultValue") is not None and f["defaultValue"] not in codigos:
                        erros.append("{}.{}: default fora do domínio".format(c["name"], f["name"]))
            for i in c["indexes"]:
                for campo in [x.strip() for x in i["fields"].split(",")]:
                    if campo not in nomes:
                        erros.append("{}: índice {} aponta campo inexistente {}"
                                     .format(c["name"], i["name"], campo))
            proib = {_norm(p) for p in PROIBIDOS.get(c["name"], [])}
            for f in c["fields"]:
                if _norm(f["name"]) in proib or _norm(f["alias"]) in proib:
                    erros.append("{}.{}: nome/alias sequestraria a resolução de campos da Sala"
                                 .format(c["name"], f["name"]))
    # cascata tipo_risco → evento: todo grupo citado existe
    grupos = {c for c, _n in TIPOS_RISCO}
    for c, _n, g, _cb, _ct in EVENTOS:
        if g and g not in grupos:
            erros.append("evento {} aponta grupo inexistente {}".format(c, g))
    return erros


# ======================================================= portal (rede) =====
def _credenciais():
    if CREDENCIAIS and os.path.isfile(CREDENCIAIS):
        kv = {}
        with open(CREDENCIAIS, encoding="utf-8") as fh:
            for linha in fh:
                if "=" in linha:
                    k, v = linha.split("=", 1)
                    kv[k.strip().lower()] = v.strip()
        return kv.get("portal", PORTAL), kv.get("usuario", ""), kv.get("senha", "")
    return PORTAL, USUARIO, SENHA


def _todas(flc):
    return list(flc.layers) + list(flc.tables)


def _por_nome(flc, nome):
    return next((c for c in _todas(flc)
                 if str(c.properties.get("name", "")).lower() == nome.lower()), None)


def _acha_servico(gis, nome):
    """Por TÍTULO aqui é aceitável: o serviço pode ainda não existir. A prova de
    que é ESTE serviço vem depois, por campos exclusivos."""
    for tipo in ("Feature Layer Collection", "Feature Service", None):
        try:
            achados = gis.content.search(query='title:"{}"'.format(nome),
                                         item_type=tipo, max_items=50)
        except Exception:                                    # noqa: BLE001
            continue
        it = next((i for i in achados if i.title == nome), None)
        if it:
            return it
    return None


def _criar_servico(gis, sv):
    com_ponto = any(c.get("geometryType") for c in sv["camadas"])
    params = {
        "name": sv["nome"], "serviceDescription": sv["descricao"],
        "hasStaticData": False, "maxRecordCount": 4000,
        "supportedQueryFormats": "JSON", "capabilities": CAPS,
        "allowGeometryUpdates": com_ponto,
        "units": "esriDecimalDegrees" if com_ponto else "esriMeters",
        "xssPreventionInfo": XSS,
    }
    if com_ponto:
        params["spatialReference"] = {"wkid": 4326, "latestWkid": 4326}
        params["initialExtent"] = EXTENT_MG
    item = gis.content.create_service(
        name=sv["nome"], service_type="featureService", has_static_data=False,
        wkid=4326, capabilities=CAPS, create_params=params)
    try:
        item.update(item_properties={"title": sv["nome"], "snippet": sv["snippet"],
                                     "tags": sv["tags"], "description": sv["descricao"]})
    except Exception as e:                                   # noqa: BLE001
        print("    [!] metadados do item:", e, flush=True)
    return item


def _criar_camadas(item, sv):
    """Uma camada por vez (falha nomeia a camada); confere o id OBTIDO."""
    from arcgis.features import FeatureLayerCollection
    flc = FeatureLayerCollection.fromitem(item)
    inventario = {str(c.properties.get("name", "")).lower(): c.properties.get("id")
                  for c in _todas(flc)}
    ocupados = {v: k for k, v in inventario.items()}
    for c in sv["camadas"]:
        nome = c["name"]
        if nome.lower() in inventario:
            print("  [=] {} já existe em /{}".format(nome, inventario[nome.lower()]), flush=True)
            continue
        if c["id"] in ocupados:
            print("[X] o id /{} já é de `{}` — não crio {} às cegas.".format(
                c["id"], ocupados[c["id"]], nome))
            return False
        chave = "layers" if c.get("geometryType") else "tables"
        print("  [+] criando {} (pedindo /{}) …".format(nome, c["id"]), flush=True)
        try:
            flc.manager.add_to_definition({chave: [c]})
        except Exception as e:                               # noqa: BLE001
            print("[X] o portal recusou {}: {}".format(nome, e))
            if COM_GLOBALID:
                print("    Se o erro citar GlobalID, rode de novo com COM_GLOBALID = False.")
            return False
        flc = FeatureLayerCollection.fromitem(item)
        nova = _por_nome(flc, nome)
        if nova is None:
            print("[X] {} criada mas não encontrada de volta — confira no portal.".format(nome))
            return False
        if nova.properties.get("id") != c["id"]:
            print("[!] {}: o portal deu /{} (pedido /{}). Ajuste o catálogo da Sala para o "
                  "id REAL — trocar id de camada publicada é destrutivo."
                  .format(nome, nova.properties.get("id"), c["id"]), flush=True)
        ocupados[nova.properties.get("id")] = nome.lower()
    return True


def garantir_indices(item, c):
    """add_to_definition descarta `indexes`: pede à parte e RELÊ."""
    from arcgis.features import FeatureLayerCollection
    desejados = c["indexes"]
    cam = _por_nome(FeatureLayerCollection.fromitem(item), c["name"])
    if cam is None:
        return [i["name"] for i in desejados]
    tem = {str(i.get("name", "")).lower() for i in (cam.properties.get("indexes") or [])}
    faltam = [i for i in desejados if i["name"].lower() not in tem]
    if faltam:
        try:
            cam.manager.add_to_definition({"indexes": faltam})
        except Exception as e:                               # noqa: BLE001
            print("    [X] índices recusados em {}: {}".format(c["name"], e), flush=True)
    cam2 = _por_nome(FeatureLayerCollection.fromitem(item), c["name"])
    tem2 = {str(i.get("name", "")).lower()
            for i in ((cam2.properties.get("indexes") if cam2 else None) or [])}
    return [i["name"] for i in desejados if i["name"].lower() not in tem2]


def _caps_ok(atual, pedido):
    """Tudo o que foi pedido está lá; e, se o pedido NÃO tem Update/Delete (o
    histórico), eles também não podem estar."""
    tem, quer = set(atual.split(",")) - {""}, set(pedido.split(","))
    proibidas = {"Update", "Delete"} - quer
    return quer <= tem and not (tem & proibidas)


def garantir_capacidades(item, c):
    """Relê `capabilities`; se faltar Create (ou sobrar Update/Delete no
    histórico), tenta corrigir e relê. Devolve o valor final."""
    from arcgis.features import FeatureLayerCollection
    cam = _por_nome(FeatureLayerCollection.fromitem(item), c["name"])
    if cam is None:
        return ""
    atual = str(cam.properties.get("capabilities", ""))
    if not _caps_ok(atual, c["capabilities"]):
        try:
            cam.manager.update_definition({"capabilities": c["capabilities"]})
        except Exception as e:                               # noqa: BLE001
            print("    [!] {}: não consegui ajustar capabilities: {}".format(c["name"], e))
        cam = _por_nome(FeatureLayerCollection.fromitem(item), c["name"])
        atual = str(cam.properties.get("capabilities", "")) if cam else ""
    return atual


def ligar_editor_tracking(item):
    """Liga no SERVIÇO e confere `editFieldsInfo` em cada camada.
    ⚠️ Não testado neste portal (o GeoRescue sempre ligou à mão, pelo item)."""
    from arcgis.features import FeatureLayerCollection
    flc = FeatureLayerCollection.fromitem(item)
    eti = (flc.properties.get("editorTrackingInfo") or {})
    if not eti.get("enableEditorTracking"):
        try:
            flc.manager.update_definition({"editorTrackingInfo": {
                "enableEditorTracking": True,
                # a escrita é toda da conta de serviço: controle por dono não faz sentido
                "enableOwnershipAccessControl": False,
                "allowOthersToQuery": True, "allowOthersToUpdate": True,
                "allowOthersToDelete": True, "allowAnonymousToQuery": False,
                "allowAnonymousToUpdate": False, "allowAnonymousToDelete": False}})
        except Exception as e:                               # noqa: BLE001
            print("    [!] editor tracking recusado: {}".format(e), flush=True)
    flc = FeatureLayerCollection.fromitem(item)
    sem = [c.properties.get("name") for c in _todas(flc)
           if not c.properties.get("editFieldsInfo")]
    if sem:
        print("    [!] sem editor tracking em: {}.\n        No portal: item → Configurações → "
              "'Manter controle de quem criou e atualizou feições'.".format(", ".join(sem)))
    return not sem


def compartilhar(gis, item):
    """Só com o GRUPO. Organização/público dariam leitura direta pela URL REST."""
    achados = [g for g in gis.groups.search('title:"{}"'.format(GRUPO_EDITORES))
               if g.title == GRUPO_EDITORES]
    grupo = achados[0] if achados else None
    if grupo is None and CRIAR_GRUPO_SE_FALTAR:
        grupo = gis.groups.create(title=GRUPO_EDITORES, tags="sala,edicao", access="private",
                                  description="Conta(s) de serviço que gravam na Sala de Situação")
        print("  [+] grupo criado:", GRUPO_EDITORES, flush=True)
    if grupo is None:
        print("  [!] grupo {} não existe — compartilhe à mão.".format(GRUPO_EDITORES))
        return
    try:
        grupo.add_users([EDITOR])
    except Exception as e:                                   # noqa: BLE001
        print("  [!] não consegui pôr {} no grupo: {}".format(EDITOR, e))
    try:
        item.sharing.groups.add(grupo)                       # API 2.3+
    except AttributeError:
        item.share(groups=[grupo.id])                        # API antiga
    nivel = ""
    try:
        nivel = str(item.sharing.sharing_level).upper()
    except Exception:                                        # noqa: BLE001
        nivel = {"public": "EVERYONE", "org": "ORGANIZATION"}.get(item.access, "PRIVATE")
    if "EVERYONE" in nivel or "ORGANIZATION" in nivel:
        print("  ######## ATENÇÃO: {} está aberto para {} — desmarque e deixe só o grupo."
              .format(item.title, nivel))
    else:
        print("  [OK] {} compartilhado só com {}.".format(item.title, GRUPO_EDITORES))


def relatorio(item):
    """Lê DE VOLTA do portal — descreve o que ficou lá, não o que foi pedido.
    Nenhuma LINHA é lida."""
    from arcgis.features import FeatureLayerCollection
    flc = FeatureLayerCollection.fromitem(item)
    print("\n" + "=" * 72 + "\nRELATÓRIO — {} ({})\n{}".format(item.title, item.id, item.url))
    for c in _todas(flc):
        p = c.properties
        campos = ["{}({}{}{})".format(f["name"], f["type"].replace("esriFieldType", ""),
                                      "," + str(f.get("length")) if f.get("length") else "",
                                      ",dom" if f.get("domain") else "")
                  for f in p.get("fields", [])]
        print("/{} {} [{}] caps={} globalId={} editFields={}".format(
            p.get("id"), p.get("name"), p.get("geometryType") or "tabela",
            p.get("capabilities"), p.get("globalIdField"), bool(p.get("editFieldsInfo"))))
        print("   índices:", ", ".join(i.get("name", "") for i in (p.get("indexes") or [])))
        print("   campos({}): {}".format(len(campos), ", ".join(campos)))
    print("=" * 72)


def principal(argv):
    erros = _conferir_schema()
    if erros:
        print("[ABORTADO] schema reprovado — o portal NÃO foi tocado:")
        for e in erros:
            print("   -", e)
        return 1
    total = sum(len(c["fields"]) for sv in SERVICOS for c in sv["camadas"])
    print("[OK] schema conferido: {} serviços, {} camadas, {} campos.".format(
        len(SERVICOS), sum(len(sv["camadas"]) for sv in SERVICOS), total))
    if "--conferir" in argv:
        for sv in SERVICOS:
            for c in sv["camadas"]:
                print("   {:<26} /{} {:<28} {:>3} campos".format(
                    sv["nome"], c["id"], c["name"], len(c["fields"])))
        print("[--conferir] nada foi enviado ao portal.")
        return 0

    portal, usuario, senha = _credenciais()
    if not usuario or usuario == "SEU_ADMIN" or not senha or senha == "SUA_SENHA":
        print("Preencha USUARIO/SENHA ou ARCGIS_CREDENCIAIS antes de rodar.")
        return 1
    from arcgis.gis import GIS
    from arcgis.features import FeatureLayerCollection
    gis = GIS(portal, usuario, senha, verify_cert=VERIFY_CERT)
    print("Conectado como:", gis.users.me.username, "\n", flush=True)

    falhas = []
    for sv in SERVICOS:
        print("── {} ──".format(sv["nome"]), flush=True)
        item = _acha_servico(gis, sv["nome"])
        if item is None:
            item = _criar_servico(gis, sv)
            print("  [+] serviço criado:", item.id, flush=True)
        else:
            # Título é rótulo editável: prova por campos exclusivos antes de
            # escrever. Serviço com camadas e SEM a camada-prova também é alheio.
            nome_prova, campos_prova = sv["prova"]
            flc0 = FeatureLayerCollection.fromitem(item)
            cam = _por_nome(flc0, nome_prova)
            alheio = (cam is None and _todas(flc0)) or (cam is not None and not all(
                x in {f["name"].lower() for f in cam.properties.fields} for x in campos_prova))
            if alheio:
                print("[X] existe um {} que NÃO é este (falta {}). Nada feito.".format(
                    sv["nome"], "/".join(campos_prova)))
                return 1
            print("  [=] serviço já existe:", item.id, flush=True)
        if not _criar_camadas(item, sv):
            return 1
        for c in sv["camadas"]:
            resta = garantir_indices(item, c)
            if resta:
                falhas.append("{}: índices faltando {}".format(c["name"], resta))
            caps = garantir_capacidades(item, c)
            if not _caps_ok(caps, c["capabilities"]):
                falhas.append("{}: capabilities ficaram '{}' (pedido '{}')".format(
                    c["name"], caps, c["capabilities"]))
        if LIGAR_EDITOR_TRACKING and not ligar_editor_tracking(item):
            falhas.append("{}: editor tracking incompleto".format(sv["nome"]))
        compartilhar(gis, item)
        relatorio(item)

    if falhas:
        print("\n[!] CRIADO, MAS COM PENDÊNCIAS (não destrutivas; rode de novo):")
        for f in falhas:
            print("   -", f)
        return 1
    print("""
PRÓXIMOS PASSOS
 1) Semear Sala_Territorio com a articulação operacional OFICIAL (EMBM/3):
    853 municípios × fração, com cod_ibge e coordenadas da sede (IBGE).
 2) Sala: catálogo novo em lib/sources/arcgis/camadas.ts com `where`
    "situacao <> 'RASCUNHO' AND natureza = 'REAL'" e token (serviço privado);
    conferir em /status que cada atributo resolveu para o campo esperado.
 3) Registro de Acessos do GeoRescue: recurso da Sala + domínio de GRUPO dos
    operadores da sala; COBs pelo domínio territorial.
""")
    return 0


if __name__ == "__main__":
    _codigo = principal(sys.argv[1:])
    # numa célula de notebook o sys.exit faria a execução parar MUDA
    try:
        get_ipython()          # noqa: F821
        _em_notebook = True
    except NameError:
        _em_notebook = False
    if not _em_notebook:
        sys.exit(_codigo)
