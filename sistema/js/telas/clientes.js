// Cadastro mínimo de clientes (preparação 5.5).
// ============================================
//
// Contrato e compromisso usam este cadastro rápido sem precisar de acesso
// aos dados completos, que ficam no módulo Clientes.

import { abrirDialogo } from '../nucleo/dialogo.js';
import { documento, documentoValido, limparDocumento, numeroCnj, soDigitos, telefone } from '../nucleo/formato.js';
import { desenhar, html } from '../nucleo/html.js';
import { pode } from '../nucleo/estado.js';
import { db } from '../nucleo/supabase.js';
import { acharCliente, buscarClientes } from '../dominio/clientes.js';

/** Quem lê o cadastro de clientes (privado.le_clientes no banco). Os demais
 *  — Agenda e Tarefas — escolhem o cliente pela lista mínima clientes_agenda. */
export const podeLerClientes = () => pode.administrar() || pode.clientes() || pode.prazos() || pode.financeiro();

export const carregarClientes = async ({ inativos = false } = {}) => {
  if (!podeLerClientes()) {
    const lista = await db.rpc('clientes_agenda');
    return inativos ? lista : lista.filter((c) => c.ativo);
  }
  return db.todos('clientes', {
    select: 'id,nome,documento,telefone,email,ativo',
    filtros: inativos ? [] : [['ativo', 'eq', true]],
    ordem: 'nome.asc,id.asc',
  });
};

export const rotuloCliente = (c) => (c.documento ? `${c.nome} — ${documento(c.documento)}` : c.nome);

let lista = 0;
const MOSTRAR = 50;
const controles = new WeakMap();

/** Campo com sugestões enquanto digita. O id escolhido vai em cliente_id. */
export function campoCliente(clientes, { rotulo = 'Cliente', obrigatorio = true, atual = null, classe = '' } = {}) {
  const inicial = atual ? clientes.find((c) => c.id === atual) : null;
  const id = `clientes-${++lista}`;
  return html`
    <div class="campo ${classe}">
      <span>${rotulo}</span>
      <div class="campo-cliente">
        <div class="combo">
          <input name="cliente_texto" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}"
            autocomplete="off" spellcheck="false" aria-label="${rotulo}"
            value="${inicial ? rotuloCliente(inicial) : ''}" placeholder="${podeLerClientes() ? 'Nome, parte do nome ou CPF/CNPJ' : 'Nome ou parte do nome'}" ${obrigatorio ? 'required' : ''}>
          <ul class="combo__lista" id="${id}" role="listbox" aria-label="${rotulo}" hidden></ul>
        </div>
        <button type="button" class="botao" data-papel="novo-cliente">Novo</button>
      </div>
      <input type="hidden" name="cliente_id" value="${inicial?.id ?? ''}">
    </div>`;
}

/**
 * Liga o campo: lista quem bate com o que foi digitado (nome em qualquer
 * parte, CPF/CNPJ e, com `processos`, o número do processo), escolhe pelo
 * clique, pelas setas + Enter ou — se só um bate — ao sair do campo, e
 * cadastra cliente novo. Um nome que não aparece faz buscar o cadastro de
 * novo: a tela pode ter sido aberta antes de o cliente ser cadastrado.
 * `aoMudar(cliente, { processo })` recebe o processo quando foi ele que achou.
 */
export function ligarCampoCliente(form, clientes, { aoMudar, processos = [] } = {}) {
  const texto = form.cliente_texto;
  const oculto = form.cliente_id;
  const caixa = document.getElementById(texto.getAttribute('aria-controls'));
  let itens = [];
  let ativo = -1;
  let ultimaBusca = 0;

  const avisarMudanca = (cliente, processo = null) => aoMudar?.(cliente, { processo });

  const destacar = (i) => {
    ativo = i;
    for (const li of caixa.querySelectorAll('[role="option"]')) li.setAttribute('aria-selected', String(Number(li.dataset.i) === i));
    const li = caixa.querySelector(`[data-i="${i}"]`);
    if (li) {
      texto.setAttribute('aria-activedescendant', li.id);
      // Rola só a lista (scrollIntoView rolaria também o diálogo e a página).
      const fim = li.offsetTop + li.offsetHeight;
      if (li.offsetTop < caixa.scrollTop) caixa.scrollTop = li.offsetTop;
      else if (fim > caixa.scrollTop + caixa.clientHeight) caixa.scrollTop = fim - caixa.clientHeight;
    } else texto.removeAttribute('aria-activedescendant');
  };

  const fechar = () => {
    caixa.hidden = true;
    texto.setAttribute('aria-expanded', 'false');
    texto.removeAttribute('aria-activedescendant');
    ativo = -1;
  };

  // Abre para baixo; perto do fim do diálogo (ou da tela), para cima.
  const posicionar = () => {
    const campo = texto.getBoundingClientRect();
    const rolagem = texto.closest('.dialogo__corpo')?.getBoundingClientRect() ?? { top: 0, bottom: innerHeight };
    const abaixo = rolagem.bottom - campo.bottom;
    const acima = campo.top - rolagem.top;
    const paraCima = abaixo < 200 && acima > abaixo;
    caixa.classList.toggle('combo__lista--acima', paraCima);
    caixa.style.setProperty('--combo-altura', `${Math.max(150, Math.min(320, (paraCima ? acima : abaixo) - 12))}px`);
  };

  const buscarDeNovo = () => {
    if (Date.now() - ultimaBusca < 5000) return;
    ultimaBusca = Date.now();
    carregarClientes().then((frescos) => {
      const ids = new Set(clientes.map((c) => c.id));
      const novos = frescos.filter((c) => !ids.has(c.id));
      if (!novos.length || !texto.isConnected) return;
      clientes.push(...novos);
      if (!caixa.hidden) abrir();
      resolver();
    }).catch(() => { /* sem rede: fica a lista que já estava */ });
  };

  const abrir = () => {
    if (texto.disabled || texto.readOnly) return;
    const valor = texto.value.trim();
    const escolhido = clientes.find((c) => c.id === oculto.value);
    // Com um cliente escolhido, a lista mostra todos para trocar.
    itens = buscarClientes(clientes, escolhido && rotuloCliente(escolhido) === valor ? '' : valor, { processos });
    const sobra = itens.length - MOSTRAR;
    desenhar(caixa, itens.length
      ? html`${itens.slice(0, MOSTRAR).map(({ cliente: c, processo: p }, i) => html`
          <li id="${caixa.id}-${i}" role="option" class="combo__opcao" data-i="${i}" aria-selected="false">
            <span class="combo__nome">${c.nome}</span>
            ${c.documento || p || c.ativo === false ? html`<span class="combo__sub">${[
              c.documento ? documento(c.documento) : '',
              p ? `Processo ${numeroCnj(p.numero)}` : '',
              c.ativo === false ? 'inativo' : '',
            ].filter(Boolean).join(' · ')}</span>` : ''}
          </li>`)}
          ${sobra > 0 ? html`<li class="combo__nota" role="presentation">E mais ${sobra}. Continue digitando para achar.</li>` : ''}`
      : html`<li class="combo__nota" role="presentation">${valor
        ? `Nenhum cliente com “${valor}”. Confira o nome${podeLerClientes() ? ' ou o CPF' : ''}, ou use Novo.`
        : 'Nenhum cliente cadastrado ainda. Use Novo.'}</li>`);
    if (!itens.length && valor.length >= 2) buscarDeNovo();
    caixa.hidden = false;
    texto.setAttribute('aria-expanded', 'true');
    posicionar();
    const atual = itens.findIndex((x) => x.cliente.id === oculto.value);
    destacar(atual >= 0 ? atual : valor && itens.length ? 0 : -1);
  };

  // O "change" que o navegador manda ao sair do campo, depois de uma escolha
  // já avisada, repetiria o aviso (Documentos perguntaria duas vezes se refaz
  // o texto). Barrado antes de chegar a quem escuta.
  let avisado = null;
  form.addEventListener('change', (e) => {
    if (e.target !== texto || !e.isTrusted) return;
    if (avisado !== null && texto.value === avisado) e.stopImmediatePropagation();
    avisado = null;
  }, true);

  const escolher = (cliente, processo = null, { evento = true } = {}) => {
    texto.value = rotuloCliente(cliente);
    oculto.value = cliente.id;
    texto.setCustomValidity('');
    fechar();
    // Quem escuta o "change" do campo (Documentos, Tarefas, a validação) fica sabendo.
    if (evento) {
      avisado = texto.value;
      texto.dispatchEvent(new Event('change', { bubbles: true }));
    }
    avisarMudanca(cliente, processo);
  };

  const resolver = ({ sempre = false } = {}) => {
    const valor = texto.value.trim();
    const antes = oculto.value;
    const achado = acharCliente(clientes, valor, rotuloCliente);
    oculto.value = achado?.id ?? '';
    texto.setCustomValidity(valor && !achado ? 'Escolha um cliente da lista, ou cadastre um novo.' : '');
    if (sempre || oculto.value !== antes) avisarMudanca(achado ?? null);
  };

  texto.addEventListener('input', () => {
    avisado = null;
    resolver();
    abrir();
  });
  texto.addEventListener('click', () => {
    if (caixa.hidden) abrir();
  });
  texto.addEventListener('keydown', (e) => {
    const aberta = !caixa.hidden;
    const quantos = Math.min(itens.length, MOSTRAR);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!aberta) return abrir();
      if (quantos) destacar(e.key === 'ArrowDown' ? (ativo + 1) % quantos : (ativo <= 0 ? quantos : ativo) - 1);
    } else if (e.key === 'Enter' && aberta) {
      // Enter escolhe; não envia o formulário com a lista aberta.
      e.preventDefault();
      if (ativo >= 0 && itens[ativo]) escolher(itens[ativo].cliente, itens[ativo].processo);
      else fechar();
    } else if (e.key === 'Escape' && aberta) {
      // Fecha a lista, não o diálogo.
      e.preventDefault();
      e.stopPropagation();
      fechar();
    } else if (e.key === 'Tab') fechar();
  });
  // Saiu do campo com o texto digitado e um cliente só batendo: é ele.
  texto.addEventListener('change', () => {
    if (oculto.value || !texto.value.trim()) return;
    const unicos = buscarClientes(clientes, texto.value, { processos });
    if (unicos.length === 1) escolher(unicos[0].cliente, unicos[0].processo, { evento: false });
  });
  texto.addEventListener('blur', fechar);
  // Rolou o diálogo com a lista aberta: ela muda de lado e de altura se precisar.
  texto.closest('.dialogo__corpo')?.addEventListener('scroll', () => { if (!caixa.hidden) posicionar(); }, { passive: true });
  // O clique na lista não tira o foco do campo (o blur fecharia antes do clique).
  caixa.addEventListener('mousedown', (e) => e.preventDefault());
  caixa.addEventListener('click', (e) => {
    const li = e.target.closest('[role="option"]');
    const item = li && itens[Number(li.dataset.i)];
    if (item) escolher(item.cliente, item.processo);
  });

  const definir = (cliente) => {
    if (!clientes.some((c) => c.id === cliente.id)) clientes.push(cliente);
    escolher(cliente);
  };
  controles.set(texto, definir);

  form.querySelector('[data-papel="novo-cliente"]').addEventListener('click', async () => {
    const novo = await cadastrarCliente({ nome: oculto.value ? '' : texto.value.trim() });
    if (novo) definir(novo);
  });

  // Na abertura, quem usa o campo preenche o que depende do cliente (processos…).
  resolver({ sempre: true });
}

/** Põe no campo um cliente que acabou de ser cadastrado por outro caminho. */
export function definirCliente(form, cliente) {
  controles.get(form.cliente_texto)?.(cliente);
}

export const cadastrarCliente = ({ nome = '', email = '', telefone = '' } = {}) => formularioCliente({ nome, email, telefone });

/**
 * Corrigir o cadastro de quem já existe. Sem isto, um telefone digitado errado
 * ficava errado para sempre — e é ele que abre o WhatsApp da cobrança.
 * O histórico guarda o valor anterior.
 */
export async function editarCliente(id) {
  const cliente = await db.um('clientes', { select: 'id,nome,documento,telefone,email,observacoes', filtros: [['id', 'eq', id]] });
  if (!cliente) throw new Error('Cliente não encontrado.');
  return formularioCliente(cliente);
}

function formularioCliente(c) {
  const novo = !c.id;
  return abrirDialogo({
    titulo: novo ? 'Novo cliente' : `Editar cliente — ${c.nome}`,
    rotuloOk: novo ? 'Cadastrar' : 'Salvar',
    corpo: html`
      <div class="campos">
        <label class="campo">
          <span>Nome completo</span>
          <input name="nome" value="${c.nome ?? ''}" required maxlength="200" autofocus>
        </label>
        <label class="campo campo--6">
          <span>CPF ou CNPJ</span>
          <input name="documento" value="${c.documento ? documento(c.documento) : ''}" maxlength="18" autocomplete="off">
        </label>
        <label class="campo campo--6">
          <span>Telefone / WhatsApp</span>
          <input name="telefone" type="tel" value="${c.telefone ? telefone(c.telefone) : ''}" maxlength="20" placeholder="(41) 99999-9999">
        </label>
        <label class="campo">
          <span>E-mail</span>
          <input name="email" type="email" value="${c.email ?? ''}" maxlength="200">
        </label>
        <label class="campo">
          <span>Observações</span>
          <textarea name="observacoes" rows="2">${c.observacoes ?? ''}</textarea>
        </label>
      </div>
      <p class="sub secao">${novo
        ? 'Cadastro rápido para Agenda e Financeiro. Os dados completos podem ser preenchidos no módulo Clientes.'
        : 'Vale para todos os contratos deste cliente. O dado anterior fica no histórico.'}</p>`,
    aoEnviar: async (d) => {
      const doc = limparDocumento(d.documento);
      if (doc && !documentoValido(doc)) throw new Error('CPF ou CNPJ inválido — confira os dígitos.');
      const fone = soDigitos(d.telefone);
      if (fone && (fone.length < 10 || fone.length > 13)) throw new Error('Telefone precisa do DDD, como (41) 99999-9999.');
      const registro = {
        nome: d.nome,
        documento: doc || null,
        telefone: fone || null,
        email: d.email || null,
        observacoes: d.observacoes || null,
      };
      const colunas = 'id,nome,documento,telefone,email';
      if (novo && !podeLerClientes()) return db.rpc('cadastrar_cliente_rapido', { p: registro });
      return novo
        ? db.inserir('clientes', registro, colunas)
        : db.alterar('clientes', [['id', 'eq', c.id]], registro, colunas);
    },
  });
}
