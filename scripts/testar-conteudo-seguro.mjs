import assert from 'node:assert/strict';

import { CAMPANHAS } from '../src/data/campanhas.mjs';
import { POSTS } from '../src/data/posts.mjs';
import { buildCampanha } from '../src/pages/campanhas.mjs';
import { buildPost, postItem } from '../src/pages/publicacoes.mjs';
import { shell } from '../src/layouts/shell.mjs';
import { textoHtml, textoInlineSeguro } from '../src/lib/html.mjs';

const ataque = '<img src=x onerror="document.documentElement.dataset.pwned=1">';
const svgAttack = '<svg onload="document.documentElement.dataset.pwned=1"><circle></circle></svg>';
const simples = 'A & B';

assert.equal(textoHtml(simples), 'A &amp; B');
assert.equal(textoHtml('A &amp; B'), 'A &amp; B', 'entidades antigas não devem ser codificadas duas vezes');
assert.equal(textoInlineSeguro('<strong>Prazo:</strong> hoje'), '<strong>Prazo:</strong> hoje');
assert.equal(textoInlineSeguro('<strong onclick="alert(1)">texto</strong>'),
  '&lt;strong onclick="alert(1)"&gt;texto&lt;/strong&gt;');
assert.equal(textoInlineSeguro('</strong>solto'), '&lt;/strong&gt;solto');
assert.equal(textoInlineSeguro('<strong>aberto'), '<strong>aberto</strong>');
assert.equal(textoInlineSeguro(svgAttack), '&lt;svg onload="document.documentElement.dataset.pwned=1"&gt;&lt;circle&gt;&lt;/circle&gt;&lt;/svg&gt;');

const campanha = buildCampanha({
  slug: 'fixture-seguro', rotulo: svgAttack, titulo: ataque, subtitulo: ataque,
  descricao: ataque, whatsapp: ataque, situacoes: [ataque],
  direitos: [[ataque, ataque]], passos: [[ataque, ataque]],
  documentos: [ataque], prazo: ataque, faq: [[ataque, ataque]],
});
assert.equal(campanha.body.includes(ataque), false, 'texto CMS de campanha não pode virar elemento HTML');
assert.ok(campanha.body.includes('&lt;img src=x onerror='));
assert.ok(campanha.body.includes('href="https://wa.me/'), 'WhatsApp continua com URL codificada');
const campanhaCompleta = shell(campanha);
assert.equal(campanhaCompleta.includes(ataque), false, 'descrição e FAQ também não podem quebrar shell/JSON-LD');
assert.ok(campanhaCompleta.includes('name="description" content="&lt;img src=x onerror='));

const postDados = {
  slug: 'fixture-seguro', data: '23 Out 2026', datetime: '2026-10-23',
  titulo: ataque, area: ataque, thumb: '§', autor: ataque, resumo: ataque,
  corpo: [['p', ataque], ['h2', ataque], ['pq', ataque], ['ul', [ataque]],
    ['instagram', {
      url: 'https://instagram.com/?a=1&b=2',
      imagem: 'assets/img/publicacoes/clausula-nao-concorrencia-instagram.png',
      legenda: ataque, alt: ataque, width: 1, height: 1,
    }]],
};
const post = buildPost(postDados);
assert.equal(post.body.includes(ataque), false, 'texto CMS de publicação não pode virar elemento HTML');
assert.ok(post.body.includes('&lt;img src=x onerror='));
assert.ok(post.body.includes('href="https://instagram.com/?a=1&amp;b=2"'),
  'URL HTTPS codifica o separador de parâmetros para contexto de atributo');
assert.ok(post.body.includes('src="../assets/img/publicacoes/clausula-nao-concorrencia-instagram.png"'),
  'imagem local permanece sob assets e dentro do atributo src');
assert.ok(post.body.includes('alt="&lt;img src=x onerror='), 'alt permanece texto de atributo');
assert.equal(postItem({ ...postDados, titulo: simples, resumo: 'A &amp; B' }, '/post.html', '  ', { resumo: true })
  .includes('A &amp;amp; B'), false, 'índice não duplica entidades');

const paginaSegura = shell(post);
assert.equal(paginaSegura.includes(ataque), false, 'metadados e corpo da página não reintroduzem o payload');
assert.ok(paginaSegura.includes('"headline": "\\u003cimg'), 'JSON-LD continua escapando menor que');
assert.throws(() => buildPost({ ...postDados, corpo: [['instagram', {
  url: 'javascript:alert(1)', imagem: 'assets/img/publicacoes/clausula-nao-concorrencia-instagram.png',
  legenda: 'texto',
}]] }), /URL HTTPS válida/);
assert.throws(() => buildPost({ ...postDados, corpo: [['instagram', {
  url: 'https://instagram.com/', imagem: 'assets/../../fora.png', legenda: 'texto',
}]] }), /caminho de imagem inválido/);

for (const atual of POSTS) {
  const html = buildPost(atual).body;
  assert.ok(!html.includes('<script'), `conteúdo estático ${atual.slug} não introduz script`);
  if (atual.corpo.some(([tipo, valor]) => tipo === 'ul' && valor.some((linha) => linha.includes('<strong>')))) {
    assert.ok(html.includes('<strong>'), `formatação forte antiga foi preservada em ${atual.slug}`);
  }
}

for (const atual of CAMPANHAS) {
  const html = buildCampanha(atual).body;
  assert.ok(!html.includes('<script'), `campanha estática ${atual.slug} não introduz script`);
}

console.log(`Conteúdo seguro: payload, atributos, entidades e ${POSTS.length} publicações + ${CAMPANHAS.length} campanhas OK.`);

