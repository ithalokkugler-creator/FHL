// Clientes (F2): busca sem acento e sem máscara, filtros por responsável,
// área e situação dos processos, e o cadastro completo.

import { avisarErro } from '../../nucleo/avisos.js';
import { nomeDe } from '../../nucleo/estado.js';
import { dataHora, documento, linkWhatsApp, nomeDoMes, telefone } from '../../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta, navegar } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import {
  agruparProcessos, COLUNAS_CLIENTE, COLUNAS_DETALHES, filtrarClientes, SITUACOES_PROCESSO, ultimaAlteracao,
} from '../../dominio/clientes.js';
import { contarPorMes, formatarMedia, lerPeriodo } from '../../dominio/indicadores.js';
import { AREAS_JURIDICAS, cabecalho, capitalizar, indicador, opcoes, plural, vazio } from '../comum.js';
import { barrasPorMes, ligarNumeros, painelNumeros } from '../numeros.js';
import { formularioCompleto, opcoesResponsaveis } from './formulario.js';
import { carregarProcessos } from '../clientes.js';

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
    periodo: lerPeriodo(c.periodo),
  };

  const [clientes, detalhes, processos] = await Promise.all([
    db.todos('clientes', { select: COLUNAS_CLIENTE, ordem: 'nome.asc,id.asc' }),
    db.todos('clientes_detalhes', { select: COLUNAS_DETALHES }),
    carregarProcessos(),
  ]);
  if (!ctx.ativa()) return;

  const detalheDe = new Map(detalhes.map((d) => [d.cliente_id, d]));
  const processosDe = agruparProcessos(processos);
  const etiquetas = [...new Set(detalhes.flatMap((d) => d.etiquetas ?? []))].sort();

  desenhar(ctx.raiz, html`
    ${cabecalho('Clientes', 'Cadastro, processos e tudo o que pertence a cada cliente', html`
      <button type="button" class="botao botao--primario" data-acao="novo">Novo cliente</button>`)}
    <div data-papel="numeros">${numerosClientes(clientes, f.periodo)}</div>
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
        <td data-rotulo="CPF / CNPJ" ${cliente.documento ? '' : 'data-vazio'}><span class="num">${documento(cliente.documento) || '—'}</span></td>
        <td data-rotulo="Telefone" ${cliente.telefone ? '' : 'data-vazio'}>${cliente.telefone ? html`<a class="num" href="${linkWhatsApp(cliente.telefone)}" target="_blank" rel="noopener" title="Abrir conversa no WhatsApp">${telefone(cliente.telefone)}</a>` : '—'}</td>
        <td data-rotulo="Processos abertos">${casos.filter((p) => p.situacao !== 'encerrado').length}</td>
        <td data-rotulo="Responsável" ${d?.responsavel_id ? '' : 'data-vazio'}>${nomeDe(d?.responsavel_id)}</td>
        <td data-rotulo="Atualizado em" ${ultima ? '' : 'data-vazio'}>${ultima ? dataHora(ultima) : '—'}</td>
      </tr>`;
  };

  const mostrar = () => {
    const lista = filtrarClientes(clientes, detalhes, processos, f);
    desenhar($('[data-lista]', ctx.raiz), lista.length
      ? html`
        <div class="tabela-rolagem"><table class="tabela tabela--cartoes">
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

  const caixaNumeros = $('[data-papel="numeros"]', ctx.raiz);
  const desligarNumeros = ligarNumeros(caixaNumeros, (periodo) => {
    f.periodo = periodo;
    guardarConsulta(f);
    desenhar(caixaNumeros, numerosClientes(clientes, f.periodo));
  });

  const desligarAcoes = aoClicar(ctx.raiz, {
    novo: async () => {
      try {
        const salvo = await formularioCompleto();
        if (salvo && ctx.ativa()) navegar(`/clientes/${salvo.id}`);
      } catch (erro) {
        avisarErro(erro);
      }
    },
  });
  return () => {
    desligarAcoes();
    desligarNumeros();
  };
}

/**
 * Total da carteira e novos no período (pedido de 12/11/2026). "Novo" é pela
 * data do cadastro no sistema — quem já era cliente antes de outubro de 2026
 * aparece como novo no mês em que foi cadastrado aqui.
 */
function numerosClientes(clientes, periodo) {
  const ativos = clientes.filter((c) => c.ativo).length;
  const inativos = clientes.length - ativos;
  const contagem = contarPorMes(clientes, (c) => c.criado_em, { meses: periodo });
  const mes = capitalizar(nomeDoMes(`${contagem.porMes.at(-1).mes}-01`).replace(/ de \d{4}$/, ''));
  const noPeriodo = `nos últimos ${periodo} meses`;
  return painelNumeros({
    id: 'clientes',
    titulo: 'Carteira de clientes',
    chamada: `${plural(ativos, 'cliente ativo', 'clientes ativos')} · ${mes}: ${plural(contagem.esteMes, 'novo', 'novos')}`,
    periodo,
    nota: 'Novos = cadastrados no sistema no período, de todo o escritório.',
    indicadores: html`
      ${indicador('Clientes ativos', ativos, inativos ? `${plural(inativos, 'inativo', 'inativos')} · ${clientes.length} no total` : `${clientes.length} no total`)}
      ${indicador(`Novos em ${mes.toLowerCase()}`, contagem.esteMes, 'mês atual')}
      ${periodo > 1 ? indicador(`Novos nos últimos ${periodo} meses`, contagem.total, `média de ${formatarMedia(contagem.media)} por mês`) : ''}`,
    barras: barrasPorMes(contagem, { rotulo: 'Clientes novos mês a mês' }),
  });
}
