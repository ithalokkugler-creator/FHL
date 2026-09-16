// Leitura de arquivos de assets/ durante o build.
//
// Os caminhos são sempre relativos à raiz do projeto ("assets/img/…") — o
// mesmo texto que vai em src/data/ e, com o prefixo da página, no HTML.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const assetExists = (rel) => existsSync(join(ROOT, rel));

/**
 * Largura e altura de uma imagem PNG, JPEG ou WebP, lidas do cabeçalho.
 *
 * Com elas o <img> sai com width/height e reserva o espaço antes de carregar,
 * em vez de empurrar o texto do artigo quando a imagem chega. Falha com
 * mensagem clara se o arquivo não existe: um nome digitado errado em
 * src/data/ para o build, em vez de publicar uma imagem quebrada.
 */
export function imageSize(rel) {
  const file = join(ROOT, rel);
  if (!existsSync(file)) throw new Error(`Imagem não encontrada: ${rel}`);
  return imageSizeFrom(readFileSync(file), rel);
}

/**
 * O mesmo, a partir dos bytes. Imagem enviada pela área dos advogados é
 * baixada do Supabase durante o build e nunca chega a existir em assets/ —
 * ver src/data/conteudo.mjs. `nome` só aparece na mensagem de erro.
 */
export function imageSizeFrom(b, nome) {
  // PNG — o bloco IHDR vem logo depois da assinatura de 8 bytes
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }

  // WebP — três variantes de cabeçalho
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') {
      return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X') {
      return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
    }
  }

  // JPEG — percorre os segmentos até o SOF, que traz as dimensões
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xff) { i++; continue; }                          // byte de preenchimento
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { i += 2; continue; } // sem tamanho
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }

  throw new Error(`Formato de imagem não reconhecido (use PNG, JPEG ou WebP): ${nome}`);
}
