import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELOS_OFICIAIS_INICIAIS } from '../../scripts/local/modelos-iniciais.mjs';
import { camposDeEmissao, contextoFicticio, corpoParaEditor, renderModelo, tamanhoNoBanco, validarModelo } from '../js/documentos/modelos-editaveis.js';
import { avisoOficial, blocosOficiais, extrasDePrevia, perguntaOficialVisivel } from '../js/documentos/modelos-oficiais.js';

const preparar = (chave) => {
  const v = MODELOS_OFICIAIS_INICIAIS.find((m) => m.chave === chave);
  const c = extrasDePrevia(chave,contextoFicticio(v.definicao));
  return { v, c, editor: () => String(corpoParaEditor(v.definicao,blocosOficiais(chave))),
    render: () => renderModelo(v,c,blocosOficiais(chave)) };
};

test('Os 29 modelos DOCX passam pela validação e geram prévia preenchida', () => {
  assert.equal(MODELOS_OFICIAIS_INICIAIS.length,29);
  assert.equal(MODELOS_OFICIAIS_INICIAIS.filter((m) => m.categoria === 'Petição').length,9);
  for (const { chave, definicao, rascunho } of MODELOS_OFICIAIS_INICIAIS) {
    validarModelo(definicao,{publicar:true,extras:blocosOficiais(chave)});
    assert.equal(rascunho,false,chave);
    const r = preparar(chave).render();
    assert.deepEqual(r.faltas,[],chave);
    assert.doesNotMatch(String(r.folha),/modelo-campo-chip|Lorem ipsum|escolher o estado|doc-(?:cor|realce)-/i,chave);
  }
});

test('CPF faltante aparece na prévia e texto digitado pelo cliente é escapado', () => {
  const v = {titulo:'Teste',definicao:{ formato:1,corpo:[{tipo:'campo',chave:'cliente.cpf'},{tipo:'campo',chave:'cliente.nome'}],perguntas:[],assinaturas:[] }};
  const r = renderModelo(v,{cliente:{nome:'<svg onload=alert(1)>',documento:'11222333000181'},detalhes:{tipo_pessoa:'juridica'},hoje:'2026-11-13'});
  assert.deepEqual(r.faltas,['CPF do cliente']);
  assert.match(String(r.folha),/&lt;svg onload=/);
  assert.doesNotMatch(String(r.folha),/<svg/);
});

test('A intimação usa a modalidade da Agenda e o artigo e nota do ramo escolhido', () => {
  const { c,render,editor } = preparar('intimacao_testemunha');
  c.dados.m_modalidade_audiencia = 'Virtual';
  assert.match(String(render().folha),/na forma presencial/);
  assert.doesNotMatch(String(render().folha),/Sendo a audiência semipresencial\/virtual/);
  assert.match(String(render().folha),/A testemunha que, intimada na forma/);
  assert.doesNotMatch(String(render().folha),/Código de Processo Penal/);
  assert.match(editor(),/Código de Processo Penal/);
  c.dados.agenda.modalidade = 'online';
  c.dados.m_ramo = 'criminal';
  assert.match(String(render().folha),/Sendo a audiência semipresencial\/virtual/);
  assert.match(String(render().folha),/art\. 218 do Código de Processo Penal/);
  assert.doesNotMatch(String(render().folha),/A testemunha que, intimada na forma/);
  c.dados.agenda.modalidade = null;
  assert.equal(perguntaOficialVisivel('intimacao_testemunha',{chave:'manual.modalidade_audiencia'},c),true);
});

test('Texto integral e notas permanecem no editor, com apenas a alternativa selecionada na emissão', () => {
  const renuncia = preparar('renuncia');
  assert.match(renuncia.editor(),/renunciantes deixam de representá-la/);
  assert.match(renuncia.editor(),/renunciantes continuarão a representar/);
  assert.match(String(renuncia.render().folha),/<sup>1<\/sup>/);
  assert.doesNotMatch(String(renuncia.render().folha),/renunciantes deixam de representá-la/);
  renuncia.c.dados.m_forma_renuncia = 'Com outro procurador';
  assert.match(String(renuncia.render().folha),/renunciantes deixam de representá-la/);
  assert.doesNotMatch(String(renuncia.render().folha),/renunciantes continuarão a representar/);
  const contrato = preparar('contrato_honorarios');
  assert.match(contrato.editor(),/cédula hipotecária/);
  assert.doesNotMatch(String(contrato.render().folha),/cédula hipotecária/);
  contrato.c.dados.garantia = 'hipoteca';
  assert.match(String(contrato.render().folha),/cédula hipotecária/);
  assert.doesNotMatch(String(contrato.render().folha),/O contrato não possui quaisquer garantias/);
});

test('Os campos da Petição Inicial distinguem autor, réu, cônjuge e testemunhas', () => {
  const { c, v, render } = preparar('peticao_inicial');
  c.dados.m_reu_cpf = '529.982.247-25';
  c.dados.m_conjuge_reu_cpf = '111.444.777-35';
  c.dados.m_incluir_conjuge_reu = 'Sim';
  c.dados.m_incluir_testemunha_1 = 'Sim';
  c.dados.m_testemunha_1_nome = 'Nome da primeira testemunha';
  const folha = String(render().folha);
  for (const p of [/123\.456\.789-09/,/529\.982\.247-25/,/111\.444\.777-35/,/Nome da primeira testemunha/]) {
    assert.match(folha,p);
  }
  assert.ok(camposDeEmissao(v.definicao,c.dados).has('manual.testemunha_1_nome'));
  assert.ok(!camposDeEmissao(v.definicao,c.dados).has('manual.testemunha_2_nome'));
});

test('Embargos trazem os textos da linha do tempo e a FAA mantém os campos da tabela', () => {
  const embargos = preparar('embargos_declaracao');
  assert.match(embargos.editor(),/Início do prazo/);
  assert.match(embargos.editor(),/Final do prazo/);
  assert.match(embargos.editor(),/Interposição do agravo/);
  assert.equal(embargos.v.definicao.perguntas.filter((p) => p.chave.startsWith('manual.data_caixa_')).length,5);
  const ficha = preparar('ficha_atendimento');
  assert.match(ficha.editor(),/<table/);
  assert.match(String(ficha.render().folha),/Maria de Exemplo/);
  assert.match(String(ficha.render().folha),/João de Exemplo/);
});

test('A carta usa o CNPJ da empresa e permite preencher o representante e o CNJ incompleto', () => {
  const { c,render } = preparar('carta_preposicao');
  c.detalhes.representante_qualificacao = '';
  c.processo.numero = '123';
  c.dados.processo = '';
  assert.equal(perguntaOficialVisivel('carta_preposicao',{chave:'manual.representante_nacionalidade'},c,true),true);
  assert.equal(perguntaOficialVisivel('carta_preposicao',{chave:'manual.autos'},c,true),true);
  c.dados.m_autos = '0001234-89.2026.8.16.0129';
  assert.match(String(render().folha),/0001234-89\.2026\.8\.16\.0129/);
  assert.match(String(render().folha),/11\.222\.333\/0001-81/);
});

test('Os modelos oferecem entrada para cada dado cadastral ausente que utilizam', () => {
  for (const v of MODELOS_OFICIAIS_INICIAIS) {
    const c = contextoFicticio(v.definicao);
    c.cliente = { id:'cliente', nome:'Cliente de teste' };
    c.detalhes = v.chave === 'carta_preposicao' ? { tipo_pessoa:'juridica' } : { tipo_pessoa:'fisica' };
    c.dados = { modalidade:'exito', exito:10, garantia:'fianca', data_emissao:c.hoje };
    const r = renderModelo(v,c,blocosOficiais(v.chave));
    const disponiveis = new Set(r.complementos.map((p) => p.chave));
    for (const { chave } of r.pendencias) {
      if (chave.startsWith('cliente.')) assert.ok(disponiveis.has(chave),v.chave + ' ' + chave);
    }
  }
});

test('Complementos preenchem a emissão enquanto o cadastro tem prioridade', () => {
  const { c, v } = preparar('contrato_honorarios');
  const extras = blocosOficiais(v.chave);
  c.dados = { ...c.dados, modalidade:'exito', garantia:'fianca' };
  delete c.detalhes.nacionalidade;
  delete c.detalhes.estado_civil;
  delete c.detalhes.profissao;
  delete c.detalhes.logradouro;
  c.complementos = {
    'cliente.nacionalidade':'uruguaia','cliente.estado_civil':'casada',
    'cliente.profissao':'professora','cliente.endereco':'Rua da Emissão, 100',
  };
  const r = renderModelo(v,c,extras);
  assert.deepEqual(r.faltas,[]);
  assert.deepEqual(r.complementos.map((p) => p.chave), Object.keys(c.complementos));
  assert.match(String(r.folha),/uruguaia, casada, professora/);
  assert.equal(c.detalhes.nacionalidade,undefined);
  c.detalhes.nacionalidade = 'brasileira';
  assert.match(String(renderModelo(v,c,extras).folha),/brasileira, casada, professora/);
});

test('CPF manual inválido de uma parte continua pendente', () => {
  const { c, render } = preparar('declaracao_endereco');
  c.dados.m_declarante_cpf = 'abc';
  assert.ok(render().pendencias.some((p) => p.chave === 'manual.declarante_cpf'));
  c.dados.m_declarante_cpf = '52998224725';
  assert.doesNotMatch(String(render().folha),/\[CPF · declarante\]/);
  assert.match(String(render().folha),/529\.982\.247-25/);
});

test('Revisão 14/11: recuo de primeira linha nos parágrafos corridos e títulos de cláusula sem recuo', () => {
  const contar = (m) => JSON.stringify(m).split('doc-recuo-primeira-linha').length - 1;
  assert.ok(MODELOS_OFICIAIS_INICIAIS.reduce((s, m) => s + contar(m), 0) >= 250);
  const desistencia = String(preparar('declaracao_desistencia').render().folha);
  assert.match(desistencia, /<p class="[^"]*doc-recuo-primeira-linha[^"]*">1º - Desisto/);
  const contrato = String(preparar('contrato_honorarios').render().folha);
  assert.match(contrato, /<p class="[^"]*doc-clausula[^"]*">1\. Objeto/);
  assert.match(contrato, /<p class="[^"]*doc-recuo-primeira-linha[^"]*">1\.1\. O presente acordo/);
});

test('Revisão 14/11: concordância do cadastro em inscrito, domiciliado e orientado', () => {
  const { c, render } = preparar('declaracao_desistencia');
  c.detalhes.flexao = 'f';
  assert.match(String(render().folha), /inscrita no CPF[\s\S]*domiciliada na[\s\S]*devidamente orientada/);
  c.detalhes.flexao = 'm';
  assert.match(String(render().folha), /inscrito no CPF[\s\S]*domiciliado na[\s\S]*devidamente orientado /);
  c.detalhes.flexao = '';
  assert.match(String(render().folha), /inscrito\(a\) no CPF/);
});

test('Revisão 14/11: petições sem números soltos, sem "Petição modelo" e sem parágrafo vazio de exemplo', () => {
  const { v, c, render } = preparar('contestacao');
  for (const p of v.definicao.perguntas) if (/^manual\.redacao_/.test(p.chave)) c.dados['m_' + p.chave.slice(7)] = '';
  const gratuidade = v.definicao.perguntas.find((p) => /^manual\.nota_/.test(p.chave) && /^Gratuidade/.test(p.rotulo));
  c.dados['m_' + gratuidade.chave.slice(7)] = 'Sim';
  const folha = String(render().folha);
  assert.doesNotMatch(folha, /<p[^>]*>\s*\d+(?:\.\d+)*\.\s*<\/p>/);
  assert.doesNotMatch(folha, /Petição modelo|Lorem/);
  assert.deepEqual(render().faltas, []);
  assert.match(folha, /Gratuidade da justiça deferida em mov\./);
});

test('Revisão 14/11: escolhas que mudam o texto (desconto em folha, JEC/JEF, quesitos, cláusula 11)', () => {
  const h = preparar('homologacao_divorcio_consensual');
  h.c.dados.m_incluir_desconto_folha = 'Não';
  assert.doesNotMatch(String(h.render().folha), /\(\s*\)/);
  h.c.dados.m_incluir_desconto_folha = 'Sim';
  h.c.dados.m_desconto_folha = 'mediante desconto em folha';
  assert.match(String(h.render().folha), /\(mediante desconto em folha\)/);
  const j = preparar('declaracao_renuncia_credito_excedente');
  j.c.dados.m_juizado = 'JEF';
  assert.match(String(j.render().folha), /Juizado Especial Federal[\s\S]*Lei do JEF[\s\S]*sessenta/);
  assert.doesNotMatch(String(j.render().folha), /Juizado Especial Cível/);
  const q = preparar('peticao_quesitos_pericia_medica');
  q.c.dados.m_ato_pericia = 'indicar assistente técnico';
  q.c.dados.m_posicao_cliente = 'réu';
  const quesitos = String(q.render().folha);
  assert.match(quesitos, /Indicação de assistente técnico/);
  assert.doesNotMatch(quesitos, /Impedimento\/suspeição do perito|Quesitos à perícia,/);
  assert.match(quesitos, /o réu apresenta seus quesitos/);
  const contrato = preparar('contrato_honorarios');
  contrato.c.dados.area = 'trabalhista';
  assert.match(String(contrato.render().folha), /Processo Cível/);
});

test('Revisão 14/11: termo de rescisão com datas próprias e aviso quando os totais não fecham', () => {
  const { c, render } = preparar('termo_rescisao_trabalho');
  Object.assign(c.dados, { m_aviso_inicio: '2025-06-03', m_ultimo_dia: '2025-07-03', m_pagamento_aviso: '2025-07-05' });
  assert.match(String(render().folha), /aviso prévio de 03\/06\/2025 à 03\/07\/2025, tendo recebido em 05\/07\/2025/);
  Object.assign(c.dados, { m_saldo_salario: '533,33', m_decimo: '533,33', m_ferias: '533,33', m_verbas: '1.599,99',
    m_fgts: '473,60', m_fgts_devido: '236,80', m_deducoes: '0,00', m_liquido: '1.836,79' });
  assert.equal(avisoOficial('termo_rescisao_trabalho', c), '');
  c.dados.m_liquido = '1.000,00';
  assert.match(avisoOficial('termo_rescisao_trabalho', c), /total líquido/);
});

test('Revisão 14/11: tamanho medido como o banco mede o jsonb', () => {
  assert.equal(tamanhoNoBanco({ a: [1, 2] }), '{"a": [1, 2]}'.length);
  assert.equal(tamanhoNoBanco({ a: 'ç', b: {} }), new TextEncoder().encode('{"a": "ç", "b": {}}').length);
});

test('Revisão 14/11: cláusulas condicionais fora do texto não deixam lacuna na numeração', () => {
  const numeros = (chave, ajuste) => {
    const p = preparar(chave);
    ajuste(p.c);
    return [...String(p.render().folha).matchAll(/>(\d+(?:\.\d+)*)\.\s/g)].map((x) => x[1]);
  };
  const civel = numeros('contrato_honorarios', (c) => { c.dados.area = 'civel'; });
  assert.deepEqual(civel.filter((n) => n.startsWith('3.')), ['3.1','3.2','3.3','3.4','3.5','3.6']);
  const testemunha = numeros('contestacao', (c) => Object.assign(c.dados, { m_incluir_testemunha_1:'Não', m_incluir_testemunha_2:'Sim', m_incluir_testemunha_3:'Não' }));
  assert.deepEqual(testemunha.filter((n) => n.startsWith('5.')), ['5.1']);
});
