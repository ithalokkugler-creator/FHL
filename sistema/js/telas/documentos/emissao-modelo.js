// Geração por versão publicada. A folha final é gravada antes da saída.
import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { membrosAtivos, pode } from '../../nucleo/estado.js';
import { hoje, lerMoeda, noFuso, soDigitos } from '../../nucleo/formato.js';
import { $, aoClicar, cru, desenhar, html, lerFormulario } from '../../nucleo/html.js';
import { higienizar, ligarColagem } from '../../nucleo/higienizar.js';
import { navegar } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { COLUNAS_CLIENTE, COLUNAS_DETALHES, processoDoCliente } from '../../dominio/clientes.js';
import { ajustarFolha, baixarWord, confirmarPendencias, imprimirDocumento } from '../../documentos/acoes.js';
import { salvarEmissao } from '../../documentos/catalogo.js';
import { barraDeFormatacao, ligarEditor } from '../../documentos/editor.js';
import { campoDaParte, camposDeEmissao, chavesDaDefinicao, limparCoresDoModelo, perguntaDeCpf, renderModelo, temValorDeModelo } from '../../documentos/modelos-editaveis.js';
import { avisoOficial, blocosOficiais, papeisOficiais, perguntaOficialVisivel, validacaoOficial } from '../../documentos/modelos-oficiais.js';
import { MODELOS, validarComplementos } from '../../documentos/modelos.js';
import { AREAS_JURIDICAS, cabecalho, opcoes } from '../comum.js';
import { campoCliente, carregarProcessos, ligarCampoCliente } from '../clientes.js';
import { formularioCompleto } from '../clientes/formulario.js';

const filtro = (id) => [['id','eq',id]];
const lerClientes = () => db.todos('clientes',{select:COLUNAS_CLIENTE,ordem:'nome.asc,id.asc'});
const valorExtraido = (f,v) => Object.fromEntries(Object.keys(v).filter((k) => f(k)).map((k) => [k,v[k]]));
const CONTRATO_FIXO = ['modalidade','valor_total','entrada','parcelas','valor_parcela','dia_vencimento','exito'];
const AUDIENCIAS = ['intimacao_testemunha','pauta_audiencia'];
const camposInicial = (data_emissao = hoje()) => ({ data_emissao, modalidade:'fixo', garantia:'nenhuma', m_bancarios:'Omitir' });
const PREFIXO_COMPLEMENTO = 'emissao_';
const nomeComplemento = (chave) => PREFIXO_COMPLEMENTO + chave;
const CONTROLES_OFICIAIS = {
  'processo.autos':'m_autos',
  'advogado.nome':'advogado_id', 'advogado.oab':'advogado_id', 'advogado.oab_numero':'advogado_id',
  'advogado.equipe':'advogados_ids',
  'emissao.data':'data_emissao', 'emissao.data_curta':'data_emissao',
  'oficial.autos':'m_autos', 'oficial.objeto_docx':'objeto',
  'oficial.comparecimento':'m_comparecimento', 'oficial.juizo_docx':'m_juizo',
  'oficial.juizo_audiencia_docx':'m_orgao_audiencia', 'oficial.audiencia_tipo':'m_tipo_audiencia',
  'oficial.audiencia_data':'m_data_audiencia', 'oficial.audiencia_data_extenso':'m_data_audiencia',
  'oficial.audiencia_hora':'m_hora_audiencia', 'oficial.audiencia_local':'m_local_audiencia',
  'oficial.audiencia_modalidade':'m_modalidade_audiencia', 'oficial.modalidade_docx':'m_modalidade_audiencia',
  'oficial.ramo_docx':'m_ramo', 'oficial.juizado_docx':'m_juizado', 'oficial.teto':'m_juizado',
  'oficial.pagamento_docx':['valor_total','entrada','parcelas','valor_parcela','dia_vencimento','exito'],
  'oficial.endereco_docx':['m_residencia','m_endereco_declarado'],
};

async function fontesIniciais(ctx, modelo, dadosDoContrato, processos) {
  const q = ctx.consulta;
  let cliente = q.cliente || '';
  let processo = q.processo || '';
  const dados = {};
  const ids = {};
  const clienteDaFonte = (id) => {
    if (!id || (cliente && cliente !== id)) throw new Error('A origem não pertence ao cliente escolhido.');
    cliente = id;
  };
  if (q.contrato) {
    if (!pode.financeiro() || modelo.tipo !== 'contrato_honorarios') throw new Error('O contrato não está disponível para este modelo.');
    const contrato = await dadosDoContrato(q.contrato);
    if (contrato.dados.financeiro?.contrato?.cancelado_em) throw new Error('O contrato foi cancelado no Financeiro.');
    clienteDaFonte(contrato.clienteId);
    ids.contrato_id = q.contrato;
    Object.assign(dados,contrato.dados);
    if (!processo && dados.processo) processo = processos.find((p) => processoDoCliente(p, cliente) && p.numero && p.numero === soDigitos(dados.processo))?.id || '';
  }
  if (q.compromisso) {
    const comparecimento = modelo.tipo === 'declaracao_comparecimento';
    if (!pode.agenda() || (!comparecimento && !AUDIENCIAS.includes(modelo.chave_oficial))) throw new Error('O compromisso não está disponível para este modelo.');
    const c = await db.um('compromissos', {
      select:'id,cliente_id,membro_id,inicio,tipo,modalidade,local_ou_link,processo,titulo,situacao,chegada_em,cancelado_em',
      filtros:filtro(q.compromisso),
    });
    const valido = c && !c.cancelado_em && !['remarcado','faltou'].includes(c.situacao);
    if (!valido || (comparecimento ? c.tipo !== 'atendimento' || (!c.chegada_em && c.situacao !== 'realizado') : c.tipo !== 'audiencia')) {
      throw new Error(comparecimento ? 'Escolha um atendimento com presença registrada.' : 'Escolha uma audiência válida e visível na Agenda.');
    }
    clienteDaFonte(c.cliente_id);
    ids.compromisso_id = c.id;
    dados.advogado_id = c.membro_id;
    if (comparecimento) dados.data_comparecimento = noFuso(c.chegada_em || c.inicio).dia;
    else {
      dados.agenda = c;
      if (!processo && c.processo) processo = processos.find((p) => processoDoCliente(p,cliente) && p.numero && p.numero === soDigitos(c.processo))?.id || '';
      if (processo && processos.find((p) => p.id === processo)?.numero !== soDigitos(c.processo)) {
        throw new Error('A audiência não corresponde ao processo escolhido.');
      }
    }
  }
  if (q.atualizacao) {
    if (modelo.tipo !== 'ficha_atendimento') throw new Error('O relato não está disponível para este modelo.');
    const a = await db.um('atualizacoes',{select:'id,cliente_id,processo_id,relato,cancelado_em',filtros:filtro(q.atualizacao)});
    if (!a || a.cancelado_em) throw new Error('Atendimento não encontrado ou cancelado.');
    clienteDaFonte(a.cliente_id);
    ids.atualizacao_id = a.id;
    if (processo && a.processo_id && processo !== a.processo_id) throw new Error('O atendimento pertence a outro processo.');
    processo = a.processo_id || processo;
    dados.fatos = a.relato ?? '';
  }
  if (processo) {
    const p = processos.find((v) => v.id === processo);
    if (!p || (cliente && !processoDoCliente(p,cliente))) throw new Error('O processo não pertence ao cliente escolhido.');
    cliente ||= p.cliente_id;
    dados.area = p.area || dados.area;
  }
  return { cliente, processo, dados, ids };
}

export async function telaEmissaoModelo(ctx, modelo, versao, catalogo, dadosDoContrato) {
  let [clientes, processos] = await Promise.all([lerClientes(),carregarProcessos()]);
  const fonte = await fontesIniciais(ctx,modelo,dadosDoContrato,processos);
  if (!ctx.ativa()) return;
  const temFonte = Boolean(Object.keys(fonte.ids).length);
  const chave = modelo.chave_oficial;
  const extras = blocosOficiais(chave);
  const docx = versao.definicao.folha_origem;
  const usadas = chavesDaDefinicao(versao.definicao);
  const pergunta = Object.hasOwn(MODELOS,modelo.tipo) && modelo.tipo === 'contrato_honorarios'
    ? MODELOS.contrato_honorarios.complementos : [];
  const equipe = membrosAtivos().filter((m) => m.oab);
  const advogadoUnico = ['advogado.nome','advogado.oab','advogado.oab_numero'].some((k) => usadas.has(k));
  const advogadosEquipe = usadas.has('advogado.equipe');
  let clienteId = fonte.cliente;
  let processoId = fonte.processo;
  let campos = { ...camposInicial(), ...fonte.dados };
  let detalhes = new Map(), idsPartes = {};
  let sujo = false, desatualizado = false, ocupado = false, trocando = false;
  let complementosEditados = false;
  let faltas = [], pendenciasDeCampo = [], erroContexto = '', avisoValores = '', operacao = null;
  let complementos = {}, gruposComplementos = '';

  const detalhe = async (id) => {
    if (id && !detalhes.has(id)) {
      detalhes.set(id, await db.um('clientes_detalhes',{select:COLUNAS_DETALHES,filtros:[['cliente_id','eq',id]]}) ?? {});
    }
  };
  await detalhe(clienteId);
  if (!ctx.ativa()) return;

  const contexto = () => ({
    cliente: clientes.find((c) => c.id === clienteId) ?? {}, detalhes:detalhes.get(clienteId) ?? {},
    processo:processos.find((p) => p.id === processoId), advogados:equipe, hoje:hoje(),
    dados:campos, complementos,
    partes:Object.fromEntries(Object.entries(idsPartes).filter(([,id]) => id && clientes.some((c) => c.id === id))
      .map(([k,id]) => [k,{cliente:clientes.find((c) => c.id === id),detalhes:detalhes.get(id) ?? {}}])),
  });

  desenhar(ctx.raiz, html`${cabecalho('Gerar documento',
    versao.nome + ' · Versão ' + versao.numero, html`<a class="botao" href="#/documentos/modelos">Modelos</a>
    <a class="botao" href="#/documentos">Documentos gerados</a>`)}
    <div class="documento-editor">
      <aside class="documento-controles">
        <form data-fonte class="modelo-fonte"></form>
        <form data-campos class="modelo-dados secao">
          <div data-contexto></div>
          <div data-cadastro-emissao></div>
          <div data-complementos></div>
        </form>
        <div class="documento-pendencias" role="status" data-pendencias></div>
        <div class="registro-acoes secao">
          <button type="button" class="botao botao--primario" data-acao="salvar">Salvar documento</button>
          <button type="button" class="botao" data-acao="imprimir">Imprimir</button>
          <button type="button" class="botao" data-acao="word">Baixar para o Word</button>
          <button type="button" class="botao botao--discreto" data-acao="refazer">Refazer texto</button>
        </div>
      </aside>
      <div class="documento-area">
        ${barraDeFormatacao()}
        <div class="documento-visualizacao">
          <article class="documento-folha doc-padrao-fl" contenteditable="true" role="textbox" aria-label="Prévia editável do documento" aria-multiline="true"></article>
        </div>
      </div>
    </div>`);

  const raiz = ctx.raiz;
  const folha = $('.documento-folha',raiz);
  const form = $('[data-campos]',raiz);
  const painelCadastro = $('[data-cadastro-emissao]',form);
  const painelPendencias = $('[data-pendencias]',raiz);
  const formFonte = $('[data-fonte]',raiz);
  let ultimaPendencia = '';
  form.addEventListener('submit', (e) => e.preventDefault());
  formFonte.addEventListener('submit', (e) => e.preventDefault());
  const desligarFolha = ajustarFolha($('.documento-visualizacao',raiz));
  function editou() { limparCoresDoModelo(folha); sujo = true; pendencias(); }
  folha.addEventListener('input',editou);
  const barra = $('.editor-barra',raiz);
  for (const el of barra.querySelectorAll('[data-comando="cor"], [data-comando="realce"]')) {
    const g = el.closest('.editor-paleta-caixa') ?? el;
    g.hidden = true;
  }
  const editor = ligarEditor(barra,folha,{aoEditar:editou});
  const desligarColagem = ligarColagem(folha,editou);

  function entrada(p) {
    const id = p.chave.slice(7);
    const nome = 'm_' + id, v = campos[nome] ?? '';
    const cpf = perguntaDeCpf(p);
    if (p.tipo === 'escolha') return html`<label class="campo"><span>${p.rotulo}</span><select name="${nome}">
      ${opcoes(p.opcoes.map((s) => [s,s]),v,{vazio:'Escolha'})}</select></label>`;
    if (p.tipo === 'texto_longo') return html`<label class="campo"><span>${p.rotulo}</span><textarea rows="3" name="${nome}" maxlength="20000">${v}</textarea></label>`;
    return html`<label class="campo"><span>${p.rotulo}</span><input name="${nome}" value="${v}"
      type="${p.tipo === 'data' ? 'date' : id === 'hora_audiencia' ? 'time' : 'text'}"
      ${p.tipo === 'valor' ? 'inputmode="decimal"' : p.tipo === 'inteiro' || cpf ? 'inputmode="numeric"' : ''} maxlength="${cpf ? 14 : 500}">
      ${cpf ? html`<small class="sub">Informe um CPF válido.</small>` : ''}</label>`;
  }
  function entradaFinanceira(p) {
    const bloqueado = Boolean(fonte.ids.contrato_id) && CONTRATO_FIXO.includes(p.nome);
    const v = campos[p.nome] ?? p.padrao ?? '';
    if (['select','area'].includes(p.tipo)) {
      return html`<label class="campo"><span>${p.rotulo}</span><select name="${p.nome}" ${bloqueado ? 'disabled' : ''}>${opcoes(Object.entries(p.opcoes || AREAS_JURIDICAS),v,{vazio:p.tipo === 'area' ? 'Escolha' : null})}</select></label>`;
    }
    if (p.tipo === 'textarea') return html`<label class="campo"><span>${p.rotulo}</span><textarea name="${p.nome}" rows="3" maxlength="20000">${v}</textarea></label>`;
    return html`<label class="campo"><span>${p.rotulo}</span><input name="${p.nome}" value="${v}" type="${p.tipo}"
      ${bloqueado ? 'readonly' : ''} ${p.min != null ? html`min="${p.min}"` : ''} ${p.max != null ? html`max="${p.max}"` : ''}
      ${p.nome === 'exito' ? html`step="0.01"` : ''} maxlength="500"></label>`;
  }
  function controlesCadastroEmissao(camposPendentes) {
    const assinatura = camposPendentes.map((p) => p.chave).join('|');
    if (gruposComplementos === assinatura) return;
    gruposComplementos = assinatura;
    desenhar(painelCadastro, assinatura ? html`
      <fieldset class="campo cadastro-grupo">
        <legend>Dados para esta emissão</legend>
        <p class="sub">Os valores digitados aqui valem somente para este documento.</p>
        ${camposPendentes.map(({ chave, rotulo, valor, tipo, opcoes: escolhas, dica }) => {
          const nome = nomeComplemento(chave);
          return html`<label class="campo"><span>${rotulo}</span>
            ${tipo === 'escolha' ? html`<select name="${nome}">${opcoes(escolhas.map((o) => [o,o]),valor,{vazio:'Escolha'})}</select>`
              : tipo === 'texto_longo' ? html`<textarea name="${nome}" rows="2" maxlength="500">${valor}</textarea>`
              : html`<input name="${nome}" type="${tipo === 'data' ? 'date' : 'text'}" value="${valor}" maxlength="500">`}
            ${dica ? html`<small class="sub">${dica}</small>` : ''}
          </label>`;
        })}
      </fieldset>` : '');
  }
  function controlesComplementos() {
    const c = contexto();
    const ativos = camposDeEmissao(versao.definicao,campos);
    desenhar($('[data-complementos]',form), html`
      ${versao.definicao.perguntas.filter((p) => perguntaOficialVisivel(chave,p,c,docx) &&
        (!docx || !temValorDeModelo(campoDaParte(p.chave,c)) &&
          (ativos.has(p.chave) || !usadas.has(p.chave) && !/^manual\.(?:redacao_\d+|ementa)$/.test(p.chave)))).map(entrada)}`);
  }

  function controlesContexto() {
    const casos = processos.filter((p) => processoDoCliente(p,clienteId));
    const papeisDoModelo = docx && chave === 'termo_rescisao_trabalho'
      ? [['empregador','Empregador'],['empregado','Empregado']].filter(([,r]) => campos.m_papel_cliente && campos.m_papel_cliente !== r)
      : papeisOficiais(chave);
    const papeis = papeisDoModelo.filter(([papel]) => {
      if (papel === 'conjuge_reu') return campos.m_incluir_conjuge_reu === 'Sim';
      if (docx && chave === 'declaracao_endereco') return papel === 'declarante';
      if (docx && papel === 'fiador') return false;
      if (papel === 'fiador') return campos.garantia === 'fianca';
      if (chave === 'declaracao_endereco') {
        return papel === 'declarante' ? campos.m_papel_cliente === 'Pessoa declarada' : campos.m_papel_cliente === 'Declarante';
      }
      return true;
    });
    desenhar($('[data-contexto]',form),html`
      ${temFonte ? html`<p class="nota">Dados vinculados à origem deste documento. Para trocar a origem, abra uma nova emissão no catálogo.</p>` : ''}
      ${temFonte ? html`<p><strong>Cliente:</strong> ${contexto().cliente.nome}</p>` : campoCliente(clientes,{atual:clienteId})}
      <label class="campo"><span>Processo ou caso</span><select name="processo_id" ${temFonte ? 'disabled' : ''}>
        ${opcoes(casos.map((p) => [p.id,p.titulo]),processoId,{vazio:'Sem processo'})}</select></label>
      ${papeis.map(([k,rotulo]) => html`<label class="campo"><span>${rotulo} cadastrado(a)</span>
        <select name="parte_${k}">${opcoes(clientes.filter((c) => c.id !== clienteId).map((c) => [c.id,c.nome]),idsPartes[k] ?? '',
        {vazio:'Preencher nesta emissão'})}</select></label>`)}
      <label class="campo"><span>Data de emissão</span><input type="date" name="data_emissao" value="${campos.data_emissao}" required></label>
      ${advogadoUnico ? html`<label class="campo"><span>Advogado(a)</span><select name="advogado_id">${opcoes(equipe.map((a) => [a.id,a.nome_curto + ' · ' + a.oab]),campos.advogado_id ?? '',{vazio:'Escolha'})}</select></label>` : ''}
      ${advogadosEquipe ? html`<fieldset class="campo cadastro-grupo"><legend>Advogados</legend>
        ${equipe.map((a) => html`<label class="marcar"><input type="checkbox" name="advogados_ids" value="${a.id}"
          ${campos.advogados_ids?.includes(a.id) ? 'checked' : ''}> ${a.nome_curto} · ${a.oab}</label>`)}</fieldset>` : ''}
      ${pergunta.filter((p) => {
        if (p.nome === 'exito') return campos.modalidade !== 'fixo';
        if (CONTRATO_FIXO.includes(p.nome) && p.nome !== 'modalidade') {
          if (campos.modalidade === 'exito') return false;
          const vista = lerMoeda(campos.valor_total) > 0 && lerMoeda(campos.entrada) === lerMoeda(campos.valor_total);
          if (vista && ['parcelas','valor_parcela','dia_vencimento'].includes(p.nome)) return false;
        }
        return true;
      }).map(entradaFinanceira)}`);
    if (!temFonte) ligarCampoCliente(form,clientes);
    controlesComplementos();
  }

  desenhar(formFonte,html`<label class="campo"><span>Modelo</span><select name="modelo_catalogo">
    ${opcoes([...catalogo.filter((m) => m.atual && !m.arquivado_em)
      .sort((a,b) => a.atual.nome.localeCompare(b.atual.nome,'pt-BR'))
      .map((m) => [m.id,m.atual.nome]), ['prestacao_contas','Termo de Prestação de Contas']],modelo.id)}</select></label>`);
  formFonte.addEventListener('change', async () => {
    const id = formFonte.modelo_catalogo.value;
    formFonte.modelo_catalogo.value = modelo.id;
    if (id === modelo.id || trocando || ocupado) return;
    trocando = true;
    try {
      if (sujo && !await confirmarTroca()) return;
      const destino = id === 'prestacao_contas' ? {modelo:id,contrato:fonte.ids.contrato_id} :
        {modelo_catalogo:id,...(catalogo.find((m) => m.id === id)?.tipo === 'contrato_honorarios' ? {contrato:fonte.ids.contrato_id} : {})};
      if (ctx.ativa()) navegar('/documentos/novo',{...destino,cliente:clienteId,processo:processoId});
    } finally { trocando = false; }
  });

  function pendencias() {
    for (const el of painelCadastro.querySelectorAll('[name]')) {
      const falta = pendenciasDeCampo.some((p) => nomeComplemento(p.chave) === el.name);
      if (falta && el.value.trim()) el.setAttribute('aria-invalid','true');
      else el.removeAttribute('aria-invalid');
    }
    const tipoPessoa = contexto().detalhes.tipo_pessoa;
    const incompatibilidade = pendenciasDeCampo.some(({ chave }) =>
      chave === 'cliente.cpf' && tipoPessoa === 'juridica' || chave === 'cliente.cnpj' && tipoPessoa === 'fisica');
    const conteudo = html`
      ${erroContexto ? html`<p class="nota">${erroContexto}</p>` : ''}
      ${avisoValores ? html`<p class="nota">${avisoValores}</p>` : ''}
      ${faltas.length ? html`<p><strong>Falta conferir:</strong> ${pendenciasDeCampo.map((p,i) => html`${i ? ', ' : ''}${campoPendente(p.chave)
        ? html`<button type="button" class="botao-link" data-acao="ir-campo" data-campo="${p.chave}">${p.rotulo}</button>`
        : p.rotulo}`)}.</p>` : ''}
      ${incompatibilidade ? html`<p class="nota">O tipo de pessoa deste cadastro não corresponde ao CPF ou CNPJ pedido pelo modelo. Confira o cliente selecionado ou ajuste a qualificação direto na folha: sem nenhum [marcador] restante, o documento pode ser salvo.</p>` : ''}
      ${clienteId && pendenciasDeCampo.some(({ chave }) => /^(cliente|representante)\./.test(chave)) ?
        html`<button type="button" class="botao-link" data-acao="completar">Completar cadastro</button>` : ''}
      ${desatualizado ? html`<p>A folha tem edições manuais. Revise os novos dados antes de salvar.
        <button type="button" class="botao-link" data-acao="refazer">Atualizar texto</button>
        <button type="button" class="botao-link" data-acao="manter">Manter edição</button></p>` : ''}`;
    if (ultimaPendencia !== String(conteudo)) {
      ultimaPendencia = String(conteudo);
      desenhar(painelPendencias,conteudo);
    }
  }
  function campoPendente(chave) {
    const nomes = [chave.startsWith('manual.') ? 'm_' + chave.slice(7) : CONTROLES_OFICIAIS[chave]].flat();
    const livres = [...form.elements].filter((el) => !el.disabled && !el.readOnly);
    return livres.find((el) => el.name === nomeComplemento(chave))
      ?? nomes.map((n) => livres.find((el) => el.name === n)).find((el) => el && !el.value.trim())
      ?? nomes.map((n) => livres.find((el) => el.name === n)).find(Boolean);
  }
  const atualizarPendencias = () => {
    const c = contexto();
    const resultado = renderModelo(versao,c,extras);
    faltas = resultado.faltas;
    pendenciasDeCampo = resultado.pendencias;
    controlesCadastroEmissao(resultado.complementos);
    erroContexto = validacaoOficial(chave,c);
    avisoValores = avisoOficial(chave,c);
    return resultado;
  };
  function montar() {
    const r = atualizarPendencias();
    desenhar(folha,cru(higienizar(String(r.folha))));
    sujo = false;
    desatualizado = false;
    editor.reiniciar();
    pendencias();
  }
  function vForm() {
    const v = lerFormulario(form);
    for (const [k,valor] of Object.entries(v)) {
      if (k.startsWith(PREFIXO_COMPLEMENTO)) complementos[k.slice(PREFIXO_COMPLEMENTO.length)] = valor;
    }
    return {
      ...valorExtraido((k) => !['cliente_texto','cliente_id','processo_id','advogados_ids'].includes(k) && !k.startsWith('parte_') && !k.startsWith(PREFIXO_COMPLEMENTO),v),
      ...(advogadosEquipe ? {advogados_ids:[...form.querySelectorAll('[name=advogados_ids]:checked')].map((el) => el.value)} : {}),
    };
  }
  const confirmarTroca = () => abrirDialogo({titulo:'Trocar os dados do documento?',rotuloOk:'Trocar dados',
    corpo:html`<p>O texto será gerado novamente. A troca de cliente também limpa os complementos desta emissão.</p>`});
  function limparDadosParte(papel) {
    const outros = papeisOficiais(chave).map(([id]) => id).filter((id) => id.startsWith(papel + '_'));
    delete campos['m_' + papel];
    for (const k of Object.keys(campos)) {
      if (k.startsWith('m_' + papel + '_') && !outros.some((id) => k === 'm_' + id || k.startsWith('m_' + id + '_'))) delete campos[k];
    }
  }

  async function mudaContexto(e) {
    if (trocando || ocupado) return;
    const nome = e.target.name;
    if (!nome) return;
    const formDados = lerFormulario(form);
    const novoCliente = temFonte ? clienteId : formDados.cliente_id || '';
    const novoProcesso = temFonte ? processoId : formDados.processo_id || '';
    const papel = nome.startsWith('parte_') ? nome.slice(6) : '';
    const novaParte = papel ? formDados[nome] : '';
    if (['cliente_id','cliente_texto','processo_id'].includes(nome) && novoCliente === clienteId && novoProcesso === processoId) return;
    if (papel || novoCliente !== clienteId || novoProcesso !== processoId) {
      trocando = true;
      try {
        if ((sujo || (novoCliente !== clienteId && complementosEditados)) && !await confirmarTroca()) {
          if (ctx.ativa()) controlesContexto();
          return;
        }
        await detalhe(novaParte || novoCliente);
        if (!ctx.ativa()) return;
        if (novoCliente !== clienteId) {
          clienteId = novoCliente;
          processoId = '';
          idsPartes = {};
          campos = camposInicial(campos.data_emissao);
          complementos = {};
          gruposComplementos = null;
          complementosEditados = false;
        } else {
          Object.assign(campos,vForm());
          if (novoProcesso !== processoId) {
            for (const k of Object.keys(complementos)) if (k.startsWith('processo.')) delete complementos[k];
            for (const k of ['m_juizo','m_orgao_audiencia','m_autos']) delete campos[k];
            gruposComplementos = null;
            campos.area = processos.find((p) => p.id === novoProcesso)?.area ?? '';
          }
          processoId = novoProcesso;
          if (papel && (idsPartes[papel] || '') !== (novaParte || '')) {
            limparDadosParte(papel);
            idsPartes[papel] = novaParte;
          }
        }
        controlesContexto();
        montar();
      } catch (erro) { avisarErro(erro); if (ctx.ativa()) controlesContexto(); }
      finally { trocando = false; }
      return;
    }
    Object.assign(campos,vForm());
    if (nome === 'advogado_id') {
      delete complementos['advogado.oab_numero'];
      gruposComplementos = null;
    }
    complementosEditados = true;
    if (['m_papel_cliente','garantia','area','m_residencia','m_inciso','m_assinatura_rescisao','modalidade','valor_total','entrada','m_forma_renuncia','m_parte_peticao','m_modalidade_audiencia','m_incluir_conjuge_reu'].includes(nome) ||
        /^m_(?:nota|incluir_testemunha)_/.test(nome)) {
      if (nome === 'm_incluir_conjuge_reu' && campos[nome] !== 'Sim') {
        delete idsPartes.conjuge_reu;
        limparDadosParte('conjuge_reu');
      }
      if (nome === 'm_papel_cliente') {
        if (docx && chave === 'termo_rescisao_trabalho') {
          limparDadosParte('empregador');
          limparDadosParte('empregado');
        }
        for (const k of ['declarante','declarante_nome','pessoa_declarada','documento_declarado','endereco_declarado']) delete campos['m_' + k];
        idsPartes = {};
      }
      await new Promise((r) => setTimeout(r));
      if (!ctx.ativa()) return;
      const foco = document.activeElement;
      const nomeFoco = form.contains(foco) ? foco.name : '';
      controlesContexto();
      const novo = nomeFoco && form.querySelector(`[name="${CSS.escape(nomeFoco)}"]`);
      if (novo) {
        novo.focus({ preventScroll:true });
        try { novo.setSelectionRange(novo.value.length, novo.value.length); } catch { /* select, date, number */ }
      }
    }
    if (sujo) { desatualizado = true; atualizarPendencias(); pendencias(); }
    else montar();
  }

  controlesContexto();
  montar();
  form.addEventListener('change',mudaContexto);
  form.addEventListener('input',(e) => {
    if (e.target.matches('select,[type=checkbox],[type=hidden],[name=cliente_texto]')) return;
    if (!e.target.name || trocando || ocupado) return;
    Object.assign(campos,vForm());
    complementosEditados = true;
    if (sujo) { desatualizado = true; atualizarPendencias(); pendencias(); }
    else montar();
  });

  async function executar(acao) {
    if (ocupado || trocando) return;
    const word = acao === 'word';
    const formularioValido = word ? form.checkValidity() : form.reportValidity();
    if (!word && !formularioValido) return;
    const v = lerFormulario(form);
    const vinculoPendente = !temFonte && (v.cliente_id !== clienteId || (v.processo_id || '') !== processoId);
    if (vinculoPendente) return avisar('Confirme o cliente e o processo antes de continuar.');
    if (desatualizado) return avisar('Revise os dados e atualize a folha.');
    atualizarPendencias();
    const marcadorNaFolha = [...folha.querySelectorAll('.doc-falta')].some((el) => /^\[.*\]$/.test(el.textContent.trim()));
    const reescritaAMao = sujo && !desatualizado && !marcadorNaFolha;
    const dadosPendentes = !clienteId || erroContexto || marcadorNaFolha || (faltas.length && !reescritaAMao);
    if (dadosPendentes) {
      pendencias();
      if (!word) return avisar(erroContexto || (!clienteId ? 'Escolha um cliente.' : 'Complete os campos indicados antes de emitir.'));
    }
    let erroFinanceiro;
    try {
      if (modelo.tipo === 'contrato_honorarios') validarComplementos(modelo.tipo,campos);
      if (modelo.tipo === 'contrato_honorarios' && !temFonte) {
        const temFixo = campos.modalidade !== 'exito';
        const total = lerMoeda(campos.valor_total);
        const entrada = lerMoeda(campos.entrada) ?? 0;
        if (temFixo && (!(total > 0) || (entrada !== total &&
          (!(Number(campos.parcelas) > 0) || !(lerMoeda(campos.valor_parcela) > 0) || !(Number(campos.dia_vencimento) >= 1))))) {
          throw new Error('Informe o valor fixo e a entrada integral ou os dados de parcelamento.');
        }
        if (campos.modalidade !== 'fixo' && !(Number(campos.exito) > 0)) throw new Error('Informe o percentual de êxito.');
      }
    } catch (erro) {
      if (!word) return avisarErro(erro);
      erroFinanceiro = erro;
    }
    if (!folha.textContent.trim()) return avisar('O texto do documento está vazio.');
    const rascunhoWord = word && (dadosPendentes || erroFinanceiro || !formularioValido);
    // Preserva a chave apenas quando a tentativa tem exatamente o mesmo conteúdo e ação.
    const p = { modelo_catalogo_id:modelo.id,modelo_versao_id:versao.id,cliente_id:clienteId,processo_id:processoId || null,
      ...fonte.ids,conteudo:higienizar(folha.innerHTML),acao };
    if (!rascunhoWord) {
      const assinatura = JSON.stringify(p);
      if (operacao?.assinatura !== assinatura) operacao = { assinatura,id:crypto.randomUUID() };
    }
    ocupado = true;
    const botoes = [...raiz.querySelectorAll('button[data-acao]')].filter((b) => !b.disabled);
    botoes.forEach((b) => { b.disabled = true; });
    let salvo;
    try {
      const saida = document.createElement('article');
      saida.className = folha.className;
      saida.innerHTML = p.conteudo;
      if (rascunhoWord) {
        if (await confirmarPendencias(saida,'word',{forcar:true}) && ctx.ativa()) await baixarWord(saida,versao.nome);
        return;
      }
      salvo = await salvarEmissao({...p,id:operacao.id});
      if (!ctx.ativa()) return;
      try {
        if (acao !== 'salvar') {
          // A interface pode ter mudado durante o envio. A saída usa o texto gravado.
          if (acao === 'imprimir') imprimirDocumento(saida);
          else await baixarWord(saida,versao.nome);
        }
        avisar('Documento registrado.');
      } catch (erro) {
        avisarErro(new Error('O documento foi salvo. Abra-o para tentar a saída novamente.'));
      }
      if (ctx.ativa()) navegar('/documentos/' + salvo.id);
    } catch (erro) { avisarErro(erro); }
    finally { ocupado = false; botoes.forEach((b) => { b.disabled = false; }); }
  }

  // Sair com dados digitados ou a folha editada pede confirmação; depois de
  // salvar, a navegação é da própria tela e não pergunta.
  const alterado = () => !ocupado && (sujo || complementosEditados);
  ctx.antesDeVoltar(() => !alterado() || window.confirm('Sair sem salvar este documento? Os dados preenchidos e as edições da folha serão perdidos.'));
  const antesSair = (e) => { if (alterado()) e.preventDefault(); };
  window.addEventListener('beforeunload',antesSair);

  const desligar = aoClicar(raiz,{
    salvar: () => executar('salvar'),
    imprimir: () => executar('imprimir'),
    word: () => executar('word'),
    'ir-campo': (el) => campoPendente(el.dataset.campo)?.focus(),
    refazer: async () => {
      if (trocando || ocupado) return;
      if (!sujo || await confirmarTroca()) if (ctx.ativa()) montar();
    },
    manter: async () => {
      if (ocupado || trocando) return;
      if (!await abrirDialogo({titulo:'Manter o texto editado?',rotuloOk:'Manter edição',
        corpo:html`<p>Os campos alterados não serão reaplicados à folha. Confira os dados e as condições no texto antes de emitir.</p>`})) return;
      if (ctx.ativa()) { desatualizado = false; pendencias(); }
    },
    completar: async () => {
      if (trocando || ocupado) return;
      trocando = true;
      try {
        if (sujo && !await confirmarTroca()) return;
        if (await formularioCompleto(clienteId) && ctx.ativa()) {
          [clientes,processos] = await Promise.all([lerClientes(),carregarProcessos()]);
          detalhes.delete(clienteId);
          await detalhe(clienteId);
          if (ctx.ativa()) { controlesContexto(); montar(); }
        }
      } catch (erro) { avisarErro(erro); }
      finally { trocando = false; }
    },
  });
  return () => { desligar(); editor.desligar(); desligarColagem(); desligarFolha(); window.removeEventListener('beforeunload',antesSair); };
}

