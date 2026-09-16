// Agenda — a semana de todos (preparação 7.5).
// ============================================
//
// Colunas por dia, cor por advogado, horário livre — o protótipo só tinha
// 9h–12h e 14h–18h. Compromisso particular dos outros aparece como "Ocupado".
// O aviso de conflito conta o intervalo mínimo entre atendimentos (7.7), mas
// não impede marcar: quem decide é quem está marcando.
//
// Ainda não conversa com o Google Agenda (notaGoogle).

import { conflitos, distribuirColunas } from '../dominio/agenda.js';
import { avisar, avisarErro } from '../nucleo/avisos.js';
import { abrirDialogo, pedirMotivo } from '../nucleo/dialogo.js';
import { corDe, estado, membrosAtivos, nomeDe, pode } from '../nucleo/estado.js';
import {
  data, dataCurta, dataExtensa, diasEntre, hoje, hora, horaDoMinuto, inicioDaSemana, instante,
  linkWhatsApp, nomeDoDia, noFuso, somarDias, telefone,
} from '../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../nucleo/html.js';
import { guardarConsulta } from '../nucleo/rotas.js';
import { db } from '../nucleo/supabase.js';
import { campoCliente, carregarClientes, ligarCampoCliente } from './clientes.js';
import {
  cabecalho, capitalizar, MODALIDADES, notaGoogle, opcoes, rotuloTipo, seloCompromisso, TIPOS_COMPROMISSO, vazio,
} from './comum.js';
import { abrirHistorico } from './historico.js';

const LEMBRETES = [
  ['', 'Sem lembrete'], ['15', '15 minutos antes'], ['30', '30 minutos antes'],
  ['60', '1 hora antes'], ['120', '2 horas antes'], ['1440', '1 dia antes'],
];

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const ms = (instanteIso) => Date.parse(instanteIso);

export default async function telaAgenda(ctx) {
  const inicial = /^\d{4}-\d{2}-\d{2}$/.test(ctx.consulta.dia ?? '') ? ctx.consulta.dia : hoje();
  let semana = inicioDaSemana(inicial);
  const ocultos = new Set((ctx.consulta.ocultos ?? '').split(',').filter(Boolean));
  let config = await db.um('config_agenda', { select: '*' });
  let compromissos = [];

  const redesenhar = () => desenhar(ctx.raiz, tela({ semana, compromissos, config, ocultos }));

  const carregar = async () => {
    const lista = await db.rpc('agenda_periodo', { p_de: instante(semana), p_ate: instante(somarDias(semana, 7)) });
    if (!ctx.ativa()) return;
    compromissos = lista;
    redesenhar();
  };
  await carregar();

  const guardar = () => guardarConsulta({
    dia: semana === inicioDaSemana(hoje()) ? '' : semana,
    ocultos: [...ocultos].join(','),
  });
  const trocarSemana = (dias) => {
    semana = dias === 0 ? inicioDaSemana(hoje()) : somarDias(semana, dias);
    guardar();
    carregar().catch(avisarErro);
  };
  const depois = (promessa) => promessa.then((feito) => feito && carregar()).catch(avisarErro);

  // A linha do "agora" anda sozinha, sem redesenhar a grade.
  const relogio = setInterval(() => {
    const linha = $('.agenda__agora', ctx.raiz);
    const coluna = linha?.parentElement;
    if (!linha || !coluna) return;
    const { minuto } = noFuso(new Date().toISOString());
    const inicio = Number(coluna.dataset.inicio);
    const fim = Number(coluna.dataset.fim);
    linha.style.setProperty('--topo', `${((minuto - inicio) / (fim - inicio)) * 100}%`);
  }, 60_000);

  const desligar = aoClicar(ctx.raiz, {
    'semana-anterior': () => trocarSemana(-7),
    'semana-seguinte': () => trocarSemana(7),
    'semana-atual': () => trocarSemana(0),
    imprimir: () => print(),
    membro: (el) => {
      if (ocultos.has(el.dataset.id)) ocultos.delete(el.dataset.id);
      else ocultos.add(el.dataset.id);
      guardar();
      redesenhar();
    },
    novo: () => {
      const dia = hoje();
      const nestaSemana = diasEntre(semana, dia) >= 0 && diasEntre(semana, dia) < 7;
      depois(editarCompromisso(null, { config, dia: nestaSemana ? dia : semana }));
    },
    evento: async (el) => {
      const c = compromissos.find((x) => x.id === el.dataset.id);
      if (!c || c.mascarado) return;
      const resultado = await detalhe(c);
      if (resultado === 'editar') depois(editarCompromisso(c, { config }));
      else if (resultado) carregar().catch(avisarErro);
    },
    configurar: async () => {
      if (await configurarAgenda(config)) {
        config = await db.um('config_agenda', { select: '*' });
        redesenhar();
      }
    },
  });

  // Clique num espaço vazio da grade marca naquele horário.
  const clicarNaGrade = (e) => {
    const coluna = e.target.closest('.agenda__coluna');
    if (!coluna || e.target.closest('.evento')) return;
    const caixa = coluna.getBoundingClientRect();
    const inicio = Number(coluna.dataset.inicio);
    const fim = Number(coluna.dataset.fim);
    const minuto = inicio + ((e.clientY - caixa.top) / caixa.height) * (fim - inicio);
    depois(editarCompromisso(null, { config, dia: coluna.dataset.dia, minuto: Math.floor(minuto / 30) * 30 }));
  };
  ctx.raiz.addEventListener('click', clicarNaGrade);

  return () => {
    desligar();
    clearInterval(relogio);
    ctx.raiz.removeEventListener('click', clicarNaGrade);
  };
}

// ---------------------------------------------------------------------------
// Semana
// ---------------------------------------------------------------------------

function rotuloSemana(inicio, dias) {
  const fim = somarDias(inicio, dias - 1);
  const dia = (iso) => Number(iso.slice(8, 10));
  const mes = (iso) => MESES[Number(iso.slice(5, 7)) - 1];
  if (inicio.slice(0, 7) === fim.slice(0, 7)) return `${dia(inicio)} a ${dia(fim)} de ${mes(fim)} de ${fim.slice(0, 4)}`;
  if (inicio.slice(0, 4) === fim.slice(0, 4)) return `${dia(inicio)} de ${mes(inicio)} a ${dia(fim)} de ${mes(fim)} de ${fim.slice(0, 4)}`;
  return `${data(inicio)} a ${data(fim)}`;
}

function montarSemana({ semana, compromissos, config, ocultos }) {
  const dia = hoje();
  const visiveis = compromissos.filter((c) => !ocultos.has(c.membro_id));

  // Seg–sex, sábado se configurado, e o fim de semana se tiver compromisso nele.
  let quantos = config.sabado ? 6 : 5;
  for (const c of visiveis) {
    const indice = diasEntre(semana, noFuso(c.inicio).dia);
    if (indice >= quantos && indice < 7) quantos = indice + 1;
  }

  const dias = Array.from({ length: quantos }, (_, i) => {
    const iso = somarDias(semana, i);
    return { iso, hoje: iso === dia, diaTodo: [], itens: [] };
  });

  let inicioGrade = config.hora_inicio * 60;
  let fimGrade = config.hora_fim * 60;

  for (const d of dias) {
    const abre = ms(instante(d.iso));
    const fecha = ms(instante(somarDias(d.iso, 1)));
    for (const c of visiveis) {
      if (ms(c.inicio) >= fecha || ms(c.fim) <= abre) continue;
      const mesmoDia = noFuso(c.inicio).dia === d.iso && noFuso(new Date(ms(c.fim) - 1).toISOString()).dia === d.iso;
      if (c.dia_inteiro || !mesmoDia) {
        d.diaTodo.push(c);
        continue;
      }
      const inicio = noFuso(c.inicio).minuto;
      const duracao = Math.round((ms(c.fim) - ms(c.inicio)) / 60000);
      d.itens.push({ c, inicio, fim: inicio + Math.max(duracao, 20), duracao });
      inicioGrade = Math.min(inicioGrade, Math.floor(inicio / 60) * 60);
      fimGrade = Math.max(fimGrade, Math.min(24 * 60, Math.ceil((inicio + duracao) / 60) * 60));
    }
  }

  for (const d of dias) distribuirColunas(d.itens);
  return { dias, inicioGrade, fimGrade };
}

function tela(estadoTela) {
  const { semana, config } = estadoTela;
  const { dias, inicioGrade, fimGrade } = montarSemana(estadoTela);
  const total = fimGrade - inicioGrade;
  const horas = Array.from({ length: total / 60 }, (_, i) => inicioGrade / 60 + i);
  const agora = noFuso(new Date().toISOString());
  const pct = (minuto) => Math.round(((minuto - inicioGrade) / total) * 10000) / 100;
  const vazia = dias.every((d) => !d.itens.length && !d.diaTodo.length);

  return html`
    ${cabecalho('Agenda', rotuloSemana(semana, dias.length), html`
      <span class="grupo-botoes">
        <button type="button" class="botao" data-acao="semana-anterior" aria-label="Semana anterior">‹</button>
        <button type="button" class="botao" data-acao="semana-atual">Hoje</button>
        <button type="button" class="botao" data-acao="semana-seguinte" aria-label="Semana seguinte">›</button>
      </span>
      <button type="button" class="botao" data-acao="imprimir">Imprimir</button>
      ${pode.administrar() ? html`<button type="button" class="botao" data-acao="configurar">Configurar</button>` : ''}
      <button type="button" class="botao botao--primario" data-acao="novo">Novo compromisso</button>`)}

    <div class="nao-imprimir">${notaGoogle()}</div>

    <div class="chips secao nao-imprimir" role="group" aria-label="Mostrar a agenda de">
      ${membrosAtivos().map((m) => html`
        <button type="button" class="chip" data-acao="membro" data-id="${m.id}" aria-pressed="${estadoTela.ocultos.has(m.id) ? 'false' : 'true'}" data-vars="--cor:${m.cor}">${m.nome_curto}</button>`)}
    </div>

    <div class="agenda secao" data-vars="--dias:${dias.length};--horas:${total / 60}">
      <div class="agenda__grade">
        <div class="agenda__cabeca"></div>
        ${dias.map((d) => html`
          <div class="agenda__cabeca${d.hoje ? ' agenda__cabeca--hoje' : ''}">
            <span class="rotulo">${nomeDoDia(d.iso)}</span>
            <strong>${dataCurta(d.iso)}</strong>
          </div>`)}

        <div class="agenda__dia-todo agenda__dia-todo--rotulo">dia todo</div>
        ${dias.map((d) => html`
          <div class="agenda__dia-todo">
            ${d.diaTodo.map((c) => html`
              <button type="button" class="evento-dia-todo" data-acao="evento" data-id="${c.id}" data-vars="--cor:${c.mascarado ? '#465953' : corDe(c.membro_id)}"
                title="${nomeDe(c.membro_id)} · ${c.titulo ?? ''}">${nomeDe(c.membro_id)} · ${c.titulo || MODALIDADES[c.tipo]?.[c.modalidade] || TIPOS_COMPROMISSO[c.tipo]}</button>`)}
          </div>`)}

        <div class="agenda__horas">
          ${horas.map((h, i) => html`<span data-vars="--i:${i}">${String(h).padStart(2, '0')}h</span>`)}
        </div>
        ${dias.map((d) => html`
          <div class="agenda__coluna${d.hoje ? ' agenda__coluna--hoje' : ''}" data-dia="${d.iso}" data-inicio="${inicioGrade}" data-fim="${fimGrade}"
            title="Clique num horário livre para marcar">
            ${d.hoje && agora.minuto >= inicioGrade && agora.minuto <= fimGrade ? html`<span class="agenda__agora" data-vars="--topo:${pct(agora.minuto)}%"></span>` : ''}
            ${d.itens.map(({ c, inicio, fim, duracao, coluna, colunas }) => html`
              <button type="button"
                class="evento evento--${c.tipo}${c.mascarado ? ' evento--oculto' : ''}${c.situacao === 'realizado' ? ' evento--realizado' : ''}${duracao < 45 ? ' evento--curto' : ''}"
                data-acao="evento" data-id="${c.id}"
                data-vars="--cor:${corDe(c.membro_id)};--topo:${pct(inicio)}%;--altura:${Math.round(((fim - inicio) / total) * 10000) / 100}%;--esq:${Math.round((coluna / colunas) * 10000) / 100}%;--larg:${Math.round((1 / colunas) * 10000) / 100}%"
                title="${hora(c.inicio)}–${hora(c.fim)} · ${nomeDe(c.membro_id)}${c.titulo ? ` · ${c.titulo}` : ''}">
                <span class="evento__titulo"><span class="evento__hora">${hora(c.inicio)}</span> ${c.titulo || c.cliente_nome || TIPOS_COMPROMISSO[c.tipo]}</span>
                <span class="sub">${nomeDe(c.membro_id)}${c.mascarado ? '' : ` · ${rotuloTipo(c.tipo, c.modalidade).toLowerCase()}`}</span>
              </button>`)}
          </div>`)}
      </div>
    </div>

    <div class="agenda-lista secao">
      ${vazia ? html`<section class="painel">${vazio('Nenhum compromisso nesta semana.')}</section>` : dias.filter((d) => d.itens.length || d.diaTodo.length).map((d) => html`
        <section class="agenda-lista__dia">
          <h3>${capitalizar(dataExtensa(d.iso))}${d.hoje ? ' — hoje' : ''}</h3>
          <ul class="compromissos painel">
            ${[...d.diaTodo.map((c) => ({ c, texto: 'Dia todo' })), ...d.itens.map(({ c }) => ({ c, texto: `${hora(c.inicio)}–${hora(c.fim)}` }))].map(({ c, texto }) => html`
              <li class="compromisso" data-vars="--cor:${corDe(c.membro_id)}">
                <span class="compromisso__hora">${texto}</span>
                <span class="compromisso__corpo">
                  <strong>${c.titulo || c.cliente_nome || TIPOS_COMPROMISSO[c.tipo]}</strong>
                  <span class="sub">${nomeDe(c.membro_id)} · ${rotuloTipo(c.tipo, c.modalidade)}</span>
                </span>
                <span class="compromisso__acoes">${c.mascarado ? '' : html`<button type="button" class="botao botao--pequeno" data-acao="evento" data-id="${c.id}">Abrir</button>`}</span>
              </li>`)}
          </ul>
        </section>`)}
    </div>

    <p class="sub secao nao-imprimir">Grade das ${config.hora_inicio}h às ${config.hora_fim}h · intervalo mínimo entre atendimentos de ${config.intervalo_minimo} minutos. Compromissos fora da grade também aparecem.</p>`;
}

// ---------------------------------------------------------------------------
// Diálogos
// ---------------------------------------------------------------------------

const linkOuTexto = (texto) => (/^https?:\/\//i.test(texto)
  ? html`<a href="${texto}" target="_blank" rel="noopener">${texto}</a>`
  : texto);

function quando(c) {
  const inicio = noFuso(c.inicio).dia;
  if (c.dia_inteiro) {
    const ultimo = somarDias(noFuso(c.fim).dia, -1);
    return ultimo === inicio ? `${capitalizar(dataExtensa(inicio))}, dia todo` : `De ${data(inicio)} a ${data(ultimo)}, dias inteiros`;
  }
  const fim = noFuso(c.fim).dia;
  return fim === inicio
    ? `${capitalizar(dataExtensa(inicio))}, ${hora(c.inicio)}–${hora(c.fim)}`
    : `De ${data(inicio)} ${hora(c.inicio)} a ${data(fim)} ${hora(c.fim)}`;
}

function detalhe(c) {
  const podeMarcar = c.pode_editar && ['atendimento', 'audiencia'].includes(c.tipo) && c.situacao === 'agendado';

  return abrirDialogo({
    titulo: c.titulo || c.cliente_nome || rotuloTipo(c.tipo, c.modalidade),
    somenteLeitura: true,
    corpo: html`
      <dl class="dados">
        <div><dt>Quando</dt><dd>${quando(c)}</dd></div>
        <div><dt>Responsável</dt><dd>${nomeDe(c.membro_id)}</dd></div>
        <div><dt>Tipo</dt><dd>${rotuloTipo(c.tipo, c.modalidade)}${c.particular ? ' · particular' : ''}</dd></div>
        ${c.cliente_nome ? html`<div><dt>Cliente</dt><dd>${c.cliente_nome}${c.cliente_telefone ? html` · <a href="${linkWhatsApp(c.cliente_telefone)}" target="_blank" rel="noopener">${telefone(c.cliente_telefone)}</a>` : ''}</dd></div>` : ''}
        ${c.processo ? html`<div><dt>Processo</dt><dd>${c.processo}</dd></div>` : ''}
        ${c.local_ou_link ? html`<div><dt>Local ou link</dt><dd>${linkOuTexto(c.local_ou_link)}</dd></div>` : ''}
        ${c.observacoes ? html`<div><dt>Observações</dt><dd>${c.observacoes}</dd></div>` : ''}
        <div><dt>Situação</dt><dd>${seloCompromisso(c.situacao)}${c.chegada_em ? ` · cliente chegou às ${hora(c.chegada_em)}` : ''}</dd></div>
      </dl>
      <p class="grupo-botoes secao">
        ${podeMarcar ? html`
          ${c.tipo === 'atendimento' && !c.chegada_em ? html`<button type="button" class="botao" data-papel="situacao" data-valor="chegou">Cliente chegou</button>` : ''}
          <button type="button" class="botao" data-papel="situacao" data-valor="realizado">Realizado</button>
          <button type="button" class="botao" data-papel="situacao" data-valor="faltou">Faltou</button>
          <button type="button" class="botao" data-papel="situacao" data-valor="remarcado">Remarcado</button>` : ''}
        ${c.pode_editar ? html`
          <button type="button" class="botao" data-papel="editar">Editar</button>
          <button type="button" class="botao botao--discreto" data-papel="cancelar">Cancelar compromisso</button>` : ''}
        <button type="button" class="botao botao--discreto" data-papel="historico">Histórico</button>
      </p>`,

    aoAbrir: (dialogo, _, fechar) => {
      dialogo.addEventListener('click', async (e) => {
        const alvo = e.target.closest('[data-papel]');
        if (!alvo) return;
        try {
          if (alvo.dataset.papel === 'situacao') {
            const valor = alvo.dataset.valor;
            await db.alterar('compromissos', [['id', 'eq', c.id]], valor === 'chegou' ? { chegada_em: new Date().toISOString() } : { situacao: valor }, 'id');
            avisar(valor === 'chegou' ? 'Chegada registrada.' : 'Situação atualizada.');
            fechar(true);
          } else if (alvo.dataset.papel === 'editar') {
            fechar('editar');
          } else if (alvo.dataset.papel === 'cancelar') {
            const motivo = await pedirMotivo({ titulo: 'Cancelar compromisso', rotuloOk: 'Cancelar compromisso', texto: 'O compromisso sai da agenda e fica no histórico.' });
            if (!motivo) return;
            await db.alterar('compromissos', [['id', 'eq', c.id]], { cancelado_em: new Date().toISOString(), motivo_cancelamento: motivo }, 'id');
            avisar('Compromisso cancelado.');
            fechar(true);
          } else if (alvo.dataset.papel === 'historico') {
            abrirHistorico({ titulo: c.titulo || rotuloTipo(c.tipo, c.modalidade), registros: [c.id] });
          }
        } catch (erro) {
          avisarErro(erro);
        }
      });
    },
  });
}

const duracaoPadrao = (config, tipo, modalidade) => {
  if (tipo === 'atendimento' && modalidade === 'retorno') return config.duracao_retorno;
  if (tipo === 'audiencia') return config.duracao_audiencia;
  if (tipo === 'interno') return config.duracao_interno;
  return config.duracao_atendimento;
};

function periodo(form) {
  if (form.dia_inteiro.checked) {
    const primeiro = form.dia_inicio.value;
    const ultimo = form.dia_fim.value;
    if (!primeiro || !ultimo || ultimo < primeiro) return null;
    return { inicio: instante(primeiro), fim: instante(somarDias(ultimo, 1)), primeiro, ultimo };
  }
  const dia = form.dia.value;
  const comeca = form.hora_inicio.value;
  const termina = form.hora_fim.value;
  if (!dia || !comeca || !termina || termina <= comeca) return null;
  return { inicio: instante(dia, comeca), fim: instante(dia, termina), primeiro: dia, ultimo: dia };
}

async function editarCompromisso(c, { config, dia = hoje(), minuto = 9 * 60 }) {
  const clientes = await carregarClientes();
  const novo = !c;
  const eu = estado.membro.id;
  const deTodos = pode.agendaDeTodos();
  const tipo = c?.tipo ?? 'atendimento';
  const comeca = c ? noFuso(c.inicio) : { dia, minuto };
  const duracao = c ? Math.round((ms(c.fim) - ms(c.inicio)) / 60000) : duracaoPadrao(config, 'atendimento', 'presencial');
  const termina = Math.min(comeca.minuto + duracao, 23 * 60 + 55);
  const ultimoDia = c?.dia_inteiro ? somarDias(noFuso(c.fim).dia, -1) : comeca.dia;

  return abrirDialogo({
    titulo: novo ? 'Novo compromisso' : 'Editar compromisso',
    rotuloOk: novo ? 'Marcar' : 'Salvar',
    largo: true,
    corpo: html`
      <div class="campos">
        <label class="campo campo--4"><span>Tipo</span><select name="tipo">${opcoes(Object.entries(TIPOS_COMPROMISSO), tipo)}</select></label>
        <label class="campo campo--4"><span>Modalidade</span><select name="modalidade"></select></label>
        <label class="campo campo--4">
          <span>Responsável</span>
          <select name="membro_id" ${deTodos ? '' : 'disabled'}>${opcoes(membrosAtivos().map((m) => [m.id, m.nome_curto]), c?.membro_id ?? eu)}</select>
        </label>
        <label class="opcao"><input type="checkbox" name="dia_inteiro" ${c?.dia_inteiro ? 'checked' : ''}> Dia inteiro — férias, viagem, ausência de um ou mais dias</label>

        <div class="campos" data-papel="horario">
          <label class="campo campo--4"><span>Dia</span><input type="date" name="dia" value="${comeca.dia}"></label>
          <label class="campo campo--4"><span>Começa</span><input type="time" name="hora_inicio" step="300" value="${horaDoMinuto(comeca.minuto)}"></label>
          <label class="campo campo--4"><span>Termina</span><input type="time" name="hora_fim" step="300" value="${horaDoMinuto(termina)}"></label>
        </div>
        <div class="campos" data-papel="dias" hidden>
          <label class="campo campo--6"><span>Primeiro dia</span><input type="date" name="dia_inicio" value="${comeca.dia}"></label>
          <label class="campo campo--6"><span>Último dia</span><input type="date" name="dia_fim" value="${ultimoDia}"></label>
        </div>

        <label class="campo"><span>Assunto</span><input name="titulo" value="${c?.titulo ?? ''}" maxlength="200" placeholder="Ex.: Primeira conversa — rescisão"></label>
        ${campoCliente(clientes, { rotulo: 'Cliente', obrigatorio: false, atual: c?.cliente_id, classe: 'campo--8' })}
        <label class="campo campo--4" data-papel="processo"><span>Nº do processo</span><input name="processo" value="${c?.processo ?? ''}" maxlength="40"></label>
        <label class="campo"><span>Local ou link</span><input name="local_ou_link" value="${c?.local_ou_link ?? ''}" maxlength="300" placeholder="Sala, fórum ou link da reunião"></label>
        <label class="campo"><span>Observações</span><textarea name="observacoes" rows="2">${c?.observacoes ?? ''}</textarea></label>
        <label class="campo campo--6">
          <span>Lembrete</span>
          <select name="lembrete_minutos">${opcoes(LEMBRETES, c?.lembrete_minutos ?? '')}</select>
          <span class="campo__ajuda">Vira alerta no Google Agenda quando a integração existir.</span>
        </label>
        <label class="opcao campo--6" data-papel="particular"><input type="checkbox" name="particular" ${c?.particular ? 'checked' : ''}> Particular — os outros veem só "Ocupado"</label>
      </div>
      <p class="nota secao" data-papel="conflito" role="status" hidden></p>`,

    aoAbrir: (dialogo, form) => {
      ligarCampoCliente(form, clientes);
      const bloco = (papel) => $(`[data-papel="${papel}"]`, dialogo);
      const campoDoCliente = form.cliente_texto.closest('.campo');
      let fimMexido = !novo;

      const atualizarModalidades = (preferida) => {
        const lista = Object.entries(MODALIDADES[form.tipo.value]);
        const atual = preferida ?? form.modalidade.value;
        desenhar(form.modalidade, opcoes(lista, lista.some(([v]) => v === atual) ? atual : lista[0][0]));
      };
      const atualizarBlocos = () => {
        campoDoCliente.hidden = form.tipo.value === 'bloqueio';
        bloco('processo').hidden = form.tipo.value !== 'audiencia';
        const inteiro = form.dia_inteiro.checked;
        bloco('horario').hidden = inteiro;
        bloco('dias').hidden = !inteiro;
        const meu = (form.membro_id.value || eu) === eu;
        bloco('particular').hidden = !meu;
        if (!meu) form.particular.checked = false;
      };
      const aplicarDuracao = () => {
        if (fimMexido || !form.hora_inicio.value) return;
        const [h, m] = form.hora_inicio.value.split(':').map(Number);
        form.hora_fim.value = horaDoMinuto(Math.min(h * 60 + m + duracaoPadrao(config, form.tipo.value, form.modalidade.value), 23 * 60 + 55));
      };

      let pedido = 0;
      const verificarConflitos = async () => {
        const este = ++pedido;
        const caixa = bloco('conflito');
        const p = periodo(form);
        if (!p) {
          caixa.hidden = true;
          return;
        }
        try {
          const existentes = await db.rpc('agenda_periodo', { p_de: instante(p.primeiro), p_ate: instante(somarDias(p.ultimo, 1)) });
          if (este !== pedido) return;
          const intervalo = form.tipo.value === 'bloqueio' ? 0 : config.intervalo_minimo;
          const r = conflitos(
            { id: c?.id, membro_id: form.membro_id.value || eu, inicio: ms(p.inicio), fim: ms(p.fim) },
            existentes.map((x) => ({ ...x, inicio: ms(x.inicio), fim: ms(x.fim) })),
            intervalo,
          );
          const descrever = (x) => `${x.dia_inteiro ? 'dia todo' : `${hora(x.inicio)}–${hora(x.fim)}`} ${x.titulo || x.cliente_nome || TIPOS_COMPROMISSO[x.tipo]}`;
          const partes = [];
          if (r.sobrepostos.length) partes.push(`Conflita com ${r.sobrepostos.map(descrever).join('; ')}.`);
          if (r.colados.length) partes.push(`Fica a menos de ${intervalo} minutos de ${r.colados.map(descrever).join('; ')}.`);
          caixa.textContent = partes.length ? `${partes.join(' ')} Dá para marcar mesmo assim.` : '';
          caixa.hidden = !partes.length;
        } catch {
          caixa.hidden = true;
        }
      };

      let espera = null;
      form.addEventListener('input', (e) => {
        if (e.target.name === 'hora_fim') fimMexido = true;
        if (e.target.name === 'hora_inicio') aplicarDuracao();
        clearTimeout(espera);
        espera = setTimeout(verificarConflitos, 350);
      });
      form.addEventListener('change', (e) => {
        if (e.target.name === 'tipo') {
          atualizarModalidades();
          if (novo && form.tipo.value === 'bloqueio') form.dia_inteiro.checked = true;
          aplicarDuracao();
        }
        if (e.target.name === 'modalidade') aplicarDuracao();
        atualizarBlocos();
      });

      atualizarModalidades(c?.modalidade);
      atualizarBlocos();
      verificarConflitos();
    },

    aoEnviar: async (d, form) => {
      const p = periodo(form);
      if (!p) {
        throw new Error(form.dia_inteiro.checked
          ? 'Informe o primeiro e o último dia — o último igual ou depois do primeiro.'
          : 'Informe o dia e um horário de fim depois do começo.');
      }
      const registro = {
        membro_id: deTodos ? form.membro_id.value : c?.membro_id ?? eu,
        tipo: d.tipo,
        modalidade: d.modalidade || null,
        titulo: d.titulo || null,
        inicio: p.inicio,
        fim: p.fim,
        dia_inteiro: Boolean(d.dia_inteiro),
        cliente_id: d.tipo === 'bloqueio' ? null : d.cliente_id || null,
        processo: d.tipo === 'audiencia' ? d.processo || null : null,
        local_ou_link: d.local_ou_link || null,
        observacoes: d.observacoes || null,
        particular: Boolean(d.particular),
        lembrete_minutos: d.lembrete_minutos ? Number(d.lembrete_minutos) : null,
      };
      if (registro.tipo !== 'bloqueio' && !registro.titulo && !registro.cliente_id) {
        throw new Error('Informe o assunto ou o cliente.');
      }

      if (novo) await db.inserir('compromissos', registro, 'id');
      else await db.alterar('compromissos', [['id', 'eq', c.id]], registro, 'id');
      avisar(novo ? 'Compromisso marcado.' : 'Compromisso salvo.');
      return true;
    },
  });
}

function configurarAgenda(config) {
  const numero = (nome, rotulo, min, max) => html`
    <label class="campo campo--6"><span>${rotulo}</span><input type="number" name="${nome}" min="${min}" max="${max}" value="${config[nome]}" required></label>`;

  return abrirDialogo({
    titulo: 'Configurar agenda',
    corpo: html`
      <div class="campos">
        ${numero('hora_inicio', 'Grade começa às (hora)', 0, 23)}
        ${numero('hora_fim', 'Grade termina às (hora)', 1, 24)}
        <label class="opcao"><input type="checkbox" name="sabado" ${config.sabado ? 'checked' : ''}> Mostrar o sábado</label>
        ${numero('intervalo_minimo', 'Intervalo mínimo entre atendimentos (min)', 0, 120)}
        ${numero('duracao_atendimento', 'Atendimento (min)', 5, 600)}
        ${numero('duracao_retorno', 'Retorno (min)', 5, 600)}
        ${numero('duracao_audiencia', 'Audiência (min)', 5, 600)}
        ${numero('duracao_interno', 'Reunião interna (min)', 5, 600)}
      </div>`,
    aoEnviar: async (d) => {
      if (Number(d.hora_fim) <= Number(d.hora_inicio)) throw new Error('A grade precisa terminar depois de começar.');
      await db.alterar('config_agenda', [['id', 'eq', config.id]], {
        hora_inicio: Number(d.hora_inicio),
        hora_fim: Number(d.hora_fim),
        sabado: Boolean(d.sabado),
        intervalo_minimo: Number(d.intervalo_minimo),
        duracao_atendimento: Number(d.duracao_atendimento),
        duracao_retorno: Number(d.duracao_retorno),
        duracao_audiencia: Number(d.duracao_audiencia),
        duracao_interno: Number(d.duracao_interno),
      }, 'id');
      avisar('Agenda configurada.');
      return true;
    },
  });
}
