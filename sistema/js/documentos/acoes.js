// O que se faz com a folha pronta: gravar, imprimir, baixar para o Word.
// ======================================================================
//
// O texto final é gravado em `documentos` antes de sair da tela (F3): o que
// foi entregue ao cliente fica guardado, com autor e data, e não se edita —
// para corrigir, gera-se outro. Imprimir de novo e baixar de novo também
// registram uma geração.

import { abrirDialogo } from '../nucleo/dialogo.js';
import { higienizar } from '../nucleo/higienizar.js';
import { html } from '../nucleo/html.js';
import { db } from '../nucleo/supabase.js';

export const COLUNAS_DOCUMENTO = 'id,modelo,titulo,cliente_id,processo_id,contrato_id,compromisso_id,atualizacao_id,'
  + 'dados,conteudo,cancelado_em,cancelado_por,motivo_cancelamento,criado_em,criado_por';
export const COLUNAS_LISTA_DOCUMENTO = 'id,modelo,titulo,cliente_id,processo_id,criado_em,criado_por,cancelado_em';

/** Aviso antes de imprimir com "[dados]" ainda entre colchetes. */
export async function confirmarPendencias(elemento, acao) {
  const n = elemento.querySelectorAll('.doc-falta').length;
  if (!n) return true;
  return Boolean(await abrirDialogo({
    titulo: 'Dados pendentes no documento',
    rotuloOk: acao === 'word' ? 'Baixar assim mesmo' : acao === 'salvar' ? 'Salvar com pendências' : 'Imprimir assim mesmo',
    corpo: html`<p>${n === 1 ? 'Falta 1 dado' : `Faltam ${n} dados`}. Confira os trechos entre colchetes na folha e complete o cadastro ou edite o texto antes de entregar.</p>`,
  }));
}

export function salvarDocumento(p) {
  const conteudo = higienizar(p.conteudo);
  if (!conteudo.trim()) throw new Error('O documento está vazio.');
  if (conteudo.length > 400000) throw new Error('O documento excede o limite de texto.');
  if (!p.cliente_id) throw new Error('Escolha um cliente.');
  return db.inserir('documentos', { ...p, conteudo }, COLUNAS_DOCUMENTO);
}

// ---------------------------------------------------------------------------
// Folha na tela
// ---------------------------------------------------------------------------

const LARGURA_A4 = 794; // 210 mm a 96 pontos por polegada

/**
 * A folha tem a largura do papel. Numa coluna mais estreita ela encolhe por
 * inteiro (zoom, via --escala) em vez de ficar cortada; abaixo de 55%, a
 * letra ficaria pequena demais e a folha passa a rolar na horizontal.
 * Devolve a função que desliga o ajuste.
 */
export function ajustarFolha(visualizacao) {
  const folha = visualizacao?.querySelector('.documento-folha');
  if (!folha || typeof ResizeObserver !== 'function') return () => {};
  const ajustar = () => {
    const estilo = getComputedStyle(visualizacao);
    const util = visualizacao.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
    const escala = Math.min(1, Math.max(0.55, util / LARGURA_A4));
    folha.style.setProperty('--escala', escala.toFixed(3));
  };
  const observador = new ResizeObserver(ajustar);
  observador.observe(visualizacao);
  ajustar();
  return () => observador.disconnect();
}

// ---------------------------------------------------------------------------
// Impressão
// ---------------------------------------------------------------------------

let limparImpressaoAtual = null;

/** Cópia limpa da folha, sozinha na página, só enquanto o navegador imprime. */
export function prepararImpressao(elemento) {
  limparImpressaoAtual?.();
  document.querySelector('.documento-impressao')?.remove();

  const caixa = document.createElement('section');
  caixa.className = 'documento-impressao';
  const folha = document.createElement('article');
  folha.className = 'documento-folha';
  folha.innerHTML = higienizar(elemento.innerHTML);

  // O Chromium repete o elemento fixo a partir da página em que o encontra:
  // posto antes do texto, o rodapé sai desde a primeira página.
  const rodape = folha.querySelector('.doc-rodape');
  if (rodape) folha.prepend(rodape);

  // Melhor ainda: a caixa de margem da página (@bottom-center) repete o
  // rodapé sem ocupar o espaço do texto. Onde o navegador não entende essa
  // regra, fica o elemento fixo acima.
  const folhaDeEstilo = [...document.styleSheets].find((s) => s.href?.includes('/sistema/css/sistema.css'));
  let regra = null;
  if (rodape && folhaDeEstilo) {
    try {
      const i = folhaDeEstilo.cssRules.length;
      const texto = JSON.stringify(rodape.textContent.replace(/\s+/g, ' ').trim());
      folhaDeEstilo.insertRule(`@page documento { @bottom-center { content: ${texto}; font: 8pt "Times New Roman"; color: #333; } }`, i);
      const nova = folhaDeEstilo.cssRules[i];
      if ([...(nova.cssRules ?? [])].some((r) => r.name === 'bottom-center')) {
        regra = nova;
        caixa.classList.add('documento-impressao--rodape-margem');
      } else {
        folhaDeEstilo.deleteRule(i);
      }
    } catch {
      // Fica o rodapé fixo.
    }
  }

  caixa.append(folha);
  document.body.append(caixa);
  document.body.classList.add('imprimindo-documento');

  const limpar = () => {
    caixa.remove();
    document.body.classList.remove('imprimindo-documento');
    removeEventListener('afterprint', limpar);
    if (regra) {
      const i = [...folhaDeEstilo.cssRules].indexOf(regra);
      if (i >= 0) folhaDeEstilo.deleteRule(i);
      regra = null;
    }
    if (limparImpressaoAtual === limpar) limparImpressaoAtual = null;
  };
  limparImpressaoAtual = limpar;
  addEventListener('afterprint', limpar, { once: true });
  return limpar;
}

export function imprimirDocumento(elemento) {
  const limpar = prepararImpressao(elemento);
  try {
    print();
  } catch (erro) {
    limpar();
    throw erro;
  }
}

// ---------------------------------------------------------------------------
// Word
// ---------------------------------------------------------------------------

// O Word abre HTML/MHTML salvo como .doc. As imagens entram como anexos PNG
// do mesmo arquivo, com largura e altura explícitas; não é um .docx.
const ESTILO_WORD = [
  '@page{size:A4;margin:20mm}',
  'body{font:12pt "Times New Roman",Georgia,serif;color:#000}',
  'p{line-height:1.45;margin:0 0 12pt}',
  '.doc-titulo{text-align:center;font-size:16pt}',
  '.doc-cabecalho{text-align:center}.doc-cabecalho img{width:135pt;height:40.5pt}',
  '.doc-assinatura{text-align:center;margin-top:32pt;page-break-inside:avoid}',
  '.doc-rodape{font-size:8pt;text-align:center;margin-top:24pt}',
  'table{border-collapse:collapse;width:100%;font-size:10pt}',
  'th,td{border:1px solid #999;padding:6pt;vertical-align:top}',
  'td p{margin:0}',
  '.doc-ficha{font-size:11pt}.doc-ficha th{width:18%;text-align:left;background:#f2f2f2}.doc-ficha-relato{height:45mm}',
  '.doc-nota{font-size:10pt}.doc-num{white-space:nowrap}',
  '.doc-falta{color:#a00;background:#fff0d5}',
].join('');

const nomeDeArquivo = (titulo) => titulo.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '');

const emBase64 = (bytes) => {
  let texto = '';
  for (let i = 0; i < bytes.length; i += 8192) texto += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(texto).match(/.{1,76}/g)?.join('\r\n') || '';
};

async function imagemParaWord(src) {
  const img = new Image();
  img.src = new URL(src, location.origin).href;
  try { await img.decode(); }
  catch { throw new Error('Não foi possível carregar a marca para o Word. Tente baixar novamente.'); }
  const canvas = document.createElement('canvas');
  canvas.width = 915;
  canvas.height = Math.round(canvas.width * img.naturalHeight / img.naturalWidth);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { base64: canvas.toDataURL('image/png').split(',')[1], altura: Math.round(180 * canvas.height / canvas.width) };
}

/** MHTML inclui a imagem PNG no arquivo: o Word respeita as dimensões físicas
 *  e a marca não depende de uma conexão ao site ao reabrir o documento. */
export async function montarWord(elemento, titulo) {
  const caixa = document.createElement('div');
  caixa.innerHTML = higienizar(elemento.innerHTML);
  const imagens = [];
  const cache = new Map();
  for (const img of caixa.querySelectorAll('img')) {
    const src = img.getAttribute('src');
    if (!cache.has(src)) cache.set(src, await imagemParaWord(src));
    const imagem = cache.get(src);
    const caminho = `file:///fhl-documento/imagem-${imagens.length}.png`;
    img.setAttribute('src', caminho);
    img.setAttribute('width', '180');
    img.setAttribute('height', String(imagem.altura));
    // CSSOM evita aplicar um atributo inline na página com CSP restrita.
    // As propriedades são serializadas no HTML que só será aberto no Word.
    img.style.width = '135pt';
    img.style.height = `${imagem.altura * 0.75}pt`;
    imagens.push({ caminho, base64: imagem.base64 });
  }

  const texto = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo.replace(/[<>&]/g, '')}</title>`
    + `<style>${ESTILO_WORD}</style></head><body>${caixa.innerHTML}</body></html>`;
  const limite = '----FHL-documento-' + crypto.randomUUID();
  const partes = [
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; boundary="${limite}"; type="text/html"`,
    '', `--${limite}`, 'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: base64', 'Content-Location: file:///fhl-documento/documento.htm',
    '', emBase64(new TextEncoder().encode(texto)),
  ];
  for (const img of imagens) partes.push(
    `--${limite}`, 'Content-Type: image/png', 'Content-Transfer-Encoding: base64',
    `Content-Location: ${img.caminho}`, '', img.base64.match(/.{1,76}/g).join('\r\n'),
  );
  partes.push(`--${limite}--`, '');
  return new Blob([partes.join('\r\n')], { type: 'application/msword' });
}

export async function baixarWord(elemento, titulo) {
  const url = URL.createObjectURL(await montarWord(elemento, titulo));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nomeDeArquivo(titulo)}.doc`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
