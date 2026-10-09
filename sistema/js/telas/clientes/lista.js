// Clientes (F2): busca sem acento e sem máscara, filtros por responsável,
// área e situação dos processos, e o cadastro completo.

import { avisarErro } from '../../nucleo/avisos.js';
import { nomeDe } from '../../nucleo/estado.js';
import { dataHora, documento, linkWhatsApp, telefone } from '../../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta, navegar } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import {
  agruparProcessos, COLUNAS_CLIENTE, COLUNAS_DETALHES, COLUNAS_PROCESSO, filtrarClientes, SITUACOES_PROCESSO, ultimaAlteracao,
} from '../../dominio/clientes.js';
import { AREAS_JURIDICAS, cabecalho, opcoes, vazio } from '../comum.js';
import { formularioCompleto, opcoesResponsaveis } from './formulario.js';

export default async function telaClientes(ctx) {
  const c = ctx.consulta;
  const f = {
    busca: c.busca ?? '',
    ativo: ['ativos', 'inativos', 'todos'].includes(c.ativo) ? c.ativo : 'ativos',
    area: AREAS_JURIDICAS[c.area] ? c.area : '',
    situacao: SITUACOES_PROCESSO[c.situacao] ? c.situacao : '',
    responsavel: c.responsavel ?? '',
    representante: ['sim', 'nao'].includes(c.representante) ? c.representante : '',
    etiqueta: c.etiqueta ?? '',
  };

  const [clientes, detalhes, processos] = await Promise.all([
    db.todos('clientes', { select: COLUNAS_CLIENTE, ordem: 'nome.asc,id.asc' }),
    db.todos('clientes_detalhes', { select: COLUNAS_DETALHES }),
    db.todos('processos', { select: COLUNAS_PROCESSO }),
  ]);
  if (!ctx.ativa()) return;

  const detalheDe = new Map(detalhes.map((d) => [d.cliente_id, d]));
  const processosDe = agruparProcessos(processos);
  const etiquetas = [...new Set(detalhes.flatMap((d) => d.etiquetas ?? []))].sort();

  desenhar(ctx.raiz, html`
    ${cabecalho('Clientes', 'Cadastro, processos e tudo o que pertence a cada cliente', html`
      <button type="button" class="botao botao--primario" data-acao="novo">Novo cliente</button>`)}
    <form class="filtros">
      <label class="campo campo--busca"><span>Buscar</span><input type="search" name="busca" value="${f.busca}" placeholder="Nome, nome fantasia, documento, telefone, etiqueta ou processo"></label>
      ${etiquetas.length ? html`<label class="campo"><span>Etiqueta</span><select name="etiqueta">${opcoes(etiquetas.map((e) => [e, e]), f.etiqueta, { vazio: 'Todas' })}</select></label>` : ''}
      <label class="campo"><span>Responsável</span><select name="responsavel">${opcoesResponsaveis(f.responsavel, { vazio: 'Todos' })}</select></label>
      <label class="campo"><span>Área</span><select name="area">${opcoes(Object.entries(AREAS_JURIDICAS), f.area, { vazio: 'Todas' })}</select></label>
      <label class="campo"><span>Situação do processo</span><select name="situacao">${opcoes(Object.entries(SITUACOES_PROCESSO), f.situacao, { vazio: 'Todas' })}</select></label>
      <label class="campo"><span>Representante legal</span><select name="representante">${opcoes([['', 'Todos'], ['sim', 'Com representante'], ['nao', 'Sem representante']], f.representante)}</select></label>
      <label class="campo"><span>Cadastro</span><select name="ativo">${opcoes([['ativos', 'Ativos'], ['inativos', 'Inativos'], ['todos', 'Todos']], f.ativo)}</select></label>
    </form>
    <section class="painel" data-lista></section>`);

  const linha = (cliente) => {
    const d = detalheDe.get(cliente.id);
    const casos = processosDe.get(cliente.id) ?? [];
    const ultima = ultimaAlteracao(cliente, d, casos);
    return html`
      <tr class="${cliente.ativo ? '' : 'apagada'}">
        <td><a href="#/clientes/${cliente.id}"><strong>${cliente.nome}</strong></a>
          <span class="sub">${[d?.nome_fantasia, cliente.email].filter(Boolean).join(' · ')}${cliente.ativo ? '' : ' · Inativo'}</span>
          ${d?.etiquetas?.length ? html`<span class="etiquetas">${d.etiquetas.map((e) => html`<span class="etiqueta">${e}</span>`)}</span>` : ''}</td>
        <td><span class="num">${documento(cliente.documento) || '—'}</span></td>
        <td>${cliente.telefone ? html`<a class="num" href="${linkWhatsApp(cliente.telefone)}" target="_blank" rel="noopener">${telefone(cliente.telefone)}</a>` : '—'}</td>
        <td>${casos.filter((p) => p.situacao !== 'encerrado').length}</td>
        <td>${nomeDe(d?.responsavel_id)}</td>
        <td>${ultima ? dataHora(ultima) : '—'}</td>
      </tr>`;
  };

  const mostrar = () => {
    const lista = filtrarClientes(clientes, detalhes, processos, f);
    desenhar($('[data-lista]', ctx.raiz), lista.length
      ? html`
        <div class="tabela-rolagem"><table class="tabela">
          <thead><tr><th>Cliente</th><th>CPF / CNPJ</th><th>Telefone</th><th>Processos abertos</th><th>Responsável</th><th>Última atualização</th></tr></thead>
          <tbody>${lista.map(linha)}</tbody>
        </table></div>`
      : vazio('Nenhum cliente com esses filtros.'));
  };

  const form = $('form.filtros', ctx.raiz);
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', () => {
    Object.assign(f, Object.fromEntries(new FormData(form)));
    guardarConsulta(f);
    mostrar();
  });
  mostrar();

  return aoClicar(ctx.raiz, {
    novo: async () => {
      try {
        const salvo = await formularioCompleto();
        if (salvo && ctx.ativa()) navegar(`/clientes/${salvo.id}`);
      } catch (erro) {
        avisarErro(erro);
      }
    },
  });
}
