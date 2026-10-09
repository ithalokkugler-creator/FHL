// Contatos (F1) — quem procurou o escritório e o que foi feito com cada um.
// =========================================================================
//
// O formulário do site chega aqui sozinho (função receber-contato); contatos
// por telefone, WhatsApp ou indicação a equipe lança à mão. A mensagem
// original não se edita. Responder só prepara o texto: enviar continua sendo
// um gesto da pessoa, no aplicativo dela.

import { avisar, avisarErro } from '../nucleo/avisos.js';
import { abrirDialogo } from '../nucleo/dialogo.js';
import { estado, membrosAtivos, nomeDe } from '../nucleo/estado.js';
import { dataHora, hoje, inicioDoMes, instante, linkWhatsApp, noFuso, somarDias, telefone } from '../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../nucleo/html.js';
import { guardarConsulta } from '../nucleo/rotas.js';
import { db } from '../nucleo/supabase.js';
import { COLUNAS_CONTATO, filtrarContatos, origemContato, resumirOrigens } from '../dominio/contatos.js';
import { mensagemRespostaContato } from '../dominio/mensagens.js';
import { campoCliente, carregarClientes, ligarCampoCliente, rotuloCliente } from './clientes.js';
import { formularioCompleto } from './clientes/formulario.js';
import { cabecalho, CANAIS_CONTATO, indicador, opcoes, seloContato, SITUACOES_CONTATO, vazio } from './comum.js';
import { abrirHistorico } from './historico.js';

const responsaveis = (id) => opcoes(membrosAtivos().map((m) => [m.id, m.nome_curto]), id, { vazio: 'Sem responsável' });
const alterarContato = (c, dados) => db.alterar('contatos', [['id', 'eq', c.id]], dados, 'id');
/** Acrescenta uma linha às observações, sem apagar as anteriores. */
const observacao = (c, texto) => [c.observacoes, texto].filter(Boolean).join('\n');
const agora = () => dataHora(new Date().toISOString());
const dataValida = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s ?? '') ? s : '');

export default async function telaContatos(ctx) {
  let contatos = [];
  const filtro = {
    situacao: ctx.consulta.situacao === 'todas' || SITUACOES_CONTATO[ctx.consulta.situacao] ? ctx.consulta.situacao : 'abertos',
    canal: CANAIS_CONTATO[ctx.consulta.canal] ? ctx.consulta.canal : '',
    campanha: ctx.consulta.campanha ?? '',
    busca: ctx.consulta.busca ?? '',
    de: dataValida(ctx.consulta.de),
    ate: dataValida(ctx.consulta.ate),
  };

  const mostrar = () => {
    // As datas do filtro são dias de Brasília, não o dia UTC do carimbo.
    const ids = new Set(filtrarContatos(contatos.map((c) => ({ ...c, recebido_em: noFuso(c.recebido_em).dia })), filtro).map((c) => c.id));
    desenhar($('[data-lista]', ctx.raiz), tabela(contatos.filter((c) => ids.has(c.id))));
  };

  const carregar = async () => {
    contatos = await db.todos('contatos', { select: COLUNAS_CONTATO, ordem: 'recebido_em.desc,id.desc' });
    if (!ctx.ativa()) return;
    desenhar(ctx.raiz, tela(contatos, filtro));
    const form = $('form.filtros', ctx.raiz);
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('input', () => {
      Object.assign(filtro, Object.fromEntries(new FormData(form)));
      guardarConsulta(filtro);
      mostrar();
    });
    mostrar();
  };

  await carregar();
  if (!ctx.ativa()) return;

  const contatoDe = (el) => contatos.find((c) => c.id === el.dataset.id);
  const depois = async (promessa) => {
    if (await promessa && ctx.ativa()) await carregar();
  };
  return aoClicar(ctx.raiz, {
    novo: () => depois(novoContato()).catch(avisarErro),
    abrir: (el) => depois(abrirContato(contatoDe(el))).catch(avisarErro),
    responder: (el) => depois(responderContato(contatoDe(el))).catch(avisarErro),
    converter: (el) => depois(converterContato(contatoDe(el))).catch(avisarErro),
    arquivar: (el) => depois(arquivarContato(contatoDe(el))).catch(avisarErro),
    historico: (el) => abrirHistorico({ titulo: contatoDe(el).nome, registros: [el.dataset.id] }),
  });
}

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------

function tela(contatos, f) {
  const dia = hoje();
  const desde = instante(somarDias(dia, -90));
  const inicioMes = Date.parse(instante(inicioDoMes(dia)));
  const inicioConversoes = Date.parse(desde);
  const origens = resumirOrigens(contatos, desde);
  const novos = contatos.filter((c) => c.situacao === 'novo').length;
  const campanhas = [...new Set(contatos.map((c) => c.campanha).filter(Boolean))].sort();
  // "Viraram clientes" conta pela data da conversão, não pela de chegada.
  const convertidos = contatos.filter((c) => c.situacao === 'convertido' && Date.parse(c.convertido_em) >= inicioConversoes).length;

  return html`
    ${cabecalho('Contatos', 'Quem procurou o escritório e o que foi feito com cada um', html`
      <button class="botao botao--primario" type="button" data-acao="novo">Novo contato</button>`)}
    <div class="indicadores">
      ${indicador('Novos', novos, '', { tom: novos ? 'perigo' : '' })}
      ${indicador('Em atendimento', contatos.filter((c) => c.situacao === 'em_atendimento').length)}
      ${indicador('Recebidos no mês', contatos.filter((c) => Date.parse(c.recebido_em) >= inicioMes).length)}
      ${indicador('Viraram clientes', convertidos, 'Conversões nos últimos 90 dias')}
    </div>
    <form class="filtros filtros--contatos secao">
      <label class="campo"><span>Situação</span><select name="situacao">${opcoes([['abertos', 'Abertos'], ['todas', 'Todas'], ...Object.entries(SITUACOES_CONTATO)], f.situacao)}</select></label>
      <label class="campo"><span>Canal</span><select name="canal">${opcoes(Object.entries(CANAIS_CONTATO), f.canal, { vazio: 'Todos' })}</select></label>
      <label class="campo"><span>Campanha</span><select name="campanha">${opcoes(campanhas.map((c) => [c, c]), f.campanha, { vazio: 'Todas' })}</select></label>
      <label class="campo campo--busca"><span>Buscar</span><input type="search" name="busca" value="${f.busca}" placeholder="Nome, e-mail ou telefone"></label>
      <label class="campo"><span>De</span><input type="date" name="de" value="${f.de}"></label>
      <label class="campo"><span>Até</span><input type="date" name="ate" value="${f.ate}"></label>
    </form>
    <section class="painel" data-lista></section>
    <section class="painel secao">
      <header class="painel__topo"><h2 class="painel__titulo">De onde vêm os contatos</h2><span class="sub">Últimos 90 dias</span></header>
      ${origens.length
        ? html`<ul class="lista">${origens.map(([origem, n]) => html`<li class="lista__item"><span>${origem}</span><strong class="num">${n}</strong></li>`)}</ul>`
        : vazio('Nenhum contato recebido nos últimos 90 dias.')}
    </section>`;
}

function tabela(lista) {
  if (!lista.length) return vazio('Nenhum contato com esses filtros.');
  const resumo = (texto = '') => `${texto.slice(0, 110)}${texto.length > 110 ? '…' : ''}`;
  return html`
    <div class="tabela-rolagem"><table class="tabela tabela--contatos">
      <thead><tr><th>Recebido em</th><th>Pessoa / contato</th><th>Origem</th><th>Mensagem</th><th>Responsável</th><th>Situação</th><th class="acoes">Ações</th></tr></thead>
      <tbody>${lista.map((c) => html`
        <tr>
          <td>${dataHora(c.recebido_em)}</td>
          <td><strong>${c.nome}</strong><span class="sub">${c.telefone ? telefone(c.telefone) : ''}</span><span class="sub">${c.email ?? ''}</span></td>
          <td><span class="selo">${origemContato(c)}</span></td>
          <td class="contato-resumo">${resumo(c.mensagem ?? '')}</td>
          <td>${nomeDe(c.responsavel_id)}</td>
          <td>${seloContato(c.situacao)}</td>
          <td class="acoes"><div class="contato-acoes">
            <div class="contato-acoes__linha">
              <button type="button" class="botao botao--pequeno" data-acao="abrir" data-id="${c.id}">Abrir</button>
              <button type="button" class="botao botao--pequeno" data-acao="responder" data-id="${c.id}">Responder</button>
            </div>
            ${c.situacao !== 'convertido' ? html`<button type="button" class="botao botao--pequeno" data-acao="converter" data-id="${c.id}">Virou cliente</button>` : ''}
            <div class="contato-acoes__linha">
              ${!['arquivado', 'convertido'].includes(c.situacao) ? html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="arquivar" data-id="${c.id}">Arquivar</button>` : ''}
              <button type="button" class="botao botao--pequeno botao--discreto" data-acao="historico" data-id="${c.id}">Histórico</button>
            </div>
          </div></td>
        </tr>`)}
      </tbody>
    </table></div>`;
}

// ---------------------------------------------------------------------------
// Diálogos
// ---------------------------------------------------------------------------

/** Contato que chegou por fora do site: telefone, WhatsApp, indicação… */
function novoContato() {
  return abrirDialogo({
    titulo: 'Novo contato',
    rotuloOk: 'Cadastrar',
    largo: true,
    corpo: html`
      <div class="campos">
        <label class="campo campo--6"><span>Canal</span><select name="canal">${opcoes(Object.entries(CANAIS_CONTATO).filter(([v]) => v !== 'site'), 'telefone')}</select></label>
        <label class="campo campo--6"><span>Responsável</span><select name="responsavel_id">${responsaveis(estado.membro.id)}</select></label>
        <label class="campo"><span>Nome</span><input name="nome" required maxlength="200" autofocus></label>
        <label class="campo campo--6"><span>Telefone</span><input name="telefone" type="tel" maxlength="40"></label>
        <label class="campo campo--6"><span>E-mail</span><input name="email" type="email" maxlength="200"></label>
        <label class="campo"><span>Empresa</span><input name="empresa" maxlength="200"></label>
        <label class="campo"><span>Mensagem</span><textarea name="mensagem" rows="4" maxlength="5000"></textarea></label>
        <label class="campo"><span>Observações</span><textarea name="observacoes" rows="2"></textarea></label>
      </div>`,
    aoEnviar: async (d) => {
      if (!d.nome.trim()) throw new Error('Preencha o nome.');
      if (!d.email && !d.telefone) throw new Error('Informe telefone ou e-mail para responder.');
      await db.inserir('contatos', {
        ...d,
        email: d.email?.toLowerCase() || null,
        telefone: d.telefone || null,
        empresa: d.empresa || null,
        mensagem: d.mensagem || null,
        responsavel_id: d.responsavel_id || null,
      }, 'id');
      avisar('Contato cadastrado.');
      return true;
    },
  });
}

function abrirContato(c) {
  // "Convertido" só nasce junto de um vínculo; o formulário não pode fingir isso.
  const situacoes = Object.entries(SITUACOES_CONTATO).filter(([v]) => c.cliente_id || v !== 'convertido');
  const meios = [c.telefone && telefone(c.telefone), c.email].filter(Boolean).join(' · ');
  return abrirDialogo({
    titulo: c.nome,
    largo: true,
    corpo: html`
      <dl class="dados">
        <div><dt>Origem</dt><dd>${origemContato(c)}</dd></div>
        <div><dt>Recebido</dt><dd>${dataHora(c.recebido_em)}</dd></div>
        <div><dt>Contato</dt><dd>${meios || '—'}</dd></div>
        <div><dt>Empresa</dt><dd>${c.empresa ?? '—'}</dd></div>
        <div><dt>Consentimento</dt><dd>${c.consentimento_em ? dataHora(c.consentimento_em) : 'Contato lançado pela equipe'}</dd></div>
        <div><dt>Cliente vinculado</dt><dd>${c.cliente_id ? html`<a href="#/clientes/${c.cliente_id}">Abrir ficha do cliente</a>` : '—'}</dd></div>
      </dl>
      <p class="rotulo">Mensagem recebida</p>
      <p class="contato-mensagem">${c.mensagem || 'Sem mensagem.'}</p>
      <div class="campos secao">
        <label class="campo campo--6"><span>Situação</span><select name="situacao">${opcoes(situacoes, c.situacao)}</select></label>
        <label class="campo campo--6"><span>Responsável</span><select name="responsavel_id">${responsaveis(c.responsavel_id)}</select></label>
        <label class="campo"><span>Observações</span><textarea name="observacoes" rows="4">${c.observacoes ?? ''}</textarea></label>
      </div>`,
    aoEnviar: async (d) => {
      await alterarContato(c, { ...d, responsavel_id: d.responsavel_id || null });
      avisar('Contato salvo.');
      return true;
    },
  });
}

const CANAIS_RESPOSTA = { whatsapp: 'WhatsApp', telefone: 'telefone', email: 'e-mail' };

function responderContato(c) {
  const canais = [
    ...(c.telefone ? [['whatsapp', 'WhatsApp'], ['telefone', 'Telefone']] : []),
    ...(c.email ? [['email', 'E-mail']] : []),
  ];
  return abrirDialogo({
    titulo: `Responder — ${c.nome}`,
    rotuloOk: 'Registrar que respondi',
    largo: true,
    corpo: html`
      <label class="campo"><span>Mensagem para conferir e enviar</span>
        <textarea name="texto" rows="6">${mensagemRespostaContato({ contato: c, remetente: estado.membro.nome_curto })}</textarea></label>
      <div class="pagina__acoes secao">
        <button type="button" class="botao" data-copiar>Copiar</button>
        ${c.telefone ? html`<a class="botao" data-whats href="${linkWhatsApp(c.telefone)}" target="_blank" rel="noopener">Abrir no WhatsApp</a>` : ''}
        ${c.email ? html`<a class="botao" data-email href="mailto:${c.email}" target="_blank" rel="noopener">Abrir e-mail</a>` : ''}
      </div>
      <label class="campo secao"><span>Canal usado</span><select name="canal">${opcoes(canais, c.telefone ? 'whatsapp' : 'email')}</select></label>
      <p class="nota secao">Confira o texto e envie pelo aplicativo. Este botão só registra que você respondeu.</p>`,
    aoAbrir: (dialogo, form) => {
      // Os links levam o texto como está na caixa, inclusive depois de editado.
      const atualizar = () => {
        const whats = $('[data-whats]', dialogo);
        const email = $('[data-email]', dialogo);
        if (whats) whats.href = linkWhatsApp(c.telefone, form.texto.value);
        if (email) email.href = `mailto:${c.email}?subject=${encodeURIComponent('Contato — Fonseca Lisboa Advocacia')}&body=${encodeURIComponent(form.texto.value)}`;
      };
      form.texto.addEventListener('input', atualizar);
      atualizar();
      $('[data-copiar]', dialogo).addEventListener('click', () => navigator.clipboard.writeText(form.texto.value)
        .then(() => avisar('Mensagem copiada.'))
        .catch(() => avisar('Selecione o texto e copie.')));
    },
    aoEnviar: async (d) => {
      await alterarContato(c, {
        situacao: c.situacao === 'convertido' ? 'convertido' : 'contatado',
        observacoes: observacao(c, `${agora()} · ${estado.membro.nome_curto} respondeu por ${CANAIS_RESPOSTA[d.canal] ?? d.canal}.`),
      });
      avisar('Resposta registrada.');
      return true;
    },
  });
}

/** "Virou cliente": escolhe um cliente já cadastrado ou cadastra com os dados
 *  do contato, e liga os dois (o banco carimba a data da conversão). */
async function converterContato(c) {
  const clientes = await carregarClientes();
  return abrirDialogo({
    titulo: `Virou cliente — ${c.nome}`,
    rotuloOk: 'Vincular cliente',
    corpo: html`
      <p class="dialogo__texto">Escolha quem já está cadastrado ou cadastre com os dados deste contato.</p>
      ${campoCliente(clientes, { atual: c.cliente_id })}
      <button type="button" class="botao secao" data-cadastrar-contato>Cadastrar com os dados do contato</button>`,
    aoAbrir: (dialogo, form) => {
      ligarCampoCliente(form, clientes);
      const botao = $('[data-cadastrar-contato]', dialogo);
      botao.addEventListener('click', async () => {
        botao.disabled = true;
        try {
          const novo = await formularioCompleto(null, { nome: c.nome, email: c.email, telefone: c.telefone });
          if (!novo) return;
          clientes.push(novo);
          const opcao = document.createElement('option');
          opcao.value = rotuloCliente(novo);
          $(`#${form.cliente_texto.getAttribute('list')}`, dialogo).append(opcao);
          form.cliente_texto.value = rotuloCliente(novo);
          form.cliente_texto.setCustomValidity('');
          form.cliente_id.value = novo.id;
          avisar('Cliente cadastrado. Clique em Vincular cliente para concluir.');
        } catch (erro) {
          avisarErro(erro);
        } finally {
          botao.disabled = false;
        }
      });
    },
    aoEnviar: async (d) => {
      if (!d.cliente_id) throw new Error('Escolha ou cadastre um cliente.');
      try {
        await alterarContato(c, { situacao: 'convertido', cliente_id: d.cliente_id });
      } catch (erro) {
        throw new Error(`O cliente continua cadastrado, mas o vínculo não foi salvo. Escolha-o novamente para tentar vincular. ${erro.message}`);
      }
      avisar('Contato convertido em cliente.');
      return true;
    },
  });
}

function arquivarContato(c) {
  return abrirDialogo({
    titulo: `Arquivar — ${c.nome}`,
    rotuloOk: 'Arquivar',
    corpo: html`
      <p class="dialogo__texto">O contato fica no histórico e pode ser consultado pelo filtro Arquivado.</p>
      <label class="campo"><span>Observação (opcional)</span><textarea name="observacao" rows="3" placeholder="Spam, fora da área, desistiu…"></textarea></label>`,
    aoEnviar: async (d) => {
      await alterarContato(c, {
        situacao: 'arquivado',
        observacoes: observacao(c, `${agora()} · ${estado.membro.nome_curto} arquivou.${d.observacao ? ` ${d.observacao}` : ''}`),
      });
      avisar('Contato arquivado.');
      return true;
    },
  });
}
