// Gerar documento (F3): modelo + dados do cadastro + complementos → folha A4
// editável. O que sai daqui (imprimir, Word ou só salvar) fica gravado.
//
// Pode chegar com contexto no endereço: ?cliente, ?processo, ?modelo e as
// fontes ?contrato (Financeiro), ?compromisso (Agenda) e ?atualizacao (o
// relato de um atendimento, para a ficha). Cada fonte só é lida com o acesso
// ao módulo dela.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { membrosAtivos, pode } from '../../nucleo/estado.js';
import { centavos, decimal, hoje, noFuso, numeroCnj } from '../../nucleo/formato.js';
import { $, aoClicar, cru, desenhar, html, lerFormulario } from '../../nucleo/html.js';
import { higienizar, ligarColagem } from '../../nucleo/higienizar.js';
import { navegar } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { COLUNAS_CLIENTE, COLUNAS_DETALHES, COLUNAS_PROCESSO } from '../../dominio/clientes.js';
import { COLUNAS_ATUALIZACAO } from '../../dominio/tempo.js';
import { ajustarFolha, baixarWord, confirmarPendencias, imprimirDocumento, salvarDocumento } from '../../documentos/acoes.js';
import { ErroCampo, mostrarErroFormulario, validarFormulario } from '../../nucleo/formularios.js';
import { MODELOS } from '../../documentos/modelos.js';
import { AREAS_JURIDICAS, cabecalho, opcoes } from '../comum.js';
import { campoCliente, ligarCampoCliente } from '../clientes.js';
import { formularioCompleto } from '../clientes/formulario.js';

// Modelos que nomeiam os advogados — a tela deixa escolher quais.
const COM_ADVOGADOS = ['procuracao', 'contrato_honorarios', 'renuncia', 'prestacao_contas'];

const carregarCadastro = () => Promise.all([
  db.todos('clientes', { select: COLUNAS_CLIENTE, ordem: 'nome.asc,id.asc' }),
  db.todos('clientes_detalhes', { select: COLUNAS_DETALHES }),
]);

/** Valores do contrato do Financeiro para o contrato de honorários e a prestação de contas. */
async function dadosDoContrato(id) {
  const [c, parcelasTodas, recebimentos] = await Promise.all([
    db.um('v_contratos', { select: '*', filtros: [['id', 'eq', id]] }),
    db.todos('v_parcelas', { select: '*', filtros: [['contrato_id', 'eq', id]], ordem: 'numero.asc,id.asc' }),
    db.todos('v_recebimentos', { select: '*', filtros: [['contrato_id', 'eq', id]], ordem: 'data.asc,id.asc' }),
  ]);
  if (!c) throw new Error('Contrato não encontrado ou sem acesso.');

  const parcelas = parcelasTodas.filter((p) => !['cancelada', 'renegociada'].includes(p.situacao));
  const normais = parcelas.filter((p) => p.numero !== 0);
  const entrada = parcelas.find((p) => p.numero === 0);
  const pago = recebimentos.filter((r) => !r.estornado_em).reduce((soma, r) => soma + centavos(r.valor), 0);

  return {
    clienteId: c.cliente_id,
    dados: {
      processo: c.processo ?? '',
      valor_total: c.valor_total == null ? '' : decimal(centavos(c.valor_total)),
      entrada: entrada ? decimal(centavos(entrada.valor)) : '',
      parcelas: String(normais.length || ''),
      valor_parcela: normais[0] ? decimal(centavos(normais[0].valor)) : '',
      dia_vencimento: normais[0]?.vencimento.slice(8) || '',
      exito: c.exito_pct ?? 30,
      data_contrato: hoje(new Date(c.criado_em)),
      total_pago: decimal(pago),
      financeiro: { parcelas, recebimentos },
    },
  };
}

export default async function telaNovoDocumento(ctx) {
  let [[clientes, detalhes], processos] = await Promise.all([
    carregarCadastro(),
    db.todos('processos', { select: COLUNAS_PROCESSO }),
  ]);
  if (!ctx.ativa()) return;

  const advogados = membrosAtivos().filter((m) => m.oab);
  let modelo = MODELOS[ctx.consulta.modelo] ? ctx.consulta.modelo : 'procuracao';
  let clienteId = ctx.consulta.cliente ?? '';
  let processoId = processos.find((p) => p.id === ctx.consulta.processo)?.id ?? '';
  let dados = { data_emissao: hoje(), advogados_ids: advogados.map((m) => m.id) };
  let fontes = {};
  let sujo = false; // a folha foi editada à mão
  let alterando = false;
  let ocupado = false;

  // Fonte e cliente precisam concordar: um contrato de outro cliente não entra.
  const vincular = (id) => {
    if (clienteId && clienteId !== id) throw new Error('O registro de origem não pertence ao cliente escolhido.');
    clienteId = id;
  };

  if (ctx.consulta.contrato && pode.financeiro()) {
    const contrato = await dadosDoContrato(ctx.consulta.contrato);
    vincular(contrato.clienteId);
    fontes.contrato_id = ctx.consulta.contrato;
    dados = { ...dados, ...contrato.dados };
  }
  if (ctx.consulta.compromisso && pode.agenda()) {
    const c = await db.um('compromissos', { select: 'id,cliente_id,membro_id,inicio', filtros: [['id', 'eq', ctx.consulta.compromisso]] });
    if (!c) throw new Error('Compromisso não encontrado ou sem acesso.');
    vincular(c.cliente_id);
    fontes.compromisso_id = c.id;
    dados.data_comparecimento = noFuso(c.inicio).dia;
    dados.advogado_id = c.membro_id;
  }
  if (ctx.consulta.atualizacao) {
    const a = await db.um('atualizacoes', { select: COLUNAS_ATUALIZACAO, filtros: [['id', 'eq', ctx.consulta.atualizacao]] });
    if (!a) throw new Error('Atualização não encontrada.');
    vincular(a.cliente_id);
    fontes.atualizacao_id = a.id;
    processoId = a.processo_id || processoId;
    dados.fatos = a.relato ?? '';
    dados.data_emissao = noFuso(a.fim || a.inicio).dia;
  }
  // O número do contrato pode apontar para um processo cadastrado do cliente.
  if (!processoId && dados.processo) {
    processoId = processos.find((p) => p.cliente_id === clienteId && numeroCnj(p.numero) === dados.processo)?.id ?? '';
  }
  if (processoId) {
    const processo = processos.find((p) => p.id === processoId);
    if (clienteId && processo.cliente_id !== clienteId) throw new Error('O processo não pertence ao cliente escolhido.');
    clienteId = processo.cliente_id;
    dados.processo = dados.processo || numeroCnj(processo.numero) || processo.referencia || '';
    dados.area = processo.area;
  }
  if (!ctx.ativa()) return;

  desenhar(ctx.raiz, html`
    ${cabecalho('Gerar documento', 'Dados do cadastro, complementos e texto editável', html`
      <a class="botao" href="#/documentos">Documentos gerados</a>`)}
    <div class="documento-editor">
      <aside class="documento-controles">
        <form data-controles></form>
        <div class="documento-pendencias" role="status" data-pendencias></div>
        <div class="registro-acoes secao">
          <button type="button" class="botao botao--primario" data-acao="imprimir">Imprimir</button>
          <button type="button" class="botao" data-acao="word">Baixar para o Word</button>
          <button type="button" class="botao" data-acao="salvar">Salvar sem imprimir</button>
          <button type="button" class="botao botao--discreto" data-acao="refazer">Refazer texto</button>
        </div>
        <p class="sub secao">Os modelos seguem a preparação e aguardam revisão do escritório (§7.8). Confira o texto antes de entregar.</p>
      </aside>
      <div class="documento-visualizacao">
        <article class="documento-folha" contenteditable="true" role="textbox" aria-label="Prévia editável do documento" aria-multiline="true" spellcheck="true"></article>
      </div>
    </div>`);

  const form = $('[data-controles]', ctx.raiz);
  const folha = $('.documento-folha', ctx.raiz);
  const desligarFolha = ajustarFolha($('.documento-visualizacao', ctx.raiz));

  const campo = (c) => {
    const valor = dados[c.nome] ?? c.padrao ?? '';
    if (['select', 'area', 'advogado'].includes(c.tipo)) {
      const lista = c.tipo === 'area' ? Object.entries(AREAS_JURIDICAS)
        : c.tipo === 'advogado' ? advogados.map((m) => [m.id, `${m.nome_curto} · ${m.oab}`])
          : Object.entries(c.opcoes);
      const vazio = c.tipo === 'advogado' ? 'Escolha o advogado' : c.tipo === 'area' ? 'Escolha a área' : null;
      return html`<label class="campo"><span>${c.rotulo}</span><select name="${c.nome}">${opcoes(lista, valor, { vazio })}</select></label>`;
    }
    if (c.tipo === 'textarea') {
      return html`<label class="campo"><span>${c.rotulo}</span><textarea name="${c.nome}" rows="3" maxlength="20000">${valor}</textarea></label>`;
    }
    return html`<label class="campo"><span>${c.rotulo}</span><input name="${c.nome}" type="${c.tipo}" value="${valor}"
      ${c.min != null ? html`min="${c.min}"` : ''} ${c.max != null ? html`max="${c.max}"` : ''} ${c.tipo === 'text' ? html`maxlength="500"` : ''}></label>`;
  };

  const desenharControles = () => {
    const casos = processos.filter((p) => p.cliente_id === clienteId);
    desenhar(form, html`
      <div class="campos">
        ${campoCliente(clientes, { atual: clienteId })}
        <label class="campo"><span>Processo / caso (opcional)</span>
          <select name="processo_id">${opcoes(casos.map((p) => [p.id, p.titulo]), processoId, { vazio: 'Sem processo' })}</select></label>
        <fieldset class="campo documento-modelos">
          <legend>Modelo</legend>
          ${Object.values(MODELOS).map((m) => html`
            <button type="button" class="documento-modelo" data-modelo="${m.id}" aria-pressed="${m.id === modelo}">
              <strong>${m.nome}</strong><span>${m.descricao}</span>
            </button>`)}
        </fieldset>
        ${campo({ nome: 'data_emissao', rotulo: 'Data do documento', tipo: 'date' })}
        ${MODELOS[modelo].complementos.map(campo)}
        ${COM_ADVOGADOS.includes(modelo) ? html`
          <fieldset class="campo cadastro-grupo">
            <legend>Advogados ${modelo === 'renuncia' ? 'renunciantes' : 'outorgados / contratados'}</legend>
            ${advogados.length
              ? advogados.map((m) => html`<label class="marcar"><input type="checkbox" name="advogados_ids" value="${m.id}" ${dados.advogados_ids.includes(m.id) ? 'checked' : ''}>${m.nome_curto} · ${m.oab}</label>`)
              : html`<p class="sub">Nenhum membro ativo com OAB. O texto mostrará o campo pendente.</p>`}
          </fieldset>` : ''}
      </div>
      ${modelo === 'renuncia' ? html`<p class="nota secao">ATENÇÃO: ANTES DE ENVIAR O DOCUMENTO, PEDIR DOCUMENTO DE IDENTIDADE COM FOTO, CONFORME IN 73/2021 CGJ/TJPR.</p>` : ''}
      ${modelo === 'contrato_honorarios' ? html`<p class="sub secao">A entrada é guardada nos complementos. O texto original da cláusula 3.1 não a discrimina; revisão pendente.</p>` : ''}`);
    ligarCampoCliente(form, clientes);
  };

  const pendencias = () => {
    const n = folha.querySelectorAll('.doc-falta').length;
    const texto = n ? `${n === 1 ? 'Falta 1 dado destacado' : `Faltam ${n} dados destacados`} entre colchetes` : 'Nenhum campo destacado pendente';
    desenhar($('[data-pendencias]', ctx.raiz), html`
      <p>${texto}${clienteId ? html` <button class="botao-link" type="button" data-acao="completar">Completar o cadastro</button>` : '.'}</p>`);
  };

  const montar = () => {
    const contexto = {
      cliente: clientes.find((c) => c.id === clienteId) ?? {},
      detalhes: detalhes.find((d) => d.cliente_id === clienteId) ?? {},
      processo: processos.find((p) => p.id === processoId),
      advogados,
      dados,
      hoje: hoje(),
    };
    desenhar(folha, cru(higienizar(String(MODELOS[modelo].montar(contexto)))));
    sujo = false;
    pendencias();
  };

  const ler = () => {
    const d = lerFormulario(form);
    delete d.cliente_texto;
    d.advogados_ids = COM_ADVOGADOS.includes(modelo)
      ? [...form.querySelectorAll('[name=advogados_ids]:checked')].map((e) => e.value)
      : dados.advogados_ids;
    return d;
  };

  /** Monta a folha de novo a partir dos campos. Se ela foi editada à mão, pergunta antes. */
  const refazer = async (novoModelo = modelo) => {
    if (alterando || ocupado) return;
    alterando = true;
    try {
      const v = ler();
      if (!v.cliente_id && form.cliente_texto.value.trim()) {
        mostrarErroFormulario(form, new ErroCampo('cliente_texto', 'Escolha um cliente da lista ou cadastre um novo.'));
        return;
      }
      if (sujo && !await abrirDialogo({
        titulo: 'Refazer o texto a partir dos campos?',
        rotuloOk: 'Refazer texto',
        corpo: html`<p>As edições feitas diretamente na folha serão substituídas pelos dados dos campos.</p>`,
      })) {
        desenharControles(); // volta os campos para o que está na folha
        return;
      }
      if (!ctx.ativa()) return;

      const mudouCliente = v.cliente_id !== clienteId;
      const mudouProcesso = v.processo_id !== processoId;
      if (mudouCliente) {
        // Outro cliente: as fontes (contrato, compromisso, relato) não valem mais.
        fontes = {};
        dados = { data_emissao: v.data_emissao || hoje(), advogados_ids: dados.advogados_ids };
        processoId = '';
      } else {
        dados = { ...dados, ...v };
        delete dados.cliente_id;
        delete dados.processo_id;
        processoId = v.processo_id;
      }
      clienteId = v.cliente_id;
      modelo = novoModelo;

      if (mudouProcesso || mudouCliente) {
        const p = processos.find((x) => x.id === processoId);
        dados.processo = p ? numeroCnj(p.numero) || p.referencia || '' : '';
        if (p) dados.area = p.area;
      }
      for (const c of MODELOS[modelo].complementos) {
        if (dados[c.nome] == null && c.padrao != null) dados[c.nome] = c.padrao;
      }
      desenharControles();
      montar();
    } catch (erro) {
      avisarErro(erro);
    } finally {
      alterando = false;
    }
  };

  desenharControles();
  montar();
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('change', () => refazer());
  form.addEventListener('click', (e) => {
    const botao = e.target.closest('[data-modelo]');
    if (botao && botao.dataset.modelo !== modelo) refazer(botao.dataset.modelo);
  });

  const editou = () => {
    sujo = true;
    pendencias();
  };
  folha.addEventListener('input', editou);
  const desligarColagem = ligarColagem(folha, editou);

  const executar = async (acao) => {
    if (ocupado || alterando) return;
    if (!validarFormulario(form)) return;
    ocupado = true;
    const botoes = ctx.raiz.querySelectorAll('[data-acao]');
    botoes.forEach((b) => { b.disabled = true; });
    try {
      const v = ler();
      if (v.cliente_id !== clienteId || v.processo_id !== processoId) {
        throw new Error('Confirme a seleção de cliente e processo antes de salvar.');
      }
      if ((acao !== 'salvar' && !await confirmarPendencias(folha, acao)) || !ctx.ativa()) return;
      const salvo = await salvarDocumento({
        modelo,
        titulo: MODELOS[modelo].nome,
        cliente_id: clienteId,
        processo_id: processoId || null,
        ...fontes,
        dados: { ...dados, acao },
        conteudo: folha.innerHTML,
      });
      if (acao === 'imprimir') imprimirDocumento(folha);
      else if (acao === 'word') await baixarWord(folha, MODELOS[modelo].nome);
      avisar('Documento registrado.');
      navegar(`/documentos/${salvo.id}`);
    } catch (erro) {
      mostrarErroFormulario(form, erro);
    } finally {
      ocupado = false;
      botoes.forEach((b) => { b.disabled = false; });
    }
  };

  const desligar = aoClicar(ctx.raiz, {
    salvar: () => executar('salvar'),
    imprimir: () => executar('imprimir'),
    word: () => executar('word'),
    refazer: () => refazer(),
    completar: async () => {
      try {
        if (!clienteId) return;
        if (await formularioCompleto(clienteId) && ctx.ativa()) {
          [clientes, detalhes] = await carregarCadastro();
          if (ctx.ativa()) await refazer();
        }
      } catch (erro) {
        avisarErro(erro);
      }
    },
  });

  return () => {
    desligar();
    desligarColagem();
    desligarFolha();
  };
}
