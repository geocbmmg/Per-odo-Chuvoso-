import { CORES_NIVEL, type NivelRisco } from "@/lib/dominio/matrizes";
import type { ConteudoBalaoRisco } from "@/lib/mapa/risco";

/**
 * DOM do balão do mapa de risco. Só createElement + textContent: nenhum valor
 * vindo das fontes vira HTML. As cores aplicadas vêm de CORES_NIVEL
 * (constantes), nunca dos dados. Reaproveita as classes .mapa-pop do mapa da
 * Visão Geral; o nível vai num selo com cor + palavra.
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string): HTMLElementTagNameMap[K] {
  const elemento = document.createElement(tag);
  elemento.className = classe;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

/** Amostra quadrada do nível (vazada e tracejada quando não há dado). */
function amostra(nivel: NivelRisco | null): HTMLSpanElement {
  const span = el("span", "risco-amostra");
  span.setAttribute("aria-hidden", "true");
  if (nivel) span.style.setProperty("--risco-cor", CORES_NIVEL[nivel].fundo);
  else span.dataset.vazia = "true";
  return span;
}

/** Selo "Laranja · Perigo": fundo na cor do nível e tinta com contraste ≥ 4,5:1. */
export function seloNivel(nivel: NivelRisco | null, texto: string): HTMLElement {
  const selo = el("p", "risco-selo", texto);
  if (nivel) {
    selo.style.setProperty("--risco-cor", CORES_NIVEL[nivel].fundo);
    selo.style.setProperty("--risco-tinta", CORES_NIVEL[nivel].tinta);
  } else {
    selo.dataset.vazio = "true";
  }
  return selo;
}

let contador = 0;

export interface AcoesBalao {
  /** Botão "Aproximar em …" (balão de área). */
  aoAproximar?: () => void;
}

export function criarBalaoRisco(conteudo: ConteudoBalaoRisco, acoes: AcoesBalao = {}): HTMLElement {
  const raiz = el("div", "mapa-pop risco-pop");
  const idTitulo = `risco-pop-titulo-${++contador}`;
  // Recebe o foco ao abrir (o leitor de tela anuncia o título); -1 = fora do Tab.
  raiz.tabIndex = -1;
  raiz.setAttribute("role", "group");
  raiz.setAttribute("aria-labelledby", idTitulo);

  const bloco = el("article", "mapa-pop__registro");
  const topo = el("div", "mapa-pop__topo");
  topo.append(amostra(conteudo.nivel), el("span", "mapa-pop__tipo", conteudo.tipo));
  bloco.append(topo);

  const titulo = el("h3", "mapa-pop__titulo", conteudo.titulo);
  titulo.id = idTitulo;
  bloco.append(titulo);
  if (conteudo.subtitulo) bloco.append(el("p", "risco-pop__subtitulo", conteudo.subtitulo));
  bloco.append(seloNivel(conteudo.nivel, conteudo.rotuloNivel));

  if (conteudo.campos.length) {
    const lista = el("dl", "mapa-pop__campos");
    for (const campo of conteudo.campos) {
      const linha = el("div", "mapa-pop__campo");
      linha.append(el("dt", "", campo.rotulo), el("dd", "", campo.valor));
      lista.append(linha);
    }
    bloco.append(lista);
  }

  if (conteudo.contagem.length) {
    const total = conteudo.totalMunicipios;
    bloco.append(
      el("p", "risco-pop__secao", total === null ? "Municípios por nível" : `${total} municípios por nível`),
    );
    const lista = el("ul", "risco-pop__contagem");
    for (const linha of conteudo.contagem) {
      const item = el("li", "");
      item.append(
        amostra(linha.nivel),
        el("span", "risco-pop__rotulo", linha.rotulo),
        el("span", "risco-pop__n", String(linha.quantidade)),
      );
      lista.append(item);
    }
    bloco.append(lista);
  }

  if (conteudo.itens.length) {
    bloco.append(
      el(
        "p",
        "risco-pop__secao",
        conteudo.itens.length === 1 ? "Alerta vigente" : `${conteudo.itens.length} alertas vigentes`,
      ),
    );
    const lista = el("ul", "risco-pop__itens");
    for (const item of conteudo.itens) {
      const li = el("li", "");
      const cabeca = el("p", "risco-pop__item-titulo");
      cabeca.append(amostra(item.nivel), el("span", "", item.titulo), el("span", "mapa-sr", ` (${item.rotuloNivel})`));
      li.append(cabeca);
      li.append(el("p", "risco-pop__item-meta", `${item.origem} · vigência ${item.vigencia}`));
      lista.append(li);
    }
    bloco.append(lista);
  }

  if (conteudo.nota) bloco.append(el("p", "mapa-pop__nota", conteudo.nota));

  if (conteudo.aproximar && acoes.aoAproximar) {
    const botao = el("button", "risco-pop__aproximar", conteudo.aproximar.rotulo);
    botao.type = "button";
    const aoAproximar = acoes.aoAproximar;
    botao.addEventListener("click", () => aoAproximar());
    bloco.append(botao);
  }

  raiz.append(bloco);
  return raiz;
}
