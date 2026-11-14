import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { abrirDialogo, pedirMotivo } from '../../nucleo/dialogo.js';
import { nomeDe, pode } from '../../nucleo/estado.js';
import { dataHora, semAcento } from '../../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { ligarColagem } from '../../nucleo/higienizar.js';
import { guardarConsulta, navegar } from '../../nucleo/rotas.js';
import { barraDeFormatacao, ligarEditor } from '../../documentos/editor.js';
import { acaoModelo, carregarCatalogo, carregarVersao } from '../../documentos/catalogo.js';
import {
  CATEGORIAS_MODELO, DEFINICAO_VAZIA, LIMITE_PERGUNTAS_MODELO, PALAVRAS_MODELO, TIPOS_PERGUNTA, chavesDaDefinicao, chipDoCampo, contextoFicticio,
  corpoParaEditor, lerCorpoEditavel, renderModelo, validarModelo,
} from '../../documentos/modelos-editaveis.js';
import { blocosOficiais, extrasDePrevia, perguntasProtegidas } from '../../documentos/modelos-oficiais.js';
import { cabecalho, opcoes, vazio } from '../comum.js';

const rota = (id) => '#/documentos/modelos' + (id ? '/' + id : '');

export async function telaCatalogo(ctx) {
  const modelos = await carregarCatalogo();
  if (!ctx.ativa()) return;
  const filtro = ctx.consulta;
  desenhar(ctx.raiz, html`
    ${cabecalho('Modelos de documentos', 'Escolha um modelo para gerar um documento', html`
      <a class="botao" href="#/documentos">Documentos gerados</a>
      ${pode.editarModelos() ? html`<a class="botao botao--primario" href="${rota('novo')}">Novo modelo</a>` : ''}`)}
    <form class="filtros modelos-filtros" role="search">
      <label class="campo"><span>Buscar modelo</span><input type="search" name="busca" placeholder="Nome do modelo" value="${filtro.busca ?? ''}"></label>
      <label class="campo"><span>Categoria</span><select name="categoria">${opcoes(CATEGORIAS_MODELO.map((v) => [v,v]), filtro.categoria ?? '', { vazio: 'Todas' })}</select></label>
      ${pode.editarModelos() ? html`<label class="campo"><span>Situação</span><select name="situacao">
        ${opcoes([['ativos','Ativos'],['arquivados','Arquivados'],['todos','Todos']], filtro.situacao ?? 'ativos')}
      </select></label>` : ''}
    </form>
    <section data-catalogo aria-label="Modelos"></section>`);
  const form = $('form',ctx.raiz);
  const titulo = (m) => m.atual?.nome || m.rascunho?.nome;
  const mostrar = () => {
    const normal = (t) => semAcento(t).toLocaleLowerCase('pt-BR');
    const busca = normal(form.busca.value.trim());
    const sit = form.situacao?.value ?? 'ativos';
    const lista = modelos.filter((m) => titulo(m) && normal(titulo(m)).includes(busca) &&
      (!form.categoria.value || (m.atual ?? m.rascunho).categoria === form.categoria.value) &&
      (sit === 'todos' || (sit === 'ativos' ? !m.arquivado_em : m.arquivado_em)))
      .sort((a,b) => titulo(a).localeCompare(titulo(b),'pt-BR'));
    desenhar($('[data-catalogo]',ctx.raiz), lista.length ? html`<ul class="modelos-catalogo">${lista.map((m) => html`
      <li class="painel modelo-cartao">
        <div><p class="sub">${(m.atual ?? m.rascunho).categoria} · ${m.chave_oficial ? 'Do escritório' : 'Personalizado'}</p>
        <h2>${titulo(m)}</h2>
        <p class="sub">${m.arquivado_em ? 'Arquivado' : m.atual ? 'Versão ' + m.atual.numero + (m.rascunho ? ' · Rascunho em edição' : '') : 'Rascunho'}</p></div>
        <div class="registro-acoes">
          ${m.atual && !m.arquivado_em ? html`<a class="botao botao--primario" href="#/documentos/novo?modelo_catalogo=${m.id}">Usar modelo</a>` : ''}
          ${pode.editarModelos() ? html`<a class="botao" href="${rota(m.id)}">${m.arquivado_em ? 'Ver versões' : m.rascunho ? 'Editar rascunho' : 'Editar modelo'}</a>` : ''}
        </div>
      </li>`)}</ul>` : vazio(modelos.length ? 'Nenhum modelo corresponde aos filtros. Limpe a busca ou altere os filtros.' :
        pode.editarModelos() ? 'O catálogo está vazio. Use Novo modelo para começar.' : 'Ainda não há modelos publicados.'));
  };
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', () => {
    guardarConsulta({
      busca: form.busca.value.trim(),
      categoria: form.categoria.value,
      situacao: form.situacao?.value === 'ativos' ? '' : form.situacao?.value,
    });
    mostrar();
  });
  mostrar();
}

export async function telaEditorModelo(ctx) {
  if (!pode.editarModelos()) {
    desenhar(ctx.raiz, cabecalho('Edição de modelos', 'Seu perfil pode usar os modelos publicados.'));
    return;
  }
  const catalogo = ctx.params.id ? (await carregarCatalogo()).find((m) => m.id === ctx.params.id) : null;
  if (!ctx.ativa()) return;
  if (ctx.params.id && !catalogo) {
    desenhar(ctx.raiz, cabecalho('Modelo não encontrado'));
    return;
  }
  const selecao = catalogo?.rascunho ?? catalogo?.atual;
  const inicial = selecao ? await carregarVersao(selecao.id) : null;
  if (!ctx.ativa()) return;
  if (selecao && !inicial) throw new Error('O modelo mudou. Reabra o catálogo.');
  const extras = blocosOficiais(catalogo?.chave_oficial);
  const formInicial = inicial?.definicao ?? DEFINICAO_VAZIA;
  let perguntas = structuredClone(formInicial.perguntas);
  let assinaturas = structuredClone(formInicial.assinaturas);
  let rascunho = catalogo?.rascunho ?? null;
  const id = catalogo?.id ?? crypto.randomUUID();
  let ocupado = false;
  let sujo = false;
  const podeEditar = !catalogo?.arquivado_em;
  const publicador = pode.administrar();

  desenhar(ctx.raiz, html`${cabecalho(catalogo ? 'Editar modelo' : 'Novo modelo',
    catalogo?.arquivado_em ? 'Arquivado' : rascunho ? 'Rascunho da versão ' + rascunho.numero :
    catalogo?.atual ? 'Versão publicada ' + catalogo.atual.numero : 'Rascunho')}
    <div class="documento-editor modelo-editor">
      <aside class="documento-controles">
        <form data-metadados>
          <label class="campo"><span>Nome no catálogo</span><input name="nome" required maxlength="120" value="${inicial?.nome ?? ''}" ${podeEditar ? '' : 'disabled'}></label>
          <label class="campo" ${formInicial.folha_origem ? 'hidden' : ''}><span>Título na folha</span><input name="titulo" ${formInicial.folha_origem ? '' : 'required'} maxlength="160" value="${inicial?.titulo ?? ''}" ${podeEditar ? '' : 'disabled'}></label>
          <label class="campo"><span>Categoria</span><select name="categoria" ${podeEditar ? '' : 'disabled'}>${opcoes(CATEGORIAS_MODELO.map((s) => [s,s]), inicial?.categoria ?? 'Declaração')}</select></label>
        </form>
        ${podeEditar ? html`<section class="secao modelo-inserir">
          <label class="campo"><span>Campo para inserir no texto</span><select data-paleta></select></label>
          <button type="button" class="botao" data-acao="inserir">Inserir campo</button>
          <p class="sub">Clique no texto para escolher o ponto de inserção. Sem cursor, o campo entra no fim.</p>
          <button type="button" class="botao-link modelo-atalho-movel" data-acao="ir-texto">Ir para o texto</button>
        </section>
        <section class="secao modelo-controles-lista">
          <div class="modelo-cabecalho"><h2>Perguntas</h2><button type="button" class="botao botao--pequeno" data-acao="pergunta">Adicionar</button></div>
          <ul data-perguntas></ul>
          <div class="modelo-cabecalho"><h2>Assinaturas</h2><button type="button" class="botao botao--pequeno" data-acao="assinatura">Adicionar</button></div>
          <ul data-assinaturas></ul>
        </section>` : html`<p class="nota secao">Motivo: ${catalogo.motivo_arquivo}</p>`}
        <div data-status class="sub secao" role="status"></div>
        <div class="registro-acoes secao">
          ${podeEditar ? html`<button type="button" class="botao botao--primario" data-acao="salvar">Salvar rascunho</button>
          ${publicador ? html`<button type="button" class="botao" data-acao="publicar">Publicar versão</button>` : ''}` : ''}
          <button type="button" class="botao" data-acao="previa">Prévia fictícia</button>
          ${catalogo && !Object.keys(extras).length ? html`<button type="button" class="botao" data-acao="duplicar">Duplicar modelo</button>` : ''}
          ${catalogo && publicador ? html`<button type="button" class="botao" data-acao="arquivo">${podeEditar ? 'Arquivar' : 'Reativar'}</button>` : ''}
        </div>
      </aside>
      <div class="documento-area modelo-folha-area">
        ${podeEditar ? html`<button type="button" class="botao-link modelo-atalho-movel" data-acao="ir-campos">Voltar aos campos</button>` : ''}
        ${podeEditar ? barraDeFormatacao() : ''}
        <div class="documento-visualizacao">
          <article class="documento-folha modelo-corpo doc-padrao-fl" contenteditable="${String(podeEditar)}" role="textbox" aria-label="Texto do modelo" aria-multiline="true" aria-readonly="${String(!podeEditar)}">${corpoParaEditor(formInicial, extras)}</article>
        </div>
      </div>
    </div>
    ${catalogo ? html`<section class="painel secao modelo-historico"><h2>Histórico de versões</h2>
      <ul>${catalogo.versoes.map((v) => html`<li>
        <span><strong>Versão ${v.numero}</strong> · ${v.publicado_em ? html`Publicada em ${dataHora(v.publicado_em)} por ${v.publicado_por ? nomeDe(v.publicado_por) : 'Sistema'}` : 'Rascunho'}
        ${v.fonte ? html`<small>Origem: ${v.fonte}</small>` : ''}</span>
        <div class="registro-acoes"><button type="button" class="botao botao--pequeno" data-acao="ver-versao" data-id="${v.id}">Ver</button>
        ${publicador && podeEditar && v.publicado_em && !rascunho ? html`<button type="button" class="botao botao--pequeno" data-acao="restaurar" data-id="${v.id}">Restaurar como rascunho</button>` : ''}</div>
      </li>`)}</ul>
    </section>` : ''}`);

  const form = $('[data-metadados]',ctx.raiz);
  const corpo = $('.modelo-corpo',ctx.raiz);
  const paleta = $('[data-paleta]',ctx.raiz);
  let cursor = null;
  const opcoesCampos = () => [...PALAVRAS_MODELO, ...Object.entries(extras).map(([k,[r]]) => [k,r]), ...perguntas.map((p) => [p.chave,p.rotulo])];
  const usarSelecao = () => {
    const s = getSelection();
    if (s.rangeCount && corpo.contains(s.anchorNode) && corpo.contains(s.focusNode)) cursor = s.getRangeAt(0).cloneRange();
  };
  const atualizar = () => {
    if (!podeEditar) return;
    const valor = paleta.value;
    desenhar(paleta, opcoes(opcoesCampos(), valor));
    desenhar($('[data-perguntas]',ctx.raiz), perguntas.map((p,i) => html`<li>
      <span>${p.rotulo}${p.obrigatorio ? ' *' : ''}</span><span><button type="button" class="botao-link" data-acao="editar-pergunta" data-i="${i}" aria-label="Editar ${p.rotulo}">Editar</button>
      <button type="button" class="botao-link" data-acao="tirar-pergunta" data-i="${i}" aria-label="Remover ${p.rotulo}">Remover</button></span></li>`));
    desenhar($('[data-assinaturas]',ctx.raiz), assinaturas.map((a,i) => html`<li>
      <span>${a.papel}</span><button type="button" class="botao-link" data-acao="tirar-assinatura" data-i="${i}" aria-label="Remover assinatura ${a.papel}">Remover</button></li>`));
  };
  const estado = () => ({
    nome: form.nome.value.trim() || (!podeEditar ? inicial?.nome : ''),
    titulo: formInicial.folha_origem ? ((form.categoria.value !== 'Petição'
        && corpo.querySelector('.doc-titulo:not(:has([data-campo], [data-modelo-condicao], [data-modelo-exemplo]))')?.textContent.trim().slice(0,160))
        || inicial?.titulo || form.nome.value.trim())
      : form.titulo.value.trim() || (!podeEditar ? inicial?.titulo : ''),
    categoria: form.categoria.value,
    definicao: { ...formInicial, corpo: lerCorpoEditavel(corpo), perguntas, assinaturas },
  });
  const status = (texto) => { $('[data-status]',ctx.raiz).textContent = texto; };
  const editou = () => { sujo = true; status('Alterações ainda não salvas.'); };
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', editou);
  const exemplosOriginais = new Map([...corpo.querySelectorAll('[data-modelo-exemplo]')]
    .map((el) => [el.dataset.modeloExemplo,el.textContent]));
  corpo.addEventListener('input',() => {
    for (const el of corpo.querySelectorAll('[data-modelo-exemplo]')) {
      if (exemplosOriginais.get(el.dataset.modeloExemplo) !== el.textContent) delete el.dataset.modeloExemplo;
    }
    editou();
  });
  document.addEventListener('selectionchange',usarSelecao);

  const barra = $('.editor-barra',ctx.raiz);
  for (const cel of barra?.querySelectorAll('[data-comando="cor"],[data-comando="realce"]') ?? []) {
    const grupo = cel.closest('.editor-paleta-caixa');
    if (grupo) grupo.hidden = true;
    else cel.hidden = true;
  }
  const editor = barra ? ligarEditor(barra,corpo,{ aoEditar:editou }) : null;
  // Copiar/recortar dentro do modelo leva as fichas de campo junto: o trecho
  // vai também como árvore do modelo e volta como fichas ao colar aqui.
  const TIPO_MODELO = 'application/x-fl-modelo';
  const copiarTrecho = (e) => {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !corpo.contains(sel.getRangeAt(0).commonAncestorContainer)) return;
    const caixa = document.createElement('div');
    caixa.append(sel.getRangeAt(0).cloneContents());
    if (!caixa.querySelector('.modelo-campo-chip')) return;
    e.clipboardData.setData(TIPO_MODELO, JSON.stringify(lerCorpoEditavel(caixa)));
    e.clipboardData.setData('text/plain', caixa.textContent);
    e.preventDefault();
    if (e.type === 'cut' && podeEditar) { document.execCommand('delete'); editou(); }
  };
  const colarTrecho = (e) => {
    const bruto = e.clipboardData?.getData(TIPO_MODELO);
    if (!bruto || !podeEditar) return;
    let nos;
    try { nos = JSON.parse(bruto); validarModelo({ formato:1, corpo:nos, perguntas, assinaturas:[] }, { extras }); } catch { return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    document.execCommand('insertHTML', false, String(corpoParaEditor({ ...estado().definicao, corpo:nos }, extras)));
    editou();
  };
  corpo.addEventListener('copy',copiarTrecho);
  corpo.addEventListener('cut',copiarTrecho);
  corpo.addEventListener('paste',colarTrecho,true);
  const desligarColagem = podeEditar ? ligarColagem(corpo,editou) : () => {};
  atualizar();

  function confirmarMetadados(v) {
    if (!form.reportValidity() || !v.nome || !v.titulo) throw new Error('Informe o nome do modelo e o título na folha.');
  }
  function confirmarBlocosOficiais(definicao) {
    if (!catalogo?.chave_oficial) return;
    const antes = chavesDaDefinicao(formInicial);
    const depois = chavesDaDefinicao(definicao);
    const removidos = [...antes].filter((chave) => chave.startsWith('oficial.') && !depois.has(chave));
    if (removidos.length) throw new Error('Preserve os campos próprios deste modelo: ' + removidos.map((chave) => extras[chave]?.[0] || chave).join(', ') + '.');
  }
  async function salvar() {
    const v = estado();
    const fotografia = JSON.stringify(v);
    confirmarMetadados(v);
    validarModelo(v.definicao,{ extras });
    confirmarBlocosOficiais(v.definicao);
    const res = await acaoModelo(catalogo || rascunho ? 'salvar' : 'criar', {
      ...v,id,versao_id:rascunho?.id ?? null,revisao:rascunho?.revisao ?? null,base_id:catalogo?.versao_atual_id ?? null,
    });
    rascunho = { id: res.versao_id, revisao: res.revisao ?? rascunho?.revisao ?? 1 };
    // Uma resposta lenta não deve levar junto o que foi digitado durante o envio.
    if (JSON.stringify(estado()) !== fotografia) {
      editou();
      throw new Error('Outra alteração foi feita durante o envio. Salve novamente.');
    }
    sujo = false;
    return res;
  }
  const operacao = async (fn) => {
    if (ocupado) return;
    ocupado = true;
    const botoes = [...ctx.raiz.querySelectorAll('button[data-acao]')].filter((b) => !b.disabled);
    botoes.forEach((b) => { b.disabled = true; });
    try { await fn(); } catch (erro) { avisarErro(erro); }
    finally { ocupado = false; botoes.forEach((b) => { b.disabled = false; }); }
  };
  const mostrarPrevia = async (v) => {
    validarModelo(v.definicao,{ extras });
    const c = extrasDePrevia(catalogo?.chave_oficial,contextoFicticio(v.definicao));
    const previa = renderModelo({ ...v, titulo: v.titulo || 'Prévia do modelo' },c,extras);
    await abrirDialogo({
      titulo: 'Prévia com dados fictícios', somenteLeitura:true, largo:true,
      corpo: html`<p class="sub">Confira o conteúdo. A paginação em A4 aparece na impressão.</p>
        ${previa.faltas.length ? html`<p class="nota">Pendências no exemplo: ${previa.faltas.join(', ')}.</p>` : ''}
        <article class="modelo-previsualizacao doc-padrao-fl">${previa.folha}</article>`,
    });
  };

  const editarPergunta = async (i) => {
    const anterior = perguntas[i];
    if (!anterior && perguntas.length >= LIMITE_PERGUNTAS_MODELO) throw new Error('O modelo já tem o máximo de perguntas.');
    let p;
    const ok = await abrirDialogo({
      titulo: anterior ? 'Editar pergunta' : 'Adicionar pergunta', rotuloOk: 'Confirmar',
      corpo: html`<label class="campo"><span>Pergunta</span><input name="pergunta" value="${anterior?.rotulo ?? ''}" required maxlength="120"></label>
        <label class="campo"><span>Tipo</span><select name="tipo">${opcoes(Object.entries(TIPOS_PERGUNTA),anterior?.tipo ?? 'texto')}</select></label>
        <label class="campo" data-opcoes><span>Opções, uma por linha</span><textarea name="opcoes" rows="4" maxlength="2020">${anterior?.opcoes?.join('\n') ?? ''}</textarea></label>
        <label class="marcar"><input type="checkbox" name="obrigatorio" ${anterior?.obrigatorio === false ? '' : 'checked'}> Obrigatória ao gerar</label>`,
      aoAbrir: (_, f) => {
        const mostrar = () => { $('[data-opcoes]',f).hidden = f.tipo.value !== 'escolha'; };
        f.tipo.addEventListener('change',mostrar);
        mostrar();
      },
      aoEnviar: (d) => {
        const escolhas = d.opcoes.split('\n').map((v) => v.trim()).filter(Boolean);
        if (!d.pergunta.trim()) throw new Error('Informe a pergunta.');
        if (d.tipo === 'escolha' && (escolhas.length < 2 || escolhas.length > 20 ||
          new Set(escolhas).size !== escolhas.length || escolhas.some((s) => s.length > 100))) throw new Error('Informe de 2 a 20 opções distintas.');
        p = { chave: anterior?.chave ?? 'manual.p_' + crypto.randomUUID().replaceAll('-',''), rotulo:d.pergunta,tipo:d.tipo,
          obrigatorio:d.obrigatorio,...(d.tipo === 'escolha' ? { opcoes:escolhas } : {}) };
        return true;
      },
    });
    if (!ok || !ctx.ativa()) return;
    if (anterior) {
      perguntas[i] = p;
      for (const chip of corpo.querySelectorAll('[data-campo]')) if (chip.dataset.campo === p.chave) chip.textContent = p.rotulo;
    } else perguntas.push(p);
    atualizar();
    paleta.value = p.chave;
    editou();
  };

  const desligar = aoClicar(ctx.raiz,{
    'ir-texto': () => { corpo.scrollIntoView({block:'center'}); corpo.focus({preventScroll:true}); },
    'ir-campos': () => { paleta.scrollIntoView({block:'center'}); paleta.focus({preventScroll:true}); },
    inserir: () => {
      const chave = paleta.value;
      const rotulo = opcoesCampos().find(([k]) => k === chave)?.[1];
      if (!rotulo) return;
      const s = getSelection();
      corpo.focus({preventScroll:true});
      if (cursor && corpo.contains(cursor.startContainer) && corpo.contains(cursor.endContainer)) {
        s.removeAllRanges(); s.addRange(cursor);
      } else {
        const r = document.createRange();
        r.selectNodeContents(corpo); r.collapse(false);
        s.removeAllRanges(); s.addRange(r);
      }
      document.execCommand('insertHTML',false,String(html`${chipDoCampo(chave,rotulo)}\u200B`));
      // No fim de um parágrafo o navegador às vezes põe a ficha fora dele.
      for (const chip of [...corpo.children].filter((el) => el.matches('.modelo-campo-chip'))) {
        const anterior = chip.previousElementSibling;
        const bloco = anterior?.matches('p, h2, h3, li') ? anterior : document.createElement('p');
        if (bloco !== anterior) chip.before(bloco);
        const depois = chip.nextSibling?.nodeType === Node.TEXT_NODE ? chip.nextSibling : null;
        bloco.append(chip);
        if (depois) bloco.append(depois);
        const r = document.createRange();
        r.setStartAfter(depois ?? chip); r.collapse(true);
        s.removeAllRanges(); s.addRange(r);
      }
      usarSelecao();
    },
    pergunta: () => operacao(() => editarPergunta(-1)),
    'editar-pergunta': (el) => operacao(() => editarPergunta(Number(el.dataset.i))),
    'tirar-pergunta': (el) => {
      const i = Number(el.dataset.i);
      const usadas = chavesDaDefinicao(estado().definicao);
      if (usadas.has(perguntas[i].chave)) return avisar('Retire o campo do texto e das assinaturas antes de remover a pergunta.');
      if (catalogo?.chave_oficial && perguntasProtegidas(catalogo.chave_oficial, usadas).has(perguntas[i].chave)) {
        return avisar('Esta pergunta alimenta um campo próprio deste modelo e não pode ser removida.');
      }
      perguntas.splice(i,1); atualizar(); editou();
    },
    assinatura: () => operacao(async () => {
      if (assinaturas.length >= 10) throw new Error('O modelo já tem 10 assinaturas.');
      let assinatura;
      const ok = await abrirDialogo({
        titulo:'Adicionar assinatura',rotuloOk:'Adicionar',
        corpo: html`<label class="campo"><span>Papel</span><input name="papel" required maxlength="90" placeholder="Declarante"></label>
          <label class="campo"><span>Nome que acompanha a assinatura</span><select name="nome">${opcoes(opcoesCampos(),'cliente.nome',{ vazio:'Somente o papel' })}</select></label>`,
        aoEnviar: (d) => { assinatura = { papel:d.papel,...(d.nome ? {nome:d.nome} : {}) }; return true; },
      });
      if (ok && ctx.ativa()) { assinaturas.push(assinatura); atualizar(); editou(); }
    }),
    'tirar-assinatura': (el) => { assinaturas.splice(Number(el.dataset.i),1); atualizar(); editou(); },
    previa: () => operacao(() => mostrarPrevia(estado())),
    'ver-versao': (el) => operacao(async () => {
      const v = await carregarVersao(el.dataset.id);
      if (v && ctx.ativa()) await mostrarPrevia(v);
    }),
    salvar: () => operacao(async () => {
      const res = await salvar();
      if (!ctx.ativa()) return;
      avisar('Rascunho salvo.');
      if (!catalogo) navegar('/documentos/modelos/' + res.id);
      else await ctx.recarregar();
    }),
    publicar: () => operacao(async () => {
      const v = estado();
      confirmarMetadados(v);
      validarModelo(v.definicao,{ extras,publicar:true });
      confirmarBlocosOficiais(v.definicao);
      if (!await abrirDialogo({ titulo:'Publicar esta versão?', rotuloOk:'Publicar versão',
        corpo: html`<p>O texto ficará disponível em Documentos para o escritório.</p>` })) return;
      if (!ctx.ativa()) return;
      if (!rascunho || sujo) await salvar();
      await acaoModelo('publicar',{id,versao_id:rascunho.id,revisao:rascunho.revisao});
      if (!ctx.ativa()) return;
      avisar('Versão publicada.');
      if (catalogo) await ctx.recarregar();
      else navegar('/documentos/modelos/' + id);
    }),
    duplicar: () => operacao(async () => {
      const v = estado();
      if (sujo && !await abrirDialogo({titulo:'Duplicar com a edição atual?', rotuloOk:'Duplicar',
        corpo:html`<p>As mudanças vão para a cópia. Salve o original primeiro se também quiser mantê-las nele.</p>`})) return;
      if (!ctx.ativa()) return;
      confirmarMetadados(v);
      validarModelo(v.definicao);
      const novo = await acaoModelo('criar',{ ...v, nome:(v.nome.slice(0,110) + ' (cópia)'),id:crypto.randomUUID(),origem_id:inicial?.id ?? null });
      if (ctx.ativa()) { sujo = false; navegar('/documentos/modelos/' + novo.id); }
    }),
    arquivo: () => operacao(async () => {
      if (sujo) throw new Error('Salve ou descarte a edição atual antes de arquivar.');
      if (podeEditar) {
        const motivo = await pedirMotivo({titulo:'Arquivar modelo', texto:'Ele sairá da lista de modelos para novas emissões.', rotuloOk:'Arquivar'});
        if (!motivo || !ctx.ativa()) return;
        await acaoModelo('arquivar',{id,motivo});
      } else {
        await acaoModelo('reativar',{id});
      }
      if (ctx.ativa()) { sujo = false; await ctx.recarregar(); }
    }),
    restaurar: (el) => operacao(async () => {
      if (sujo) throw new Error('Salve ou descarte a edição atual antes de restaurar.');
      await acaoModelo('restaurar',{id,origem_id:el.dataset.id});
      if (ctx.ativa()) { avisar('Versão copiada para um rascunho.'); await ctx.recarregar(); }
    }),
  });
  const antesSair = (e) => {
    if (sujo) e.preventDefault();
  };
  const confirmarSaida = () => !sujo || window.confirm('Sair sem salvar as alterações deste modelo?');
  ctx.antesDeVoltar(confirmarSaida);
  window.addEventListener('beforeunload',antesSair);
  return () => {
    desligar();
    desligarColagem();
    editor?.desligar();
    document.removeEventListener('selectionchange',usarSelecao);
    window.removeEventListener('beforeunload',antesSair);
  };
}

