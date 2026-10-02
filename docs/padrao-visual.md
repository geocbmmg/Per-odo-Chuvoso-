# Padrão visual da Sala de Situação

Referência para qualquer tela nova. A Sala de Situação **segue o padrão de produto do
GeoRescue** (plataforma do CBMMG): mesmos tokens, raios, sombras, tipografia e padrões de
cartão, pílula, aba e trilho. Não crie identidade visual nova; quando faltar algo, derive
dos tokens abaixo.

- Tokens e utilitários: [`app/globals.css`](../app/globals.css)
- Primitivos (shadcn/ui, estilo new-york, escritos à mão): [`components/ui/`](../components/ui)
- Casca e blocos da Sala: [`components/layout/`](../components/layout)
- Navegação (fonte única): [`lib/navegacao.ts`](../lib/navegacao.ts)

## 1. Origem

Tudo foi extraído, só para leitura, do repositório do GeoRescue:

| O quê | Onde no GeoRescue |
|---|---|
| Tokens do tema escuro / claro | `Index.html:76-99` / `Index.html:100-127` |
| Eixo do acento (ouro × escuro/claro) | `Index.html:135-206` |
| Derivados (`--gr-line`, `-soft`, `-line`, `--hover`, `--zebra`) | `Index.html:210-260` |
| Foco visível | `Index.html:44327` |
| Scrollbar | `Index.html:302-305` |
| Trilho lateral (244/64px, itens de 40px, ativo com 3 sinais) | `Index.html:3322-3449`, `3363-3376` |
| Faixa de abertura `.gr-hero` / eyebrow | `Index.html:3466-3490` |
| Cabeçalho de página `.cap-pagehead` | `Index.html:3724-3746` |
| Cartão-módulo `.cap-mod` | `Index.html:3775` |
| Pílulas e badges | `Index.html:2801`, `2931`, `2963`, `3133`, `44135` |
| Botões `.btn-acc`, `.btn-acc-out`, `.cfg-abrir`, `.cfg-mini` | `Index.html:2825-2828`, `3987-4005` |
| Tabela `.dash-tbl` | `Index.html:691-699` |
| Abas `.gr-abas` / `.dash-nav` | `Index.html:4656` / `659-669` |
| Tarja de simulação | `webapp/painel.html:2610-2657` |
| Cores dos COBs | `Index.html:2657-2662` (contorno claro em `44259-44264`) |
| Contorno de MG | `webapp/assets/mg-outline.json` → `public/geo/mg-outline.json` |

## 2. Tema

- Atributo `data-tema="escuro" | "claro"` no `<html>`, gerenciado pelo `next-themes`
  (`components/layout/provedor-tema.tsx`). **Escuro é o padrão**; "Automático" segue o
  sistema operacional. A escolha fica em `localStorage["sala-situacao:tema"]`.
- Acento **ouro fixo** (`data-acento="ouro"` no `<html>`). A Sala não oferece Azul/Verde.
- Variante Tailwind `dark:` = `[data-tema="escuro"]`. Quase nunca é necessária: os tokens já
  mudam sozinhos com o tema. Use `dark:` só para exceções pontuais.
- Sem `data-tema` (antes do script do next-themes), `:root` já tem os tokens do escuro.

## 3. Tokens

Toda cor translúcida é `rgba(var(--X-rgb), α)` — o mesmo α funciona nos dois temas.

| Token | Escuro | Claro | Uso | Tailwind |
|---|---|---|---|---|
| `--gr-bg` | `#0A0E14` | `#F2F4F7` | fundo da página | `bg-gr-bg`, `bg-background` |
| `--sup-1/2/3` | `#0F141C` `#131922` `#1B2330` | `#FFF` `#F7F9FB` `#EDF1F6` | superfícies em camadas | `bg-sup-1`… |
| `--gr-surface` | `rgba(19,25,34,.6)` | `rgba(255,255,255,.82)` | cartões/painéis | `bg-superficie` |
| `--gr-ink` / `ink2` / `mut` / `faint` | `#E6EAF0` `#AEB6C2` `#868F9C` `#5A6371` | `#10151C` `#39424F` `#4A5462` `#545D69` | texto: principal / secundário / apagado / micro | `text-ink`, `text-ink-2`, `text-mut`, `text-faint` |
| `--gr-ink-forte` | `#FFF` | `#0B1017` | títulos | `text-ink-forte` |
| `--linha-rgb` | `255,255,255` | `16,21,28` | bordas e véus | `border-linha/12`, `bg-linha/5` |
| `--gr-line` | `rgba(linha,.09)` | idem | borda padrão | `border-border` |
| `--acc` | `#F1C23C` | `#7A5800` | preenchimento de acento | `bg-primary` |
| `--acc-txt` / `--acc-forte` | `#F1C23C` / `#FBDC74` | `#6E4F00` / `#5A4000` | texto em acento / número KPI | `text-acc-txt`, `text-acc-forte` |
| `--acc-rgb` | `241,194,60` | `110,79,0` | fundos/molduras translúcidos | `bg-acc/12`, `border-acc/34` |
| `--acc-ink` | `#0A0E14` | `#FFF` | tinta sobre o acento | `text-acc-ink` |
| `--ok` | `#43C67C` | `#0B5C33` | sucesso | `bg-ok/14`, `text-ok-txt` |
| `--perigo` / `-txt` | `#E11D48` / `#FB7185` | `#B01F34` / `#A81B30` | erro, perigo | `bg-perigo/16`, `text-perigo-txt` |
| `--alerta` | `#FF8A45` | `#8F3110` | atenção (laranja: com acento ouro o âmbar é a marca) | `bg-alerta/14`, `text-alerta-txt` |
| `--info` | `#38BDF8` | `#0B6570` | informação | `bg-info/16`, `text-info-txt` |
| `--sombra-k` | `1` | `.42` | escala de todas as sombras | — |

Derivados prontos: `--acc-soft/-line`, `--ok-soft/-line`, `--perigo-soft/-line`,
`--alerta-soft/-line`, `--info-soft/-line`, `--hover`, `--zebra`, `--tinta-cheia` (`#FFF`
sobre preenchimento semântico sólido) e `--tinta-fixa` (`#0A0E14` sobre chip de cor fixa).

**Acento sólido × translúcido.** `bg-primary` é `--acc` exato; `bg-acc/α` usa `--acc-rgb`
(no claro, a cor do texto de acento), exatamente como o GeoRescue faz nos fundos "soft".

### Variáveis do shadcn

Mapeadas conforme `visual-tokens.md §10`: `--background`=`--gr-bg`, `--card`=`--sup-1`,
`--popover`=`--sup-2`, `--primary`=`--acc`, `--secondary`/`--muted`=`--sup-3`,
`--muted-foreground`=`--gr-mut`, `--accent`=acento .15, `--destructive`=`--perigo`,
`--border`=`--gr-line`, `--input`=linha .12, `--ring`=`--acc-forte`, `--radius`=12px,
`--sidebar*` = trilho. `--chart-1..5` = acento, info, ok, alerta, neutro.

### Tipografia, raios, sombras

- Fonte do sistema, sem webfont: `'Segoe UI', system-ui, -apple-system, Roboto, sans-serif`.
  Corpo de 14px. Mono: `ui-monospace, SFMono-Regular, Menlo, monospace`.
- **Números sempre `tabular-nums`**; números grandes de KPI com o utilitário `numero`
  (tabular + `letter-spacing:-.02em`).
- Caixa alta é **CSS** (`uppercase` + `tracking`), nunca o texto digitado em maiúsculas.
- Escala: título de página 20px/700/.02em · título de cartão 16px/700/.03em · eyebrow
  10.5–11.5px/700/.22em em `--acc-txt` · rótulo de seção 11–12px/700/.18em em `--gr-faint` ·
  cabeçalho de tabela 10px/700/.09em · micro-rótulo de KPI 9.5–11.5px/700–800.
- Raios: 8px (botão pequeno) · 9px (botão, input) · 10px (item de menu, aba) · 12px
  (cartão de operação, popover) · 14px (KPI, tabela, painel) · 16px (cartão grande,
  módulo) · 999px (pílula). Utilitários `rounded-sm/md/lg/xl` = 8/10/12/16px; para 9 e 14
  use `rounded-[9px]` e `rounded-[14px]`.
- Sombras (todas × `--sombra-k`): `shadow-cartao`, `shadow-cartao-hover`, `shadow-menu`,
  `shadow-modal`, `shadow-acc` (brilho do botão primário), `shadow-halo` (chip de ícone).

## 4. Regras de design (do código do GeoRescue)

1. **Dois sinais, nunca só a cor.** Estado = cor + palavra, forma (ponto redondo, quadrado,
   losango), traço tracejado ou peso. Item ativo = fundo + barra de 3px + peso.
2. **Cor como dado** (COBs, risco, mapa) é literal e **não segue o tema**. A interface é toda
   feita com tokens.
3. **Acento** só para ativo, primário, foco e chips. Nada de acento decorativo.
4. **Números** com `tabular-nums`.
5. **Contraste ≥ 4,5:1 medido no tema claro** — por isso os textos do claro não espelham os
   do escuro. Não use `--gr-faint` em texto que precise ser lido com atenção no escuro.
6. **`prefers-reduced-motion`** respeitado globalmente (animações e transições param; o
   estado continua visível).
7. **Componentes globais**, nunca presos a um `#id` de tela.
8. **Sem rolagem horizontal na página.** Tabelas largas rolam dentro do próprio contêiner
   (`Table` já faz isso). Use `min-w-0` em filhos de flex/grid.

Mais: foco visível em tudo (`outline: 2px solid var(--acc-forte)`), alvos de toque ≥ 44px no
celular (utilitário `alvo-toque` amplia a área sem mudar o desenho; o elemento precisa de
`relative`), interface em português do Brasil e datas sempre por `lib/datas.ts`
(fuso `America/Sao_Paulo`).

## 5. Casca (layout)

```
┌──────────┬───────────────────────────────────────────────┐
│ Trilho   │ [Tarja de demonstração — só com DADOS_EXEMPLO=1]│
│ brasão   │ Cabeçalho institucional: data · CBMMG · período │
│ Sala de  ├───────────────────────────────────────────────┤
│ Situação │ CabecalhoPagina (ícone, TÍTULO, subtítulo, ações│
│ itens    │ conteúdo da página (.sala-pagina, padding 20/12)│
│ Aparência│ Rodapé: créditos das fontes · CBMMG             │
└──────────┴───────────────────────────────────────────────┘
```

- **Trilho** (`trilho-lateral.tsx`): ≥1024px fixo em 244px, recolhível para 64px
  (preferência em `localStorage["sala-situacao:trilho"]`, espelhada no cookie `sala-trilho`
  para o servidor já desenhar certo); 768–1023px nasce recolhido; <768px some e vira a
  **gaveta** (`gaveta-navegacao.tsx`, botão ☰ de 38px no cabeçalho). Brasão do CBMMG com
  monograma "CBMMG" de reserva.
- Variante Tailwind **`trilho-mini:`** — estilos do trilho recolhido (ex.:
  `trilho-mini:sr-only` no rótulo). Funciona por CSS, sem JavaScript.
- **Itens de navegação** vêm de `lib/navegacao.ts` (`NAVEGACAO`, com rota, rótulo,
  descrição, ícone lucide, grupo e situação `"ativo" | "em-breve"`). Para criar um módulo,
  acrescente o item lá: trilho, gaveta, 404 e Visão Geral provisória o pegam sozinhos.
- **Cabeçalho institucional** (`cabecalho-institucional.tsx`): data por extenso calculada no
  servidor a cada requisição, linha "CBMMG · Sala de Situação — Período Chuvoso", pílula do
  período chuvoso vigente e o slot `extra` (indicador de saúde das fontes).

## 6. Componentes

### Blocos da Sala (`components/layout/`)

| Componente | Para quê |
|---|---|
| `CabecalhoPagina` | Topo de toda página: `titulo`, `subtitulo`, `icone` (lucide), `acoes` (botões, carimbo), `children` (sub-abas). Sangra até as bordas da área de conteúdo; `sangria={false}` para usar no meio da página. |
| `CarimboAtualizacao` | Obrigatório em **todo bloco de dados**: `{ atualizadoEm, origem, erro?, fonte? }` vindos de `Leitura`/`meta`. Mostra "Atualizado às HH:MM · há N min"; `ultima-valida` → pílula de alerta com o erro na dica; `exemplo` → pílula info. |
| `IdadeRelativa` | "há 3 min" isolado, atualizado a cada 30 s, sem mismatch de hidratação. |
| `AvisoDadosExemplo` | Tarja fixa (tom info) do modo de demonstração. Já está no layout. |
| `RodapeCreditos` | Créditos das fontes (termos de uso). Já está no layout. |
| `EmConstrucao` | Cartão de módulo futuro: o que vai entregar, o que substitui, o que usar enquanto isso. |
| `AlternarTema` | Escuro / Claro / Automático. `variante="menu"` (trilho) ou `"segmentado"` (gaveta). |

### Primitivos (`components/ui/`)

| Primitivo | Variantes / notas |
|---|---|
| `Button` | `default` (= `.btn-acc`, acento cheio), `outline` (= `.btn-acc-out`), `secondary`/`neutro` (= `.cfg-abrir`), `ghost`, `destructive`, `link`. Tamanhos `default` 36px, `sm` 30px, `lg` 40px, `icon`/`icon-sm`/`icon-lg`. `asChild` para links. |
| `Card` | `padrao` (.dash-*, raio 14), `destaque` (barra de 3px no acento, .op-card-uni), `vidro` (.gr-kpi), `modulo` (.cap-mod). `CardTitle` já é caixa alta 16px. `CardFooter` = .dash-foot. |
| `Badge` | Pílula: `neutro`, `acento`, `ok`, `alerta`, `perigo`, `info` (fundo .12–.16, borda .40, tinta `-txt`, caixa alta). `marcador` acrescenta a forma por estado (redondo, quadrado, losango). |
| `Table` | .dash-tbl: contêiner com rolagem horizontal própria, `th` fixo 10px caixa alta, zebra .02, hover acento .08, `TableCaption` = rodapé .dash-foot. |
| `Tabs` | `TabsList variant="chip"` (.gr-abas) ou `"sublinhado"` (.dash-nav, para sub-abas de módulo). |
| `Tooltip` | Balão sup-3. Não abre por toque: nunca esconda informação só nele. |
| `DropdownMenu` | Menu sup-2, raio 10, item em foco com acento .12; itens com 44px em tela de toque. |
| `Sheet` | Gaveta com véu `rgba(sombra,.55·k)`; `side` = left/right/top/bottom. |
| `Skeleton`, `Separator` | Carregamento (pulsa; para com movimento reduzido) e filete de 1px. |

### Exemplo de bloco de dados

```tsx
<Card>
  <CardHeader>
    <CardTitle>Alertas por COB</CardTitle>
    <CardAction>
      <CarimboAtualizacao atualizadoEm={meta.atualizadoEm} origem={meta.origem} erro={meta.erro} fonte="Emissão de Alertas" />
    </CardAction>
  </CardHeader>
  <CardContent>…</CardContent>
</Card>
```

KPI no padrão `.dash-kpi`: rótulo `text-[9.5px] font-bold uppercase tracking-[.05em] text-mut`,
número `numero text-[1.85rem] font-extrabold leading-none text-ink`, faixa lateral de 3px na
cor do indicador (`border-l-[3px]`). KPI do portal (`.gr-kpi`): `Card variant="vidro"` e número
`text-[32px] font-bold text-acc-forte numero`.

## 7. Cores-dado

Iguais nos dois temas (a cor identifica o dado). Use as variáveis no mapa e nas legendas.

| COB | `--cob-N` (preenchimento) | `--cob-N-contorno` escuro | claro |
|---|---|---|---|
| 1º | `#F1C23C` | `#F6D06A` | `#9B7A18` |
| 2º | `#5FA07A` | `#7FC59A` | `#3E6E52` |
| 3º | `#4E86C4` | `#74A6E0` | `#2F5A88` |
| 4º | `#D08A3E` | `#EAA85A` | `#8E5C25` |
| 5º | `#9AA0AC` | `#C2C8D2` | `#646A76` |
| 6º | `#C05F58` | `#E07E76` | `#863E39` |

Opacidade do preenchimento no mapa: `--cob-preenchimento-opacidade` (.16 no escuro, .78 no
claro). Utilitários: `bg-cob-3`, `border-cob-3-contorno`.

**Escala de risco** (recomendação do levantamento; não existe como token no GeoRescue):

| Nível | Cor | Tinta sobre a cor |
|---|---|---|
| Normal | `--risco-normal` `#2E8B57` | `--risco-normal-tinta` `#FFF` |
| Atenção | `--risco-atencao` `#EAB308` | `--risco-atencao-tinta` `#1A1A1A` |
| Alerta | `--risco-alerta` `#CC6E1F` | `--risco-alerta-tinta` `#1A1A1A` |
| Perigo | `--risco-perigo` `#E11D48` | `--risco-perigo-tinta` `#FFF` |

O risco **não** reaproveita `--alerta` (que, com acento ouro, já é o laranja da interface).
Preenchimentos sólidos de risco servem para mapa, legenda e números grandes; para texto
pequeno, use amostra de cor + palavra em `text-ink` (o branco sobre `#2E8B57` fica em 4,25:1).

Contorno de MG: `public/geo/mg-outline.json` (GeoJSON `Feature`/`MultiPolygon`, WGS84) —
camada `line` branca, 1.4px, opacidade .85, como no GeoRescue.

## 8. O que foi adaptado e por quê

| Adaptação | Motivo |
|---|---|
| Só o acento ouro, sem seletor de acento | A Sala é uma tela operacional única; o eixo de acento não agrega e só multiplica casos de contraste. |
| `next-themes` no lugar do script anti-piscada próprio | Mesmo efeito (atributo no `<html>` antes da pintura), suportado pelo React/Next. Chaves de armazenamento próprias da Sala. |
| Cabeçalho institucional compacto (gr-hero sem saudação nem logo do produto) | A Sala não tem login pessoal nesta fase; o nome do produto fica no trilho, junto do brasão. A data é do servidor, no fuso de Brasília. |
| Pílula do período chuvoso no cabeçalho | Contexto operacional permanente da Sala (tracejada quando fora do período). |
| Tarja de demonstração em tom **info** (não vermelho) | É aviso de dado fictício, não alarme; o vermelho fica reservado a perigo real. |
| Ícone próprio (`app/icon.svg`: gota sobre escudo, ouro sobre `#0A0E14`) | A águia e o logotipo são marca do GeoRescue. |
| Brasão do CBMMG por URL do portal + monograma de reserva | Não está no repositório; ver `public/marca/README.md`. |
| `lucide-react` no lugar de Bootstrap Icons | Equivalente direto do traço usado no app de celular do GeoRescue. |
| Corpo de 14px (o Index usa 12,8px) | Valor do app de celular do GeoRescue; melhor leitura em telas pequenas. |
| Rodapé com créditos das fontes | O GeoRescue não tem rodapé global; aqui os termos de uso das fontes (Open-Meteo CC BY 4.0, INMET) exigem atribuição. |
| Tinta escura no risco "alerta" | `#1A1A1A` sobre `#CC6E1F` dá 4,8:1; branco daria 3,6:1. |

## 9. Checklist de tela nova

- [ ] `CabecalhoPagina` com título, subtítulo e ícone do item em `lib/navegacao.ts`.
- [ ] `export const metadata = { title: "…" }` (o layout completa "· Sala de Situação — CBMMG").
- [ ] Todo bloco de dados com `CarimboAtualizacao` (medição real, nunca selo fixo).
- [ ] Estados com dois sinais (cor + palavra/forma); números `tabular-nums`.
- [ ] Testada a 360px de largura: sem rolagem horizontal, alvos ≥ 44px.
- [ ] Testada nos temas escuro e claro; texto ≥ 4,5:1 no claro.
- [ ] Datas e horas só por `lib/datas.ts`; textos em português do Brasil.
