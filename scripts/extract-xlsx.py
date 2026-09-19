#!/usr/bin/env python3
"""Outil de developpement : convertit ~/Downloads/Sport 2026.xlsx en scripts/seed.json.

Lit l'onglet "Programmes" (definition des seances) et l'onglet "Suivit 2"
(journal plat, une ligne par serie). Lecture seule, sans dependance externe :
un .xlsx est un ZIP de XML, la stdlib suffit.

Usage : python3 scripts/extract-xlsx.py [chemin.xlsx]
"""
import json
import re
import sys
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
EXCEL_EPOCH = date(1899, 12, 30)
DEFAULT_XLSX = Path.home() / "Downloads" / "Sport 2026.xlsx"
OUT = Path(__file__).resolve().parent / "seed.json"


def cell_ref(ref):
    """'AB12' -> (28, 12)"""
    m = re.match(r"([A-Z]+)(\d+)", ref)
    col = 0
    for ch in m.group(1):
        col = col * 26 + ord(ch) - 64
    return col, int(m.group(2))


def read_sheet(z, path, shared):
    """Renvoie {no_ligne: {no_colonne: valeur}} avec les valeurs deja resolues."""
    rows = {}
    for c in ET.fromstring(z.read(path)).iter(NS + "c"):
        ci, ri = cell_ref(c.get("r"))
        v = c.find(NS + "v")
        inline = c.find(NS + "is")
        if inline is not None:
            val = "".join(t.text or "" for t in inline.iter(NS + "t"))
        elif v is not None:
            val = shared[int(v.text)] if c.get("t") == "s" else v.text
        else:
            continue
        if val not in (None, ""):
            rows.setdefault(ri, {})[ci] = val
    return rows


def load(path):
    z = zipfile.ZipFile(path)
    shared = [
        "".join(t.text or "" for t in si.iter(NS + "t"))
        for si in ET.fromstring(z.read("xl/sharedStrings.xml"))
    ]
    names = {}
    for m in re.finditer(r'<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', z.read("xl/workbook.xml").decode()):
        names[m.group(1)] = m.group(2)
    rels = dict(
        re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', z.read("xl/_rels/workbook.xml.rels").decode())
    )
    return {name: read_sheet(z, "xl/" + rels[rid], shared) for name, rid in names.items()}


def num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return int(f) if f == int(f) else f


def serial_to_iso(v):
    return (EXCEL_EPOCH + timedelta(days=int(float(v)))).isoformat()


DASHES = "–—−-"


def parse_range(text):
    """'6-8', '8-10 / jambe', '12' -> (min, max). Gere tous les tirets Unicode."""
    if text is None:
        return None, None
    nums = re.findall(r"\d+(?:[.,]\d+)?", str(text))
    if not nums:
        return None, None
    lo = num(nums[0].replace(",", "."))
    hi = num(nums[1].replace(",", ".")) if len(nums) > 1 else lo
    return lo, hi


def slug(text):
    """Identifiant stable et lisible derive du nom de l'exercice."""
    ascii_ = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", ascii_.lower())).strip("-")[:48]


def build_program(prog_rows):
    """Les seances de l'onglet Programmes : un titre, une ligne d'en-tetes, puis les exercices."""
    header_rows = sorted(r for r, cells in prog_rows.items() if cells.get(1) == "Exercice")
    sessions = []
    for idx, header in enumerate(header_rows):
        title = prog_rows.get(header - 2, {}).get(1) or prog_rows.get(header - 1, {}).get(1) or f"Seance {idx + 1}"
        items = []
        row = header + 1
        while row in prog_rows and prog_rows[row].get(1) and prog_rows[row].get(3):
            cells = prog_rows[row]
            name = cells[1].strip()
            rep_min, rep_max = parse_range(cells.get(4))
            rir_min, rir_max = parse_range(cells.get(5))
            items.append(
                {
                    "id": f"it-{slug(title)[:12]}-{len(items) + 1}",
                    "exerciseId": slug(name),
                    "sets": int(float(cells[3])),
                    "repMin": rep_min,
                    "repMax": rep_max,
                    "targetRirMin": rir_min,
                    "targetRirMax": rir_max,
                    "notes": (cells.get(2) or "").strip(),
                }
            )
            row += 1
        sessions.append(
            {
                "id": f"ses-{chr(65 + idx)}",
                "code": chr(65 + idx),
                "name": title.strip(),
                "items": items,
            }
        )
    return {"id": "prog-p2", "code": "P2", "name": "Programme 2026", "active": True, "sessions": sessions}


def build_logs(rows):
    """Suivit 2 : Programme | Date | Exercice | Serie | Reps | Charge | RIR (une ligne par serie)."""
    logs = {}
    for ri in sorted(rows):
        if ri == 1:
            continue
        c = rows[ri]
        code, serial, name, set_index = c.get(1), c.get(2), c.get(3), c.get(4)
        if not (code and serial and name):
            continue
        day = serial_to_iso(serial)
        key = (code, day)
        log = logs.get(key)
        if log is None:
            log = logs[key] = {
                "id": f"log-{day}-{slug(code)}",
                "programCode": code,
                "sessionId": None,
                "date": day,
                "startedAt": None,
                "endedAt": None,
                "entries": [],
            }
        log["entries"].append(
            {
                "exerciseId": slug(name),
                "exerciseName": name.strip(),
                "setIndex": int(float(set_index)) if set_index else len(log["entries"]) + 1,
                "reps": num(c.get(5)),
                "weight": num(c.get(6)),
                "rir": num(c.get(7)),
            }
        )
    return sorted(logs.values(), key=lambda l: l["date"])


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    if not src.exists():
        sys.exit(f"Classeur introuvable : {src}")
    sheets = load(src)
    program = build_program(sheets["Programmes"])
    logs = build_logs(sheets["Suivit 2"])

    # Rattache les seances du journal a celles du programme quand le code correspond (P2-A -> ses-A).
    by_code = {f"{program['code']}-{s['code']}": s["id"] for s in program["sessions"]}
    for log in logs:
        log["sessionId"] = by_code.get(log["programCode"])

    # Catalogue d'exercices : ceux du programme d'abord, puis ceux vus dans l'historique.
    exercises = {}
    for session in program["sessions"]:
        for item in session["items"]:
            exercises.setdefault(item["exerciseId"], None)
    for log in logs:
        for entry in log["entries"]:
            exercises.setdefault(entry["exerciseId"], None)
    names = {}
    for log in logs:
        for entry in log["entries"]:
            names.setdefault(entry["exerciseId"], entry["exerciseName"])

    # Les noms du programme font reference ; ceux de l'historique completent.
    prog_names = {}
    header_rows = sorted(r for r, cells in sheets["Programmes"].items() if cells.get(1) == "Exercice")
    for header in header_rows:
        row = header + 1
        while row in sheets["Programmes"] and sheets["Programmes"][row].get(1) and sheets["Programmes"][row].get(3):
            n = sheets["Programmes"][row][1].strip()
            prog_names[slug(n)] = n
            row += 1
    catalogue = [
        {"id": eid, "name": prog_names.get(eid) or names.get(eid, eid)}
        for eid in exercises
    ]

    seed = {
        "rev": 0,
        "appliedOps": [],
        "exercises": catalogue,
        "programs": [program],
        "logs": logs,
        "liveSession": None,
    }
    OUT.write_text(json.dumps(seed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    sets = sum(len(l["entries"]) for l in logs)
    print(f"{OUT} : {len(catalogue)} exercices, "
          f"{len(program['sessions'])} seances, {len(logs)} seances au journal, {sets} series")


if __name__ == "__main__":
    main()
