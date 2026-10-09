// Histórico — quem fez o quê e quando (preparação 5.3).
// =====================================================
//
// Duas formas: a tela do administrador (e de quem tem acesso de auditoria),
// com tudo, e o diálogo "Histórico" que cada registro abre. O diálogo mostra
// só o que a política da tabela auditoria deixa a pessoa ver — a mesma
// permissão do módulo.

import { avisarErro } from '../nucleo/avisos.js';
import { abrirDialogo } from '../nucleo/dialogo.js';
import { estado, nomeDe } from '../nucleo/estado.js';
import { data, dataHora, hoje, instante, somarDias } from '../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../nucleo/html.js';
import { guardarConsulta } from '../nucleo/rotas.js';
import { db } from '../nucleo/supabase.js';
import { ESTADOS_CIVIS, SITUACOES_PROCESSO, TIPOS_PESSOA } from '../dominio/clientes.js';
import { PRIORIDADES } from '../dominio/tarefas.js';
import { TIPOS_ATUALIZACAO } from '../dominio/tempo.js';
import {
  AREAS_JURIDICAS, CANAIS, CANAIS_CONTATO, TIPOS_AVULSA, TIPOS_COMPROMISSO, TIPOS_HONORARIO,
  cabecalho, paginacao, rotuloSituacao, vazio,
} from './comum.js';

const POR_PAGINA = 200;

const TABELAS = {
  contratos: 'Contrato',
  parcelas: 'Parcela',
  recebimentos: 'Recebimento',
  renegociacoes: 'Renegociação',
  ajustes_financeiros: 'Desconto / acréscimo',
  cobrancas: 'Cobrança',
  contas: 'Despesa',
  pagamentos_despesa: 'Pagamento de despesa',
  contas_recorrentes: 'Despesa recorrente',
  fornecedores: 'Fornecedor',
  centros_custo: 'Centro de custo',
  contas_financeiras: 'Conta financeira',
  transferencias_financeiras: 'Transferência entre contas',
  fechamentos: 'Fechamento do mês',
  fechamentos_anuais: 'Fechamento do ano',
  fechamentos_anuais_versoes: 'Versão do fechamento do ano',
  eventos_alerta: 'Alerta registrado',
  alertas_estado: 'Leitura de alerta',
  backups_execucoes: 'Cópia de segurança',
  anexos: 'Anexo',
  anexos_versoes: 'Versão de anexo',
  importacoes: 'Importação de planilha',
  importacao_linhas: 'Linha importada',
  exportacoes: 'Exportação',
  clientes: 'Cliente',
  clientes_detalhes: 'Dados completos do cliente',
  clientes_contatos: 'Contato do cliente',
  processos: 'Processo / caso',
  contatos: 'Contato',
  documentos: 'Documento',
  atualizacoes: 'Atualização',
  tarefas: 'Tarefa / prazo',
  feriados: 'Feriado / suspensão',
  intimacoes: 'Intimação',
  intimacoes_consultas: 'Consulta ao diário',
  membros: 'Membro',
  compromissos: 'Compromisso',
  categorias: 'Categoria',
  formas_pagamento: 'Forma de pagamento',
  divisao_cotas: 'Divisão entre sócios',
  config_financeiro: 'Configuração do Financeiro',
  config_agenda: 'Configuração da Agenda',
  config_prazos: 'Configuração de prazos',
  config_seguranca: 'Configuração de segurança',
  convites_acesso: 'Convite de acesso',
  solicitacoes_titular: 'Pedido de titular (LGPD)',
  publicacoes: 'Publicação do site',
  campanhas: 'Campanha do site',
  site_deploys: 'Publicação do site no ar',
};

const ACOES = {
  criou: 'criou',
  alterou: 'alterou',
  cancelou: 'cancelou',
  estornou: 'estornou',
  desativou: 'desativou',
  reativou: 'reativou',
  fechou: 'fechou',
  reabriu: 'reabriu',
  migrou: 'converteu (migração)',
};

const CAMPOS = {
  prioridade:'prioridade', ato:'ato', contagem:'contagem', base_em:'publicação / intimação',
  quantidade:'quantidade', recesso:'suspensão no recesso', concluida_por:'concluída por',
  conferida_por:'conferida por', disponibilizada_em:'disponibilização / recebimento',
  publicada_em:'publicação', intimacao_id:'intimação de origem', texto:'teor',
  tipo_pessoa: 'tipo de pessoa', flexao: 'concordância nos documentos', rg: 'RG / inscrição estadual',
  nascimento: 'nascimento / constituição', recado_nome: 'nome para recados', recado_relacao: 'relação / parentesco',
  recado_telefone: 'telefone para recados', recado_observacao: 'observação para recados',
  representante_nome: 'nome do representante', representante_documento: 'CPF / CNPJ do representante',
  representante_relacao: 'relação com o cliente', representante_qualificacao: 'qualificação do representante',
  situacao: 'situação',
  observacoes: 'observações',
  recebido_em: 'recebido em',
  convertido_em: 'convertido em',
  consentimento_em: 'consentimento em',
  motivo_cancelamento: 'motivo',
  motivo_estorno: 'motivo do estorno',
  motivo_reabertura: 'motivo da reabertura',
  data_pagamento: 'data de pagamento',
  valor_total: 'valor total',
  valor_principal: 'saldo abatido',
  valor_encargos: 'encargos',
  multa_pct: 'multa (%)',
  juros_mes_pct: 'juros ao mês (%)',
  carencia_dias: 'carência (dias)',
  pago_por_id: 'pago por',
  responsavel_id: 'responsável',
  membro_id: 'responsável',
  user_id: 'login',
  acesso_agenda: 'acesso à agenda',
  acesso_financeiro: 'acesso ao financeiro',
  acesso_site: 'acesso ao site',
  acesso_clientes: 'acesso aos clientes',
  acesso_prazos: 'acesso aos prazos',
  acesso_auditoria: 'acesso ao histórico',
  conta_financeira_id: 'conta financeira',
  fornecedor_id: 'fornecedor',
  centro_custo_id: 'centro de custo',
  competencia_manual: 'competência escolhida à mão',
  motivo_ajuste: 'motivo do ajuste',
  motivo_alteracao: 'motivo da alteração',
  data_contrato: 'data do contrato',
  data_contrato_origem: 'origem da data do contrato',
  data_fim: 'fim da vigência',
  arquivado_em: 'arquivado em',
  motivo_arquivamento: 'motivo do arquivamento',
  valor_multa: 'multa',
  valor_juros: 'juros',
  valor_correcao: 'correção',
  valor_acrescimo: 'acréscimo',
  reembolsado_em: 'reembolsado em',
  nome_fantasia: 'nome fantasia',
  recebe_cobranca: 'recebe cobrança',
  codigo_prefixo: 'prefixo do código',
  busca_automatica: 'busca automática no diário',
  inatividade_minutos: 'saída por inatividade (min)',
  cliente_id: 'cliente',
  processo_id: 'processo',
  fatal_em: 'prazo fatal',
  entrega: 'prazo de entrega',
  proxima_providencia: 'próxima providência',
  concluida_em: 'concluída em',
  conferida_em: 'conferida em',
  renegociacao_id: 'renegociação',
  chegada_em: 'chegada do cliente',
};

const nomeCampo = (c) => CAMPOS[c] ?? c.replace(/_id$/, '').replace(/_/g, ' ');

// Valores gravados como código (em_andamento, uteis…) aparecem com o nome que
// as telas usam. `tipo` muda de sentido conforme a tabela.
const CONTAGENS = { uteis: 'Dias úteis', corridos: 'Dias corridos', horas: 'Horas' };
const VALORES = {
  prioridade: PRIORIDADES, area: AREAS_JURIDICAS, tipo_pessoa: TIPOS_PESSOA, estado_civil: ESTADOS_CIVIS,
  contagem: CONTAGENS, tipo_honorario: TIPOS_HONORARIO, tipo_avulsa: TIPOS_AVULSA, flexao: { m: 'O cliente', f: 'A cliente' },
};
const TIPOS = {
  tarefas: { tarefa: 'Tarefa', prazo: 'Prazo processual' },
  compromissos: TIPOS_COMPROMISSO, atualizacoes: TIPOS_ATUALIZACAO,
};
const CANAIS_POR_TABELA = { contatos: CANAIS_CONTATO };

function codigo(tabela, campo, v) {
  if (campo === 'situacao') return tabela === 'processos' ? SITUACOES_PROCESSO[v] : rotuloSituacao(tabela, v);
  if (campo === 'tipo') return TIPOS[tabela]?.[v];
  if (campo === 'canal') return (CANAIS_POR_TABELA[tabela] ?? CANAIS)[v];
  return VALORES[campo]?.[v];
}

// Texto corrido de um valor estruturado: ["p", "…"], listas, cartões.
const textos = (v) => (typeof v === 'string' ? [v]
  : Array.isArray(v) ? v.flatMap(textos)
    : v && typeof v === 'object' ? Object.values(v).flatMap(textos) : []);
const encurtar = (t, n = 140) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

const TIPOS_BLOCO = { p: 'parágrafo', h2: 'subtítulo', pq: 'destaque', ul: 'lista', instagram: 'post do Instagram', facebook: 'post do Facebook', linkedin: 'post do LinkedIn' };
const ehBloco = (b) => Array.isArray(b) && typeof b[0] === 'string' && b.length === 2;
const textoCru = ([, valor]) => textos(valor).filter(Boolean).join(' · ');
const textoBloco = (b) => encurtar(textoCru(b) || '(vazio)', 90);

/** O pedaço que mudou entre dois textos, com um pouco de contexto — senão
 *  uma frase acrescentada no fim de um parágrafo longo some no corte. */
function trechos(antes, depois, contexto = 30, maximo = 90) {
  let i = 0;
  while (i < antes.length && i < depois.length && antes[i] === depois[i]) i++;
  let fa = antes.length;
  let fd = depois.length;
  while (fa > i && fd > i && antes[fa - 1] === depois[fd - 1]) { fa--; fd--; }
  const inicio = Math.max(0, i - contexto);
  const corte = (t, fim) => {
    const pedaco = t.slice(inicio, Math.min(t.length, fim + contexto));
    return `${inicio > 0 ? '…' : ''}${encurtar(pedaco, maximo)}${fim + contexto < t.length && pedaco.length <= maximo ? '…' : ''}` || '(vazio)';
  };
  return [corte(antes, fa), corte(depois, fd)];
}

/** Corpo de artigo: o que mudou bloco a bloco, em vez do JSON inteiro. */
function mudancasCorpo(antes, depois) {
  const a = Array.isArray(antes) ? antes : [];
  const d = Array.isArray(depois) ? depois : [];
  const mudancas = [];
  for (let i = 0; i < Math.max(a.length, d.length); i++) {
    const nome = (b) => TIPOS_BLOCO[b[0]] ?? b[0];
    if (!a[i]) mudancas.push(`bloco ${i + 1} incluído (${nome(d[i])}): “${textoBloco(d[i])}”`);
    else if (!d[i]) mudancas.push(`bloco ${i + 1} retirado (${nome(a[i])}): “${textoBloco(a[i])}”`);
    else if (JSON.stringify(a[i]) !== JSON.stringify(d[i])) {
      mudancas.push(a[i][0] === d[i][0]
        ? `bloco ${i + 1} (${nome(d[i])}): ${trechos(textoCru(a[i]), textoCru(d[i])).map((t) => `“${t}”`).join(' → ')}`
        : `bloco ${i + 1}: ${nome(a[i])} → ${nome(d[i])}: “${textoBloco(d[i])}”`);
    }
  }
  if (!mudancas.length) return [`${d.length} bloco(s), sem mudança de texto`];
  return mudancas.length > 4 ? [...mudancas.slice(0, 4), `e mais ${mudancas.length - 4} mudança(s)`] : mudancas;
}

function legivel(campo, v, tabela) {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (campo === 'participantes' && Array.isArray(v)) return v.map(nomeDe).join(' + ') || '—';
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v.join(', ') || '—';
  if (typeof v === 'object') return encurtar(textos(v).filter(Boolean).join(' · ') || '—');
  const rotulo = typeof v === 'string' ? codigo(tabela, campo, v) : null;
  if (rotulo) return rotulo;
  if (estado.porId.has(v)) return nomeDe(v);
  if (/_id$/.test(campo)) return `registro …${String(v).slice(-6)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return data(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return dataHora(v);
  return String(v);
}

export function itemHistorico(a) {
  const quem = a.membro_id ? nomeDe(a.membro_id) : a.usuario_id ? 'Login sem membro' : 'Sistema';
  return html`
    <li class="historico__item">
      <span class="historico__quando">${dataHora(a.em)}</span>
      <span>
        <strong>${quem}</strong> ${ACOES[a.acao] ?? a.acao} <span class="selo">${TABELAS[a.tabela] ?? a.tabela}</span>
        ${a.campos?.length
          ? html`<ul class="historico__campos">${a.campos.map((c) => (c === 'corpo' && [a.antes?.[c], a.depois?.[c]].some((v) => Array.isArray(v) && v.every(ehBloco))
            ? html`<li>conteúdo:<ul>${mudancasCorpo(a.antes?.[c], a.depois?.[c]).map((m) => html`<li>${m}</li>`)}</ul></li>`
            : html`<li>${nomeCampo(c)}: <s>${legivel(c, a.antes?.[c], a.tabela)}</s> → ${legivel(c, a.depois?.[c], a.tabela)}</li>`))}</ul>`
          : ''}
      </span>
    </li>`;
}

/** O histórico de um ou mais registros — um contrato com as parcelas e os
 *  recebimentos dele, por exemplo. */
export async function abrirHistorico({ titulo, registros }) {
  try {
    const linhas = await db.listar('auditoria', {
      select: '*',
      filtros: [['registro_id', 'in', registros]],
      ordem: 'em.desc',
      limite: 300,
    });
    return abrirDialogo({
      titulo: `Histórico — ${titulo}`,
      largo: true,
      somenteLeitura: true,
      corpo: linhas.length ? html`<ul class="historico">${linhas.map(itemHistorico)}</ul>` : vazio('Nada registrado.'),
    });
  } catch (erro) {
    avisarErro(erro);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tela do administrador e da auditoria
// ---------------------------------------------------------------------------

export default async function telaHistorico(ctx) {
  const dia = hoje();
  const filtro = {
    tabela: TABELAS[ctx.consulta.tabela] ? ctx.consulta.tabela : '',
    membro: ctx.consulta.membro ?? '',
    de: /^\d{4}-\d{2}-\d{2}$/.test(ctx.consulta.de ?? '') ? ctx.consulta.de : somarDias(dia, -30),
    ate: /^\d{4}-\d{2}-\d{2}$/.test(ctx.consulta.ate ?? '') ? ctx.consulta.ate : dia,
    pagina: Math.max(1, Number(ctx.consulta.pagina) || 1),
  };

  desenhar(ctx.raiz, html`
    ${cabecalho('Histórico', 'Tudo o que foi criado, alterado, cancelado ou estornado — nada é apagado. Só leitura.')}
    <form class="filtros">
      <label class="campo">
        <span>O quê</span>
        <select name="tabela">
          <option value="">Tudo</option>
          ${Object.entries(TABELAS).map(([v, r]) => html`<option value="${v}" ${v === filtro.tabela ? 'selected' : ''}>${r}</option>`)}
        </select>
      </label>
      <label class="campo">
        <span>Quem</span>
        <select name="membro">
          <option value="">Todos</option>
          ${estado.membros.map((m) => html`<option value="${m.id}" ${m.id === filtro.membro ? 'selected' : ''}>${m.nome_curto}</option>`)}
        </select>
      </label>
      <label class="campo"><span>De</span><input type="date" name="de" value="${filtro.de}"></label>
      <label class="campo"><span>Até</span><input type="date" name="ate" value="${filtro.ate}"></label>
    </form>
    <section class="painel" data-papel="lista"><p class="carregando">Carregando…</p></section>`);

  const form = $('form', ctx.raiz);
  const lista = $('[data-papel="lista"]', ctx.raiz);
  let pedido = 0;

  const carregar = async () => {
    const este = ++pedido;
    if (filtro.ate < filtro.de) {
      desenhar(lista, html`<p class="nota nota--perigo" role="alert">A data final (Até) precisa ser igual ou depois da inicial (De). Nenhuma busca foi feita.</p>`);
      form.ate.setAttribute('aria-invalid', 'true');
      return;
    }
    form.ate.removeAttribute('aria-invalid');
    const filtros = [['em', 'gte', instante(filtro.de)], ['em', 'lt', instante(somarDias(filtro.ate, 1))]];
    if (filtro.tabela) filtros.push(['tabela', 'eq', filtro.tabela]);
    if (filtro.membro) filtros.push(['membro_id', 'eq', filtro.membro]);
    const { linhas, total } = await db.pagina('auditoria', { select: '*', filtros, ordem: 'em.desc,id.desc', pagina: filtro.pagina, porPagina: POR_PAGINA });
    if (este !== pedido || !ctx.ativa()) return;
    desenhar(lista, linhas.length
      ? html`<ul class="historico">${linhas.map(itemHistorico)}</ul>
          ${paginacao(filtro.pagina, Math.max(1, Math.ceil(total / POR_PAGINA)), total, POR_PAGINA)}`
      : vazio('Nada registrado com esses filtros.'));
  };

  form.addEventListener('input', () => {
    Object.assign(filtro, { tabela: form.tabela.value, membro: form.membro.value, de: form.de.value || filtro.de, ate: form.ate.value || filtro.ate, pagina: 1 });
    guardarConsulta(filtro);
    carregar().catch(avisarErro);
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  await carregar();
  return aoClicar(ctx.raiz, {
    pagina: (el) => {
      filtro.pagina = Number(el.dataset.pagina);
      guardarConsulta(filtro);
      carregar().then(() => ctx.raiz.scrollIntoView?.({ block: 'start' })).catch(avisarErro);
    },
  });
}
