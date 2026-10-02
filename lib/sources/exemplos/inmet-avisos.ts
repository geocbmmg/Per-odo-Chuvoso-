/**
 * Feed RSS de avisos do INMET usado no modo de demonstração (DADOS_EXEMPLO=1) e
 * nos testes. Reproduz a estrutura real do feed (ver docs/fontes-de-dados.md);
 * as datas são deslocadas para perto do horário atual em exemplos/index.ts.
 * Referência temporal do arquivo: 2026-10-02 12:00 (Brasília).
 */
export const RSS_INMET_EXEMPLO = String.raw`<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
<title>Avisos</title>
<link>https://avisos.inmet.gov.br</link>
<description>Avisos atuais na América do Sul</description>
<!-- About Copyright: Licenca de Uso: O conteudo deste site, podera ser reproduzido desde que citada a fonte, excetuando os casos especificados em contrario e os conteudos replicados de outras fontes. O INMET nao se responsabiliza por eventuais danos que o conteudo hospedado por terceiros possa causar, sejam estes morais ou materiais. -->
<copyright>public domain</copyright>
<language>pt-BR</language>
<pubDate>Fri, 02 Oct 2026 13:04:27 +0000</pubDate>
<item>
<title>Aviso de Acumulado de Chuva. Severidade Grau: Perigo</title>
<link>https://apiprevmet3.inmet.gov.br/avisos/rss/55931</link>
<description><![CDATA[<table border="0" cellspacing="0" cellpadding="3"><tr><th align="left">Status</th><td>Alert</td></tr><tr><th align="left">Evento</th><td>Acumulado de Chuva</td></tr><tr><th align="left">Severidade</th><td>Perigo</td></tr><tr><th align="left">Início</th><td>2026-10-03 00:00:00.0</td></tr><tr><th align="left">Fim</th><td>2026-10-03 23:59:00.0</td></tr><tr><th align="left">Descrição</th><td>INMET publica aviso iniciando em: 03/10/2026 00:00. Chuva entre 30 a 60 mm/h ou 50 a 100 mm/dia. Risco de alagamentos, deslizamentos de encostas, transbordamentos de rios, em cidades com tais áreas de risco.</td></tr><tr><th align="left">Área</th><td>Aviso para as Áreas: Sul/Sudoeste de Minas, Campinas, Oeste de Minas, Ribeirão Preto, Vale do Paraíba Paulista, Macro Metropolitana Paulista, Piracicaba, Campo das Vertentes</td></tr><tr><th align="left">Link Gráfico</th><td><a href='https://avisos.inmet.gov.br/55931'>https://avisos.inmet.gov.br/55931</a></td></tr></table>]]></description>
<pubDate>Sat, 03 Oct 2026 00:00:00 +0000</pubDate>
<guid>https://apiprevmet3.inmet.gov.br/avisos/rss/55931</guid>
</item>
<item>
<title>Aviso de Tempestade. Severidade Grau: Grande Perigo</title>
<link>https://apiprevmet3.inmet.gov.br/avisos/rss/55928</link>
<description><![CDATA[<table border="0" cellspacing="0" cellpadding="3"><tr><th align="left">Status</th><td>Alert</td></tr><tr><th align="left">Evento</th><td>Tempestade</td></tr><tr><th align="left">Severidade</th><td>Grande Perigo</td></tr><tr><th align="left">Início</th><td>2026-10-02 08:30:00.0</td></tr><tr><th align="left">Fim</th><td>2026-10-02 23:59:00.0</td></tr><tr><th align="left">Descrição</th><td>INMET publica aviso iniciando em: 02/10/2026 08:30. Chuva superior a 60 mm/h ou maior que 100 mm/dia, ventos superiores a 100 km/h, e queda de granizo. Grande risco de danos em edificações, corte de energia elétrica, estragos em plantações, queda de árvores, alagamentos e transtornos no transporte rodoviário.</td></tr><tr><th align="left">Área</th><td>Aviso para as Áreas: Metropolitana de Belo Horizonte, Zona da Mata, Campo das Vertentes</td></tr><tr><th align="left">Link Gráfico</th><td><a href='https://avisos.inmet.gov.br/55928'>https://avisos.inmet.gov.br/55928</a></td></tr></table>]]></description>
<pubDate>Fri, 02 Oct 2026 08:30:00 +0000</pubDate>
<guid>https://apiprevmet3.inmet.gov.br/avisos/rss/55928</guid>
</item>
<item>
<title>Aviso de Tempestade. Severidade Grau: Perigo</title>
<link>https://apiprevmet3.inmet.gov.br/avisos/rss/55925</link>
<description><![CDATA[<table border="0" cellspacing="0" cellpadding="3"><tr><th align="left">Status</th><td>Alert</td></tr><tr><th align="left">Evento</th><td>Tempestade</td></tr><tr><th align="left">Severidade</th><td>Perigo</td></tr><tr><th align="left">Início</th><td>2026-10-02 00:00:00.0</td></tr><tr><th align="left">Fim</th><td>2026-10-02 23:59:00.0</td></tr><tr><th align="left">Descrição</th><td>INMET publica aviso iniciando em: 02/10/2026 00:00. Chuva entre 30 e 60 mm/h ou 50 e 100 mm/dia, ventos intensos (60-100 km/h), e queda de granizo. Risco de corte de energia elétrica, estragos em plantações,  queda de árvores e de alagamentos.</td></tr><tr><th align="left">Área</th><td>Aviso para as Áreas: Zona da Mata, Sul Fluminense, Metropolitana de Belo Horizonte, Campo das Vertentes, Vale do Paraíba Paulista, Central Mineira, Centro Fluminense, Oeste de Minas, Noroeste Fluminense, Sul/Sudoeste de Minas, Vale do Rio Doce, Sul Espírito-santense, Metropolitana do Rio de Janeiro, Central Espírito-santense, Triângulo Mineiro/Alto Paranaíba</td></tr><tr><th align="left">Link Gráfico</th><td><a href='https://avisos.inmet.gov.br/55925'>https://avisos.inmet.gov.br/55925</a></td></tr></table>]]></description>
<pubDate>Fri, 02 Oct 2026 00:00:00 +0000</pubDate>
<guid>https://apiprevmet3.inmet.gov.br/avisos/rss/55925</guid>
</item>
<item>
<title>Aviso de Chuvas Intensas. Severidade Grau: Perigo Potencial</title>
<link>https://apiprevmet3.inmet.gov.br/avisos/rss/55919</link>
<description><![CDATA[<table border="0" cellspacing="0" cellpadding="3"><tr><th align="left">Status</th><td>Alert</td></tr><tr><th align="left">Evento</th><td>Chuvas Intensas</td></tr><tr><th align="left">Severidade</th><td>Perigo Potencial</td></tr><tr><th align="left">Início</th><td>2026-10-01 09:40:00.0</td></tr><tr><th align="left">Fim</th><td>2026-10-03 10:00:00.0</td></tr><tr><th align="left">Descrição</th><td>INMET publica aviso iniciando em: 01/10/2026 09:40. Chuva entre 20 e 30 mm/h ou até 50 mm/dia, ventos intensos (40-60 km/h). Baixo risco de corte de energia elétrica, queda de galhos de árvores, alagamentos e de descargas elétricas.</td></tr><tr><th align="left">Área</th><td>Aviso para as Áreas: Sul Baiano, Jequitinhonha, Centro Sul Baiano, Vale do Mucuri, Noroeste Espírito-santense, Vale do Rio Doce, Litoral Norte Espírito-santense</td></tr><tr><th align="left">Link Gráfico</th><td><a href='https://avisos.inmet.gov.br/55919'>https://avisos.inmet.gov.br/55919</a></td></tr></table>]]></description>
<pubDate>Thu, 01 Oct 2026 09:40:00 +0000</pubDate>
<guid>https://apiprevmet3.inmet.gov.br/avisos/rss/55919</guid>
</item>
<item>
<title>Aviso de Ventos Costeiros. Severidade Grau: Perigo Potencial</title>
<link>https://apiprevmet3.inmet.gov.br/avisos/rss/55914</link>
<description><![CDATA[<table border="0" cellspacing="0" cellpadding="3"><tr><th align="left">Status</th><td>Alert</td></tr><tr><th align="left">Evento</th><td>Ventos Costeiros</td></tr><tr><th align="left">Severidade</th><td>Perigo Potencial</td></tr><tr><th align="left">Início</th><td>2026-10-02 06:00:00.0</td></tr><tr><th align="left">Fim</th><td>2026-10-03 12:00:00.0</td></tr><tr><th align="left">Descrição</th><td>INMET publica aviso iniciando em: 02/10/2026 06:00. Intensificação dos ventos nas regiões litorâneas, movimentando dunas de areia sobre construções na orla.</td></tr><tr><th align="left">Área</th><td>Aviso para as Áreas: Sudeste Rio-grandense, Metropolitana de Porto Alegre, Sul Catarinense, Grande Florianópolis, Vale do Itajaí, Norte Catarinense</td></tr><tr><th align="left">Link Gráfico</th><td><a href='https://avisos.inmet.gov.br/55914'>https://avisos.inmet.gov.br/55914</a></td></tr></table>]]></description>
<pubDate>Fri, 02 Oct 2026 06:00:00 +0000</pubDate>
<guid>https://apiprevmet3.inmet.gov.br/avisos/rss/55914</guid>
</item>
<item>
<title>Aviso de Baixa Umidade. Severidade Grau: Perigo Potencial</title>
<link>https://apiprevmet3.inmet.gov.br/avisos/rss/55211</link>
<description><![CDATA[<table border="0" cellspacing="0" cellpadding="3"><tr><th align="left">Status</th><td>Alert</td></tr><tr><th align="left">Evento</th><td>Baixa Umidade</td></tr><tr><th align="left">Severidade</th><td>Perigo Potencial</td></tr><tr><th align="left">Início</th><td>2026-07-31 12:00:00.0</td></tr><tr><th align="left">Fim</th><td>2026-07-31 18:00:00.0</td></tr><tr><th align="left">Descrição</th><td>INMET publica aviso iniciando em: 31/07/2026 12:00. Umidade relativa do ar variando entre 30% e 20%. Baixo risco de incêndios florestais e à saúde.</td></tr><tr><th align="left">Área</th><td>Aviso para as Áreas: Noroeste de Minas, Leste Goiano, Norte de Minas, Distrito Federal, Triângulo Mineiro/Alto Paranaíba, Noroeste Goiano, Norte Goiano, Sul Goiano</td></tr><tr><th align="left">Link Gráfico</th><td><a href='https://avisos.inmet.gov.br/55211'>https://avisos.inmet.gov.br/55211</a></td></tr></table>]]></description>
<pubDate>Fri, 31 Jul 2026 12:00:00 +0000</pubDate>
<guid>https://apiprevmet3.inmet.gov.br/avisos/rss/55211</guid>
</item>
</channel>
</rss>`;

export const REFERENCIA_RSS_INMET_EXEMPLO = "2026-10-02T15:00:00.000Z";
