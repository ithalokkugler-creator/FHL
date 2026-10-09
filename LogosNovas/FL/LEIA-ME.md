# Marca FL — Fonseca Lisboa Advocacia

Peças tiradas da logo definitiva, `Fonseca Lisboa Logo final.png` (raiz do
projeto). **Nada foi redesenhado:** a logo foi vetorizada e cada peça é um
recorte ou rearranjo dos próprios contornos dela. **Ainda não está no site.**

Veja tudo de uma vez em **`visao-geral.png`**.

## Peças (`svg/<peça>/`)

| Peça | O que é | Uso sugerido |
|---|---|---|
| `logo-completa` | A logo como foi entregue | Capa, rodapé, cartão, OG |
| `monograma-fl` | Só o FL com o traço | Favicon, avatar, marca d'água, loader |
| `traco` | Só o traço, sem letras | Detalhe gráfico, divisor de seção |
| `nome` | FONSECA LISBOA, uma linha | Rodapé, menções no texto |
| `nome-advocacia` | Nome + ADVOCACIA entre filetes | A logo sem o FL |
| `nome-empilhado` | FONSECA / LISBOA / filete / ADVOCACIA | Espaços estreitos, assinatura |
| `horizontal` | FL à esquerda, nome + ADVOCACIA à direita | Cabeçalho largo, papel timbrado |
| `horizontal-nome` | FL + FONSECA LISBOA | **Cabeçalho do site** (o mais compacto) |
| `horizontal-empilhada` | FL + nome em duas linhas + ADVOCACIA | Bloco quase quadrado |

Cada peça vem em 5 versões:

| Sufixo | Letras e faixa de cima do traço | Terra/verde |
|---|---|---|
| `-fundo-escuro` | branco (como a original) | sim |
| `-fundo-claro` | `#202322` | sim |
| `-branco` | tudo branco | — |
| `-carvao` | tudo `#202322` | — |
| `-uma-cor` | `currentColor`: embutido no HTML, pega a cor do CSS | — |

## Outras pastas

- `icones/`: favicon (`.svg` e `.ico`), ícone de app, avatar das redes
  (sobre `#202322` e sobre `#CCDBCC`), imagem de compartilhamento 1200×630.
- `png/`: exportações prontas: favicon 16/32/48, apple-touch 180, ícone
  192/512, avatares 1080, OG, e cada peça em fundo escuro e claro (2000 px).
- `paleta.svg`: a paleta oficial.
- `_fonte/`: `vetorizar.py` (PNG → `tracado.json`) e `gerar.py` (refaz tudo).

## Paleta

| HEX | Pantone | CMYK | RGB | Papel na marca |
|---|---|---|---|---|
| `#202322` | 5605 C | 76, 63, 61, 78 | 32, 35, 34 | Fundo escuro; letras sobre claro |
| `#323A37` | 446 C | 72, 55, 58, 62 | 50, 58, 55 | Superfícies escuras secundárias |
| `#435B54` | 5545 C | 71, 43, 56, 39 | 67, 91, 84 | Faixa verde do traço |
| `#CCDBCC` | 565 C | 24, 7, 23, 0 | 204, 219, 204 | Fundo claro |
| `#4B3D37` | 411 C | 53, 58, 58, 61 | 75, 61, 55 | Faixa terra do traço |

## Para refazer

```
cd LogosNovas/FL/_fonte
python gerar.py
```

Só se a logo mudar: `pip install potracer` e
`python vetorizar.py "../../../Fonseca Lisboa Logo final.png" tracado.json`.
O PNG/ICO precisa do ImageMagick 7 (`magick`).
