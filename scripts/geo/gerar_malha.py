#!/usr/bin/env python3
"""
Gera os dados geográficos estáticos da Fase 1 da Sala de Situação (CBMMG):

  municipios-mg.json        malha dos 853 municípios de MG, simplificada SEM quebrar a
                            topologia (fronteiras compartilhadas idênticas, sem frestas
                            nem sobreposições), com {ibge, nome, cob}.
  grade-chuva-mg.json       grade regular de 0,25° sobre MG (+ faixa de ~10 km além da
                            divisa), cada ponto com município/COB.
  grade-chuva-mg-035.json   idem, 0,35°   (alternativa)
  grade-chuva-mg-050.json   idem, 0,50°   (alternativa)
  municipio-ponto-grade.json para cada município, o ponto de grade mais próximo da SEDE
                            (coordenada IBGE), em cada espaçamento.

Insumos (padrão: pasta ../org ao lado deste script e o contorno do app):
  mg-mun.json          tbrugz/geodata-br, geojson/geojs-31-mun.json (fonte: IBGE; CC0).
                       Byte a byte igual a
                       https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-31-mun.json
  municipios.csv       kelvins/municipios-brasileiros, csv/municipios.csv (MIT): código IBGE,
                       nome e coordenada da sede de cada município.
  municipios-cob.json  município -> COB APROXIMADO (org/build.py: mapa SVG dos COBs do
                       GeoRescue georreferenciado e cruzado com a malha municipal).
  mg-outline.json      contorno de MG usado no mapa do app (cópia de
                       GeoRescue webapp/assets/mg-outline.json). Só para conferência.

Quando a camada oficial MG_DISSOLVIDO_COB estiver disponível, exporte-a em GeoJSON
(query ...?where=1=1&outFields=*&outSR=4326&f=geojson) e rode com
  --cobs-oficiais MG_DISSOLVIDO_COB.geojson
para atribuir o COB de cada município pela maior área de interseção.

Uso:  python3 gerar_geo.py            (padrões abaixo; --help lista tudo)
      python3 gerar_geo.py --malha X --sedes Y --cobs-municipio Z --contorno W --saida DIR
      python3 gerar_geo.py --cobs-oficiais MG_DISSOLVIDO_COB.geojson
Requer: Python 3.9+, shapely >= 2.1 (GEOS >= 3.12), numpy. Saídas determinísticas
(sem carimbo de hora): rodar de novo com os mesmos insumos gera os mesmos bytes.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

import numpy as np
import shapely
import shapely.ops
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box, mapping, shape
from shapely.strtree import STRtree

AQUI = os.path.dirname(os.path.abspath(__file__))
COBS = [f"{i}º COB" for i in range(1, 7)]  # "º" = U+00BA, igual a lib/territorio
RAIO_TERRA_KM = 6371.0088
LAT_REF = -18.5  # latitude central de MG para a escala local lon*cos(lat)

# Grafia oficial do IBGE onde o CSV de sedes diverge (conferido com geodata-br e
# datasets-br/city-codes).
CORRECOES_NOME = {"3145455": "Olhos-d'Água"}

# Sedes erradas no CSV de sedes. São Sebastião da Vargem Alegre vem com a coordenada
# de São Gonçalo do Rio Abaixo (-19.7477, -43.3679; ~160 km fora do próprio polígono).
# Correção: mapaslivres/municipios-br tabelas/municipios.csv (ODbL), que cai dentro do
# polígono IBGE. Qualquer outra sede a mais de 1 km fora do próprio polígono é
# trocada pelo ponto interno do polígono e avisada no log.
CORRECOES_SEDE = {"3164431": (-21.0738, -42.6387)}
TOLERANCIA_SEDE_KM = 1.0


# ----------------------------------------------------------------------------- utilidades
def sha12(caminho: str) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()[:12]


def chave(texto: str) -> str:
    t = unicodedata.normalize("NFD", texto).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", t)


def haversine_km(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 2 * RAIO_TERRA_KM * np.arcsin(np.sqrt(a))


def escala(geom):
    """lon*cos(LAT_REF), lat: plano local quase isotrópico para 'mais próximo'."""
    c = math.cos(math.radians(LAT_REF))
    return shapely.transform(geom, lambda xy: xy * np.array([c, 1.0]))


def desescala_xy(x, y):
    return x / math.cos(math.radians(LAT_REF)), y


def normalizar_cob(valor) -> str | None:
    if valor is None:
        return None
    t = chave(str(valor))
    m = re.search(r"([1-6])(?:o|a)?cob", t) or re.search(r"cob([1-6])", t)
    if m:
        return f"{m.group(1)}º COB"
    nomes = {"primeiro": 1, "segundo": 2, "terceiro": 3, "quarto": 4, "quinto": 5, "sexto": 6}
    for n, i in nomes.items():
        if n in t and "cob" in t:
            return f"{i}º COB"
    return None


def escrever_fc(caminho, features, metadados):
    """FeatureCollection compacta, uma feição por linha (diffs legíveis)."""
    with open(caminho, "w", encoding="utf-8") as f:
        f.write('{"type":"FeatureCollection","metadados":')
        f.write(json.dumps(metadados, ensure_ascii=False, separators=(",", ":")))
        f.write(',"features":[\n')
        for i, ft in enumerate(features):
            f.write(json.dumps(ft, ensure_ascii=False, separators=(",", ":")))
            f.write(",\n" if i < len(features) - 1 else "\n")
        f.write("]}\n")


# ------------------------------------------------- simplificação topológica por arcos
class MalhaTopologica:
    """
    Decompõe a cobertura (polígonos que só se tocam nas bordas, com vértices
    coincidentes) em ARCOS: trechos de fronteira entre dois nós (vértices onde se
    encontram 3+ arestas distintas). Cada arco é simplificado UMA vez (Douglas-Peucker
    com as pontas fixas) e reaproveitado pelos dois municípios vizinhos, então as
    fronteiras continuam idênticas: sem frestas, sem sobreposição. Igual em espírito ao
    TopoJSON/mapshaper, mas com tolerância POR ARCO (menor nos municípios pequenos).
    """

    def __init__(self, poligonos):
        # aneis[k] = (indice_poligono, indice_parte, indice_anel, [(x,y), ...] sem repetir o 1º)
        self.poligonos = poligonos
        self.aneis = []
        for ip, g in enumerate(poligonos):
            partes = list(g.geoms) if isinstance(g, MultiPolygon) else [g]
            for jp, p in enumerate(partes):
                for ja, anel in enumerate([p.exterior, *p.interiors]):
                    pts = [tuple(c) for c in anel.coords]
                    if pts[0] == pts[-1]:
                        pts = pts[:-1]
                    # remove repetidos consecutivos
                    pts = [q for i, q in enumerate(pts) if q != pts[i - 1]] if len(pts) > 1 else pts
                    self.aneis.append((ip, jp, ja, pts))
        viz = defaultdict(set)
        for *_, pts in self.aneis:
            n = len(pts)
            for i, q in enumerate(pts):
                viz[q].add(pts[i - 1])
                viz[q].add(pts[(i + 1) % n])
        nos = {q for q, v in viz.items() if len(v) != 2}
        self.arcos = []  # lista de listas de coordenadas
        indice = {}
        self.uso = defaultdict(set)  # arco -> polígonos que o usam
        self.refs = []  # por anel: [(id_arco, invertido)]
        for ip, jp, ja, pts in self.aneis:
            nos_anel = [i for i, q in enumerate(pts) if q in nos]
            if not nos_anel:  # anel sem junção (ilha/enclave): nó canônico = menor ponto
                i0 = min(range(len(pts)), key=lambda i: pts[i])
                nos.add(pts[i0])
                nos_anel = [i0]
            i0 = nos_anel[0]
            rot = pts[i0:] + pts[:i0]
            corte = [i - i0 for i in nos_anel] + [len(pts)]
            rot = rot + [rot[0]]
            refs = []
            for a, b in zip(corte[:-1], corte[1:]):
                arco = tuple(rot[a : b + 1])
                inv = arco[::-1]
                k, invertido = (arco, False) if arco <= inv else (inv, True)
                if k not in indice:
                    indice[k] = len(self.arcos)
                    self.arcos.append(list(k))
                ida = indice[k]
                self.uso[ida].add(ip)
                refs.append((ida, invertido))
            self.refs.append(refs)
        self.nos = nos

    @staticmethod
    def _dp(coords, tol):
        if tol <= 0 or len(coords) <= 2:
            return list(coords)
        if coords[0] == coords[-1]:  # arco fechado: divide no ponto mais distante
            p0 = np.array(coords[0])
            dist = np.hypot(*(np.array(coords) - p0).T)
            m = int(dist.argmax())
            if m in (0, len(coords) - 1):
                return list(coords)
            a = MalhaTopologica._dp(coords[: m + 1], tol)
            b = MalhaTopologica._dp(coords[m:], tol)
            return a + b[1:]
        s = shapely.simplify(LineString(coords), tol, preserve_topology=False)
        return [tuple(c) for c in s.coords]

    def montar(self, tol_arco, casas):
        """Simplifica cada arco com tol_arco[i], arredonda e remonta os polígonos."""
        arcos_s = []
        for i, a in enumerate(self.arcos):
            s = self._dp(a, tol_arco[i])
            s = [(round(x, casas), round(y, casas)) for x, y in s]
            s = [q for j, q in enumerate(s) if j == 0 or q != s[j - 1]]
            arcos_s.append(s)
        aneis = defaultdict(lambda: defaultdict(dict))
        for (ip, jp, ja, _), refs in zip(self.aneis, self.refs):
            pts = []
            for ida, inv in refs:
                seg = arcos_s[ida][::-1] if inv else arcos_s[ida]
                pts.extend(seg if not pts else seg[1:])
            pts = [q for j, q in enumerate(pts) if j == 0 or q != pts[j - 1]]
            aneis[ip][jp][ja] = pts
        saida = []
        for ip in range(len(self.poligonos)):
            partes = []
            for jp in sorted(aneis[ip]):
                rs = aneis[ip][jp]
                ext = rs[0]
                ints = [rs[k] for k in sorted(rs) if k != 0]
                partes.append((ext, ints))
            if len(partes) == 1:
                ext, ints = partes[0]
                saida.append(_poligono_seguro(ext, ints))
            else:
                saida.append(MultiPolygon([_poligono_seguro(e, i) for e, i in partes]))
        return saida, arcos_s


def _poligono_seguro(ext, ints):
    if len(set(ext)) < 3:
        return Polygon()
    return Polygon(ext, [r for r in ints if len(set(r)) >= 3])


def simplificar_malha(geoms, tol_global, fator_area, casas, log):
    """Simplificação por arcos com tolerância adaptativa e verificação/repair iterativo."""
    malha = MalhaTopologica(geoms)
    areas = shapely.area(np.array(geoms))
    tol_poly = np.minimum(tol_global, fator_area * np.sqrt(areas))
    tol_arco = np.array([min(tol_poly[p] for p in malha.uso[i]) for i in range(len(malha.arcos))])
    log(f"  arcos: {len(malha.arcos)}  nós: {len(malha.nos)}  vértices originais: "
        f"{int(shapely.get_num_coordinates(np.array(geoms)).sum())}")
    for rodada in range(12):
        simp, _ = malha.montar(tol_arco, casas)
        arr = np.array(simp, dtype=object)
        ruins = set()
        for i, g in enumerate(simp):
            if g.is_empty or not g.is_valid or g.area <= 0:
                ruins.add(i)
            elif abs(g.area - areas[i]) / areas[i] > 0.10:  # deformação grande
                ruins.add(i)
        if not ruins:
            arestas = shapely.coverage_invalid_edges(arr)
            ruins = {i for i, e in enumerate(arestas) if e is not None and not e.is_empty}
        if not ruins:
            log(f"  rodada {rodada}: malha válida")
            return simp, malha
        log(f"  rodada {rodada}: {len(ruins)} município(s) a refinar")
        for i in range(len(malha.arcos)):
            if malha.uso[i] & ruins:
                tol_arco[i] = tol_arco[i] / 2 if tol_arco[i] > 10 ** -(casas + 1) else 0.0
    raise SystemExit("ERRO: a malha não convergiu para uma cobertura válida")


# ------------------------------------------------------------------------------- insumos
def carregar_insumos(a, log):
    mun = json.load(open(a.malha, encoding="utf-8"))["features"]
    sedes = {}
    for r in csv.DictReader(open(a.sedes, encoding="utf-8")):
        if r["codigo_uf"] == "31":
            sedes[r["codigo_ibge"]] = (r["nome"], float(r["latitude"]), float(r["longitude"]))
    cob_aprox = {m["ibge"]: m["cob"] for m in json.load(open(a.cobs_municipio, encoding="utf-8"))}
    contorno = shape(json.load(open(a.contorno, encoding="utf-8"))["geometry"])

    ids = [f["properties"]["id"] for f in mun]
    assert len(mun) == 853, f"esperava 853 municípios, veio {len(mun)}"
    assert len(set(ids)) == 853 and all(re.fullmatch(r"31\d{5}", i) for i in ids), "códigos IBGE inválidos"
    assert set(ids) == set(sedes) == set(cob_aprox), "malha, sedes e COB não têm os mesmos códigos"
    assert set(cob_aprox.values()) <= set(COBS), f"COB fora do padrão: {set(cob_aprox.values()) - set(COBS)}"

    ordem = sorted(range(len(mun)), key=lambda i: ids[i])
    mun = [mun[i] for i in ordem]
    ids = [ids[i] for i in ordem]
    geoms = []
    for f in mun:
        g = shapely.make_valid(shape(f["geometry"]))
        if g.geom_type == "GeometryCollection":
            g = shapely.union_all([p for p in g.geoms if p.geom_type in ("Polygon", "MultiPolygon")])
        geoms.append(g)
    nomes = {}
    for i, f in zip(ids, mun):
        nomes[i] = CORRECOES_NOME.get(i, sedes[i][0])
    divergentes = [(i, f["properties"]["name"], nomes[i]) for i, f in zip(ids, mun)
                   if f["properties"]["name"] != nomes[i]]
    if divergentes:
        log(f"  nomes: {len(divergentes)} grafia(s) da malha substituída(s) pela do IBGE: {divergentes}")

    # sedes: correções conhecidas + conferência contra o próprio polígono (malha original)
    origem_sede = {}
    for i, g in zip(ids, geoms):
        nome, lat, lon = sedes[i]
        origem_sede[i] = "csv"
        if i in CORRECOES_SEDE:
            lat, lon = CORRECOES_SEDE[i]
            origem_sede[i] = "corrigida (mapaslivres/municipios-br)"
        p = Point(lon, lat)
        if not g.covers(p):
            q1, q2 = shapely.ops.nearest_points(g, p)
            km = float(haversine_km(q1.y, q1.x, p.y, p.x))
            if km > TOLERANCIA_SEDE_KM:
                r = g.representative_point()
                log(f"  AVISO sede de {nome} ({i}) {km:.1f} km fora do polígono; usando ponto interno")
                lat, lon = round(r.y, 4), round(r.x, 4)
                origem_sede[i] = "ponto interno do polígono"
        sedes[i] = (nome, lat, lon)
    corr = {i: o for i, o in origem_sede.items() if o != "csv"}
    log(f"  sedes: {len(corr)} corrigida(s): {corr}")
    return ids, geoms, nomes, sedes, cob_aprox, contorno, origem_sede


def cob_por_camada_oficial(caminho, ids, geoms, campo, log):
    fc = json.load(open(caminho, encoding="utf-8"))["features"]
    polis = []
    for f in fc:
        props = f.get("properties") or {}
        valores = [props[campo]] if campo else list(props.values())
        rot = next((normalizar_cob(v) for v in valores if normalizar_cob(v)), None)
        if rot is None:
            raise SystemExit(f"ERRO: feição sem COB reconhecível em {caminho}: {props}")
        polis.append((rot, shapely.make_valid(shape(f["geometry"]))))
    saida, ambiguos = {}, []
    for i, g in zip(ids, geoms):
        partes = {rot: g.intersection(p).area / g.area for rot, p in polis}
        melhor = max(partes, key=partes.get)
        saida[i] = melhor
        if partes[melhor] < 0.9:
            ambiguos.append((i, {k: round(v, 2) for k, v in partes.items() if v > 0.02}))
    log(f"  COB pela camada oficial; {len(ambiguos)} município(s) com < 90% num só COB")
    return saida


def conferir_com_fracoes(caminho, nomes, cob, log):
    """Cidades-sede de fração no XLSForm oficial (Emissão de Alertas) x COB atribuído."""
    if not caminho or not os.path.exists(caminho):
        return None
    fr = json.load(open(caminho, encoding="utf-8"))
    por_chave = {chave(n): i for i, n in nomes.items()}
    cidades = defaultdict(set)
    for f in fr:
        cidades[chave(f["cidade"])].add(f["cob"])
    ok, dif, fora = 0, [], []
    for c, cobs in cidades.items():
        i = por_chave.get(c)
        if i is None:
            fora.append(c)
        elif cob[i] in cobs:
            ok += 1
        else:
            dif.append((nomes[i], cob[i], sorted(cobs)))
    log(f"  conferência com frações do XLSForm: {ok} cidades conferem, {len(dif)} divergem {dif}, "
        f"{len(fora)} sem município ({fora})")
    return {"cidades_conferidas": ok, "divergentes": dif, "nao_municipio": fora}


# ----------------------------------------------------------------------------------- grade
def gerar_grade(passo, mg, geoms, ids, nomes, cob, faixa_km, log):
    c0 = math.cos(math.radians(LAT_REF))
    minx, miny, maxx, maxy = mg.bounds
    margem = faixa_km / 100 + passo
    i0, i1 = math.floor((miny - margem) / passo), math.ceil((maxy + margem) / passo)
    j0, j1 = math.floor((minx - margem) / passo), math.ceil((maxx + margem) / passo)
    lats = np.array([round(i * passo, 6) for i in range(i1, i0 - 1, -1)])  # norte -> sul
    lons = np.array([round(j * passo, 6) for j in range(j0, j1 + 1)])  # oeste -> leste
    LON, LAT = np.meshgrid(lons, lats)
    lon, lat = LON.ravel(), LAT.ravel()
    shapely.prepare(mg)
    dentro = shapely.contains_xy(mg, lon, lat)
    # distância à divisa (km) dos pontos de fora: ponto mais próximo no plano local + haversine
    mg_e = escala(mg)
    pts_e = shapely.points(lon * c0, lat)
    linha = shapely.shortest_line(pts_e, mg_e)
    fim = shapely.get_coordinates(shapely.get_point(linha, 1))
    flon, flat = desescala_xy(fim[:, 0], fim[:, 1])
    dist = np.where(dentro, 0.0, haversine_km(lat, lon, flat, flon))
    manter = dentro | (dist <= faixa_km)
    lon, lat, dentro, dist = lon[manter], lat[manter], dentro[manter], dist[manter]

    arvore = STRtree(geoms)
    pts = shapely.points(lon, lat)
    idx_mun = np.full(len(pts), -1)
    par = arvore.query(pts, predicate="intersects")
    for p, g in sorted(zip(*par)):  # empate em borda: menor código IBGE
        if idx_mun[p] < 0:
            idx_mun[p] = g
    sem = np.where(idx_mun < 0)[0]
    if len(sem):
        arvore_e = STRtree([escala(g) for g in geoms])
        viz = arvore_e.query_nearest(shapely.points(lon[sem] * c0, lat[sem]), return_distance=False)
        for p, g in zip(*viz):
            if idx_mun[sem[p]] < 0:
                idx_mun[sem[p]] = g
    assert (idx_mun >= 0).all()

    celulas = shapely.box(lon - passo / 2, lat - passo / 2, lon + passo / 2, lat + passo / 2)
    peso = shapely.area(shapely.intersection(celulas, mg)) / (passo * passo)

    tag = f"{int(round(passo * 100)):03d}"
    feats = []
    for k in range(len(lon)):
        i = ids[idx_mun[k]]
        pid = f"{lat[k]:.2f}_{lon[k]:.2f}"
        feats.append({
            "type": "Feature",
            "id": k,
            "properties": {
                "id": pid, "lat": round(float(lat[k]), 4), "lon": round(float(lon[k]), 4),
                "ibge": i, "nome": nomes[i], "cob": cob[i],
                "dentro": bool(dentro[k]), "dist_km": round(float(dist[k]), 1),
                "peso": round(float(peso[k]), 3),
            },
            "geometry": {"type": "Point", "coordinates": [round(float(lon[k]), 4), round(float(lat[k]), 4)]},
        })
    assert len({f["properties"]["id"] for f in feats}) == len(feats)
    est = {
        "passo_graus": passo,
        "pontos": len(feats),
        "dentro_mg": int(dentro.sum()),
        "faixa_externa": int((~dentro).sum()),
        "por_cob_dentro": dict(sorted(Counter(f["properties"]["cob"] for f in feats if f["properties"]["dentro"]).items())),
        "municipios_com_ponto_dentro": len({f["properties"]["ibge"] for f in feats if f["properties"]["dentro"]}),
        "soma_peso": round(float(peso.sum()), 1),
    }
    log(f"  grade {passo}°: {est}")
    return tag, feats, est, np.array(lat), np.array(lon)


# ------------------------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    org = os.path.join(AQUI, "..", "org")
    ap.add_argument("--malha", default=os.path.join(org, "mg-mun.json"))
    ap.add_argument("--sedes", default=os.path.join(org, "municipios.csv"))
    ap.add_argument("--cobs-municipio", default=os.path.join(org, "municipios-cob.json"))
    ap.add_argument("--contorno", default="/home/user/Per-odo-Chuvoso-/public/geo/mg-outline.json")
    ap.add_argument("--fracoes", default="/home/user/Per-odo-Chuvoso-/lib/territorio/fracoes-cbmmg.json",
                    help="frações do XLSForm (só para conferir o COB; opcional)")
    ap.add_argument("--cobs-oficiais", default=None, help="GeoJSON exportado de MG_DISSOLVIDO_COB (opcional)")
    ap.add_argument("--campo-cob", default=None, help="campo do COB na camada oficial (padrão: detectar)")
    ap.add_argument("--saida", default=AQUI)
    ap.add_argument("--tolerancia", type=float, default=0.018, help="tolerância DP máxima (graus)")
    ap.add_argument("--fator-area", type=float, default=0.08,
                    help="tolerância de cada município <= fator * sqrt(área) (graus)")
    ap.add_argument("--casas", type=int, default=3, help="casas decimais das coordenadas da malha")
    ap.add_argument("--passos", default="0.25,0.35,0.5")
    ap.add_argument("--faixa-km", type=float, default=10.0, help="pontos fora de MG até esta distância")
    ap.add_argument("--limite-kb", type=float, default=450.0)
    a = ap.parse_args()
    log = lambda s: print(s, file=sys.stderr)
    os.makedirs(a.saida, exist_ok=True)

    log("1) insumos")
    ids, geoms, nomes, sedes, cob_aprox, contorno, origem_sede = carregar_insumos(a, log)
    origem_cob = "aproximado (SVG dos COBs do GeoRescue x malha municipal; org/build.py)"
    cob = dict(cob_aprox)
    if a.cobs_oficiais:
        cob = cob_por_camada_oficial(a.cobs_oficiais, ids, geoms, a.campo_cob, log)
        origem_cob = f"camada oficial {os.path.basename(a.cobs_oficiais)} (maior área de interseção)"
        mud = [(i, nomes[i], cob_aprox[i], cob[i]) for i in ids if cob_aprox[i] != cob[i]]
        log(f"  {len(mud)} município(s) mudaram de COB em relação ao aproximado: {mud}")
    conf = conferir_com_fracoes(a.fracoes, nomes, cob, log)

    arr = np.array(geoms)
    mg = shapely.union_all(arr)
    assert mg.geom_type == "Polygon" and len(mg.interiors) == 0, "união da malha original com furos/partes"
    assert shapely.coverage_is_valid(arr), "malha original não é cobertura válida"
    hd_contorno = shapely.hausdorff_distance(mg, contorno) * 111.2
    log(f"  malha original: válida, sem furos; Hausdorff até o contorno do app ≈ {hd_contorno:.1f} km")

    log("2) malha simplificada")
    simp, malha = simplificar_malha(geoms, a.tolerancia, a.fator_area, a.casas, log)
    s_arr = np.array(simp, dtype=object)
    valido = shapely.is_valid(s_arr)
    assert valido.all() and not shapely.is_empty(s_arr).any()
    assert shapely.coverage_is_valid(s_arr), "malha simplificada com sobreposição/aresta inválida"
    u = shapely.union_all(s_arr)
    furos = sum(len(p.interiors) for p in (u.geoms if hasattr(u, "geoms") else [u]))
    furos_mun = sum(len(p.interiors) for g in simp for p in (g.geoms if hasattr(g, "geoms") else [g]))
    assert furos == 0 and u.geom_type == "Polygon", "a união da malha simplificada tem frestas"
    areas0 = shapely.area(arr)
    err = np.abs(shapely.area(s_arr) - areas0) / areas0
    hd = np.array([shapely.hausdorff_distance(o, s) for o, s in zip(arr, s_arr)]) * 111.2
    sede_fora = [(i, nomes[i]) for i, g in zip(ids, simp)
                 if not g.covers(Point(sedes[i][2], sedes[i][1]))]
    feats = []
    for i, g in zip(ids, simp):
        gm = mapping(g)
        feats.append({"type": "Feature", "id": int(i),
                      "properties": {"ibge": i, "nome": nomes[i], "cob": cob[i]},
                      "geometry": {"type": gm["type"], "coordinates": gm["coordinates"]}})
    est_malha = {
        "municipios": len(feats),
        "por_cob": dict(sorted(Counter(cob.values()).items())),
        "vertices_original": int(shapely.get_num_coordinates(arr).sum()),
        "vertices_simplificada": int(shapely.get_num_coordinates(s_arr).sum()),
        "tipos": dict(Counter(g.geom_type for g in simp)),
        "furos_em_municipios": furos_mun,
        "uniao_partes": int(shapely.get_num_geometries(u)),
        "uniao_furos": furos,
        "erro_area_max": round(float(err.max()), 4),
        "erro_area_p95": round(float(np.percentile(err, 95)), 4),
        "hausdorff_km_max": round(float(hd.max()), 2),
        "hausdorff_km_p95": round(float(np.percentile(hd, 95)), 2),
        "sedes_fora_do_proprio_poligono": sede_fora,
    }
    meta_malha = {
        "descricao": "Municípios de MG (853), malha simplificada com topologia preservada",
        "fonte_geometria": "IBGE via tbrugz/geodata-br geojson/geojs-31-mun.json (CC0)",
        "fonte_nomes": "IBGE via kelvins/municipios-brasileiros csv/municipios.csv (MIT)",
        "cob": origem_cob,
        "simplificacao": {"metodo": "Douglas-Peucker por arco compartilhado (fronteiras idênticas)",
                          "tolerancia_graus": a.tolerancia, "fator_area": a.fator_area,
                          "casas_decimais": a.casas},
        "crs": "EPSG:4326",
        "insumos_sha256_12": {os.path.basename(p): sha12(p) for p in (a.malha, a.sedes, a.cobs_municipio)},
        "estatisticas": {k: v for k, v in est_malha.items() if k != "sedes_fora_do_proprio_poligono"},
        "gerador": "gerar_geo.py",
    }
    cam_malha = os.path.join(a.saida, "municipios-mg.json")
    escrever_fc(cam_malha, feats, meta_malha)
    kb = os.path.getsize(cam_malha) / 1000  # kB decimais (limite estrito)
    log(f"  municipios-mg.json: {kb:.0f} KB  {est_malha}")
    if kb > a.limite_kb:
        log(f"  AVISO: acima de {a.limite_kb} KB; aumente --tolerancia ou reduza --fator-area")

    # releitura independente do arquivo gerado
    rel = json.load(open(cam_malha, encoding="utf-8"))
    rel_geoms = np.array([shape(f["geometry"]) for f in rel["features"]])
    assert len(rel["features"]) == 853
    assert all(f["geometry"]["coordinates"] for f in rel["features"])
    assert shapely.is_valid(rel_geoms).all() and shapely.coverage_is_valid(rel_geoms)
    assert {f["properties"]["ibge"] for f in rel["features"]} == set(ids)

    log("3) grades de chuva")
    passos = [float(p) for p in a.passos.split(",")]
    grades = {}
    for passo in passos:
        tag, gfeats, est, glat, glon = gerar_grade(passo, mg, geoms, ids, nomes, cob, a.faixa_km, log)
        nome = "grade-chuva-mg.json" if abs(passo - 0.25) < 1e-9 else f"grade-chuva-mg-{tag}.json"
        meta = {
            "descricao": f"Grade regular de {passo}° sobre MG para previsão de chuva (Open-Meteo)",
            "passo_graus": passo,
            "alinhamento": f"nós em múltiplos inteiros de {passo}° (lat/lon)",
            "selecao": f"dentro de MG (união da malha IBGE) ou a até {a.faixa_km:g} km da divisa",
            "propriedades": {
                "id": "lat_lon com 2 casas (estável entre regenerações)",
                "ibge/nome/cob": "município que contém o ponto; fora de MG, o município mais próximo",
                "dentro": "true se o ponto está dentro de MG",
                "dist_km": "distância até a divisa de MG (0 dentro)",
                "peso": "fração da célula (passo x passo) dentro de MG — use como peso em médias",
            },
            "cob": origem_cob,
            "estatisticas": est,
            "gerador": "gerar_geo.py",
        }
        escrever_fc(os.path.join(a.saida, nome), gfeats, meta)
        log(f"  {nome}: {os.path.getsize(os.path.join(a.saida, nome)) / 1024:.0f} KB")
        grades[tag] = (passo, nome, gfeats, est, glat, glon)

    log("4) município -> ponto de grade mais próximo da sede")
    slat = np.array([sedes[i][1] for i in ids])
    slon = np.array([sedes[i][2] for i in ids])
    linhas = []
    resumo = {}
    for tag, (passo, nome, gfeats, est, glat, glon) in grades.items():
        d = haversine_km(slat[:, None], slon[:, None], glat[None, :], glon[None, :])
        j = d.argmin(axis=1)
        dmin = d[np.arange(len(ids)), j]
        resumo[tag] = {"arquivo": nome, "dist_km_max": round(float(dmin.max()), 1),
                       "dist_km_media": round(float(dmin.mean()), 1),
                       "pontos_distintos_usados": int(len(set(j.tolist())))}
        for k, i in enumerate(ids):
            if tag == next(iter(grades)):
                linhas.append({"ibge": i, "nome": nomes[i], "cob": cob[i],
                               "sede_lat": sedes[i][1], "sede_lon": sedes[i][2]})
                if origem_sede[i] != "csv":
                    linhas[-1]["sede_obs"] = origem_sede[i]
            linhas[k][f"g{tag}"] = gfeats[j[k]]["properties"]["id"]
            linhas[k][f"g{tag}_km"] = round(float(dmin[k]), 1)
    log(f"  {resumo}")
    saida_mp = {
        "descricao": "Para cada município de MG, o ponto de grade mais próximo da SEDE municipal "
                     "(coordenada IBGE). Use g025 com grade-chuva-mg.json; g035/g050 com as alternativas.",
        "fonte_sedes": "IBGE via kelvins/municipios-brasileiros csv/municipios.csv; "
                       "correções marcadas em sede_obs",
        "cob": origem_cob,
        "resumo": resumo,
        "gerador": "gerar_geo.py",
        "municipios": linhas,
    }
    with open(os.path.join(a.saida, "municipio-ponto-grade.json"), "w", encoding="utf-8") as f:
        f.write("{" + ",\n".join(
            f"{json.dumps(k, ensure_ascii=False)}:{json.dumps(v, ensure_ascii=False, separators=(',', ':'))}"
            for k, v in saida_mp.items() if k != "municipios"))
        f.write(',\n"municipios":[\n')
        f.write(",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in linhas))
        f.write("\n]}\n")

    relatorio = {"malha": est_malha, "grades": {t: g[3] for t, g in grades.items()},
                 "municipio_ponto": resumo, "conferencia_fracoes": conf,
                 "hausdorff_uniao_x_contorno_app_km": round(hd_contorno, 2)}
    print(json.dumps(relatorio, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
