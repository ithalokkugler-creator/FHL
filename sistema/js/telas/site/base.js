// Site — o que Publicações e Campanhas usam em comum.
// ===================================================
//
// Este bloco edita o SITE PÚBLICO (DOMINIO em src/data/site.mjs): o que se escreve
// aqui é lido pelo build do site, em src/data/conteudo.mjs, e vira HTML.
// Salvar não muda o site no ar — quem muda é a publicação, na tela Publicar.

import { html } from '../../nucleo/html.js';
import { db } from '../../nucleo/supabase.js';

/** Balde do Storage com as imagens das publicações. */
const BALDE = 'site';

/**
 * Áreas de atuação do site, na ordem em que aparecem lá.
 *
 * Cópia de src/data/areas.mjs: as áreas moldam a navegação, o rodapé e o
 * menu do site inteiro, não só o conteúdo — mudá-las é mexer no site, não
 * publicar nele, e por isso continuam no código. Se uma área for criada lá,
 * acrescente aqui.
 */
export const AREAS = [
  { slug: 'trabalhista', nome: 'Direito Trabalhista', curto: 'Trabalhista' },
  { slug: 'previdenciario', nome: 'Direito Previdenciário', curto: 'Previdenciário' },
  { slug: 'consumidor', nome: 'Direito do Consumidor', curto: 'Consumidor' },
  { slug: 'civel', nome: 'Direito Cível', curto: 'Cível' },
];

/** Símbolo grande que aparece atrás do título na lista de publicações. */
export const SIMBOLOS = ['§', '¶', '†', '‡', '&', '¤', '№', '∴'];

/**
 * "Cláusula de não concorrência" → "clausula-de-nao-concorrencia".
 * É o endereço da página: publicacoes/<slug>.html.
 */
export function comoSlug(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

export const seloPublicado = (publicado) => (publicado
  ? html`<span class="selo selo--ok">No site</span>`
  : html`<span class="selo selo--alerta">Rascunho</span>`);

/**
 * O aviso do Provimento 205/2021 da OAB.
 *
 * Fica em toda tela que escreve para o público. Não é enfeite: o site é
 * publicidade de escritório de advocacia, e o que é vedado não depende de o
 * texto ser bem-intencionado. Quem assina o conteúdo é quem escreve.
 */
export const notaOab = () => html`
  <p class="nota nota--info">
    <strong>Antes de publicar (Provimento 205/2021 da OAB):</strong> nada de depoimento de
    cliente, resultado obtido, percentual de êxito, valor de honorário, promessa, superlativo
    ("o melhor", "o maior") ou chamada que convença alguém a processar. Conteúdo informativo,
    sóbrio e sem captação — é o que o site inteiro segue.
  </p>`;

/** Endereço da página no site, para conferir depois de publicar. */
export const linkNoSite = (caminho) => html`
  <a class="link-externo" href="/${caminho}" target="_blank" rel="noopener">Ver no site ↗</a>`;

/**
 * Sobe uma imagem e devolve o caminho dela dentro do balde.
 *
 * O nome sai do slug da publicação para o arquivo ser reconhecível no
 * Storage e no repositório — é com esse nome que o build o grava em
 * assets/img/publicacoes/.
 */
export async function enviarImagem(arquivo, slug, indice) {
  const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })[arquivo.type];
  if (!ext) throw new Error('Use uma imagem PNG, JPEG ou WebP.');
  if (arquivo.size > 5 * 1024 * 1024) throw new Error('A imagem passa de 5 MB. Reduza antes de enviar.');

  const nome = `${slug || 'publicacao'}-${indice + 1}.${ext}`;
  return db.enviarArquivo(BALDE, `publicacoes/${nome}`, arquivo);
}

/** Onde a imagem está para ser mostrada na tela: no Storage ou no repositório. */
export const enderecoDaImagem = (caminho) => (caminho.startsWith('assets/')
  ? `/${caminho}`
  : db.enderecoDoArquivo(BALDE, caminho));

/** Uma linha por item, para editar lista em <textarea>. */
export const linhas = (itens) => (itens ?? []).join('\n');

export const deLinhas = (texto) => String(texto ?? '')
  .split('\n').map((l) => l.trim()).filter(Boolean);

/**
 * Pares [título, texto] num <textarea>, separados por "—". Foi o formato que
 * sobrou depois de tentar dois campos por item: a lista fica editável num
 * lugar só, e colar de um rascunho continua funcionando.
 */
export const pares = (itens) => (itens ?? []).map(([a, b]) => `${a} — ${b}`).join('\n');

export function dePares(texto, rotulo) {
  return deLinhas(texto).map((linha) => {
    const i = linha.indexOf('—');
    if (i < 0) {
      throw new Error(`${rotulo}: separe título e texto com um travessão (—) em "${linha.slice(0, 40)}".`);
    }
    const par = [linha.slice(0, i).trim(), linha.slice(i + 1).trim()];
    if (!par[0] || !par[1]) throw new Error(`${rotulo}: falta o título ou o texto em "${linha.slice(0, 40)}".`);
    return par;
  });
}
