// Processos e casos (F2). Número CNJ com dígito verificador conferido aqui e
// no banco; caso consultivo ou extrajudicial pode ficar sem número, com uma
// referência. O mesmo número pode servir a clientes diferentes, nunca duas
// vezes ao mesmo cliente.

import { avisar, avisarErro } from '../nucleo/avisos.js';
import { abrirDialogo } from '../nucleo/dialogo.js';
import { nomeDe } from '../nucleo/estado.js';
import { dataHora, numeroCnj, numeroCnjValido, tribunalDoNumero } from '../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../nucleo/html.js';
import { guardarConsulta } from '../nucleo/rotas.js';
import { db } from '../nucleo/supabase.js';
import { COLUNAS_CLIENTE, COLUNAS_PROCESSO, filtrarProcessos, prepararProcesso, SITUACOES_PROCESSO } from '../dominio/clientes.js';
import { AREAS_JURIDICAS, cabecalho, opcoes, vazio } from './comum.js';
import { campoCliente, ligarCampoCliente } from './clientes.js';
import { opcoesResponsaveis } from './clientes/formulario.js';
import { abrirHistorico } from './historico.js';

const TONS = { encerrado: 'escuro', em_andamento: 'ok' };
export const seloProcesso = (situacao) => html`<span class="selo selo--${TONS[situacao] ?? 'alerta'}">${SITUACOES_PROCESSO[situacao] ?? situacao}</span>`;

/** Também usada na ficha do cliente, sem a coluna Cliente. */
export function tabelaProcessos(processos, clientes = [], { mostrarCliente = true } = {}) {
  if (!processos.length) return vazio('Nenhum processo ou caso cadastrado.');
  const nomes = new Map(clientes.map((c) => [c.id, c.nome]));
  return html`
    <div class="tabela-rolagem"><table class="tabela tabela--processos">
      <thead><tr>
        <th>Processo / caso</th>${mostrarCliente ? html`<th>Cliente</th>` : ''}<th>Área</th><th>Tribunal / órgão</th>
        <th>Responsável</th><th>Situação</th><th>Última atualização</th><th>Ações</th>
      </tr></thead>
      <tbody>${processos.map((p) => html`
        <tr>
          <td><strong>${p.titulo}</strong><span class="sub num">${p.numero ? numeroCnj(p.numero) : p.referencia || 'Sem número judicial'}</span></td>
          ${mostrarCliente ? html`<td><a href="#/clientes/${p.cliente_id}">${nomes.get(p.cliente_id) ?? 'Cliente'}</a></td>` : ''}
          <td>${AREAS_JURIDICAS[p.area]}</td>
          <td>${p.tribunal ?? '—'}<span class="sub">${p.orgao ?? ''}</span></td>
          <td>${nomeDe(p.responsavel_id)}</td>
          <td>${seloProcesso(p.situacao)}</td>
          <td>${p.alterado_em || p.criado_em ? dataHora(p.alterado_em || p.criado_em) : '—'}</td>
          <td><div class="registro-acoes">
            <button type="button" class="botao botao--pequeno" data-acao="editar-processo" data-id="${p.id}">Editar</button>
            <button type="button" class="botao botao--pequeno botao--discreto" data-acao="historico-processo" data-id="${p.id}">Histórico</button>
          </div></td>
        </tr>`)}
      </tbody>
    </table></div>`;
}

/** Novo processo (com ou sem cliente já escolhido) ou edição. O cliente de
 *  um processo existente não muda: o vínculo é fixo, o banco nem aceita. */
export async function formularioProcesso({ cliente_id = null, processo = null } = {}) {
  const p = processo ?? { situacao: 'em_andamento', cliente_id };
  const clientes = await db.todos('clientes', { select: COLUNAS_CLIENTE, ordem: 'nome.asc,id.asc' });
  const fixo = p.cliente_id ? clientes.find((c) => c.id === p.cliente_id) : null;
  if (p.cliente_id && !fixo) throw new Error('Cliente não encontrado.');
  const ativos = clientes.filter((c) => c.ativo);

  return abrirDialogo({
    titulo: processo ? 'Editar processo / caso' : 'Novo processo / caso',
    largo: true,
    rotuloOk: processo ? 'Salvar processo' : 'Cadastrar processo',
    corpo: html`
      <div class="campos">
        ${fixo
          ? html`<label class="campo"><span>Cliente</span><input value="${fixo.nome}" readonly><input type="hidden" name="cliente_id" value="${fixo.id}"></label>`
          : campoCliente(ativos)}
        <label class="campo campo--6"><span>Número CNJ (opcional)</span>
          <input name="numero" value="${numeroCnj(p.numero)}" maxlength="25" placeholder="0000000-00.0000.0.00.0000">
          <span class="campo__ajuda">Caso consultivo ou extrajudicial pode ficar sem número.</span></label>
        <label class="campo campo--6"><span>Referência / protocolo</span><input name="referencia" value="${p.referencia ?? ''}" maxlength="200"></label>
        <label class="campo"><span>Título do processo ou caso</span><input name="titulo" value="${p.titulo ?? ''}" required maxlength="200"></label>
        <label class="campo campo--6"><span>Área jurídica</span><select name="area" required>${opcoes(Object.entries(AREAS_JURIDICAS), p.area, { vazio: 'Escolha a área' })}</select></label>
        <label class="campo campo--6"><span>Situação</span><select name="situacao">${opcoes(Object.entries(SITUACOES_PROCESSO), p.situacao)}</select></label>
        <label class="campo campo--6"><span>Tribunal</span><input name="tribunal" value="${p.tribunal ?? ''}" maxlength="100" placeholder="TJPR, TRT9, TRF4…"></label>
        <label class="campo campo--6"><span>Órgão / vara</span><input name="orgao" value="${p.orgao ?? ''}" maxlength="200"></label>
        <label class="campo"><span>Responsável</span><select name="responsavel_id">${opcoesResponsaveis(p.responsavel_id)}</select></label>
        <label class="campo"><span>Observações</span><textarea name="observacoes" rows="3" maxlength="5000">${p.observacoes ?? ''}</textarea></label>
      </div>`,
    aoAbrir: (dialogo, form) => {
      if (!fixo) ligarCampoCliente(form, ativos);
      // Ao sair do campo: confere o dígito, aplica a máscara e sugere o tribunal.
      form.numero.addEventListener('input', () => form.numero.setCustomValidity(''));
      form.numero.addEventListener('blur', () => {
        const n = form.numero.value.trim();
        const valido = !n || numeroCnjValido(n);
        form.numero.setCustomValidity(valido ? '' : 'Número CNJ inválido — confira o dígito verificador.');
        if (n && valido) {
          form.numero.value = numeroCnj(n);
          if (!form.tribunal.value.trim()) form.tribunal.value = tribunalDoNumero(n);
        }
      });
      form.titulo.focus();
    },
    aoEnviar: async (d) => {
      const registro = prepararProcesso(d, AREAS_JURIDICAS);
      let salvo;
      try {
        if (processo) {
          const { cliente_id: _fixo, ...alteracoes } = registro;
          salvo = await db.alterar('processos', [['id', 'eq', processo.id]], alteracoes, COLUNAS_PROCESSO);
        } else {
          salvo = await db.inserir('processos', registro, COLUNAS_PROCESSO);
        }
      } catch (erro) {
        if (erro.codigo === '23505') throw new Error('Este cliente já está vinculado a esse número CNJ. Edite o processo existente.');
        throw erro;
      }
      avisar(processo ? 'Processo salvo.' : 'Processo cadastrado.');
      return salvo;
    },
  });
}

export default async function telaProcessos(ctx) {
  const c = ctx.consulta;
  const f = {
    situacao: ['abertos', 'todos', ...Object.keys(SITUACOES_PROCESSO)].includes(c.situacao) ? c.situacao : 'abertos',
    area: AREAS_JURIDICAS[c.area] ? c.area : '',
    responsavel: c.responsavel ?? '',
    tribunal: c.tribunal ?? '',
    busca: c.busca ?? '',
  };
  let processos = [];
  let clientes = [];

  const mostrar = () => desenhar($('[data-lista]', ctx.raiz), tabelaProcessos(filtrarProcessos(processos, clientes, f), clientes));

  const carregar = async () => {
    [processos, clientes] = await Promise.all([
      db.todos('processos', { select: COLUNAS_PROCESSO, ordem: 'criado_em.desc,id.desc' }),
      db.todos('clientes', { select: COLUNAS_CLIENTE }),
    ]);
    if (!ctx.ativa()) return;
    const tribunais = [...new Set(processos.map((p) => p.tribunal).filter(Boolean))].sort();

    desenhar(ctx.raiz, html`
      ${cabecalho('Processos', 'Casos judiciais, administrativos, consultivos e extrajudiciais', html`
        <button type="button" class="botao botao--primario" data-acao="novo-processo">Novo processo</button>`)}
      <form class="filtros">
        <label class="campo"><span>Situação</span><select name="situacao">${opcoes([['abertos', 'Todos menos encerrados'], ['todos', 'Todos'], ...Object.entries(SITUACOES_PROCESSO)], f.situacao)}</select></label>
        <label class="campo"><span>Área</span><select name="area">${opcoes(Object.entries(AREAS_JURIDICAS), f.area, { vazio: 'Todas' })}</select></label>
        <label class="campo"><span>Responsável</span><select name="responsavel">${opcoesResponsaveis(f.responsavel, { vazio: 'Todos' })}</select></label>
        <label class="campo"><span>Tribunal</span><select name="tribunal">${opcoes(tribunais.map((t) => [t, t]), f.tribunal, { vazio: 'Todos' })}</select></label>
        <label class="campo campo--busca"><span>Buscar</span><input type="search" name="busca" value="${f.busca}" placeholder="Cliente, número, título ou referência"></label>
      </form>
      <section class="painel" data-lista></section>`);

    const form = $('form.filtros', ctx.raiz);
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('input', () => {
      Object.assign(f, Object.fromEntries(new FormData(form)));
      guardarConsulta(f);
      mostrar();
    });
    mostrar();
  };

  await carregar();
  if (!ctx.ativa()) return;

  const processoDe = (el) => processos.find((p) => p.id === el.dataset.id);
  const depois = async (promessa) => {
    try {
      if (await promessa && ctx.ativa()) await carregar();
    } catch (erro) {
      avisarErro(erro);
    }
  };
  return aoClicar(ctx.raiz, {
    'novo-processo': () => depois(formularioProcesso()),
    'editar-processo': (el) => depois(formularioProcesso({ processo: processoDe(el) })),
    'historico-processo': (el) => abrirHistorico({ titulo: processoDe(el).titulo, registros: [el.dataset.id] }),
  });
}
