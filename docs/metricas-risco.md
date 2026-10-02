# Métricas de risco: matrizes de alerta da Sala de Situação

A Sala de Situação classifica os alertas por **três matrizes**, uma por tipo de risco do
formulário "Emissão de Alertas":

| Tipo de risco (Survey123) | Matriz | Medida |
|---|---|---|
| Meteorológico (`Metereologico`) | Matriz de Níveis de Alerta e Mobilização | chuva em mm/h e acumulado em 24 h |
| Geológico (`Geologico`) | Índice de risco do GeoRisk/CEMADEN | índice de risco (adimensional) |
| Hidrológico (`Hidrologico`) | Níveis de inundação do SACE (Serviço Geológico do Brasil) | cota da estação (cm) |

## Fonte e validade

- **Imagens enviadas pelo usuário em 02/10/2026**: a matriz de chuva, a tabela do índice
  geológico e a tabela dos níveis hidrológicos. As notas do formulário exibem figuras com os
  nomes `matriz.jpg`, `geologico.png` e `inundacao.png`.
- **XLSForm "Emissão de Alertas"**: as restrições (`constraint`) dos campos `mmh`, `mmpor` e
  `indice`, e as listas `tipo`, `nivel`, `inundacao` e `deslizamento`.

> **Os valores são referência e podem mudar** a cada período chuvoso ou por decisão do CBMMG.
> Todos os números, textos e cores ficam num só lugar: **`lib/dominio/matrizes.ts`**. Para
> mudar uma matriz, altere esse arquivo e este documento. Os testes
> (`tests/matrizes.test.ts`) acusam lacuna ou sobreposição entre faixas, contraste de cor
> abaixo de 4,5:1 e divergência com as restrições do formulário.

As tabelas das seções 1.1, 1.2, 2.1 e 3.1 são **transcrição integral** das imagens: os
textos estão completos e com a grafia original (ver a seção 6). As tabelas "adotado no
código" mostram como o sistema interpreta cada linha.

---

## Escala única de níveis e cores

As três matrizes usam a mesma escala de gravidade (`NivelRisco`). No painel, "laranja" é a
mesma cor em qualquer tipo de risco.

| Nível (`NivelRisco`) | Cor (fundo) | Tinta sobre a cor | Contraste | Chuva | Geológico | Hidrológico |
|---|---|---|---|---|---|---|
| `verde` | `#88C485` | `#0A0E14` | 9,47:1 | Normalidade | Extremamente baixo, Muito baixo | Normal |
| `amarelo` | `#EFE921` | `#0A0E14` | 15,06:1 | Alerta | Baixo (tom próprio `#FFF2CC`, tinta `#0A0E14`, 17,34:1), Moderado | Atenção |
| `laranja` | `#F8982B` | `#0A0E14` | 8,77:1 | Perigo | Alto | Alerta |
| `vermelho` | `#EE312D` | `#0A0E14` | 4,71:1 | Perigo severo | Muito alto | Inundação |
| `roxo` | `#5F4D9F` | `#FFFFFF` | 6,89:1 | Desastre | Extremamente alto | — |

- Os tons foram amostrados da coluna "Nível do Alerta" da matriz de chuva. As imagens
  geológica e hidrológica usam cores puras de planilha (`#93C47D`, `#FFFF00`, `#FF9900`,
  `#FF0000`, `#9900FF`). O sistema não as usa, para manter uma escala só.
- Sobre o vermelho, o branco dá só 4,11:1. Por isso a tinta é escura, como na própria matriz.
- `#0A0E14` é a `--tinta-fixa` do padrão visual.
- As cores são iguais nos dois temas, porque a cor identifica o dado.

> Os tokens CSS `--risco-verde` … `--risco-roxo` (`app/globals.css`, documentados em
> `docs/padrao-visual.md` §7) repetem estes valores. Um teste em `tests/matrizes.test.ts`
> confere que continuam iguais.

---

## 1. Chuva (tipo Meteorológico): Matriz de Níveis de Alerta e Mobilização

### 1.1 Níveis, critério e cenário (transcrição)

| Nível do Alerta | Critério de Classificação de Risco | Cenário de Risco |
|---|---|---|
| **VERDE (NORMALIDADE)** | **SEM RISCO**<br>Previsão de chuvas fracas.<br>**Chuva fraca:** ≤ 6 mm/h | Condições meteorológicas, hidrológicas e geológicas dentro da normalidade, com demanda compatível com a capacidade operacional ordinária do CBMMG. |
| **AMARELO (ALERTA)** | **BAIXO**<br>**Chuvas fracas e moderadas:** > 6 mm e ≤ 30 mm/h ou 60 mm em 24h | Indícios de risco em formação: chuvas moderadas ou acumulados relevantes em 24h; ocorrência que acarretem desequilíbrio localizados. |
| **LARANJA (PERIGO)** | **MODERADO**<br>**Chuvas fortes:** > 30 mm e ≤ 70 mm/h ou > 90 mm em 24h | Ocorrências significativas em andamento relacionadas aos critérios meteorológicos; Aumento da demanda dos serviços de bombeiros, que exigem esforços superiores à capacidade normal de resposta. |
| **VERMELHO (PERIGO SEVERO)** | **ELEVADO**<br>**Chuvas muito fortes:** > 70 mm e ≤ 90 mm/h ou > 120 mm em 24h | Eventos de maior severidade, com desastres de impacto e necessidade de resposta ampliada simultânea; Aumento excessivo da demanda dos serviços de bombeiros, necessitando de apoio externo. |
| **ROXO (DESASTRE)** | **CRÍTICO**<br>**Chuvas extremas:** > 90 mm/h ou ≥ 170 mm em 24h | Desastres de grande complexidade; Todos os esforços e apoios externos disponíveis são necessários para dar a resposta adequada à população. |

### 1.2 Ações para o Gerenciamento de Risco (transcrição)

| Nível | Sala de Situação | UEOp | COB/CEB | Mobilização Tropa |
|---|---|---|---|---|
| **VERDE** | Monitoramento de rotina; Emissão preventiva de avisos quando necessário. | Acompanhamento de rotina; Execução de ações de GRD anteriores ao periodo crítico. | Acompanhamento das ações das UEOp. | Serviço ordinário (1º esforço). |
| **AMARELO** | Intensificação do monitoramento através dos órgãos oficiais CEMADEN, INMET, CPTEC; Comunicação de assistência junto às UEOPs; Avisos preventivos ao menos 1 vez ao dia. | Intensificar vistorias em locais vulneráveis. Avaliação para instalação de ponto base em locais prioritários de maior vulnerabilidade; Preparação de equipes para pronto atendimento a ocorrência típicas do período; Interlocução com COMPDECs. | Acompanhamento e supervisão da execução do planejamento das UEOp. Ativar planos regionais | Serviço ordinário (1º esforço). |
| **LARANJA** | Intensificação do monitoramento, ampliando a interlocução com CINDEC, com foco nos municípios com histórico de eventos hidrológicos e geológicos; Boletim diário com o panorama de risco para o Estado; Emissão de alertas específicos às UEOp. | Ativação e acionamento da equipe do NAC; Disponibilização do efetivo administrativo para emprego operacional; Vigilância (ponto-base) em áreas de maior vulnerabilidade. Suporte aos municípios em situação de emergência. | Monitoramento da situação na região e de possível acionamento das GU de referência com integrantes do NAC para apoio entre UEOp. Articulação e interlocução com as REDECs para monitoramento dos impactos na região. Avaliação quanto a necessidade de instalação de sala de situação regional | Serviço ordinário (1º esforço); NAC; Efetivo Administrativo (2º esforço). Possibilidade de empenho do 3º Esforço (COB e UEOp distintas) |
| **VERMELHO** | Acompanhamento da situação nas UEOp com as salas de situação regionais instaladas; Intensificação da interlocução e integração com CINDEC. Emissão de avisos periódicos (3x ao dia) | Ativação e acionamento da equipe do NAC; Redução significativa de atividades meio não essenciais. Ativação de Posto de Comando para gerenciamento das ocorrências. Possibilidade de adotar jornada extraordinária do serviço operacional (3x3 ou 5x5). | Remanejamento dos NAC para atendimento em UEOp prioritárias. Instalação de Sala de Situação Regional no COB; Diretrizes para a redução das atividades meio não essenciais e jornada extraordinária do serviço operacional; Avaliar necessidade do apoio do serviço especializado. | Serviço ordinário (1º esforço); NAC; Reforço operacional (2º, 3º e 4º esforço); Possibilidade de recobrimento pelo BEMAD |
| **ROXO** | Trabalho integrado ao Gabinete de Crise Estadual; Articulação com as salas de situação regionais e centros operativos de outras forças e órgãos. | Instalação/Integração ao Gabinete de Crise local com demais órgãos. Interrupção de atividades meio não essenciais. | Solicitação do emprego do serviço especializado; Integração ao Gabinete de Crise local e regional | Emprego de serviço especializado interno e externo (BEMAD, LIGABOM); Suporte das FFAA; Acionamento de ajuda humanitária; Organização de serviços voluntários. |

### 1.3 Limiares adotados no código

| Nível | Chuva máxima (mm/h) | Acumulado em 24 h (mm) | Código no Survey123 (`nivel`) |
|---|---|---|---|
| Verde | ≥ 0 e ≤ 6 | ≥ 0 e < 60 | — (não se emite alerta) |
| Amarelo | > 6 e ≤ 30 | ≥ 60 e ≤ 90 | `Amarelo_Alerta` |
| Laranja | > 30 e ≤ 70 | > 90 e ≤ 120 | `Laranja_Perigo` |
| Vermelho | > 70 e ≤ 90 | > 120 e < 170 | `Vermelho_Perigo_Severo` |
| Roxo | > 90 | ≥ 170 | `Roxo_Desastre` |

- **Regra:** `classificarChuva({ mmHoraMax, mm24h })` classifica cada critério e devolve **o
  mais grave dos dois**, porque a matriz usa "ou".
  - Exemplo: 5 mm/h com 130 mm em 24 h → **vermelho**.
- Sem nenhum dado válido, devolve `null`. Valor negativo, `NaN` ou infinito conta como sem dado.
- Para mostrar qual critério definiu o nível, use `classificarChuvaDetalhada`.
- No formulário, `mmh` e `mmpor` são inteiros: "> 6" equivale a "≥ 7". Fontes automáticas
  (INMET, Open-Meteo) trazem decimais, e os limites acima valem exatamente para elas.

---

## 2. Geológico: índice de risco GeoRisk/CEMADEN

### 2.1 Transcrição

| Nível do Alerta | Índice de Risco | Atuação da sala de situação |
|---|---|---|
| Extremamente baixo e muito baixo (verde) | extremamente baixo (menor que 0,40);<br>muito baixo (0,40 até 0,70) | Não há evidências suficientes para alegar que há possibilidade de deslizamentos de terra, sendo improvável que ocorram. |
| Baixo (amarelo claro) | (0,70 até 1,00) | Há pouca evidência sobre a possibilidade dos limiares serem alcançados, sendo pouco provável que ocorram deslizamentos de terra. Caso ocorram, devem ser pontuais, em áreas urbanas ou à margem de rodovias. |
| Moderado (amarelo) | (1,00 até 1,80) | Há evidências suficientes para alegar a possibilidade de ocorrência de deslizamentos. É provável que ocorram de forma pontual dentro da região que apresenta este nível de risco, normalmente em áreas urbanas ou à margem de rodovias. Além disso, é pouco provável que ocorram eventos esparsos ou em encostas naturais. |
| Alto (laranja) | (1,60 até 2,6) | Há muitas evidências sobre a possibilidade de ocorrência de deslizamentos de terra. São esperados deslizamentos em algumas localidades dentro da região que apresenta este nível de risco. Não se descarta a possibilidade de eventos esparsos ou em encostas naturais. |
| Muito alto (vermelho) | (de 2,60 até 3,40) | É muito provável que ocorram deslizamentos de terra em várias localidades dentro da região que apresenta este nível de risco, com possibilidade de eventos generalizados e com alto potencial de impacto. Não se descarta a possibilidade de corridas de lama ou fluxo de detritos. |
| Extremamente alto (roxo) | (maior que 3,40) | Situação crítica, onde é quase certo que ocorram deslizamentos de terra em muitas localidades dentro da região que apresenta este nível de risco, com potencial de impacto muito alto associado. É provável que ocorram corridas de massa ou fluxo de detritos. |

### 2.2 Faixas adotadas no código

| Classe (`ClasseGeologica`) | Índice adotado | Nível | Código no Survey123 (`deslizamento`) |
|---|---|---|---|
| `extremamente_baixo` | ≥ 0 e < 0,40 | verde | — |
| `muito_baixo` | ≥ 0,40 e < 0,70 | verde | — |
| `baixo` | ≥ 0,70 e < 1,00 | amarelo (tom amarelo claro) | — |
| `moderado` | ≥ 1,00 e < 1,60 | amarelo | — |
| `alto` | ≥ 1,60 e < 2,60 | laranja | `Laranja_Alto` |
| `muito_alto` | ≥ 2,60 e ≤ 3,40 | vermelho | `Vermelho_Muito_Alto` |
| `extremamente_alto` | > 3,40 | roxo | `Roxo_Extremamente_Alto` |

`classificarIndiceGeologico(indice)` devolve a classe e `nivelDoIndiceGeologico(indice)`
devolve o nível. Índice ausente, negativo ou `NaN` dá `null`. Os valores de fronteira
seguem as inconsistências 6 e 7 da seção 5.

---

## 3. Hidrológico: níveis de inundação do SACE

### 3.1 Transcrição

| Nível do Alerta | Detalhamento | Atuação da sala de situação |
|---|---|---|
| Normal | **Condição de normalidade.** | Condições meteorológicas, hidrológicas e geológicas dentro da normalidade, com demanda compatível com a capacidade operacional ordinária do CBMMG.. |
| Atenção | **Possibilidade moderada de ocorrência de inundação.** | Monitoramento/Emissão de alertas, se todos os demais radares de previsão metereológica convergirem para a mesma informação. |
| Alerta | **Possibilidade elevada de ocorrência de inundação.** | Alerta com acompanhamento das ações locais. Consultar os relatórios e os mapas de inundação para assessorar as Unidades/frações com informações relevantes.Fazer contato telefônico com a Unidade/fração. |
| Inundação | **Cota em que o primeiro dano é observado no município** | Alerta com acompanhamento das ações locais. Consultar os relatórios e os mapas de inundação para assessorar as Unidades/frações com informações relevantes. Fazer contato telefônico com a Unidade/fração |

### 3.2 Correspondência adotada no código

| Nível hidrológico (`NivelHidrologico`) | Cor da imagem | Nível | Código no Survey123 (`inundacao`) |
|---|---|---|---|
| `normal` | verde | verde | — |
| `atencao` | amarelo | amarelo | — |
| `alerta` | laranja | laranja | `Laranja_Alerta` |
| `inundacao` | vermelho | vermelho | `Vermelho_Inundacao` |

Não há limiar numérico global. Cada estação do SACE tem as próprias cotas de atenção, alerta
e inundação, e o formulário registra a cota observada em centímetros. Por isso o código não
classifica a cota, só converte o nível informado.

---

## 4. Códigos do Survey123 ("Emissão de Alertas")

Os códigos (coluna `name`) são o valor gravado na feição. Os rótulos (coluna `label`) estão
copiados como aparecem no formulário, inclusive com os erros de grafia.

| Lista | Código | Rótulo no formulário | Conversão |
|---|---|---|---|
| `tipo` | `Metereologico` | Metereológico (Chuva) | `meteorologico` |
| `tipo` | `Hidrologico` | Hidrológico (Inuncação) | `hidrologico` |
| `tipo` | `Geologico` | Geológico | `geologico` |
| `nivel` | `Amarelo_Alerta` | Amarelo (Alerta) | `amarelo` |
| `nivel` | `Laranja_Perigo` | Laranja (Perigo) | `laranja` |
| `nivel` | `Vermelho_Perigo_Severo` | Vermelho (Perigo Servero) | `vermelho` |
| `nivel` | `Roxo_Desastre` | Roxo (Desastre) | `roxo` |
| `inundacao` | `Laranja_Alerta` | Laranja (Alerta) | `alerta` → `laranja` |
| `inundacao` | `Vermelho_Inundacao` | Vermelho (Inundação) | `inundacao` → `vermelho` |
| `deslizamento` | `Laranja_Alto` | Laranja (Alto) | `alto` → `laranja` |
| `deslizamento` | `Vermelho_Muito_Alto` | Vermelho (Muito Alto) | `muito_alto` → `vermelho` |
| `deslizamento` | `Roxo_Extremamente_Alto` | Roxo (Extremamente Alto) | `extremamente_alto` → `roxo` |

Funções de conversão:

| Função | Aceita | Devolve |
|---|---|---|
| `nivelDoCodigoSurvey` | código ou rótulo das listas `nivel`, `inundacao` e `deslizamento`; o nome da cor sozinho ("Laranja"); "Verde (Normalidade)"; "Vermelho (Perigo Severo)" | `NivelRisco` |
| `tipoRiscoDoCodigoSurvey` | lista `tipo` e a grafia correta ("Meteorológico") | `TipoRisco` |
| `nivelHidrologicoDoCodigoSurvey` | lista `inundacao` e os nomes da matriz ("Atenção") | `NivelHidrologico` |
| `classeGeologicaDoCodigoSurvey` | lista `deslizamento` e os nomes da matriz ("Moderado") | `ClasseGeologica` |

Todas ignoram caixa, acento, espaço e pontuação. Assim, `Laranja_Perigo`, "Laranja (Perigo)"
e "LARANJA PERIGO" dão o mesmo resultado. Valor desconhecido ou que não é texto devolve
`null`. Os nomes de alerta sem cor ("Alerta", "Perigo") **não** são aceitos, porque mudam de
cor conforme a matriz (inconsistência 8).

---

## 5. Inconsistências encontradas e decisões

| # | Onde | O que diverge | Decisão |
|---|---|---|---|
| 1 | Chuva, 24 h, Amarelo | A imagem diz só "60 mm em 24h", sem operador nem teto. | Adotado o formulário: **≥ 60 e ≤ 90**. |
| 2 | Chuva, 24 h, Laranja e Vermelho | A imagem só dá o piso ("> 90", "> 120"). | Adotado o teto do formulário: Laranja **≤ 120**, Vermelho **< 170**. Roxo **≥ 170** (imagem e formulário concordam). |
| 3 | Chuva, Verde | A imagem só traz o critério por hora (≤ 6 mm/h). | Adotado **< 60 mm em 24 h**, o complemento do Amarelo. |
| 4 | Chuva, Amarelo a Vermelho | "> 6 mm e ≤ 30 mm/h": o piso está escrito em "mm". | Lido como mm/h, como no formulário. |
| 5 | Chuva × formulário | A matriz usa **"ou"** (basta um critério). O formulário valida **os dois** campos contra a faixa do **mesmo** nível. Assim, 5 mm/h com 130 mm em 24 h não passa em nenhum nível. | O sistema segue a matriz e usa o critério **mais grave**. **Sugestão:** revisar a restrição do formulário. |
| 6 | Geológico | "Moderado (1,00 até 1,80)" e "Alto (1,60 até 2,6)" se sobrepõem entre 1,60 e 1,80. | Adotado o formulário (`Laranja_Alto` a partir de 1,6): Moderado **< 1,60**, Alto **≥ 1,60**. |
| 7 | Geológico | 0,70, 1,00 e 2,60 são limite de duas linhas ("até 0,70" e "0,70 até"). No formulário, 2,6 é aceito tanto em Laranja quanto em Vermelho. | No valor de fronteira vale a **classe mais grave** (precaução, e coerente com o formulário em 1,6 e 2,6): 0,70 → Baixo, 1,00 → Moderado, 2,60 → Muito alto. **Exceção:** 3,40 fica em Muito alto, porque Extremamente alto é "maior que 3,40" na imagem e "> 3,4" no formulário. |
| 8 | Entre matrizes | "Alerta" é **amarelo** na chuva ("Amarelo (Alerta)") e **laranja** na hidrológica ("Laranja (Alerta)"). | A conversão nunca usa o nome do alerta sozinho, sempre a cor ou o código completo. |
| 9 | Formulário | Só há códigos a partir do nível em que se emite alerta. Chuva: a partir do Amarelo. Hidrológico: Laranja e Vermelho, sem "Atenção". Geológico: a partir do Laranja. | Os níveis abaixo existem no código (para mapas e previsões), mas não têm código do Survey123. |
| 10 | Formulário | Erros de grafia: "Vermelho (Perigo Servero)", "Hidrológico (Inuncação)" e o código `Metereologico`. | O código é o valor gravado na feição, então fica como está. As conversões aceitam também a grafia correta. |
| 11 | Geológico × Hidrológico | A geológica tem 6 linhas (7 classes) e um amarelo claro. A hidrológica não tem roxo. | Baixo e Moderado → `amarelo`, com Baixo no tom amarelo claro. A hidrológica vai até `vermelho`. |

## 6. Grafias mantidas como no original

A transcrição respeita a grafia das imagens. Se for corrigir, corrija na fonte oficial e
depois aqui e no código:

- Chuva, Verde, UEOp: "anteriores ao **periodo** crítico" (sem acento; no Amarelo está "período").
- Chuva, Amarelo, Sala de Situação: "junto às **UEOPs**" (nas outras células: "UEOp").
- Chuva, Amarelo, cenário: "ocorrência que acarretem desequilíbrio localizados".
- Hidrológico, Normal: "ordinária do **CBMMG..**" (dois pontos finais).
- Hidrológico, Atenção: "previsão **metereológica**".
- Hidrológico, Alerta: "informações **relevantes.Fazer**" (sem espaço).
- As células "Alerta" e "Inundação" da hidrológica têm o mesmo texto de atuação. Só a
  pontuação muda.

## 7. No código

| Export de `lib/dominio/matrizes.ts` | Conteúdo |
|---|---|
| `NIVEIS_RISCO`, `NivelRisco`, `gravidade`, `maisGrave`, `ehNivelRisco` | escala única, do verde ao roxo |
| `CORES_NIVEL`, `COR_AMARELO_CLARO`, `CorNivel` | cor de fundo e tinta (contraste ≥ 4,5:1) |
| `Faixa`, `dentroDaFaixa`, `descreverFaixa` | intervalos com limite inclusivo ou exclusivo explícito; texto para legenda ("> 6 e ≤ 30 mm/h") |
| `MATRIZ_CHUVA`, `classificarChuva`, `classificarChuvaDetalhada` | seção 1 |
| `MATRIZ_GEOLOGICA`, `CLASSES_GEOLOGICAS`, `classificarIndiceGeologico`, `nivelDoIndiceGeologico` | seção 2 |
| `MATRIZ_HIDROLOGICA`, `NIVEIS_HIDROLOGICOS` | seção 3 |
| `OPCOES_SURVEY`, `TIPOS_RISCO`, `nivelDoCodigoSurvey`, `tipoRiscoDoCodigoSurvey`, `nivelHidrologicoDoCodigoSurvey`, `classeGeologicaDoCodigoSurvey` | seção 4 |

O módulo é puro: não lê rede, ambiente nem relógio. Pode ser usado no servidor e no
navegador.

## Uso nos dados normalizados

Cada alerta lido do ArcGIS traz `nivelRisco` (`verde` … `roxo`), calculado a partir do
campo de nível do seu tipo de risco (`nivel`, `inundacao` ou `deslizamento`) por
`nivelDoCodigoSurvey()`. Se o texto não estiver nas listas do formulário, vale a cor no
início do rótulo ("Laranja - …"). Um nome de alerta sem cor ("Alerta") fica `null`: o
nome sozinho é ambíguo (inconsistência 8). É esse campo que o mapa de risco usa para
colorir.

