import type { ConteudoPopup } from "@/lib/mapa";

/**
 * DOM dos balões do mapa. Só createElement + textContent: nenhum valor vindo
 * das fontes é interpretado como HTML. As cores aplicadas vêm das tabelas de
 * simbologia (constantes), nunca dos dados.
 */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classe: string,
  texto?: string,
): HTMLElementTagNameMap[K] {
  const elemento = document.createElement(tag);
  elemento.className = classe;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

function blocoRegistro(conteudo: ConteudoPopup, idTitulo: string | null): HTMLElement {
  const bloco = el("article", "mapa-pop__registro");
  bloco.style.setProperty("--pop-cor", conteudo.cor);

  const topo = el("div", "mapa-pop__topo");
  const marca = el("span", "mapa-pop__marca");
  marca.dataset.forma = conteudo.forma;
  marca.setAttribute("aria-hidden", "true");
  topo.append(marca, el("span", "mapa-pop__tipo", conteudo.tipo));
  bloco.append(topo);

  const titulo = el("h3", "mapa-pop__titulo", conteudo.titulo);
  if (idTitulo) titulo.id = idTitulo;
  bloco.append(titulo);

  if (conteudo.selo) {
    const selo = el("p", "mapa-pop__selo", conteudo.selo.texto);
    selo.dataset.tom = conteudo.selo.tom;
    bloco.append(selo);
  }

  const lista = el("dl", "mapa-pop__campos");
  for (const campo of conteudo.campos) {
    const linha = el("div", "mapa-pop__campo");
    linha.append(el("dt", "", campo.rotulo), el("dd", "", campo.valor));
    lista.append(linha);
  }
  bloco.append(lista);

  if (conteudo.nota) bloco.append(el("p", "mapa-pop__nota", conteudo.nota));
  return bloco;
}

let contador = 0;

/**
 * Conteúdo do balão para um ou mais registros (pontos sobrepostos no mesmo
 * lugar). Mostra até `limite` registros e informa quantos ficaram de fora.
 */
export function criarConteudoPopup(itens: ConteudoPopup[], limite = 4): HTMLElement {
  const raiz = el("div", "mapa-pop");
  const idTitulo = `mapa-pop-titulo-${++contador}`;
  raiz.setAttribute("role", "group");
  raiz.setAttribute("aria-labelledby", idTitulo);

  if (itens.length > 1) {
    raiz.append(el("p", "mapa-pop__resumo", `${itens.length} registros neste ponto`));
  }
  itens.slice(0, limite).forEach((item, i) => raiz.append(blocoRegistro(item, i === 0 ? idTitulo : null)));
  if (itens.length > limite) {
    const restantes = itens.length - limite;
    raiz.append(
      el(
        "p",
        "mapa-pop__nota",
        `e mais ${restantes} ${restantes === 1 ? "registro" : "registros"} — aproxime o mapa para separá-los.`,
      ),
    );
  }
  return raiz;
}
