// Intimações (F6).
// ================
//
// Duas entradas: a busca no DJEN (API pública do CNJ, pelo navegador — ver
// telas/djen.js) e o cadastro manual (intimação pessoal, e-mail da vara…).
// Tudo entra pendente e é conferido por uma pessoa: ler o teor, conferir
// datas e processo, e então só conferir, gerar o prazo ou lançar a
// audiência — nos dois últimos, a conferência é gravada junto, numa
// transação. O prazo e a audiência vêm SUGERIDOS a partir do teor; quem
// confirma é o advogado.

import { DJEN_URL } from '../config.js';
import { avisar, avisarErro } from '../nucleo/avisos.js';
import { abrirDialogo } from '../nucleo/dialogo.js';
import { estado, membrosAtivos, nomeDe, pode } from '../nucleo/estado.js';
import { data, dataHora, hoje, instante, numeroCnj, numeroCnjValido, semAcento, soDigitos, somarDias } from '../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../nucleo/html.js';
import { guardarConsulta } from '../nucleo/rotas.js';
import { db } from '../nucleo/supabase.js';
import { COLUNAS_CLIENTE, COLUNAS_PROCESSO } from '../dominio/clientes.js';
import { linkDaCertidao, periodoDaBusca, sugerirAudiencia, sugerirPrazo } from '../dominio/djen.js';
import { contagemDaArea } from '../dominio/prazos.js';
import { COLUNAS_TAREFA } from '../dominio/tarefas.js';
import { cabecalho, indicador, opcoes, seloIntimacao, vazio } from './comum.js';
import { campoCliente, ligarCampoCliente } from './clientes.js';
import { editarCompromisso } from './agenda.js';
import { buscarNoDiario, oabsDosMembros } from './djen.js';
import { abrirHistorico } from './historico.js';
import { formularioTarefa } from './tarefas/formulario.js';

const COLUNAS = 'id,fonte,djen_hash,disponibilizada_em,publicada_em,tribunal,orgao,tipo_comunicacao,tipo_documento,classe,numero_processo,texto,link,destinatarios,'
  + 'advogados,membro_id,cliente_id,processo_id,situacao,conferida_em,conferida_por,compromisso_id,observacoes,criado_em,criado_por';
const SITUACOES_CONSULTA = { ok: 'completa', parcial: 'parcial', falhou: 'falhou' };
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
// Busca no DJEN
// ---------------------------------------------------------------------------

async function buscarDiario(consultas) {
  const { usadas, semOab } = oabsDosMembros();
  const config = await db.um('config_prazos', { select: '*' });
  const periodo = periodoDaBusca(consultas.find((c) => c.situacao === 'ok'), hoje(), config?.dias_primeira_busca ?? 7);
  return abrirDialogo({
    titulo: 'Buscar no Diário de Justiça (DJEN)',
    rotuloOk: 'Buscar',
    corpo: html`
      <div class="campos">
        <label class="campo campo--6"><span>Disponibilizadas de</span><input type="date" name="de" value="${periodo.de}" max="${hoje()}" required></label>
        <label class="campo campo--6"><span>Até</span><input type="date" name="ate" value="${periodo.ate}" max="${hoje()}" required></label>
        <div class="campo">
          <span>OABs consultadas</span>
          ${usadas.length ? html`<p>${usadas.map((o) => `${o.nome} (${o.chave})`).join(' · ')}</p>` : html`<p class="perigo">Nenhum membro ativo tem OAB cadastrada.</p>`}
          ${semOab.length ? html`<span class="campo__ajuda">Sem OAB legível em Membros: ${semOab.map((m) => m.nome_curto).join(', ')}.</span>` : ''}
        </div>
        <p class="campo sub" data-progresso aria-live="polite"></p>
      </div>
      <p class="nota">A consulta sai do seu navegador direto para o CNJ (a API só responde a pedidos do Brasil). Uma OAB por vez, com pausa — o CNJ limita
        consultas por endereço. O que vier entra pendente, para conferência; nada vira prazo sozinho.</p>`,
    aoEnviar: async (d, form) => {
      if (d.ate < d.de) throw new Error('O fim do período precisa ser igual ou depois do início.');
      if ((Date.parse(d.ate) - Date.parse(d.de)) / 86_400_000 > 30) throw new Error('Busque no máximo 31 dias por vez.');
      const progresso = $('[data-progresso]', form);
      const r = await buscarNoDiario({ de: d.de, ate: d.ate, aoProgresso: (t) => { progresso.textContent = t; } });
      avisar(`${r.encontradas} comunicação(ões) no período, ${r.novas} nova(s).${r.situacao === 'ok' ? '' : ' Busca incompleta: veja o detalhe em Consultas ao diário.'}`,
        r.situacao === 'ok' ? 'ok' : 'erro', 8000);
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// Conferência
// ---------------------------------------------------------------------------

const PEDEM_CONFERENCIA = ['conferir', 'prazo', 'audiencia'];

async function conferirIntimacao(i, clientes, processos) {
  // Manual cadastrada sem publicação: a data se completa aqui, antes do prazo.
  const completarPublicacao = i.fonte === 'manual' && !i.publicada_em;
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
        <span class="sub">${juntar(i.fonte === 'djen' ? `Disponibilizada no DJEN: ${data(i.disponibilizada_em)}` : `Recebida: ${data(i.disponibilizada_em)}`,
          `${i.fonte === 'djen' ? 'Publicação (1º dia útil seguinte)' : 'Publicação informada'}: ${data(i.publicada_em) || 'não informada'}`, numeroCnj(i.numero_processo))}</span>
        ${i.classe || i.tipo_documento ? html`<span class="sub">${juntar(i.classe, i.tipo_documento)}</span>` : ''}</p>
      <div class="intimacao-teor texto-preservado">${i.texto}</div>
      ${i.destinatarios?.length ? html`<p>Destinatários: ${i.destinatarios.map((d) => d.nome).join(' · ')}</p>` : ''}
      ${i.fonte === 'djen' ? html`<p class="sub">
        ${i.djen_hash ? html`<a href="${linkDaCertidao(DJEN_URL, i.djen_hash)}" target="_blank" rel="noopener noreferrer">Certidão no DJEN</a>` : ''}
        ${i.link ? html` · <a href="${i.link}" target="_blank" rel="noopener noreferrer">Documento no tribunal</a>` : ''}
        · Confira a publicação com a certidão; se o tribunal tiver feriado que não está cadastrado, a data muda.</p>` : ''}
      ${i.conferida_em ? html`<p class="sub">Conferida por ${nomeDe(i.conferida_por)} em ${dataHora(i.conferida_em)}</p>` : ''}
      <div class="campos secao">
        ${completarPublicacao ? html`
          <label class="campo campo--6" data-publicacao><span>Publicação conferida</span>
            <input type="date" name="publicada_em" min="${i.disponibilizada_em}">
            <span class="campo__ajuda">Obrigatória para gerar o prazo. Confira na certidão ou no documento recebido.</span></label>` : ''}
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
        if (completarPublicacao) form.publicada_em.required = form.acao.value === 'prazo';
      };
      form.acao.addEventListener('change', ajustar);
      ajustar();
    },
    aoEnviar: async (d) => {
      if (PEDEM_CONFERENCIA.includes(d.acao) && !d.conferi) throw new Error('Marque que leu e conferiu a comunicação.');
      const publicada = i.publicada_em || d.publicada_em;
      if (d.acao === 'prazo' && !publicada) {
        throw new Error('Informe a data de publicação conferida para gerar o prazo.');
      }
      if (d.publicada_em && d.publicada_em < i.disponibilizada_em) throw new Error('Confira as datas de recebimento e publicação.');
      if (d.acao === 'arquivar' && !d.motivo) throw new Error('Informe o motivo do arquivamento.');

      const vinculo = {
        cliente_id: d.cliente_id || null,
        processo_id: d.processo_id || null,
        observacoes: d.acao === 'arquivar' ? [d.observacoes, `Arquivada: ${d.motivo}`].filter(Boolean).join('\n') : d.observacoes || null,
      };
      const processo = processos.find((p) => p.id === vinculo.processo_id);
      if (processo && i.numero_processo && processo.numero !== i.numero_processo) throw new Error('O número da intimação não é o deste processo.');
      if (completarPublicacao && d.publicada_em) vinculo.publicada_em = d.publicada_em;
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
    // Sugestão lida do teor ("no prazo de 15 (quinze) dias"); a contagem
    // segue a área do processo (criminal: corridos). O formulário calcula a
    // data fatal sugerida e o advogado confere.
    const sugestao = sugerirPrazo(n.texto);
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
        ...(sugestao ? { quantidade: sugestao.quantidade, contagem: sugestao.unidade === 'horas' ? 'horas' : contagemDaArea(processo?.area) } : {}),
      },
      sugerir: Boolean(sugestao),
    });
  }
  if (resultado.acao === 'audiencia') {
    const quando = sugerirAudiencia(n.texto);
    const [h, m] = (quando?.hora ?? '09:00').split(':').map(Number);
    return editarCompromisso(null, {
      ...(quando && quando.dia >= hoje() ? { dia: quando.dia, minuto: h * 60 + m } : {}),
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
        <span><strong>${juntar(i.tipo_comunicacao || 'Comunicação', i.tribunal)}</strong>${i.fonte === 'djen' ? html` <span class="selo">DJEN</span>` : ''}</span>
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

  let config = null;
  const carregar = async () => {
    [lista, consultas, clientes, processos, tarefas, config] = await Promise.all([
      db.todos('intimacoes', { select: COLUNAS, ordem: 'disponibilizada_em.desc,id.desc' }),
      db.listar('intimacoes_consultas', { select: COLUNAS_CONSULTAS, ordem: 'criado_em.desc', limite: 30 }),
      db.todos('clientes', { select: COLUNAS_CLIENTE }),
      db.todos('processos', { select: COLUNAS_PROCESSO }),
      db.todos('v_tarefas', { select: COLUNAS_TAREFA }),
      db.um('config_prazos', { select: '*' }).catch(() => null),
    ]);
    if (!ctx.ativa()) return;

    const semana = instante(somarDias(hoje(), -6));
    const ultima = consultas[0];
    const nomes = new Map(clientes.map((c) => [c.id, c.nome]));
    desenhar(ctx.raiz, html`
      ${cabecalho('Intimações', 'Busca no DJEN, cadastro manual, vínculo com o processo e conferência humana', html`
        <button type="button" class="botao" data-acao="cadastrar">Cadastrar manual</button>
        <button type="button" class="botao botao--primario" data-acao="buscar">Buscar no diário</button>`)}
      <p class="nota">O que vem do DJEN entra pendente. Prazo e audiência são sugeridos a partir do teor e da contagem automática — confira sempre com a certidão
        antes de confirmar. A busca automática roda uma vez por dia útil, quando alguém com acesso a Prazos abre o sistema
        (${config?.busca_automatica ? 'ligada' : 'desligada'} — <a href="#/feriados">ajustar em Feriados e prazos</a>).</p>
      <div class="indicadores">
        ${indicador('Pendentes', lista.filter((i) => i.situacao === 'pendente').length)}
        ${indicador('Conferidas em 7 dias', lista.filter((i) => i.conferida_em && Date.parse(i.conferida_em) >= Date.parse(semana)).length)}
        ${indicador('Prazos gerados em 7 dias', tarefas.filter((t) => t.intimacao_id && !t.cancelado_em && Date.parse(t.criado_em) >= Date.parse(semana)).length)}
        ${indicador('Última busca no DJEN', ultima ? dataHora(ultima.criado_em) : 'Nenhuma',
          ultima ? `${SITUACOES_CONSULTA[ultima.situacao] ?? ultima.situacao}${ultima.automatica ? ' · automática' : ''}` : 'Use "Buscar no diário"',
          { tom: ultima && ultima.situacao !== 'ok' ? 'alerta' : '' })}
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
              <li><strong>${dataHora(c.criado_em)} · ${SITUACOES_CONSULTA[c.situacao] ?? c.situacao}${c.automatica ? ' · automática' : ''}</strong>
                <span>${data(c.de)} a ${data(c.ate)} · ${c.oabs.join(', ')} · ${c.encontradas} encontradas / ${c.novas} novas · ${nomeDe(c.criado_por)}</span>
                ${c.detalhe && c.situacao !== 'ok' ? html`<span class="sub">${c.detalhe}</span>` : ''}</li>`)}</ul>`
          : vazio('Nenhuma busca no DJEN ainda.')}
        <p class="painel__rodape sub">Cada consulta fica registrada — é a prova de que o diário foi conferido naquele dia.</p>
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
    buscar: () => executar(() => buscarDiario(consultas)),
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
