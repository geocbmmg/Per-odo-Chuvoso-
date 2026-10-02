/**
 * Resposta de EXEMPLO de https://apiprevmet3.inmet.gov.br/avisos/ativos (modo
 * DADOS_EXEMPLO=1 e testes), no formato bruto da fonte: `geocodes` e
 * `municipios` como TEXTO separado por vírgula, `poligono` como GeoJSON dentro
 * de string, `data_*` com "Z" falso e `hora_*` à parte, `riscos` ora lista, ora
 * texto, e o mesmo aviso repetido em `hoje` e `futuro` (como a fonte faz).
 * Passa pelo MESMO parser da produção (lib/sources/inmet/parser-ativos.ts); as
 * datas são deslocadas depois, para o instante de referência virar "agora".
 *
 * Referência temporal: 2026-10-02 12:00 (Brasília). Avisos, números e
 * polígonos fictícios; municípios e códigos IBGE reais.
 *   - 56012 Chuvas Intensas · Perigo (Zona da Mata, MG e RJ), vigente, em `hoje` e `futuro`;
 *   - 56015 Tempestade · Perigo Potencial (região de BH), vigente até 23:59;
 *   - 56018 Acumulado de Chuva · Perigo (Sul de Minas e SP), só em `futuro`, começa às 22:00;
 *   - 56009 Baixa Umidade · Perigo Potencial (Norte de Minas): fora do período chuvoso;
 *   - 56020 Vendaval · Perigo (RS e SC): nenhum município de MG.
 */

export const REFERENCIA_INMET_ATIVOS_EXEMPLO = "2026-10-02T15:00:00.000Z";

const CHUVAS_INTENSAS_ZONA_DA_MATA = {
  id: 56012,
  id_aviso: 28140,
  id_sequencia: 1,
  descricao: "Chuvas Intensas",
  severidade: "Perigo",
  id_severidade: 2,
  aviso_cor: "#F96602",
  inicio: "2026-10-02 08:00",
  fim: "2026-10-03 10:00",
  data_inicio: "2026-10-02T00:00:00.000Z",
  hora_inicio: "08:00",
  data_fim: "2026-10-03T00:00:00.000Z",
  hora_fim: "10:00",
  geocodes: "3136702,3143906,3169901,3115300,3138401,3101508,3113305,3171303,3303906,3305802",
  municipios:
    "Juiz de Fora - MG (3136702),Muriaé - MG (3143906),Ubá - MG (3169901),Cataguases - MG (3115300),Leopoldina - MG (3138401),Além Paraíba - MG (3101508),Carangola - MG (3113305),Viçosa - MG (3171303),Petrópolis - RJ (3303906),Teresópolis - RJ (3305802)",
  microrregioes: "Juiz de Fora, Muriaé, Ubá, Cataguases, Viçosa, Serrana",
  mesorregioes: "Zona da Mata, Metropolitana do Rio de Janeiro",
  estados: "Minas Gerais, Rio de Janeiro",
  regioes: "Sudeste",
  poligono:
    '{"type":"Polygon","coordinates":[[[-43.95,-20.55],[-41.85,-20.35],[-41.75,-21.95],[-42.9,-22.6],[-43.65,-22.45],[-43.95,-20.55]]]}',
  riscos: [
    "Chuva entre 30 e 60 mm/h ou 50 e 100 mm/dia, ventos intensos (60-100 km/h). Risco de corte de energia elétrica, estragos em plantações, queda de árvores e de alagamentos.",
  ],
  instrucoes:
    "Em caso de rajadas de vento: não se abrigue debaixo de árvores, pois há leve risco de queda e descargas elétricas e não estacione veículos próximos a torres de transmissão e placas de propaganda. Obtenha mais informações junto à Defesa Civil (telefone 199) e ao Corpo de Bombeiros (telefone 193).",
  encerrado: false,
  alterado: false,
};

const TEMPESTADE_RMBH = {
  id: 56015,
  id_aviso: 28143,
  id_sequencia: 1,
  descricao: "Tempestade",
  severidade: "Perigo Potencial",
  id_severidade: 1,
  aviso_cor: "#FFFE00",
  inicio: "2026-10-02 10:00",
  fim: "2026-10-02 23:59",
  data_inicio: "2026-10-02T00:00:00.000Z",
  hora_inicio: "10:00",
  data_fim: "2026-10-02T00:00:00.000Z",
  hora_fim: "23:59",
  geocodes: "3106200,3118601,3106705,3156700,3144805,3154606,3157807,3129806",
  municipios:
    "Belo Horizonte - MG (3106200),Contagem - MG (3118601),Betim - MG (3106705),Sabará - MG (3156700),Nova Lima - MG (3144805),Ribeirão das Neves - MG (3154606),Santa Luzia - MG (3157807),Ibirité - MG (3129806)",
  microrregioes: "Belo Horizonte",
  mesorregioes: "Metropolitana de Belo Horizonte",
  estados: "Minas Gerais",
  regioes: "Sudeste",
  poligono:
    '{"type":"Polygon","coordinates":[[[-44.35,-19.65],[-43.75,-19.6],[-43.7,-20.1],[-44.3,-20.15],[-44.35,-19.65]]]}',
  riscos: "Chuva entre 20 e 30 mm/h ou até 50 mm/dia, ventos intensos (40-60 km/h). Baixo risco de corte de energia elétrica, queda de galhos de árvores, alagamentos e de descargas elétricas.",
  instrucoes: [
    "Em caso de rajadas de vento: não se abrigue debaixo de árvores e não estacione veículos próximos a torres de transmissão e placas de propaganda.",
    "Evite usar aparelhos eletrônicos ligados à tomada.",
  ],
  encerrado: false,
  alterado: false,
};

const ACUMULADO_SUL_DE_MINAS = {
  id: 56018,
  id_aviso: 28146,
  id_sequencia: 1,
  descricao: "Acumulado de Chuva",
  severidade: "Perigo",
  id_severidade: 2,
  aviso_cor: "#F96602",
  inicio: "2026-10-02 22:00",
  fim: "2026-10-03 21:59",
  data_inicio: "2026-10-02T00:00:00.000Z",
  hora_inicio: "22:00",
  data_fim: "2026-10-03T00:00:00.000Z",
  hora_fim: "21:59",
  geocodes: "3152501,3151800,3170701,3138203,3132404,3169307,3101607,3509502",
  municipios:
    "Pouso Alegre - MG (3152501),Poços de Caldas - MG (3151800),Varginha - MG (3170701),Lavras - MG (3138203),Itajubá - MG (3132404),Três Corações - MG (3169307),Alfenas - MG (3101607),Campinas - SP (3509502)",
  microrregioes: "Pouso Alegre, Poços de Caldas, Varginha, Lavras, Itajubá, Alfenas, Campinas",
  mesorregioes: "Sul/Sudoeste de Minas, Campo das Vertentes, Campinas",
  estados: "Minas Gerais, São Paulo",
  regioes: "Sudeste",
  poligono:
    '{"type":"Polygon","coordinates":[[[-47.2,-21.3],[-44.8,-21.0],[-44.6,-22.6],[-46.9,-23.0],[-47.2,-21.3]]]}',
  riscos: [
    "Chuva entre 50 e 100 mm/dia. Risco de alagamentos, deslizamentos de encostas, transbordamentos de rios, em cidades com tais áreas de risco.",
  ],
  instrucoes: ["Evite enfrentar o mau tempo.", "Observe alteração nas encostas."],
  encerrado: false,
  alterado: false,
};

const BAIXA_UMIDADE_NORTE = {
  id: 56009,
  id_aviso: 28137,
  id_sequencia: 1,
  descricao: "Baixa Umidade",
  severidade: "Perigo Potencial",
  id_severidade: 1,
  aviso_cor: "#FFFE00",
  inicio: "2026-10-02 11:00",
  fim: "2026-10-02 19:00",
  data_inicio: "2026-10-02T00:00:00.000Z",
  hora_inicio: "11:00",
  data_fim: "2026-10-02T00:00:00.000Z",
  hora_fim: "19:00",
  geocodes: "3143302,3135100,3135209",
  municipios: "Montes Claros - MG (3143302),Janaúba - MG (3135100),Januária - MG (3135209)",
  microrregioes: "Montes Claros, Janaúba, Januária",
  mesorregioes: "Norte de Minas",
  estados: "Minas Gerais",
  regioes: "Sudeste",
  poligono:
    '{"type":"Polygon","coordinates":[[[-45.0,-14.9],[-43.0,-14.9],[-43.2,-17.0],[-44.9,-17.0],[-45.0,-14.9]]]}',
  riscos: ["Umidade relativa do ar variando entre 30% e 20%. Baixo risco de incêndios florestais e à saúde."],
  instrucoes: ["Beba bastante líquido.", "Evite desgaste físico nas horas mais secas."],
  encerrado: false,
  alterado: false,
};

const VENDAVAL_SUL = {
  id: 56020,
  id_aviso: 28150,
  id_sequencia: 1,
  descricao: "Vendaval",
  severidade: "Perigo",
  id_severidade: 2,
  aviso_cor: "#F96602",
  inicio: "2026-10-02 06:00",
  fim: "2026-10-03 06:00",
  data_inicio: "2026-10-02T00:00:00.000Z",
  hora_inicio: "06:00",
  data_fim: "2026-10-03T00:00:00.000Z",
  hora_fim: "06:00",
  geocodes: "4314902,4205407",
  municipios: "Porto Alegre - RS (4314902),Florianópolis - SC (4205407)",
  microrregioes: "Porto Alegre, Florianópolis",
  mesorregioes: "Metropolitana de Porto Alegre, Grande Florianópolis",
  estados: "Rio Grande do Sul, Santa Catarina",
  regioes: "Sul",
  poligono:
    '{"type":"Polygon","coordinates":[[[-51.5,-27.3],[-48.4,-27.3],[-48.4,-30.3],[-51.5,-30.3],[-51.5,-27.3]]]}',
  riscos: ["Ventos intensos (60-100 km/h). Risco de corte de energia elétrica, estragos em plantações e queda de árvores."],
  instrucoes: ["Não se abrigue debaixo de árvores."],
  encerrado: false,
  alterado: false,
};

/** Corpo da resposta como a fonte entrega (antes do parser). */
export const AVISOS_ATIVOS_INMET_EXEMPLO = {
  hoje: [CHUVAS_INTENSAS_ZONA_DA_MATA, TEMPESTADE_RMBH, BAIXA_UMIDADE_NORTE, VENDAVAL_SUL],
  futuro: [CHUVAS_INTENSAS_ZONA_DA_MATA, ACUMULADO_SUL_DE_MINAS],
};
