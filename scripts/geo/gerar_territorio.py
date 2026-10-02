#!/usr/bin/env python3
"""Gera os dados estáticos de território do mapa de risco e da chuva.

Entradas (scripts/geo/insumos/, ver README.md):
  municipios-mg.json   malha dos 853 municípios simplificada com topologia
                       preservada ({ibge, nome, cob}; COB aproximado)
  municipios.csv       sedes municipais do IBGE (kelvins/municipios-brasileiros, MIT)
Mais a tabela oficial de frações: lib/territorio/fracoes-cbmmg.json.

Saídas:
  public/geo/municipios-mg.json   malha com {ibge, nome, cob, ueop}
  public/geo/ueops-mg.json        áreas APROXIMADAS das UEOp (dissolve dos municípios)
  lib/territorio/municipios-mg.json  [{ibge, nome, cob, ueop, fracao, lat, lon}]

UEOp APROXIMADA: não existe tabela oficial município → fração. Cada município
vai para a fração cuja cidade-sede é a mais próxima da sua sede, DENTRO do seu
COB. Sai quando a EMBM/3 publicar a articulação (docs/fase-1.md §6).

Requer shapely 2.
"""
import csv, json, math, os, unicodedata
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
INSUMOS = os.path.join(RAIZ, "scripts", "geo", "insumos")


def chave(texto):
    t = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn" and c.isalnum())


def distancia_km(a, b):
    (lat1, lon1), (lat2, lon2) = a, b
    p = math.pi / 180
    h = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def arredondar(coords, casas=3):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], casas), round(coords[1], casas)]
    return [arredondar(c, casas) for c in coords]


def main():
    malha = json.load(open(os.path.join(INSUMOS, "municipios-mg.json"), encoding="utf-8"))
    sedes = {}
    with open(os.path.join(INSUMOS, "municipios.csv"), encoding="utf-8") as f:
        for linha in csv.DictReader(f):
            if linha["codigo_uf"] == "31":
                sedes[linha["codigo_ibge"]] = (float(linha["latitude"]), float(linha["longitude"]), linha["nome"])
    por_nome = {chave(nome): (lat, lon) for (lat, lon, nome) in sedes.values()}
    fracoes = json.load(open(os.path.join(RAIZ, "lib", "territorio", "fracoes-cbmmg.json"), encoding="utf-8"))

    # Frações operacionais (sem a sede do próprio COB) com a coordenada da cidade.
    candidatas = []
    for f in fracoes:
        if f["ueop"].endswith("COB"):
            continue
        cidade = "Belo Horizonte" if f["cidade"].startswith("Barreiro") else f["cidade"]
        coord = por_nome.get(chave(cidade))
        if coord is None:
            raise SystemExit(f"Cidade da fração sem sede IBGE: {f['cidade']}")
        candidatas.append({**f, "coord": coord})

    territorio = []
    for feicao in malha["features"]:
        p = feicao["properties"]
        lat, lon, _ = sedes[p["ibge"]]
        do_cob = [c for c in candidatas if c["cob"] == p["cob"]]
        # Mais próxima; empate (mesma cidade) fica com a sede da UEOp.
        melhor = min(do_cob, key=lambda c: (round(distancia_km((lat, lon), c["coord"]), 3), not c["sede"]))
        territorio.append({
            "ibge": p["ibge"], "nome": p["nome"], "cob": p["cob"], "ueop": melhor["ueop"],
            "fracao": melhor["fracao"], "lat": round(lat, 4), "lon": round(lon, 4),
        })
    por_ibge = {t["ibge"]: t for t in territorio}

    # Malha pública com o território (o mapa liga tudo pelo código IBGE).
    features = []
    for feicao in malha["features"]:
        t = por_ibge[feicao["properties"]["ibge"]]
        features.append({
            "type": "Feature",
            "properties": {"ibge": t["ibge"], "nome": t["nome"], "cob": t["cob"], "ueop": t["ueop"]},
            "geometry": feicao["geometry"],
        })
    publico = {
        "type": "FeatureCollection",
        "metadados": {
            "descricao": "853 municípios de MG, simplificados com topologia preservada (erro ≈ 2 km).",
            "geometria": "IBGE via tbrugz/geodata-br (CC0)",
            "cob": "APROXIMADO: mapa dos COBs do GeoRescue × malha municipal; a camada oficial é MG_DISSOLVIDO_COB",
            "ueop": "APROXIMADA: fração mais próxima dentro do COB (scripts/geo/gerar_territorio.py)",
        },
        "features": features,
    }
    os.makedirs(os.path.join(RAIZ, "public", "geo"), exist_ok=True)
    with open(os.path.join(RAIZ, "public", "geo", "municipios-mg.json"), "w", encoding="utf-8") as f:
        json.dump(publico, f, ensure_ascii=False, separators=(",", ":"))

    # Áreas aproximadas das UEOp: dissolve dos municípios.
    grupos = {}
    for feicao in malha["features"]:
        t = por_ibge[feicao["properties"]["ibge"]]
        grupos.setdefault((t["cob"], t["ueop"]), []).append(shape(feicao["geometry"]))
    ueops = []
    for (cob, ueop), geometrias in sorted(grupos.items()):
        uniao = unary_union(geometrias).buffer(0)
        geo = mapping(uniao)
        ueops.append({
            "type": "Feature",
            "properties": {"chave": f"{cob} · {ueop}", "cob": cob, "ueop": ueop,
                           "municipios": sum(1 for t in territorio if t["cob"] == cob and t["ueop"] == ueop)},
            "geometry": {"type": geo["type"], "coordinates": arredondar(geo["coordinates"])},
        })
    with open(os.path.join(RAIZ, "public", "geo", "ueops-mg.json"), "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "metadados": {"ueop": publico["metadados"]["ueop"]}, "features": ueops},
                  f, ensure_ascii=False, separators=(",", ":"))

    with open(os.path.join(RAIZ, "lib", "territorio", "municipios-mg.json"), "w", encoding="utf-8") as f:
        linhas = [json.dumps(t, ensure_ascii=False, separators=(",", ":")) for t in sorted(territorio, key=lambda t: t["ibge"])]
        f.write("[\n" + ",\n".join(linhas) + "\n]\n")

    contagem = {}
    for t in territorio:
        contagem.setdefault(t["cob"], {}).setdefault(t["ueop"], 0)
        contagem[t["cob"]][t["ueop"]] += 1
    print(json.dumps(contagem, ensure_ascii=False, indent=1))
    print("UEOp:", len(ueops), "municípios:", len(territorio))


if __name__ == "__main__":
    main()
