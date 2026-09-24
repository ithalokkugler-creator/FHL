// Cadastro mínimo de clientes (preparação 5.5).
// ============================================
//
// Enquanto o módulo Clientes não existe, contrato e compromisso escolhem o
// cliente por aqui — e cadastram na hora, sem sair do que estavam fazendo.

import { abrirDialogo } from '../nucleo/dialogo.js';
import { documento, documentoValido, limparDocumento, soDigitos, telefone } from '../nucleo/formato.js';
import { html } from '../nucleo/html.js';
import { db } from '../nucleo/supabase.js';

export const carregarClientes = () => db.todos('clientes', {
  select: 'id,nome,documento,telefone,email',
  filtros: [['ativo', 'eq', true]],
  ordem: 'nome.asc,id.asc',
});

export const rotuloCliente = (c) => (c.documento ? `${c.nome} — ${documento(c.documento)}` : c.nome);

let lista = 0;

/** Campo com sugestões enquanto digita. O id escolhido vai em cliente_id. */
export function campoCliente(clientes, { rotulo = 'Cliente', obrigatorio = true, atual = null, classe = '' } = {}) {
  const inicial = atual ? clientes.find((c) => c.id === atual) : null;
  const id = `clientes-${++lista}`;
  return html`
    <div class="campo ${classe}">
      <span>${rotulo}</span>
      <div class="campo-cliente">
        <input name="cliente_texto" list="${id}" autocomplete="off" aria-label="${rotulo}"
          value="${inicial ? rotuloCliente(inicial) : ''}" placeholder="Nome ou CPF/CNPJ" ${obrigatorio ? 'required' : ''}>
        <button type="button" class="botao" data-papel="novo-cliente">Novo</button>
      </div>
      <input type="hidden" name="cliente_id" value="${inicial?.id ?? ''}">
      <datalist id="${id}">${clientes.map((c) => html`<option value="${rotuloCliente(c)}"></option>`)}</datalist>
    </div>`;
}

/** Liga o campo: acha o id do que foi digitado e cadastra cliente novo. */
export function ligarCampoCliente(form, clientes, { aoMudar } = {}) {
  const texto = form.cliente_texto;
  const oculto = form.cliente_id;

  const resolver = () => {
    const valor = texto.value.trim();
    const achado = clientes.find((c) => rotuloCliente(c) === valor)
      ?? clientes.find((c) => c.nome.toLocaleLowerCase('pt-BR') === valor.toLocaleLowerCase('pt-BR'));
    oculto.value = achado?.id ?? '';
    texto.setCustomValidity(valor && !achado ? 'Escolha um cliente da lista, ou cadastre um novo.' : '');
    aoMudar?.(achado ?? null);
  };

  texto.addEventListener('input', resolver);
  form.querySelector('[data-papel="novo-cliente"]').addEventListener('click', async () => {
    const novo = await cadastrarCliente({ nome: oculto.value ? '' : texto.value.trim() });
    if (!novo) return;
    clientes.push(novo);
    document.getElementById(texto.getAttribute('list'))
      .append(Object.assign(document.createElement('option'), { value: rotuloCliente(novo) }));
    texto.value = rotuloCliente(novo);
    resolver();
  });

  resolver();
}

export const cadastrarCliente = ({ nome = '' } = {}) => formularioCliente({ nome });

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
        ? 'Cadastro mínimo, até o módulo Clientes existir.'
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
      return novo
        ? db.inserir('clientes', registro, colunas)
        : db.alterar('clientes', [['id', 'eq', c.id]], registro, colunas);
    },
  });
}
