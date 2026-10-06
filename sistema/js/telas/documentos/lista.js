// Documentos gerados — cada impressão, cada Word, cada cópia salva (F3).

import { nomeDe } from '../../nucleo/estado.js';
import { dataHora, hoje } from '../../nucleo/formato.js';
import { $, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { COLUNAS_CLIENTE, COLUNAS_PROCESSO } from '../../dominio/clientes.js';
import { COLUNAS_LISTA_DOCUMENTO } from '../../documentos/acoes.js';
import { TITULOS_MODELO } from '../../documentos/modelos.js';
import { cabecalho, opcoes, vazio } from '../comum.js';

const SITUACOES = [['ativos', 'Gerados'], ['cancelados', 'Cancelados'], ['todos', 'Todos']];
const diaValido = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? v : '');

/** Também usada na ficha do cliente, com a própria frase de lista vazia. */
export function tabelaDocumentos(docs, clientes = [], processos = [], { vazio: semDocumentos = 'Nenhum documento com esses filtros.' } = {}) {
  if (!docs.length) return vazio(semDocumentos);
  const nomes = new Map(clientes.map((c) => [c.id, c.nome]));
  const casos = new Map(processos.map((p) => [p.id, p.titulo]));
  return html`
    <div class="tabela-rolagem"><table class="tabela">
      <thead><tr><th>Gerado em</th><th>Documento</th><th>Cliente</th><th>Processo / caso</th><th>Quem gerou</th><th>Situação</th></tr></thead>
      <tbody>${docs.map((d) => html`
        <tr class="${d.cancelado_em ? 'apagada' : ''}">
          <td>${dataHora(d.criado_em)}</td>
          <td><a href="#/documentos/${d.id}">${TITULOS_MODELO[d.modelo] ?? d.titulo}</a></td>
          <td><a href="#/clientes/${d.cliente_id}">${nomes.get(d.cliente_id) ?? 'Cliente'}</a></td>
          <td>${casos.get(d.processo_id) ?? '—'}</td>
          <td>${nomeDe(d.criado_por)}</td>
          <td>${d.cancelado_em ? html`<span class="selo selo--escuro">Cancelado</span>` : html`<span class="selo selo--ok">Gerado</span>`}</td>
        </tr>`)}
      </tbody>
    </table></div>`;
}

export default async function telaDocumentos(ctx) {
  const f = {
    modelo: TITULOS_MODELO[ctx.consulta.modelo] ? ctx.consulta.modelo : '',
    cliente: ctx.consulta.cliente ?? '',
    de: diaValido(ctx.consulta.de),
    ate: diaValido(ctx.consulta.ate),
    situacao: ['todos', 'cancelados'].includes(ctx.consulta.situacao) ? ctx.consulta.situacao : 'ativos',
  };

  const [docs, clientes, processos] = await Promise.all([
    db.todos('documentos', { select: COLUNAS_LISTA_DOCUMENTO, ordem: 'criado_em.desc,id.desc' }),
    db.todos('clientes', { select: COLUNAS_CLIENTE, ordem: 'nome.asc,id.asc' }),
    db.todos('processos', { select: COLUNAS_PROCESSO }),
  ]);
  if (!ctx.ativa()) return;

  desenhar(ctx.raiz, html`
    ${cabecalho('Documentos', 'Texto final, cliente, autor e data de cada geração', html`
      <a class="botao botao--primario" href="#/documentos/novo">Gerar documento</a>`)}
    <form class="filtros">
      <label class="campo"><span>Modelo</span><select name="modelo">${opcoes(Object.entries(TITULOS_MODELO), f.modelo, { vazio: 'Todos' })}</select></label>
      <label class="campo"><span>Cliente</span><select name="cliente">${opcoes(clientes.map((c) => [c.id, c.nome]), f.cliente, { vazio: 'Todos' })}</select></label>
      <label class="campo"><span>De</span><input type="date" name="de" value="${f.de}"></label>
      <label class="campo"><span>Até</span><input type="date" name="ate" value="${f.ate}"></label>
      <label class="campo"><span>Situação</span><select name="situacao">${opcoes(SITUACOES, f.situacao)}</select></label>
    </form>
    <section class="painel" data-lista></section>`);

  // O dia de cada geração é o de Brasília, não o do carimbo em UTC.
  const mostrar = () => {
    const lista = docs.filter((d) => {
      const dia = hoje(new Date(d.criado_em));
      if (f.modelo && d.modelo !== f.modelo) return false;
      if (f.cliente && d.cliente_id !== f.cliente) return false;
      if ((f.de && dia < f.de) || (f.ate && dia > f.ate)) return false;
      if (f.situacao === 'todos') return true;
      return f.situacao === 'cancelados' ? Boolean(d.cancelado_em) : !d.cancelado_em;
    });
    desenhar($('[data-lista]', ctx.raiz), tabelaDocumentos(lista, clientes, processos));
  };

  const form = $('form', ctx.raiz);
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', () => {
    Object.assign(f, Object.fromEntries(new FormData(form)));
    guardarConsulta(f);
    mostrar();
  });
  mostrar();
}
