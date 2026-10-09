"""Gera as peças da marca FL a partir da logo definitiva vetorizada.

    cd LogosNovas/FL/_fonte
    python gerar.py

Nada é redesenhado: cada peça é um recorte ou rearranjo dos próprios
contornos de "Fonseca Lisboa Logo final.png" (tracado.json, ver vetorizar.py).
Os PNG/ICO saem pelo ImageMagick 7 (`magick`).

Do site, só escreve assets/img/logo.svg — a fonte da marca que o site e a área
dos advogados leem (src/lib/marca.mjs). Depois de regerar, rode `npm run marca`
na raiz do projeto para atualizar os arquivos derivados.
"""
import json
import os
import shutil
import subprocess

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)  # LogosNovas/FL

# --------------------------------------------------------------------------
# Paleta oficial
# --------------------------------------------------------------------------
CARVAO = '#202322'   # Pantone 5605 C — fundo escuro / tinta sobre claro
GRAFITE = '#323A37'  # Pantone 446 C
VERDE = '#435B54'    # Pantone 5545 C — faixa verde do traço
SALVIA = '#CCDBCC'   # Pantone 565 C  — fundo claro
TERRA = '#4B3D37'    # Pantone 411 C  — faixa terra do traço
BRANCO = '#FFFFFF'

# Versões de cor: `tinta` pinta letras, nome, filetes e a faixa de cima do
# traço (branca na logo original, feita para fundo escuro).
VERSOES = {
    'fundo-escuro': dict(tinta=BRANCO, terra=TERRA, verde=VERDE),
    'fundo-claro': dict(tinta=CARVAO, terra=TERRA, verde=VERDE),
    'branco': dict(tinta=BRANCO, terra=None, verde=None),
    'carvao': dict(tinta=CARVAO, terra=None, verde=None),
    'uma-cor': dict(tinta='currentColor', terra=None, verde=None),
}

# --------------------------------------------------------------------------
# Elementos da logo (coordenadas em pixels do PNG original)
# --------------------------------------------------------------------------
with open(os.path.join(AQUI, 'tracado.json'), encoding='utf-8') as f:
    T = json.load(f)


def _junta(subs):
    return ''.join(s['d'] for s in subs)


def _caixa(subs):
    cs = [s['caixa'] for s in subs]
    return (min(c[0] for c in cs), min(c[1] for c in cs), max(c[2] for c in cs), max(c[3] for c in cs))


_cor = _caixa(T['cor'])
_eh_traco = lambda c: abs(c[0] - _cor[0]) < 8 and abs(c[2] - _cor[2]) < 8
_tinta = T['tinta']
LETRAS_FL = [s for s in _tinta if s['caixa'][3] < 950 and not _eh_traco(s['caixa'])]
TRACO_TINTA = [s for s in _tinta if s['caixa'][3] < 950 and _eh_traco(s['caixa'])]
NOME = [s for s in _tinta if 1070 < s['caixa'][1] < 1240]
FONSECA = [s for s in NOME if s['caixa'][2] < 1300]
LISBOA = [s for s in NOME if s['caixa'][0] > 1300]
ADV = [s for s in _tinta if s['caixa'][1] > 1340 and s['caixa'][3] - s['caixa'][1] > 20]
FILETES = [s['caixa'] for s in _tinta if s['caixa'][1] > 1340 and s['caixa'][3] - s['caixa'][1] <= 20]
assert len(TRACO_TINTA) == 1 and len(FILETES) == 2 and len(LETRAS_FL) == 3, 'tracado.json inesperado'

CX_MONO = _caixa(LETRAS_FL + TRACO_TINTA)
CX_TRACO = _caixa(TRACO_TINTA)
CX_NOME = _caixa(NOME)
CX_FONSECA, CX_LISBOA = _caixa(FONSECA), _caixa(LISBOA)
CX_ADV = _caixa(ADV)
FIL_ESP = FILETES[0][3] - FILETES[0][1]           # espessura do filete
FIL_Y = (FILETES[0][1] + FILETES[0][3]) / 2        # eixo do filete
FIL_VAO = CX_ADV[0] - min(f[2] for f in FILETES)   # vão entre filete e letra
CX_BLOCO_ADV = (min(f[0] for f in FILETES), CX_ADV[1], max(f[2] for f in FILETES), CX_ADV[3])


def p(subs, cor):
    return f'<path fill="{cor}" d="{_junta(subs)}"/>' if subs else ''


def traco(c):
    """O traço em três faixas: tinta embaixo, terra e verde por cima."""
    if c['terra'] is None:
        return p(TRACO_TINTA, c['tinta'])
    return p(TRACO_TINTA, c['tinta']) + p(T['cor'], c['terra']) + p(T['verde'], c['verde'])


def monograma(c):
    return p(LETRAS_FL, c['tinta']) + traco(c)


def filete(x0, x1, c):
    return f'<rect x="{x0:.1f}" y="{FIL_Y - FIL_ESP / 2:.1f}" width="{x1 - x0:.1f}" height="{FIL_ESP:.1f}" fill="{c["tinta"]}"/>'


def advocacia(c, x0=None, x1=None):
    """ADVOCACIA entre filetes. Com x0/x1, os filetes vão até essas bordas."""
    x0 = CX_BLOCO_ADV[0] if x0 is None else x0
    x1 = CX_BLOCO_ADV[2] if x1 is None else x1
    return filete(x0, CX_ADV[0] - FIL_VAO, c) + p(ADV, c['tinta']) + filete(CX_ADV[2] + FIL_VAO, x1, c)


def mover(conteudo, dx=0.0, dy=0.0, k=1.0):
    return f'<g transform="translate({dx:.2f} {dy:.2f}) scale({k:.5f})">{conteudo}</g>'


def caixa_movida(cx, dx, dy, k):
    return (cx[0] * k + dx, cx[1] * k + dy, cx[2] * k + dx, cx[3] * k + dy)


def uniao(*cxs):
    return (min(c[0] for c in cxs), min(c[1] for c in cxs), max(c[2] for c in cxs), max(c[3] for c in cxs))


# --------------------------------------------------------------------------
# Peças: cada função devolve (conteúdo, caixa)
# --------------------------------------------------------------------------
def p_logo_completa(c):
    """A logo como foi entregue: FL em cima, nome, ADVOCACIA entre filetes."""
    return monograma(c) + p(NOME, c['tinta']) + advocacia(c), uniao(CX_MONO, CX_NOME, CX_BLOCO_ADV)


def p_monograma(c):
    """Só o FL com o traço."""
    return monograma(c), CX_MONO


def p_traco(c):
    """Só o traço, sem as letras."""
    return traco(c), CX_TRACO


def p_nome(c):
    """FONSECA LISBOA, uma linha."""
    return p(NOME, c['tinta']), CX_NOME


def p_nome_advocacia(c):
    """FONSECA LISBOA sobre ADVOCACIA entre filetes — a logo sem o FL."""
    return p(NOME, c['tinta']) + advocacia(c), uniao(CX_NOME, CX_BLOCO_ADV)


def _ao_lado(c, texto, cx_texto, altura_rel, vao_rel=0.16):
    """FL à esquerda e um bloco de texto à direita, centrado na altura do FL.
    `altura_rel`: altura do texto em fração da altura do FL."""
    mh = CX_MONO[3] - CX_MONO[1]
    k = altura_rel * mh / (cx_texto[3] - cx_texto[1])
    dx = CX_MONO[2] + vao_rel * mh - cx_texto[0] * k
    cy = (CX_MONO[1] + CX_MONO[3]) / 2
    dy = cy - (cx_texto[1] + cx_texto[3]) / 2 * k
    return monograma(c) + mover(texto, dx, dy, k), uniao(CX_MONO, caixa_movida(cx_texto, dx, dy, k))


def p_horizontal(c):
    """FL | FONSECA LISBOA / ADVOCACIA — cabeçalho largo, papel timbrado."""
    return _ao_lado(c, p(NOME, c['tinta']) + advocacia(c), uniao(CX_NOME, CX_BLOCO_ADV), 0.52)


def p_horizontal_nome(c):
    """FL | FONSECA LISBOA — o mais compacto para o cabeçalho do site."""
    return _ao_lado(c, p(NOME, c['tinta']), CX_NOME, 0.24, vao_rel=0.14)


def _pilha(c):
    """FONSECA / LISBOA / filete / ADVOCACIA, alinhados à esquerda, na largura
    de FONSECA. Devolve (conteúdo, caixa) em coordenadas próprias."""
    h = CX_FONSECA[3] - CX_FONSECA[1]
    larg = CX_FONSECA[2] - CX_FONSECA[0]
    x0, y = CX_FONSECA[0], CX_FONSECA[1]
    partes = [p(FONSECA, c['tinta'])]
    # LISBOA na linha de baixo, alinhado à esquerda
    dy = h * 1.36
    partes.append(mover(p(LISBOA, c['tinta']), x0 - CX_LISBOA[0], dy))
    base = CX_LISBOA[3] + dy
    # filete na largura de FONSECA, e ADVOCACIA esticado até ela
    yf = base + h * 0.42
    partes.append(f'<rect x="{x0:.1f}" y="{yf:.1f}" width="{larg:.1f}" height="{FIL_ESP:.1f}" fill="{c["tinta"]}"/>')
    k = larg / (CX_ADV[2] - CX_ADV[0])
    ya = yf + FIL_ESP + h * 0.42
    partes.append(mover(p(ADV, c['tinta']), x0 - CX_ADV[0] * k, ya - CX_ADV[1] * k, k))
    fim = ya + (CX_ADV[3] - CX_ADV[1]) * k
    return ''.join(partes), (x0, y, x0 + larg, fim)


def p_horizontal_empilhada(c):
    """FL | FONSECA / LISBOA / ADVOCACIA — bloco quase quadrado."""
    texto, cx = _pilha(c)
    return _ao_lado(c, texto, cx, 0.86, vao_rel=0.15)


def p_nome_empilhado(c):
    """FONSECA / LISBOA / ADVOCACIA, sem o FL — rodapé, assinatura."""
    return _pilha(c)


PECAS = {
    'logo-completa': p_logo_completa,
    'monograma-fl': p_monograma,
    'traco': p_traco,
    'nome': p_nome,
    'nome-advocacia': p_nome_advocacia,
    'nome-empilhado': p_nome_empilhado,
    'horizontal': p_horizontal,
    'horizontal-nome': p_horizontal_nome,
    'horizontal-empilhada': p_horizontal_empilhada,
}

# --------------------------------------------------------------------------
# Escrita
# --------------------------------------------------------------------------
TITULO = 'Fonseca Lisboa Advocacia'


def svg_solto(conteudo, cx, margem_rel=0.04):
    """Peça sem fundo, com um respiro pequeno em volta."""
    w, h = cx[2] - cx[0], cx[3] - cx[1]
    m = margem_rel * min(w, h) if min(w, h) > 0.2 * max(w, h) else margem_rel * max(w, h) * 0.25
    vb = f'{cx[0] - m:.1f} {cx[1] - m:.1f} {w + 2 * m:.1f} {h + 2 * m:.1f}'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img">\n<title>{TITULO}</title>\n'
            f'<g fill-rule="evenodd">{conteudo}</g>\n</svg>\n')


def svg_quadro(conteudo, cx, larg, alt, fundo, ocupar, raio=0):
    """Peça centrada num quadro com fundo, ocupando até `ocupar` da largura e da altura."""
    w, h = cx[2] - cx[0], cx[3] - cx[1]
    k = min(ocupar * larg / w, ocupar * alt / h)
    dx = (larg - w * k) / 2 - cx[0] * k
    dy = (alt - h * k) / 2 - cx[1] * k
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {larg} {alt}" width="{larg}" height="{alt}" role="img">\n'
            f'<title>{TITULO}</title>\n<rect width="{larg}" height="{alt}" rx="{raio}" fill="{fundo}"/>'
            f'<g fill-rule="evenodd">{mover(conteudo, dx, dy, k)}</g>\n</svg>\n')


def gravar(rel, texto):
    caminho = os.path.join(RAIZ, rel)
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, 'w', encoding='utf-8') as f:
        f.write(texto)


def png(rel_svg, rel_png, larg=None, alt=None):
    destino = os.path.join(RAIZ, rel_png)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    subprocess.run(['magick', '-background', 'none', '-density', '300', os.path.join(RAIZ, rel_svg),
                    '-resize', f'{larg or ""}x{alt or ""}', destino], check=True)


def fonte_do_site():
    """assets/img/logo.svg: a logo completa, com cada elemento marcado por id e
    caixa (data-caixa = x0 y0 x1 y1) para src/lib/marca.mjs montar as peças.
    Tinta branca, como a original: é o arquivo usado sobre fundo escuro."""
    cx = uniao(CX_MONO, CX_NOME, CX_BLOCO_ADV)
    caixa = lambda c: ' '.join(f'{v:.1f}' for v in c)
    x0e, x1e = CX_BLOCO_ADV[0], CX_ADV[0] - FIL_VAO
    x0d, x1d = CX_ADV[2] + FIL_VAO, CX_BLOCO_ADV[2]
    y = FIL_Y - FIL_ESP / 2
    corpo = (
        f'<g id="monograma" data-caixa="{caixa(CX_MONO)}">\n'
        f'<path id="fl" d="{_junta(LETRAS_FL)}"/>\n'
        f'<path id="traco" d="{_junta(TRACO_TINTA)}"/>\n'
        f'<path id="traco-terra" fill="{TERRA}" d="{_junta(T["cor"])}"/>\n'
        f'<path id="traco-verde" fill="{VERDE}" d="{_junta(T["verde"])}"/>\n'
        f'</g>\n'
        f'<path id="nome" data-caixa="{caixa(CX_NOME)}" d="{_junta(NOME)}"/>\n'
        f'<g id="advocacia" data-caixa="{caixa(CX_BLOCO_ADV)}">\n'
        f'<rect id="filete-esquerdo" x="{x0e:.1f}" y="{y:.1f}" width="{x1e - x0e:.1f}" height="{FIL_ESP:.1f}"/>\n'
        f'<path id="advocacia-letras" data-caixa="{caixa(CX_ADV)}" d="{_junta(ADV)}"/>\n'
        f'<rect id="filete-direito" x="{x0d:.1f}" y="{y:.1f}" width="{x1d - x0d:.1f}" height="{FIL_ESP:.1f}"/>\n'
        f'</g>\n')
    texto = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{cx[0]:.1f} {cx[1]:.1f} {cx[2] - cx[0]:.1f} {cx[3] - cx[1]:.1f}" '
             f'fill="{BRANCO}" fill-rule="evenodd">\n<title>{TITULO}</title>\n'
             f'<!-- Logomarca FL. Gerada por LogosNovas/FL/_fonte/gerar.py a partir de\n'
             f'     "Fonseca Lisboa Logo final.png". É a fonte única da marca no site:\n'
             f'     src/lib/marca.mjs lê os elementos daqui por id. Não editar à mão. -->\n'
             f'{corpo}</svg>\n')
    destino = os.path.join(RAIZ, '..', '..', 'assets', 'img', 'logo.svg')
    with open(destino, 'w', encoding='utf-8') as f:
        f.write(texto)
    print('  assets/img/logo.svg (fonte do site)')


def main():
    fonte_do_site()

    # 1. Cada peça em cada versão de cor
    for nome, fn in PECAS.items():
        for versao, c in VERSOES.items():
            conteudo, cx = fn(c)
            gravar(f'svg/{nome}/{nome}-{versao}.svg', svg_solto(conteudo, cx))
    print(f'  svg/: {len(PECAS)} peças x {len(VERSOES)} versões')

    # 2. Ícones e peças com fundo
    escuro, claro = VERSOES['fundo-escuro'], VERSOES['fundo-claro']
    mono_e, cx_m = p_monograma(escuro)
    mono_c, _ = p_monograma(claro)
    gravar('icones/favicon.svg', svg_quadro(mono_e, cx_m, 64, 64, CARVAO, 0.80, raio=10))
    gravar('icones/icone-app.svg', svg_quadro(mono_e, cx_m, 512, 512, CARVAO, 0.64))
    gravar('icones/avatar-redes-escuro.svg', svg_quadro(mono_e, cx_m, 1080, 1080, CARVAO, 0.52))
    gravar('icones/avatar-redes-claro.svg', svg_quadro(mono_c, cx_m, 1080, 1080, SALVIA, 0.52))
    completa_e, cx_l = p_logo_completa(escuro)
    gravar('icones/og-compartilhamento.svg', svg_quadro(completa_e, cx_l, 1200, 630, CARVAO, 0.72))
    print('  icones/')

    # 3. PNG
    if not shutil.which('magick'):
        print('  (sem ImageMagick: PNG não gerados)')
        return
    for lado in (16, 32, 48):
        png('icones/favicon.svg', f'png/favicon-{lado}.png', lado, lado)
    png('icones/icone-app.svg', 'png/apple-touch-icon-180.png', 180, 180)
    png('icones/icone-app.svg', 'png/icone-192.png', 192, 192)
    png('icones/icone-app.svg', 'png/icone-512.png', 512, 512)
    png('icones/avatar-redes-escuro.svg', 'png/avatar-redes-escuro-1080.png', 1080, 1080)
    png('icones/avatar-redes-claro.svg', 'png/avatar-redes-claro-1080.png', 1080, 1080)
    png('icones/og-compartilhamento.svg', 'png/og-compartilhamento-1200x630.png', 1200, 630)
    for nome in PECAS:
        for versao in ('fundo-escuro', 'fundo-claro'):
            png(f'svg/{nome}/{nome}-{versao}.svg', f'png/{nome}-{versao}.png', 2000, 2000)
    p_ = lambda s: os.path.join(RAIZ, 'png', s)
    subprocess.run(['magick', p_('favicon-16.png'), p_('favicon-32.png'), p_('favicon-48.png'),
                    os.path.join(RAIZ, 'icones', 'favicon.ico')], check=True)
    print('  png/ e icones/favicon.ico')

    # 4. Folha de visão geral: cada peça sobre o carvão e sobre a sálvia
    partes = []
    for nome in PECAS:
        rotulo = os.path.join(RAIZ, 'png', f'_rotulo-{nome}.png')
        par = os.path.join(RAIZ, 'png', f'_par-{nome}.png')
        subprocess.run(['magick', '-size', '1400x56', '-background', BRANCO, '-fill', GRAFITE,
                        '-font', 'Arial', '-pointsize', '22', '-gravity', 'west',
                        f'label:   {nome}   —   svg/{nome}/', rotulo], check=True)
        subprocess.run(['magick',
                        '(', p_(f'{nome}-fundo-escuro.png'), '-resize', '640x300', '-background', CARVAO,
                        '-gravity', 'center', '-extent', '700x360', ')',
                        '(', p_(f'{nome}-fundo-claro.png'), '-resize', '640x300', '-background', SALVIA,
                        '-gravity', 'center', '-extent', '700x360', ')', '+append', par], check=True)
        partes += [rotulo, par]
    subprocess.run(['magick', *partes, '-append', '+repage', '-depth', '8', os.path.join(RAIZ, 'visao-geral.png')], check=True)
    for f in partes:
        os.remove(f)
    print('  visao-geral.png')


if __name__ == '__main__':
    main()
