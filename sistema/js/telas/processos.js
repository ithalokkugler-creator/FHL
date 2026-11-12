// Processos e casos (F2). Número CNJ com dígito verificador conferido aqui e
// no banco; caso consultivo ou extrajudicial pode ficar sem número, com uma
// referência. O mesmo número pode servir a clientes diferentes, nunca duas
// vezes ao mesmo cliente. Cada processo tem os documentos solicitados e
// entregues (22/10), com o retorno previsto — telas/documentos-processo.js.
//
// 12/11/2026: vários clientes no mesmo processo. O cliente do processo é o
// principal; "Adicionar mais partes representadas" acrescenta outros (os
// herdeiros de um inventário), cada um com a sua condição. Processo e partes
// se gravam juntos (salvar_processo) e o processo aparece na ficha de todos.

import { avisar, avisarErro } from '../nucleo/avisos.js';
import { abrirDialogo } from '../nucleo/dialogo.js';
import { ErroCampo } from '../nucleo/formularios.js';
import { nomeDe } from '../nucleo/estado.js';
import { dataHora, hoje, nomeDoMes, numeroCnj, numeroCnjValido, tribunalDoNumero } from '../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../nucleo/html.js';
import { guardarConsulta } from '../nucleo/rotas.js';
import { db } from '../nucleo/supabase.js';
import {
  clientesDoProcesso, COLUNAS_CLIENTE, filtrarProcessos, POSICAO_OUTRA, POSICOES_CLIENTE, posicaoConhecida, posicaoNoProcesso,
  prepararProcesso, SITUACOES_PROCESSO,
} from '../dominio/clientes.js';
import { AREAS_JURIDICAS, cabecalho, capitalizar, indicador, opcoes, plural, vazio } from './comum.js';
import { contarPorMes, contarSituacoes, formatarMedia, lerPeriodo } from '../dominio/indicadores.js';
import { barrasPorMes, ligarNumeros, painelNumeros } from './numeros.js';
import { campoCliente, carregarProcessos, definirCliente, ligarCampoCliente } from './clientes.js';
import { opcoesResponsaveis } from './clientes/formulario.js';
import { abrirHistorico } from './historico.js';
import {
  abrirDocumentosProcesso, COLUNAS_RESUMO_DOCUMENTOS, documentosPorProcesso, resumoNaTabela,
} from './documentos-processo.js';
import { resumoDocumentos } from '../dominio/documentos-processo.js';

const TONS = { encerrado: 'escuro', em_andamento: 'ok' };

/** As opções de posição: as do Projudi/PJe por polo, as do inventário e "Outra…". */
const opcoesPosicao = (atual, { vazio: rotuloVazio = 'Não informado' } = {}) => {
  const outra = Boolean(atual) && !posicaoConhecida(atual);
  return html`
    <option value="">${rotuloVazio}</option>
    ${POSICOES_CLIENTE.map(([grupo, lista]) => html`
      <optgroup label="${grupo}">${lista.map((p) => html`<option value="${p}" ${p === atual ? 'selected' : ''}>${p}</option>`)}</optgroup>`)}
    <option value="${POSICAO_OUTRA}" ${outra ? 'selected' : ''}>Outra…</option>`;
};

/** "Nosso cliente é": as posições usuais por polo e "Outra…" com texto livre. */
function campoPosicao(atual) {
  const outra = Boolean(atual) && !posicaoConhecida(atual);
  return html`
    <label class="campo campo--6"><span>Nosso cliente é</span>
      <select name="posicao_cliente">${opcoesPosicao(atual)}</select>
      <span class="campo__ajuda">Como o cliente aparece neste processo: autor, réu, exequente, inventariante…</span></label>
    <label class="campo campo--6" data-posicao-outra ${outra ? '' : 'hidden'}><span>Qual posição?</span>
      <input name="posicao_outra" value="${outra ? atual : ''}" maxlength="60" placeholder="Ex.: Vítima, Cessionário" ${outra ? 'required' : 'disabled'}></label>`;
}
export const seloProcesso = (situacao) => html`<span class="selo selo--${TONS[situacao] ?? 'alerta'}">${SITUACOES_PROCESSO[situacao] ?? situacao}</span>`;

/** As outras partes de um processo: "Herdeira Um (Herdeiro(a)), Herdeiro Dois". */
function outrasPartes(p, nomes, menos = null) {
  const lista = clientesDoProcesso(p).filter((id) => id !== menos)
    .map((id) => ({ id, nome: nomes.get(id) ?? 'Cliente', posicao: posicaoNoProcesso(p, id) }));
  return lista;
}

/**
 * Também usada na ficha do cliente, sem a coluna Cliente. `documentos`: os
 * documentos de cada processo (documentosPorProcesso), para o resumo.
 * `clienteDaFicha`: na ficha, a condição dessa pessoa e quem mais está no
 * processo (`clientes` traz os nomes).
 */
export function tabelaProcessos(processos, clientes = [], {
  mostrarCliente = true, documentos = new Map(), clienteDaFicha = null, semResultado = 'Nenhum processo ou caso cadastrado.',
} = {}) {
  if (!processos.length) return vazio(semResultado);
  const nomes = new Map(clientes.map((c) => [c.id, c.nome]));
  const dia = hoje();
  return html`
    <div class="tabela-rolagem"><table class="tabela tabela--processos tabela--cartoes">
      <thead><tr>
        <th>Processo / caso</th>${mostrarCliente ? html`<th>Clientes</th>` : ''}<th>Área</th><th>Tribunal / órgão</th>
        <th>Responsável</th><th>Situação</th><th>Última atualização</th><th>Ações</th>
      </tr></thead>
      <tbody>${processos.map((p) => {
        const posicao = clienteDaFicha ? posicaoNoProcesso(p, clienteDaFicha) : p.posicao_cliente;
        const conjunto = clienteDaFicha ? outrasPartes(p, nomes, clienteDaFicha) : [];
        const partes = outrasPartes(p, nomes, p.cliente_id);
        return html`
        <tr>
          <td><strong>${p.titulo}</strong><span class="sub num">${p.numero ? numeroCnj(p.numero) : p.referencia || 'Sem número judicial'}</span>
            ${posicao ? html`<span class="sub">${clienteDaFicha ? 'Este cliente' : 'Nosso cliente'}: <strong>${posicao}</strong></span>` : ''}
            ${conjunto.length ? html`<span class="sub processo-conjunto">Em conjunto com ${conjunto.map((x, i) => html`${i ? ', ' : ''}<a href="#/clientes/${x.id}">${x.nome}</a>${x.posicao ? ` (${x.posicao})` : ''}`)}</span>` : ''}
            ${resumoNaTabela(documentos.get(p.id), dia, p.id)}</td>
          ${mostrarCliente ? html`<td data-rotulo="Clientes"><span class="celula">
            <a href="#/clientes/${p.cliente_id}">${nomes.get(p.cliente_id) ?? 'Cliente'}</a>
            ${partes.length ? html`<span class="sub processo-partes">+ ${partes.map((x, i) => html`${i ? ', ' : ''}<a href="#/clientes/${x.id}">${x.nome}</a>${x.posicao ? ` (${x.posicao})` : ''}`)}</span>` : ''}
          </span></td>` : ''}
          <td data-rotulo="Área">${AREAS_JURIDICAS[p.area]}</td>
          <td data-rotulo="Tribunal / órgão" ${p.tribunal || p.orgao ? '' : 'data-vazio'}><span class="celula">${p.tribunal ?? '—'}<span class="sub">${p.orgao ?? ''}</span></span></td>
          <td data-rotulo="Responsável" ${p.responsavel_id ? '' : 'data-vazio'}>${nomeDe(p.responsavel_id)}</td>
          <td data-rotulo="Situação"><span class="celula">${seloProcesso(p.situacao)}</span></td>
          <td data-rotulo="Atualizado em">${p.alterado_em || p.criado_em ? dataHora(p.alterado_em || p.criado_em) : '—'}</td>
          <td class="cartao-acoes"><div class="registro-acoes">
            <button type="button" class="botao botao--pequeno" data-acao="editar-processo" data-id="${p.id}" aria-label="Editar — ${p.titulo}">Editar</button>
            <button type="button" class="botao botao--pequeno" data-acao="documentos-processo" data-id="${p.id}" aria-label="Documentos — ${p.titulo}">Documentos</button>
            <button type="button" class="botao botao--pequeno botao--discreto" data-acao="historico-processo" data-id="${p.id}" aria-label="Histórico — ${p.titulo}">Histórico</button>
          </div></td>
        </tr>`;
      })}
      </tbody>
    </table></div>`;
}

/** O histórico do processo inclui o das partes — também as já retiradas, que
 *  não vêm na lista do processo: entrada, condição e retirada com o motivo. */
export async function abrirHistoricoProcesso(p) {
  const partes = await db.todos('processos_partes', { select: 'id', filtros: [['processo_id', 'eq', p.id]] })
    .catch(() => p.partes ?? []);
  return abrirHistorico({ titulo: p.titulo, registros: [p.id, ...partes.map((x) => x.id)] });
}

// ---------------------------------------------------------------------------
// Partes representadas no formulário (12/11/2026)
// ---------------------------------------------------------------------------

let numeroParte = 0;

/** A condição da parte: a lista e, em "Outra…", o texto. */
const posicaoDaParte = (atual) => {
  const outra = Boolean(atual) && !posicaoConhecida(atual);
  return html`
    <select class="parte__posicao" aria-label="Condição no processo">${opcoesPosicao(atual, { vazio: 'Condição não informada' })}</select>
    <input class="parte__outra" value="${outra ? atual : ''}" maxlength="60" placeholder="Qual condição?" aria-label="Qual condição?" ${outra ? '' : 'hidden disabled'}>`;
};

/** Parte já gravada: o nome, a condição, e "Retirar" (pede o motivo ao salvar). */
const parteGravada = (x, nome) => html`
  <li class="parte" data-parte data-id="${x.id}" data-cliente="${x.cliente_id}">
    <div class="parte__linha">
      <strong class="parte__nome">${nome}</strong>
      ${posicaoDaParte(x.posicao)}
      <button type="button" class="botao botao--pequeno botao--discreto" data-retirar-parte>Retirar</button>
    </div>
    <div class="parte__retirada" hidden>
      <label class="parte__motivo"><span>Motivo da retirada</span><input class="parte__motivo-texto" maxlength="500" placeholder="Ex.: renunciou à herança; cadastrado por engano" disabled></label>
      <button type="button" class="botao botao--pequeno" data-desfazer-retirada>Desfazer</button>
    </div>
  </li>`;

/** Parte nova: escolher o cliente (ou cadastrar com "Novo") e a condição. */
const parteNova = (clientes, nome) => html`
  <li class="parte parte--nova" data-parte data-nova="${nome}">
    ${campoCliente(clientes, { rotulo: 'Cliente representado', nome, classe: 'parte__cliente' })}
    <div class="parte__linha">
      ${posicaoDaParte('')}
      <button type="button" class="botao botao--pequeno botao--discreto" data-remover-parte>Remover</button>
    </div>
  </li>`;

/** O que o formulário diz das partes: as que ficam/entram e as que saem. */
function lerPartes(form) {
  const partes = [];
  const remover = [];
  for (const li of form.querySelectorAll('[data-parte]')) {
    const select = li.querySelector('.parte__posicao');
    const outra = li.querySelector('.parte__outra');
    const posicao = select.value === POSICAO_OUTRA ? outra.value.trim() : select.value;
    if (select.value === POSICAO_OUTRA && !posicao) throw new ErroCampo(null, 'Escreva a condição da parte, ou escolha da lista.');
    if (posicao.length > 60) throw new ErroCampo(null, 'A condição pode ter até 60 letras.');
    if (li.dataset.id) {
      if (li.classList.contains('parte--retirada')) {
        const motivo = li.querySelector('.parte__motivo-texto').value.trim();
        if (!motivo) throw new ErroCampo(null, `Informe o motivo de retirar ${li.querySelector('.parte__nome').textContent} do processo.`);
        remover.push({ id: li.dataset.id, motivo });
      } else {
        partes.push({ id: li.dataset.id, cliente_id: li.dataset.cliente, posicao: posicao || null });
      }
    } else {
      const clienteId = form.elements[`${li.dataset.nova}_id`]?.value;
      if (!clienteId) throw new ErroCampo(`${li.dataset.nova}_texto`, 'Escolha o cliente da parte (ou cadastre com Novo), ou remova a linha.');
      partes.push({ cliente_id: clienteId, posicao: posicao || null });
    }
  }
  return { partes, remover };
}

/** Novo processo (com ou sem cliente já escolhido) ou edição. O cliente
 *  principal de um processo existente não muda: o vínculo é fixo, o banco nem
 *  aceita. `novaParte`: já abre com esse cliente como parte a acrescentar. */
export async function formularioProcesso({ cliente_id = null, processo = null, novaParte = null } = {}) {
  const p = processo ?? { situacao: 'em_andamento', cliente_id };
  const clientes = await db.todos('clientes', { select: COLUNAS_CLIENTE, ordem: 'nome.asc,id.asc' });
  const fixo = p.cliente_id ? clientes.find((c) => c.id === p.cliente_id) : null;
  if (p.cliente_id && !fixo) throw new Error('Cliente não encontrado.');
  const ativos = clientes.filter((c) => c.ativo);
  const nomes = new Map(clientes.map((c) => [c.id, c.nome]));
  const novas = [];
  const partesHtml = () => html`
    ${(p.partes ?? []).map((x) => parteGravada(x, nomes.get(x.cliente_id) ?? 'Cliente'))}
    ${novaParte ? (() => { const nome = `parte_${++numeroParte}`; novas.push({ nome, atual: novaParte }); return parteNova(ativos, nome); })() : ''}`;
  let juntar = null;

  const resultado = await abrirDialogo({
    titulo: processo ? 'Editar processo / caso' : 'Novo processo / caso',
    largo: true,
    rotuloOk: processo ? 'Salvar processo' : 'Cadastrar processo',
    corpo: html`
      <div class="campos">
        ${fixo
          ? html`<label class="campo"><span>Cliente principal</span><input value="${fixo.nome}" readonly><input type="hidden" name="cliente_id" value="${fixo.id}"></label>`
          : campoCliente(ativos, { rotulo: 'Cliente principal' })}
        <label class="campo campo--6"><span>Número CNJ (opcional)</span>
          <input name="numero" value="${numeroCnj(p.numero)}" maxlength="25" placeholder="0000000-00.0000.0.00.0000">
          <span class="campo__ajuda">Caso consultivo ou extrajudicial pode ficar sem número.</span></label>
        <label class="campo campo--6"><span>Referência / protocolo</span><input name="referencia" value="${p.referencia ?? ''}" maxlength="200"></label>
        <label class="campo"><span>Título do processo ou caso</span><input name="titulo" value="${p.titulo ?? ''}" required maxlength="200"></label>
        ${campoPosicao(p.posicao_cliente)}
        <fieldset class="fieldset partes" data-papel="partes">
          <legend>Outras partes representadas</legend>
          <p class="campo__ajuda">Quando o escritório representa mais de uma pessoa no mesmo processo — os herdeiros de um inventário,
            por exemplo. Cada uma continua com o seu cadastro, e o processo aparece na ficha de todas.</p>
          <ul class="partes__lista" data-partes>${partesHtml()}</ul>
          <p><button type="button" class="botao botao--pequeno" data-adicionar-parte>Adicionar mais partes representadas</button></p>
        </fieldset>
        <label class="campo campo--6"><span>Área jurídica</span><select name="area" required>${opcoes(Object.entries(AREAS_JURIDICAS), p.area, { vazio: 'Escolha a área' })}</select></label>
        <label class="campo campo--6"><span>Situação</span><select name="situacao">${opcoes(Object.entries(SITUACOES_PROCESSO), p.situacao)}</select></label>
        <label class="campo campo--6"><span>Tribunal</span><input name="tribunal" value="${p.tribunal ?? ''}" maxlength="100" placeholder="TJPR, TRT9, TRF4…"></label>
        <label class="campo campo--6"><span>Órgão / vara</span><input name="orgao" value="${p.orgao ?? ''}" maxlength="200"></label>
        <label class="campo"><span>Responsável</span><select name="responsavel_id">${opcoesResponsaveis(p.responsavel_id)}</select></label>
        <label class="campo"><span>Observações</span><textarea name="observacoes" rows="3" maxlength="5000">${p.observacoes ?? ''}</textarea></label>
        <div class="campo" data-outro-cliente hidden>
          <p class="nota" data-outro-texto></p>
          <p class="grupo-botoes secao--curta">
            <button type="button" class="botao botao--primario" data-juntar hidden>Acrescentar como parte do processo que já existe</button>
          </p>
          <label class="opcao"><input type="checkbox" name="confirma_outro_cliente"> Não: é outro cadastro do mesmo processo, separado (cada cliente com o seu).</label>
        </div>
      </div>`,
    aoAbrir: (dialogo, form, fechar) => {
      if (!fixo) ligarCampoCliente(form, ativos);
      for (const nova of novas) {
        ligarCampoCliente(form, ativos, { nome: nova.nome });
        const cliente = clientes.find((c) => c.id === nova.atual);
        if (cliente) definirCliente(form, cliente, nova.nome);
      }
      // "Outra…" abre o campo de texto; voltar à lista o fecha (e ele não vai junto).
      form.posicao_cliente.addEventListener('change', () => {
        const outra = form.posicao_cliente.value === POSICAO_OUTRA;
        form.querySelector('[data-posicao-outra]').hidden = !outra;
        form.posicao_outra.disabled = !outra;
        form.posicao_outra.required = outra;
        if (outra) form.posicao_outra.focus();
      });

      // As partes: acrescentar, remover a nova, retirar a gravada (com motivo) e desfazer.
      const lista = $('[data-partes]', dialogo);
      dialogo.addEventListener('change', (e) => {
        if (!e.target.matches('.parte__posicao')) return;
        const outra = e.target.closest('[data-parte]').querySelector('.parte__outra');
        const sim = e.target.value === POSICAO_OUTRA;
        outra.hidden = !sim;
        outra.disabled = !sim;
        if (sim) outra.focus();
      });
      dialogo.addEventListener('click', (e) => {
        if (e.target.closest('[data-adicionar-parte]')) {
          const nome = `parte_${++numeroParte}`;
          lista.insertAdjacentHTML('beforeend', String(parteNova(ativos, nome)));
          ligarCampoCliente(form, ativos, { nome });
          form.elements[`${nome}_texto`].focus();
          return;
        }
        const remover = e.target.closest('[data-remover-parte]');
        if (remover) {
          remover.closest('[data-parte]').remove();
          return;
        }
        const retirar = e.target.closest('[data-retirar-parte]');
        const desfazer = e.target.closest('[data-desfazer-retirada]');
        if (retirar || desfazer) {
          const li = (retirar ?? desfazer).closest('[data-parte]');
          const sai = Boolean(retirar);
          li.classList.toggle('parte--retirada', sai);
          li.querySelector('.parte__retirada').hidden = !sai;
          const motivo = li.querySelector('.parte__motivo-texto');
          motivo.disabled = !sai;
          motivo.required = sai;
          li.querySelector('.parte__posicao').disabled = sai;
          if (sai) motivo.focus();
        }
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
      // Mesmo número já cadastrado (processo novo): acrescentar este cliente como parte dele.
      $('[data-juntar]', dialogo).addEventListener('click', () => {
        if (juntar) fechar({ juntar });
      });
      form.titulo.focus();
    },
    aoEnviar: async (d, form) => {
      const registro = prepararProcesso(d, AREAS_JURIDICAS);
      const { partes, remover } = lerPartes(form);
      const vistos = new Set();
      for (const x of partes) {
        if (x.cliente_id === registro.cliente_id) throw new ErroCampo(null, `${nomes.get(x.cliente_id) ?? 'Este cliente'} já é o cliente principal do processo.`);
        if (vistos.has(x.cliente_id)) throw new ErroCampo(null, `${nomes.get(x.cliente_id) ?? 'Um cliente'} aparece duas vezes nas partes.`);
        vistos.add(x.cliente_id);
      }
      // Mesmo CNJ em outro cliente: o mais comum é ser o mesmo processo — aí o
      // certo é acrescentar a pessoa como parte (12/11/2026), não duplicar.
      if (registro.numero && !d.confirma_outro_cliente) {
        const outros = (await carregarProcessos({ filtros: [['numero', 'eq', registro.numero]] }))
          .filter((o) => o.id !== processo?.id && !clientesDoProcesso(o).includes(registro.cliente_id));
        if (outros.length) {
          const quem = [...new Set(outros.flatMap((o) => clientesDoProcesso(o)).map((id) => nomes.get(id)).filter(Boolean))];
          form.querySelector('[data-outro-cliente]').hidden = false;
          const podeJuntar = !processo && outros.length === 1;
          juntar = podeJuntar ? { processo: outros[0], cliente_id: registro.cliente_id } : null;
          form.querySelector('[data-juntar]').hidden = !podeJuntar;
          form.querySelector('[data-outro-texto]').textContent = `Este número já está cadastrado (${quem.join(', ')}).${podeJuntar
            ? ' Se é o mesmo processo, acrescente este cliente como parte dele: assim o processo fica um só, na ficha de todos.' : ''}`;
          throw new ErroCampo('confirma_outro_cliente', 'Confira o número: acrescente o cliente ao processo existente, ou confirme que é um cadastro separado.');
        }
      }
      let id;
      try {
        id = await db.rpc('salvar_processo', { p: { ...registro, id: processo?.id ?? null, partes, remover } });
      } catch (erro) {
        if (erro.codigo === '23505') throw new Error('Este cliente já está vinculado a esse número CNJ. Edite o processo existente.');
        throw erro;
      }
      avisar(processo ? 'Processo salvo.' : 'Processo cadastrado.');
      return { id };
    },
  });

  // "Acrescentar como parte": abre o processo que já existe, com o cliente na lista de partes.
  if (resultado?.juntar) {
    return formularioProcesso({ processo: resultado.juntar.processo, novaParte: resultado.juntar.cliente_id });
  }
  return resultado;
}

export default async function telaProcessos(ctx) {
  const c = ctx.consulta;
  const f = {
    situacao: ['abertos', 'ativos', 'todos', ...Object.keys(SITUACOES_PROCESSO)].includes(c.situacao) ? c.situacao : 'abertos',
    area: AREAS_JURIDICAS[c.area] ? c.area : '',
    responsavel: c.responsavel ?? '',
    tribunal: c.tribunal ?? '',
    posicao: c.posicao ?? '',
    documentos: ['aguardando', 'atrasado'].includes(c.documentos) ? c.documentos : '',
    busca: c.busca ?? '',
    periodo: lerPeriodo(c.periodo),
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
      carregarProcessos({ ordem: 'criado_em.desc,id.desc' }),
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
      <div data-papel="numeros">${numerosProcessos(processos, f.periodo)}</div>
      <form class="filtros">
        <label class="campo"><span>Situação</span><select name="situacao">${opcoes([['abertos', 'Todos menos encerrados'], ['ativos', 'Ativos (sem suspensos e encerrados)'], ['todos', 'Todos'], ...Object.entries(SITUACOES_PROCESSO)], f.situacao)}</select></label>
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

  // O seletor de período só redesenha os números; `carregar` desenha a tela
  // inteira (e os números) de novo.
  const desligarNumeros = ligarNumeros(ctx.raiz, (periodo) => {
    f.periodo = periodo;
    guardarConsulta(f);
    desenhar($('[data-papel="numeros"]', ctx.raiz), numerosProcessos(processos, f.periodo));
  });

  const processoDe = (el) => processos.find((p) => p.id === el.dataset.id);
  const depois = async (promessa) => {
    try {
      if (await promessa && ctx.ativa()) await carregar();
    } catch (erro) {
      avisarErro(erro);
    }
  };
  const desligarAcoes = aoClicar(ctx.raiz, {
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
    'historico-processo': (el) => abrirHistoricoProcesso(processoDe(el)).catch(avisarErro),
    'documentos-processo': (el) => {
      const p = processoDe(el);
      return depois(abrirDocumentosProcesso({ processo: p, clienteNome: clientes.find((x) => x.id === p.cliente_id)?.nome }));
    },
  });
  return () => {
    desligarAcoes();
    desligarNumeros();
  };
}

/**
 * Total, ativos, suspensos, encerrados e novos (pedido de 12/11/2026), do
 * escritório inteiro. "Novo" é pela data do cadastro no sistema.
 */
function numerosProcessos(processos, periodo) {
  const s = contarSituacoes(processos);
  const contagem = contarPorMes(processos, (p) => p.criado_em, { meses: periodo });
  const mes = capitalizar(nomeDoMes(`${contagem.porMes.at(-1).mes}-01`).replace(/ de \d{4}$/, ''));
  const quebra = Object.entries(SITUACOES_PROCESSO)
    .filter(([v]) => !['suspenso', 'encerrado'].includes(v) && s.porSituacao[v])
    .map(([v, rotulo]) => `${s.porSituacao[v]} ${rotulo.toLowerCase()}`).join(' · ');
  return painelNumeros({
    id: 'processos',
    titulo: 'Processos e casos',
    chamada: `${plural(s.ativos, 'ativo', 'ativos')} · ${plural(s.suspensos, 'suspenso', 'suspensos')} · ${plural(s.encerrados, 'encerrado', 'encerrados')} · ${mes}: ${plural(contagem.esteMes, 'novo', 'novos')}`,
    periodo,
    nota: 'De todo o escritório (não muda com os filtros da lista). Novos = cadastrados no sistema no período.',
    indicadores: html`
      ${indicador('Cadastrados', s.total, 'no total', { href: '#/processos?situacao=todos' })}
      ${indicador('Ativos', s.ativos, quebra || 'sem suspensos e encerrados', { tom: 'ok', href: '#/processos?situacao=ativos' })}
      ${indicador('Suspensos', s.suspensos, '', { tom: s.suspensos ? 'alerta' : '', href: '#/processos?situacao=suspenso' })}
      ${indicador('Encerrados', s.encerrados, '', { href: '#/processos?situacao=encerrado' })}
      ${indicador(`Novos em ${mes.toLowerCase()}`, contagem.esteMes, periodo > 1 ? `${contagem.total} em ${periodo} meses · média de ${formatarMedia(contagem.media)}/mês` : 'mês atual')}`,
    barras: barrasPorMes(contagem, { rotulo: 'Processos cadastrados mês a mês' }),
  });
}
