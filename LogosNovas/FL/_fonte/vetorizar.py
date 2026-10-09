"""Vetoriza 'Fonseca Lisboa Logo final.png' em camadas e grava tracado.json.

    pip install potracer pillow numpy
    python vetorizar.py "../../../Fonseca Lisboa Logo final.png" tracado.json

Camadas, de baixo para cima (empilhadas não deixam fresta entre as cores):
    tinta   tudo o que tem tinta: letras, nome, filetes e o traço inteiro
    cor     as faixas terra + verde do traço
    verde   só a faixa verde
Cada subcaminho sai com sua caixa, em pixels do PNG. Só é preciso rodar de
novo se a logo mudar; gerar.py lê o JSON."""
import json, sys, time
import numpy as np
from PIL import Image
import potrace

ORIG = sys.argv[1]; SAIDA = sys.argv[2]
UP = 1  # ampliação antes do traçado (2 ou 3 multiplicam o tamanho sem ganho visível)
img = np.array(Image.open(ORIG).convert('RGBA')).astype(float)
r, g, b, a = [img[..., i] for i in range(4)]
al = a / 255
x0, y0, x1, y1 = 200, 160, 2170, 1435  # recorte com folga em volta da arte
camadas = {
    'tinta': al,
    'cor': al * np.clip((255 - r) / (255 - 75), 0, 1),       # terra + verde
    'verde': al * np.clip((g - r) / 24, 0, 1),
}

def amplia(m):
    m = m[y0:y1, x0:x1]
    im = Image.fromarray((m * 255).astype(np.uint8), 'L')
    im = im.resize((im.width * UP, im.height * UP), Image.LANCZOS)
    return np.array(im) > 127

def fmt(v):
    return f'{v:.1f}'.rstrip('0').rstrip('.')

def pt(p):
    return fmt(p.x / UP + x0) + ',' + fmt(p.y / UP + y0)

out = {}
for nome, m in camadas.items():
    t = time.time()
    bm = potrace.Bitmap(amplia(m))
    plist = bm.trace(turdsize=20 * UP, alphamax=1.0, opticurve=True, opttolerance=0.5)
    subs = []
    for curve in plist:
        d = ['M' + pt(curve.start_point)]
        xs, ys = [curve.start_point.x], [curve.start_point.y]
        for s in curve.segments:
            if s.is_corner:
                d.append('L' + pt(s.c) + 'L' + pt(s.end_point))
                xs += [s.c.x, s.end_point.x]; ys += [s.c.y, s.end_point.y]
            else:
                d.append('C' + pt(s.c1) + ' ' + pt(s.c2) + ' ' + pt(s.end_point))
                xs += [s.end_point.x]; ys += [s.end_point.y]
        d.append('Z')
        caixa = [min(xs) / UP + x0, min(ys) / UP + y0, max(xs) / UP + x0, max(ys) / UP + y0]
        if caixa == [x0, y0, x1, y1]:
            continue  # a moldura do recorte, que o potrace devolve junto
        subs.append({'d': ''.join(d), 'caixa': [round(v, 1) for v in caixa]})
    out[nome] = subs
    print(nome, len(subs), 'subcaminhos', round(time.time() - t, 1), 's')
json.dump(out, open(SAIDA, 'w'))
