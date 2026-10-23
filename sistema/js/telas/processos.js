// Processos e casos (F2). Número CNJ com dígito verificador conferido aqui e
// no banco; caso consultivo ou extrajudicial pode ficar sem número, com uma
// referência. O mesmo número pode servir a clientes diferentes, nunca duas
// vezes ao mesmo cliente. Cada processo tem os documentos solicitados e
// entregues (22/10), com o retorno previsto — telas/documentos-processo.js.

import { avisar, avisarErro } from '../nucleo/avisos.js';
import { abrirDialogo } from '../nucleo/dialogo.js';
import { ErroCampo } from '../nucleo/formularios.js';
import { nomeDe } from '../nucleo/estado.js';
import { dataHora, hoje, numeroCnj, numeroCnjValido, tribunalDoNumero } from '../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../nucleo/html.js';
import { guardarConsulta } from '../nucleo/rotas.js';
import { db } from '../nucleo/supabase.js';
import {
  COLUNAS_CLIENTE, COLUNAS_PROCESSO, filtrarProcessos, POSICAO_OUTRA, POSICOES_CLIENTE, posicaoConhecida, prepararProcesso, SITUACOES_PROCESSO,
} from '../dominio/clientes.js';
import { AREAS_JURIDICAS, cabecalho, opcoes, vazio } from './comum.js';
import { campoCliente, ligarCampoCliente } from './clientes.js';
import { opcoesResponsaveis } from './clientes/formulario.js';
import { abrirHistorico } from './historico.js';
import {
  abrirDocumentosProcesso, COLUNAS_RESUMO_DOCUMENTOS, documentosPorProcesso, resumoNaTabela,
} from './documentos-processo.js';
import { resumoDocumentos } from '../dominio/documentos-processo.js';

const TONS = { encerrado: 'escuro', em_andamento: 'ok' };

/** "Nosso cliente é": as posições usuais por polo e "Outra…" com texto livre. */
function campoPosicao(atual) {
  const outra = Boolean(atual) && !posicaoConhecida(atual);
  return html`
    <label class="campo campo--6"><span>Nosso cliente é</span>
      <select name="posicao_cliente">
        <option value="">Não informado</option>
        ${POSICOES_CLIENTE.map(([grupo, lista]) => html`
          <optgroup label="${grupo}">${lista.map((p) => html`<option value="${p}" ${p === atual ? 'selected' : ''}>${p}</option>`)}</optgroup>`)}
        <option value="${POSICAO_OUTRA}" ${outra ? 'selected' : ''}>Outra…</option>
      </select>
      <span class="campo__ajuda">Como o cliente aparece neste processo: autor, réu, exequente…</span></label>
    <label class="campo campo--6" data-posicao-outra ${outra ? '' : 'hidden'}><span>Qual posição?</span>
      <input name="posicao_outra" value="${outra ? atual : ''}" maxlength="60" placeholder="Ex.: Inventariante, Vítima" ${outra ? 'required' : 'disabled'}></label>`;
}
export const seloProcesso = (situacao) => html`<span class="selo selo--${TONS[situacao] ?? 'alerta'}">${SITUACOES_PROCESSO[situacao] ?? situacao}</span>`;

/** Também usada na ficha do cliente, sem a coluna Cliente. `documentos`:
 *  os documentos de cada processo (documentosPorProcesso), para o resumo. */
export function tabelaProcessos(processos, clientes = [], { mostrarCliente = true, documentos = new Map(), semResultado = 'Nenhum processo ou caso cadastrado.' } = {}) {
  if (!processos.length) return vazio(semResultado);
  const nomes = new Map(clientes.map((c) => [c.id, c.nome]));
  const dia = hoje();
  return html`
    <div class="tabela-rolagem"><table class="tabela tabela--processos">
      <thead><tr>
        <th>Processo / caso</th>${mostrarCliente ? html`<th>Cliente</th>` : ''}<th>Área</th><th>Tribunal / órgão</th>
        <th>Responsável</th><th>Situação</th><th>Última atualização</th><th>Ações</th>
      </tr></thead>
      <tbody>${processos.map((p) => html`
        <tr>
          <td><strong>${p.titulo}</strong><span class="sub num">${p.numero ? numeroCnj(p.numero) : p.referencia || 'Sem número judicial'}</span>
            ${p.posicao_cliente ? html`<span class="sub">Nosso cliente: <strong>${p.posicao_cliente}</strong></span>` : ''}
            ${resumoNaTabela(documentos.get(p.id), dia, p.id)}</td>
          ${mostrarCliente ? html`<td><a href="#/clientes/${p.cliente_id}">${nomes.get(p.cliente_id) ?? 'Cliente'}</a></td>` : ''}
          <td>${AREAS_JURIDICAS[p.area]}</td>
          <td>${p.tribunal ?? '—'}<span class="sub">${p.orgao ?? ''}</span></td>
          <td>${nomeDe(p.responsavel_id)}</td>
          <td>${seloProcesso(p.situacao)}</td>
          <td>${p.alterado_em || p.criado_em ? dataHora(p.alterado_em || p.criado_em) : '—'}</td>
          <td><div class="registro-acoes">
            <button type="button" class="botao botao--pequeno" data-acao="editar-processo" data-id="${p.id}">Editar</button>
            <button type="button" class="botao botao--pequeno" data-acao="documentos-processo" data-id="${p.id}" aria-label="Documentos — ${p.titulo}">Documentos</button>
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
        ${campoPosicao(p.posicao_cliente)}
        <label class="campo campo--6"><span>Área jurídica</span><select name="area" required>${opcoes(Object.entries(AREAS_JURIDICAS), p.area, { vazio: 'Escolha a área' })}</select></label>
        <label class="campo campo--6"><span>Situação</span><select name="situacao">${opcoes(Object.entries(SITUACOES_PROCESSO), p.situacao)}</select></label>
        <label class="campo campo--6"><span>Tribunal</span><input name="tribunal" value="${p.tribunal ?? ''}" maxlength="100" placeholder="TJPR, TRT9, TRF4…"></label>
        <label class="campo campo--6"><span>Órgão / vara</span><input name="orgao" value="${p.orgao ?? ''}" maxlength="200"></label>
        <label class="campo"><span>Responsável</span><select name="responsavel_id">${opcoesResponsaveis(p.responsavel_id)}</select></label>
        <label class="campo"><span>Observações</span><textarea name="observacoes" rows="3" maxlength="5000">${p.observacoes ?? ''}</textarea></label>
        <label class="opcao campo" data-outro-cliente hidden><input type="checkbox" name="confirma_outro_cliente"> Confirmo: é o mesmo processo, com mais de uma parte atendida pelo escritório.</label>
      </div>`,
    aoAbrir: (dialogo, form) => {
      if (!fixo) ligarCampoCliente(form, ativos);
      // "Outra…" abre o campo de texto; voltar à lista o fecha (e ele não vai junto).
      form.posicao_cliente.addEventListener('change', () => {
        const outra = form.posicao_cliente.value === POSICAO_OUTRA;
        form.querySelector('[data-posicao-outra]').hidden = !outra;
        form.posicao_outra.disabled = !outra;
        form.posicao_outra.required = outra;
        if (outra) form.posicao_outra.focus();
      });
      form.numero.addEventListener('input', () => { form.querySelector('[data-outro-cliente]').hidden = true; });
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
    aoEnviar: async (d, form) => {
      const registro = prepararProcesso(d, AREAS_JURIDICAS);
      // Mesmo CNJ em outro cliente vale (litisconsórcio), mas costuma ser
      // engano de cadastro: avisa quem já tem o número e pede confirmação.
      if (registro.numero && !d.confirma_outro_cliente) {
        const outros = await db.todos('processos', { select: 'id,cliente_id', filtros: [['numero', 'eq', registro.numero]] });
        const nomes = outros.filter((o) => o.id !== processo?.id && o.cliente_id !== registro.cliente_id)
          .map((o) => clientes.find((c) => c.id === o.cliente_id)?.nome).filter(Boolean);
        if (nomes.length) {
          form.querySelector('[data-outro-cliente]').hidden = false;
          throw new ErroCampo('confirma_outro_cliente', `Este número já está cadastrado para ${nomes.join(', ')}. Confira o número ou confirme que é o mesmo processo.`);
        }
      }
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
    posicao: c.posicao ?? '',
    documentos: ['aguardando', 'atrasado'].includes(c.documentos) ? c.documentos : '',
    busca: c.busca ?? '',
  };
  let processos = [];
  let clientes = [];
  let documentos = new Map();
  let documentosDisponiveis = false;

  // "Aguardando retorno" inclui os atrasados; "Com retorno atrasado", só eles.
  const peloRetorno = (p) => {
    if (!f.documentos) return true;
    const r = resumoDocumentos(documentos.get(p.id), hoje());
    return f.documentos === 'atrasado' ? r.atrasados > 0 : r.aguardando > 0;
  };
  // Lista vazia por causa dos filtros não é "nenhum processo cadastrado".
  const semResultado = () => (!processos.length ? 'Nenhum processo ou caso cadastrado.'
    : f.documentos === 'atrasado' ? 'Nenhum processo com retorno de documento atrasado, com esses filtros.'
      : f.documentos === 'aguardando' ? 'Nenhum processo aguardando retorno de documento, com esses filtros.'
        : 'Nenhum processo encontrado com esses filtros.');
  const mostrar = () => {
    const aviso = documentosDisponiveis ? '' : html`<p class="nota" role="status">Não foi possível carregar os documentos.
      ${f.documentos ? 'O filtro de retorno está suspenso; a lista abaixo considera os outros filtros.' : 'Os resumos de retorno estão indisponíveis.'}
      <button type="button" class="botao botao--pequeno" data-acao="recarregar-documentos">Tentar de novo</button></p>`;
    const lista = filtrarProcessos(processos, clientes, f).filter((p) => !documentosDisponiveis || peloRetorno(p));
    desenhar($('[data-lista]', ctx.raiz), html`${aviso}${tabelaProcessos(lista, clientes, {
      documentos, semResultado: documentosDisponiveis ? semResultado() : 'Nenhum processo encontrado com os demais filtros.',
    })}`);
  };

  const carregar = async () => {
    let lista;
    [processos, clientes, lista] = await Promise.all([
      db.todos('processos', { select: COLUNAS_PROCESSO, ordem: 'criado_em.desc,id.desc' }),
      db.todos('clientes', { select: COLUNAS_CLIENTE }),
      db.todos('processos_documentos', { select: COLUNAS_RESUMO_DOCUMENTOS, filtros: [['cancelado_em', 'is', null]] }).catch(() => null),
    ]);
    documentosDisponiveis = lista !== null;
    documentos = documentosPorProcesso(lista ?? []);
    if (!ctx.ativa()) return;
    const tribunais = [...new Set(processos.map((p) => p.tribunal).filter(Boolean))].sort();
    const posicoes = [...new Set(processos.map((p) => p.posicao_cliente).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    desenhar(ctx.raiz, html`
      ${cabecalho('Processos', 'Casos judiciais, administrativos, consultivos e extrajudiciais', html`
        <button type="button" class="botao botao--primario" data-acao="novo-processo">Novo processo</button>`)}
      <form class="filtros">
        <label class="campo"><span>Situação</span><select name="situacao">${opcoes([['abertos', 'Todos menos encerrados'], ['todos', 'Todos'], ...Object.entries(SITUACOES_PROCESSO)], f.situacao)}</select></label>
        <label class="campo"><span>Área</span><select name="area">${opcoes(Object.entries(AREAS_JURIDICAS), f.area, { vazio: 'Todas' })}</select></label>
        <label class="campo"><span>Responsável</span><select name="responsavel">${opcoesResponsaveis(f.responsavel, { vazio: 'Todos' })}</select></label>
        <label class="campo"><span>Tribunal</span><select name="tribunal">${opcoes(tribunais.map((t) => [t, t]), f.tribunal, { vazio: 'Todos' })}</select></label>
        <label class="campo"><span>Nosso cliente é</span><select name="posicao">${opcoes([...posicoes.map((p) => [p, p]), ['sem', 'Não informado']], f.posicao, { vazio: 'Todas as posições' })}</select></label>
        <label class="campo"><span>Retorno de documentos</span><select name="documentos">${opcoes([['aguardando', 'Aguardando retorno'], ['atrasado', 'Com retorno atrasado']], f.documentos, { vazio: 'Todos' })}</select></label>
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
    'recarregar-documentos': async (botao) => {
      botao.disabled = true;
      try {
        const lista = await db.todos('processos_documentos', { select: COLUNAS_RESUMO_DOCUMENTOS, filtros: [['cancelado_em', 'is', null]] });
        if (!ctx.ativa()) return;
        documentos = documentosPorProcesso(lista);
        documentosDisponiveis = true;
        mostrar();
      } catch (erro) { avisarErro(erro); }
      finally { botao.disabled = false; }
    },
    'novo-processo': () => depois(formularioProcesso()),
    'editar-processo': (el) => depois(formularioProcesso({ processo: processoDe(el) })),
    'historico-processo': (el) => abrirHistorico({ titulo: processoDe(el).titulo, registros: [el.dataset.id] }),
    'documentos-processo': (el) => {
      const p = processoDe(el);
      return depois(abrirDocumentosProcesso({ processo: p, clienteNome: clientes.find((x) => x.id === p.cliente_id)?.nome }));
    },
  });
}
