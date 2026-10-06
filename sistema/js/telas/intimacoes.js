// Intimações (F6, parte manual).
// ==============================
//
// Comunicações recebidas são cadastradas à mão e conferidas por uma pessoa:
// ler o teor, conferir datas e processo, e então só conferir, gerar o prazo
// ou lançar a audiência — nos dois últimos, a conferência é gravada junto,
// numa transação. A busca e a importação do DJEN ainda não existem.

import { avisar, avisarErro } from '../nucleo/avisos.js';
import { abrirDialogo } from '../nucleo/dialogo.js';
import { estado, membrosAtivos, nomeDe, pode } from '../nucleo/estado.js';
import { data, dataHora, hoje, instante, numeroCnj, numeroCnjValido, semAcento, soDigitos, somarDias } from '../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../nucleo/html.js';
import { guardarConsulta } from '../nucleo/rotas.js';
import { db } from '../nucleo/supabase.js';
import { COLUNAS_CLIENTE, COLUNAS_PROCESSO } from '../dominio/clientes.js';
import { COLUNAS_TAREFA } from '../dominio/tarefas.js';
import { cabecalho, indicador, opcoes, seloIntimacao, vazio } from './comum.js';
import { campoCliente, ligarCampoCliente } from './clientes.js';
import { editarCompromisso } from './agenda.js';
import { abrirHistorico } from './historico.js';
import { formularioTarefa } from './tarefas/formulario.js';

const COLUNAS = 'id,fonte,disponibilizada_em,publicada_em,tribunal,orgao,tipo_comunicacao,numero_processo,texto,link,destinatarios,'
  + 'advogados,membro_id,cliente_id,processo_id,situacao,conferida_em,conferida_por,compromisso_id,observacoes,criado_em,criado_por';
const COLUNAS_CONSULTAS = 'id,de,ate,oabs,encontradas,novas,situacao,detalhe,automatica,criado_em,criado_por';
const SITUACOES = [['pendente', 'Pendentes'], ['conferida', 'Conferidas'], ['arquivada', 'Arquivadas'], ['todas', 'Todas']];

/** "TJPR · Vara cível" sem separador sobrando quando falta um dos dois. */
const juntar = (...partes) => partes.filter(Boolean).join(' · ');

const preencherProcessos = (form, processos, atual) => desenhar(form.processo_id, opcoes(
  processos.filter((p) => p.cliente_id === form.cliente_id.value).map((p) => [p.id, p.titulo]), atual, { vazio: 'Sem processo' }));

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

function cadastrarIntimacao(clientes, processos) {
  return abrirDialogo({
    titulo: 'Cadastrar intimação manual',
    largo: true,
    corpo: html`
      <div class="campos">
        <label class="campo campo--6"><span>Disponibilização / recebimento</span><input type="date" name="disponibilizada_em" required value="${hoje()}"></label>
        <label class="campo campo--6"><span>Publicação conferida (opcional)</span><input type="date" name="publicada_em">
          <span class="campo__ajuda">Informe a data conferida pelo advogado.</span></label>
        ${campoCliente(clientes, { obrigatorio: false })}
        <label class="campo"><span>Processo cadastrado</span><select name="processo_id"></select></label>
        <label class="campo"><span>Número CNJ (se ainda não cadastrado)</span><input name="numero_processo" maxlength="25" placeholder="0000000-00.0000.0.00.0000"></label>
        <label class="campo campo--6"><span>Tribunal</span><input name="tribunal" maxlength="100"></label>
        <label class="campo campo--6"><span>Órgão / vara</span><input name="orgao" maxlength="200"></label>
        <label class="campo campo--6"><span>Tipo de comunicação</span><input name="tipo_comunicacao" value="Intimação" maxlength="100"></label>
        <label class="campo campo--6"><span>Advogado</span><select name="membro_id">${opcoes(membrosAtivos().map((m) => [m.id, m.nome_curto]), estado.membro.id, { vazio: 'Sem advogado vinculado' })}</select></label>
        <label class="campo"><span>Teor</span><textarea name="texto" required rows="8" maxlength="400000"></textarea></label>
        <label class="campo"><span>Observações / origem</span><textarea name="observacoes" rows="3" maxlength="20000" placeholder="Intimação pessoal, e-mail da vara…"></textarea></label>
      </div>`,
    aoAbrir: (_dialogo, form) => ligarCampoCliente(form, clientes, { aoMudar: () => preencherProcessos(form, processos, '') }),
    aoEnviar: async (d) => {
      const processo = processos.find((p) => p.id === d.processo_id);
      const numero = processo?.numero || soDigitos(d.numero_processo) || null;
      if (numero && !numeroCnjValido(numero)) throw new Error('Confira o número CNJ e o dígito verificador.');
      if (d.publicada_em && d.publicada_em < d.disponibilizada_em) throw new Error('Confira as datas de recebimento e publicação.');
      await db.inserir('intimacoes', {
        fonte: 'manual',
        disponibilizada_em: d.disponibilizada_em,
        publicada_em: d.publicada_em || null,
        cliente_id: d.cliente_id || null,
        processo_id: d.processo_id || null,
        numero_processo: numero,
        tribunal: d.tribunal || processo?.tribunal || null,
        orgao: d.orgao || processo?.orgao || null,
        tipo_comunicacao: d.tipo_comunicacao || null,
        membro_id: d.membro_id || null,
        texto: d.texto,
        observacoes: d.observacoes || null,
      }, 'id');
      avisar('Intimação cadastrada para conferência.');
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// Conferência
// ---------------------------------------------------------------------------

const PEDEM_CONFERENCIA = ['conferir', 'prazo', 'audiencia'];

async function conferirIntimacao(i, clientes, processos) {
  const acoes = [
    ['conferir', 'Só conferir'],
    ['prazo', 'Gerar prazo'],
    ...(pode.agenda() && !i.compromisso_id ? [['audiencia', 'Lançar audiência']] : []),
    ['vincular', 'Salvar vínculo / observações'],
    ['arquivar', 'Arquivar'],
  ];

  const resultado = await abrirDialogo({
    titulo: 'Conferir intimação',
    largo: true,
    rotuloOk: 'Continuar',
    corpo: html`
      <p><strong>${juntar(i.tribunal, i.orgao) || 'Comunicação'}</strong>
        <span class="sub">${juntar(`Recebida: ${data(i.disponibilizada_em)}`, `Publicação informada: ${data(i.publicada_em) || 'não informada'}`, numeroCnj(i.numero_processo))}</span></p>
      <div class="intimacao-teor texto-preservado">${i.texto}</div>
      ${i.destinatarios?.length ? html`<p>Destinatários: ${i.destinatarios.map((d) => d.nome).join(' · ')}</p>` : ''}
      ${i.conferida_em ? html`<p class="sub">Conferida por ${nomeDe(i.conferida_por)} em ${dataHora(i.conferida_em)}</p>` : ''}
      <div class="campos secao">
        ${campoCliente(clientes, { obrigatorio: false, atual: i.cliente_id })}
        <label class="campo"><span>Processo / caso</span><select name="processo_id"></select></label>
        <label class="campo"><span>Observações</span><textarea name="observacoes" rows="3" maxlength="20000">${i.observacoes ?? ''}</textarea></label>
        <label class="campo"><span>O que fazer</span><select name="acao">${opcoes(acoes, 'conferir')}</select></label>
        <label class="opcao" data-conferi><input type="checkbox" name="conferi"> Li o teor e conferi as datas e o processo.</label>
        <label class="campo" data-motivo hidden><span>Motivo do arquivamento</span><input name="motivo" maxlength="1000"></label>
      </div>
      <p class="nota">Esta tela não substitui a conferência jurídica. A publicação e as datas do prazo devem ser informadas pelo advogado.</p>`,
    aoAbrir: (dialogo, form) => {
      ligarCampoCliente(form, clientes, { aoMudar: () => preencherProcessos(form, processos, i.processo_id) });
      const ajustar = () => {
        $('[data-conferi]', dialogo).hidden = !PEDEM_CONFERENCIA.includes(form.acao.value);
        $('[data-motivo]', dialogo).hidden = form.acao.value !== 'arquivar';
        form.motivo.required = form.acao.value === 'arquivar';
      };
      form.acao.addEventListener('change', ajustar);
      ajustar();
    },
    aoEnviar: async (d) => {
      if (PEDEM_CONFERENCIA.includes(d.acao) && !d.conferi) throw new Error('Marque que leu e conferiu a comunicação.');
      if (d.acao === 'prazo' && !i.publicada_em) {
        throw new Error('Este registro não tem publicação informada. Cadastre a comunicação com a data conferida antes de gerar um prazo.');
      }
      if (d.acao === 'arquivar' && !d.motivo) throw new Error('Informe o motivo do arquivamento.');

      const vinculo = {
        cliente_id: d.cliente_id || null,
        processo_id: d.processo_id || null,
        observacoes: d.acao === 'arquivar' ? [d.observacoes, `Arquivada: ${d.motivo}`].filter(Boolean).join('\n') : d.observacoes || null,
      };
      const processo = processos.find((p) => p.id === vinculo.processo_id);
      if (processo && i.numero_processo && processo.numero !== i.numero_processo) throw new Error('O número da intimação não é o deste processo.');
      if (d.acao === 'conferir') vinculo.situacao = 'conferida';
      if (d.acao === 'arquivar') vinculo.situacao = 'arquivada';

      // Prazo e audiência: o vínculo fica salvo agora; a conferência só é
      // gravada junto com o prazo ou a audiência, no próximo formulário.
      const salvo = await db.alterar('intimacoes', [['id', 'eq', i.id]], vinculo, COLUNAS);
      return { acao: d.acao, intimacao: salvo };
    },
  });
  if (!resultado) return false;

  const n = resultado.intimacao;
  const processo = processos.find((p) => p.id === n.processo_id);
  const responsavel = processo?.responsavel_id || n.membro_id || estado.membro.id;

  if (resultado.acao === 'prazo') {
    return formularioTarefa({
      iniciais: {
        tipo: 'prazo',
        titulo: n.tipo_comunicacao || 'Prazo da intimação',
        descricao: n.texto,
        cliente_id: n.cliente_id,
        processo_id: n.processo_id,
        responsavel_id: responsavel,
        base_em: instante(n.publicada_em),
        intimacao_id: n.id,
      },
    });
  }
  if (resultado.acao === 'audiencia') {
    return editarCompromisso(null, {
      iniciais: {
        tipo: 'audiencia',
        cliente_id: n.cliente_id,
        processo: numeroCnj(n.numero_processo),
        membro_id: responsavel,
        titulo: `Audiência${n.orgao ? ` — ${n.orgao}` : ''}`,
      },
      salvar: (registro) => db.rpc('lancar_audiencia_intimacao', { p_id: n.id, p: registro }),
    });
  }
  avisar(resultado.acao === 'arquivar' ? 'Intimação arquivada.' : resultado.acao === 'conferir' ? 'Intimação conferida.' : 'Vínculo salvo.');
  return true;
}

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------

function itemIntimacao(i, nomes) {
  return html`
    <li>
      <div>
        <strong>${juntar(i.tipo_comunicacao || 'Comunicação', i.tribunal)}</strong>
        <span class="sub">${juntar(data(i.disponibilizada_em), `Publicação ${data(i.publicada_em) || 'não informada'}`, i.orgao)}</span>
        <span>${juntar(numeroCnj(i.numero_processo) || 'Sem número', nomes.get(i.cliente_id) || 'Sem cliente vinculado', i.membro_id ? nomeDe(i.membro_id) : '')}</span>
        <p class="texto-preservado">${i.texto.slice(0, 200)}${i.texto.length > 200 ? '…' : ''}</p>
        <span>${seloIntimacao(i.situacao)} ${i.compromisso_id && pode.agenda() ? html`<a href="#/agenda">Audiência na Agenda</a>` : ''}</span>
      </div>
      <div class="registro-acoes">
        <button type="button" class="botao botao--pequeno" data-acao="conferir" data-id="${i.id}">${i.situacao === 'pendente' ? 'Conferir / vincular' : 'Abrir'}</button>
        <button type="button" class="botao botao--pequeno botao--discreto" data-acao="historico" data-id="${i.id}">Histórico</button>
      </div>
    </li>`;
}

export default async function telaIntimacoes(ctx) {
  let lista = [];
  let consultas = [];
  let clientes = [];
  let processos = [];
  let tarefas = [];
  const f = {
    situacao: SITUACOES.some(([v]) => v === ctx.consulta.situacao) ? ctx.consulta.situacao : 'pendente',
    busca: ctx.consulta.busca ?? '',
  };

  const carregar = async () => {
    [lista, consultas, clientes, processos, tarefas] = await Promise.all([
      db.todos('intimacoes', { select: COLUNAS, ordem: 'disponibilizada_em.desc,id.desc' }),
      db.listar('intimacoes_consultas', { select: COLUNAS_CONSULTAS, ordem: 'criado_em.desc', limite: 30 }),
      db.todos('clientes', { select: COLUNAS_CLIENTE }),
      db.todos('processos', { select: COLUNAS_PROCESSO }),
      db.todos('v_tarefas', { select: COLUNAS_TAREFA }),
    ]);
    if (!ctx.ativa()) return;

    const semana = instante(somarDias(hoje(), -6));
    const ultima = consultas[0];
    const nomes = new Map(clientes.map((c) => [c.id, c.nome]));
    desenhar(ctx.raiz, html`
      ${cabecalho('Intimações', 'Cadastro manual, vínculo com o processo e conferência humana', html`
        <button type="button" class="botao botao--primario" data-acao="cadastrar">Cadastrar intimação</button>`)}
      <p class="nota">A busca e a importação do DJEN estão pendentes nesta entrega. Você pode registrar comunicações recebidas e conferir cada uma antes de gerar prazo ou audiência.</p>
      <div class="indicadores">
        ${indicador('Pendentes', lista.filter((i) => i.situacao === 'pendente').length)}
        ${indicador('Conferidas em 7 dias', lista.filter((i) => i.conferida_em && Date.parse(i.conferida_em) >= Date.parse(semana)).length)}
        ${indicador('Prazos gerados em 7 dias', tarefas.filter((t) => t.intimacao_id && !t.cancelado_em && Date.parse(t.criado_em) >= Date.parse(semana)).length)}
        ${indicador('Última busca no DJEN', ultima ? dataHora(ultima.criado_em) : 'Nenhuma', ultima ? ultima.situacao : 'Busca ainda não implementada')}
      </div>
      <form class="filtros">
        <label class="campo"><span>Situação</span><select name="situacao">${opcoes(SITUACOES, f.situacao)}</select></label>
        <label class="campo campo--busca"><span>Buscar</span><input type="search" name="busca" value="${f.busca}" placeholder="Teor, número, cliente, tribunal ou órgão"></label>
      </form>
      <section class="painel" data-lista></section>
      <section class="painel secao">
        <header class="painel__topo"><h2 class="painel__titulo">Consultas ao diário</h2></header>
        ${consultas.length
          ? html`<ul class="cliente-registros painel__corpo">${consultas.map((c) => html`
              <li><strong>${dataHora(c.criado_em)} · ${c.situacao}</strong>
                <span>${data(c.de)} a ${data(c.ate)} · ${c.oabs.join(', ')} · ${c.encontradas} encontradas / ${c.novas} novas · ${nomeDe(c.criado_por)}</span></li>`)}</ul>`
          : vazio('A busca no DJEN ainda não está disponível.')}
      </section>`);

    // Busca sem acento; número de processo com ou sem pontuação.
    const mostrar = () => {
      const busca = semAcento(f.busca).toLowerCase().trim();
      const digitos = soDigitos(f.busca);
      const visiveis = lista.filter((i) => {
        if (f.situacao !== 'todas' && i.situacao !== f.situacao) return false;
        if (!busca) return true;
        const texto = semAcento([i.texto, i.numero_processo, numeroCnj(i.numero_processo), i.tribunal, i.orgao, nomes.get(i.cliente_id)].join(' ')).toLowerCase();
        return texto.includes(busca) || (digitos.length >= 7 && (i.numero_processo ?? '').includes(digitos));
      });
      desenhar($('[data-lista]', ctx.raiz), visiveis.length
        ? html`<ul class="intimacoes-lista">${visiveis.map((i) => itemIntimacao(i, nomes))}</ul>`
        : vazio('Nenhuma intimação neste filtro.'));
    };

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

  const executar = async (fn) => {
    try {
      if (await fn() && ctx.ativa()) await carregar();
    } catch (erro) {
      avisarErro(erro);
    }
  };
  const intimacao = (el) => lista.find((i) => i.id === el.dataset.id);
  const limpar = aoClicar(ctx.raiz, {
    cadastrar: () => executar(() => cadastrarIntimacao(clientes, processos)),
    conferir: (el) => executar(() => conferirIntimacao(intimacao(el), clientes, processos)),
    historico: (el) => abrirHistorico({ titulo: 'Intimação', registros: [el.dataset.id] }),
  });

  // Vindo de uma tarefa (?id=…): abre a intimação de origem.
  if (ctx.consulta.id) {
    const i = lista.find((x) => x.id === ctx.consulta.id);
    if (i) await executar(() => conferirIntimacao(i, clientes, processos));
  }
  return limpar;
}
