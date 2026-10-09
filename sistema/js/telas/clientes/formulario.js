// Cadastro completo do cliente (F2): pessoa física ou jurídica, contato,
// endereço, recados, representante, banco e responsável. Grava o mínimo e o
// detalhe juntos, numa transação só (salvar_cliente).
//
// O CEP preenche o endereço pelo ViaCEP (gratuito, sem chave). Só o CEP sai
// do navegador; se o serviço não responder, o endereço se digita à mão.

import { CEP_URL } from '../../config.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { estado, membrosAtivos } from '../../nucleo/estado.js';
import { documento, hoje, soDigitos, telefone } from '../../nucleo/formato.js';
import { html } from '../../nucleo/html.js';
import { db } from '../../nucleo/supabase.js';
import { COLUNAS_CLIENTE, COLUNAS_DETALHES, ESTADOS_CIVIS, prepararCliente, TIPOS_PESSOA } from '../../dominio/clientes.js';
import { opcoes } from '../comum.js';

/** Membros ativos — e o responsável atual, mesmo desativado, para não sumir da escolha. */
export function opcoesResponsaveis(atual, { vazio = 'Sem responsável' } = {}) {
  const pessoas = membrosAtivos();
  const anterior = estado.porId.get(atual);
  if (anterior && !anterior.ativo) pessoas.push(anterior);
  return opcoes(pessoas.map((m) => [m.id, `${m.nome_curto}${m.ativo ? '' : ' (inativo)'}`]), atual, { vazio });
}

const RELACOES_RECADO = ['Pai', 'Mãe', 'Tio', 'Tia', 'Avô', 'Avó', 'Vizinho', 'Vizinha', 'Outro'];

// Rótulos que mudam com o tipo de pessoa: CPF/CNPJ, RG/IE, nascimento/constituição.
const ROTULOS = {
  fisica: { documento: 'CPF', rg: 'RG', nascimento: 'Nascimento' },
  juridica: { documento: 'CNPJ', rg: 'Inscrição estadual', nascimento: 'Constituição' },
};

const campo = (c, nome, rotulo, { tipo = 'text', classe = 'campo--6', max = 200, ate = '', obrigatorio = false, marcador = '' } = {}) => html`
  <label class="campo ${classe}"><span ${marcador ? html`data-rotulo="${marcador}"` : ''}>${rotulo}</span>
    <input type="${tipo}" name="${nome}" value="${c[nome] ?? ''}" ${tipo === 'date' ? (ate ? html`max="${ate}"` : '') : html`maxlength="${max}"`} ${obrigatorio ? 'required' : ''}></label>`;

const longo = (c, nome, rotulo, max = 1000) => html`
  <label class="campo"><span>${rotulo}</span><textarea name="${nome}" rows="2" maxlength="${max}">${c[nome] ?? ''}</textarea></label>`;

const grupo = (titulo, campos) => html`
  <fieldset class="cadastro-grupo"><legend>${titulo}</legend><div class="campos">${campos}</div></fieldset>`;

function corpo(c) {
  const rotulos = ROTULOS[c.tipo_pessoa] ?? ROTULOS.fisica;
  return html`
    ${grupo('Identificação', html`
      ${campo(c, 'nome', 'Nome completo / razão social', { classe: '', obrigatorio: true })}
      ${campo(c, 'nome_fantasia', 'Nome fantasia / como é conhecido', { classe: '' })}
      <label class="campo campo--6"><span>Tipo de pessoa</span><select name="tipo_pessoa">${opcoes(Object.entries(TIPOS_PESSOA), c.tipo_pessoa)}</select></label>
      <label class="campo campo--6"><span>Concordância nos documentos</span><select name="flexao">${opcoes([['', 'Neutra (a)'], ['m', 'O cliente'], ['f', 'A cliente']], c.flexao)}</select></label>
      ${campo(c, 'documento', rotulos.documento, { max: 18, marcador: 'documento' })}
      ${campo(c, 'rg', rotulos.rg, { max: 30, marcador: 'rg' })}
      ${campo(c, 'nascimento', rotulos.nascimento, { tipo: 'date', ate: hoje(), marcador: 'nascimento' })}
      ${campo(c, 'nacionalidade', 'Nacionalidade')}
      <label class="campo campo--6"><span>Estado civil</span><select name="estado_civil">${opcoes(Object.entries(ESTADOS_CIVIS), c.estado_civil, { vazio: 'Não informado' })}</select></label>
      ${campo(c, 'profissao', 'Profissão')}
      ${campo(c, 'filiacao', 'Filiação', { classe: '', max: 500 })}`)}
    ${grupo('Contato', html`
      ${campo(c, 'telefone', 'Telefone / WhatsApp', { tipo: 'tel', max: 20 })}
      ${campo(c, 'email', 'E-mail', { tipo: 'email' })}`)}
    ${grupo('Endereço', html`
      <label class="campo campo--4"><span>CEP</span>
        <span class="campo__linha"><input name="cep" value="${c.cep ?? ''}" maxlength="9" inputmode="numeric">
          <button type="button" class="botao botao--pequeno" data-cep>Buscar</button></span>
        <span class="campo__ajuda" data-cep-aviso aria-live="polite"></span></label>
      ${campo(c, 'logradouro', 'Logradouro', { classe: 'campo--8' })}
      ${campo(c, 'numero', 'Número', { max: 30, classe: 'campo--4' })}
      ${campo(c, 'complemento', 'Complemento', { classe: 'campo--8' })}
      ${campo(c, 'bairro', 'Bairro', { classe: 'campo--4' })}
      ${campo(c, 'cidade', 'Cidade', { classe: 'campo--4' })}
      ${campo(c, 'uf', 'UF', { max: 2, classe: 'campo--4' })}`)}
    ${grupo('Contato para recados', html`
      ${campo(c, 'recado_nome', 'Nome para recados')}
      <label class="campo campo--6"><span>Relação / parentesco</span>
        <input name="recado_relacao" value="${c.recado_relacao ?? ''}" list="relacoes-recados" maxlength="200">
        <datalist id="relacoes-recados">${RELACOES_RECADO.map((r) => html`<option value="${r}"></option>`)}</datalist></label>
      ${campo(c, 'recado_telefone', 'Telefone para recados', { tipo: 'tel', max: 20 })}
      ${longo(c, 'recado_observacao', 'Observação para recados')}`)}
    ${grupo('Representante legal', html`
      ${campo(c, 'representante_nome', 'Nome do representante')}
      ${campo(c, 'representante_documento', 'CPF / CNPJ do representante', { max: 18 })}
      ${campo(c, 'representante_relacao', 'Relação com o cliente', { classe: '' })}
      ${longo(c, 'representante_qualificacao', 'Qualificação do representante')}`)}
    ${grupo('Dados bancários', html`
      ${campo(c, 'banco', 'Banco')}
      ${campo(c, 'agencia', 'Agência', { max: 30 })}
      ${campo(c, 'conta', 'Conta', { max: 40 })}
      ${campo(c, 'pix', 'Chave Pix')}`)}
    ${grupo('Organização', html`
      <label class="campo"><span>Responsável interno</span><select name="responsavel_id">${opcoesResponsaveis(c.responsavel_id)}</select></label>
      <label class="campo"><span>Etiquetas</span><input name="etiquetas" value="${(c.etiquetas ?? []).join(', ')}" maxlength="900" placeholder="Ex.: inss, indicação, urgente">
        <span class="campo__ajuda">Separe por vírgula. Servem para filtrar a lista de clientes.</span></label>
      ${longo(c, 'observacoes', 'Observações', 5000)}`)}`;
}

/** Busca o endereço do CEP. Ao sair do campo, só preenche o que está vazio; o botão substitui. */
function ligarCep(form) {
  const aviso = form.querySelector('[data-cep-aviso]');
  const buscar = async (substituir) => {
    const cep = soDigitos(form.cep.value);
    if (cep.length !== 8) {
      if (substituir) aviso.textContent = 'O CEP tem 8 dígitos.';
      return;
    }
    aviso.textContent = 'Buscando…';
    try {
      const r = await fetch(`${CEP_URL}/${cep}/json/`, { signal: AbortSignal.timeout(8000) });
      const e = r.ok ? await r.json() : null;
      if (!e || e.erro) {
        aviso.textContent = 'CEP não encontrado. Preencha o endereço à mão.';
        return;
      }
      const campos = { logradouro: e.logradouro, bairro: e.bairro, cidade: e.localidade, uf: e.uf };
      for (const [nome, valor] of Object.entries(campos)) {
        if (valor && (substituir || !form[nome].value.trim())) form[nome].value = valor;
      }
      aviso.textContent = 'Endereço preenchido. Confira e informe o número.';
      if (!form.numero.value) form.numero.focus();
    } catch {
      aviso.textContent = 'O serviço de CEP não respondeu. Preencha à mão.';
    }
  };
  form.querySelector('[data-cep]').addEventListener('click', () => buscar(true));
  form.cep.addEventListener('change', () => buscar(false));
}

/**
 * Novo cliente (sem `clienteId`) ou edição. `iniciais` preenche um cadastro
 * novo — a conversão de um contato manda nome, telefone e e-mail.
 * Devolve o que foi gravado, com o id, ou null se fechou sem salvar.
 */
export async function formularioCompleto(clienteId = null, iniciais = {}) {
  let c = { ...iniciais, tipo_pessoa: 'fisica' };
  if (clienteId) {
    const [cliente, detalhes] = await Promise.all([
      db.um('clientes', { select: COLUNAS_CLIENTE, filtros: [['id', 'eq', clienteId]] }),
      db.um('clientes_detalhes', { select: COLUNAS_DETALHES, filtros: [['cliente_id', 'eq', clienteId]] }),
    ]);
    if (!cliente) throw new Error('Cliente não encontrado.');
    // O id do detalhe é outro: não pode sobrescrever o do cliente.
    c = {
      ...cliente,
      ...detalhes,
      id: cliente.id,
      tipo_pessoa: detalhes?.tipo_pessoa ?? (cliente.documento?.length === 14 ? 'juridica' : 'fisica'),
    };
  }
  c.documento = documento(c.documento);
  c.telefone = telefone(c.telefone);
  c.recado_telefone = telefone(c.recado_telefone);
  c.representante_documento = documento(c.representante_documento);

  return abrirDialogo({
    titulo: clienteId ? `Editar dados — ${c.nome}` : 'Novo cliente',
    largo: true,
    rotuloOk: clienteId ? 'Salvar cadastro' : 'Cadastrar cliente',
    corpo: corpo(c),
    aoAbrir: (dialogo, form) => {
      const atualizarRotulos = () => {
        const rotulos = ROTULOS[form.tipo_pessoa.value];
        for (const [nome, rotulo] of Object.entries(rotulos)) dialogo.querySelector(`[data-rotulo="${nome}"]`).textContent = rotulo;
      };
      form.tipo_pessoa.addEventListener('change', atualizarRotulos);
      ligarCep(form);
      form.nome.focus();
    },
    aoEnviar: async (d) => {
      const p = prepararCliente(d, clienteId);
      try {
        const id = await db.rpc('salvar_cliente', { p });
        return { ...p, id };
      } catch (erro) {
        if (erro.codigo === '23505') throw new Error('Este CPF / CNPJ já está cadastrado. Confira o cliente existente.');
        throw erro;
      }
    },
  });
}
