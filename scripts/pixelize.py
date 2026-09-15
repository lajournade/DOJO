#!/usr/bin/env python3
"""
Transcrit une image (fond uni, style pixel art) en lignes de caracteres pour
`src/fx/sprites.ts` : un caractere par pixel, `.` pour le transparent, les
autres indexant la palette BASE. Le depot ne garde que le texte, l'image
generee reste hors git.

    python3 scripts/pixelize.py scratch/chatgpt/default.png --name HERO_FRESH
    python3 scripts/pixelize.py scratch/chatgpt/low_hp.png --preview /tmp/t.png

Le fond est lu dans le coin haut-gauche (ou `--bg 00ff00`), le sujet est cadre
sur sa plus grande composante connexe (les etincelles, textes et miettes
tombent), puis pose au sol de la grille, centre. Chaque pixel prend la cle de
la couleur la plus proche dans la palette. Les references sont des bustes
coupes a la ceinture, d'ou la grille carree ; une image en pied se coupe
avant de passer ici.

La ceinture est noire sur les references et le sang rouge : le script sort
`o`/`k` pour l'une et `b` pour l'autre. En collant dans `sprites.ts`, passer
le sang en `r` puis peindre la ceinture en `b`, la couleur d'identite.
"""
import argparse
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

# Miroir de BASE dans src/fx/sprites.ts : les cles sont ce qui compte, la
# permutation de palette a l'ecran se fait sur elles.
PALETTE = {
    'o': '#000000',
    'k': '#5a3418',
    's': '#f5c8a0',
    'S': '#be8c69',
    'w': '#f5f0e6',
    'W': '#aaafbe',
    'e': '#ffffff',
    'b': '#e01b24',
    'r': '#b0142a',
}


def hex_rgb(h: str) -> np.ndarray:
    h = h.lstrip('#')
    return np.array([int(h[i : i + 2], 16) for i in (0, 2, 4)], dtype=float)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('image')
    ap.add_argument('--w', type=int, default=48, help='largeur de la grille (defaut 48)')
    ap.add_argument('--h', type=int, default=48, help='hauteur de la grille (defaut 48)')
    ap.add_argument('--bg', help='couleur du fond en hex, sinon le pixel (0,0)')
    ap.add_argument('--tolerance', type=float, default=90, help='distance RGB max au fond (defaut 90)')
    ap.add_argument('--margin', type=int, default=1, help='colonnes vides de chaque cote (defaut 1)')
    ap.add_argument('--name', help='emet `const NAME = [...]` pret a coller')
    ap.add_argument('--preview', help='ecrit un apercu PNG agrandi x8')
    args = ap.parse_args()

    rgb = np.array(Image.open(args.image).convert('RGB'), dtype=float)
    bg = hex_rgb(args.bg) if args.bg else rgb[0, 0]
    mask = np.linalg.norm(rgb - bg, axis=2) > args.tolerance

    # Plus grande composante connexe : le sujet, sans ses eclats.
    labels, count = ndimage.label(mask)
    if count == 0:
        sys.exit('aucun sujet trouve : verifier --bg / --tolerance')
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    mask = labels == (int(np.argmax(sizes)) + 1)
    ys, xs = np.where(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb, mask = rgb[y0:y1, x0:x1], mask[y0:y1, x0:x1]

    # Reduction en conservant le ratio ; l'alpha porte le masque pour que le
    # fond ne teinte pas les bords.
    h, w = mask.shape
    scale = min((args.w - 2 * args.margin) / w, args.h / h)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    rgba = np.dstack([rgb, mask * 255]).astype('uint8')
    small = np.array(Image.fromarray(rgba, 'RGBA').resize((nw, nh), Image.BOX), dtype=float)

    keys = list(PALETTE)
    colors = np.stack([hex_rgb(PALETTE[k]) for k in keys])
    grid = [['.'] * args.w for _ in range(args.h)]
    ox, oy = (args.w - nw) // 2, args.h - nh
    for y in range(nh):
        for x in range(nw):
            if small[y, x, 3] < 128:
                continue
            d = np.linalg.norm(colors - small[y, x, :3], axis=1)
            grid[oy + y][ox + x] = keys[int(d.argmin())]
    rows = [''.join(r) for r in grid]

    if args.preview:
        big = Image.new('RGB', (args.w * 8, args.h * 8), (0, 255, 0))
        for y, row in enumerate(rows):
            for x, c in enumerate(row):
                if c != '.':
                    color = tuple(int(v) for v in hex_rgb(PALETTE[c]))
                    big.paste(color, (x * 8, y * 8, x * 8 + 8, y * 8 + 8))
        big.save(args.preview)

    if args.name:
        print(f'const {args.name} = [')
        for row in rows:
            print(f"  '{row}',")
        print('];')
    else:
        print('\n'.join(rows))


if __name__ == '__main__':
    main()
