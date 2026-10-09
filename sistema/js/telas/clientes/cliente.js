// Ficha do cliente (F2): tudo o que pertence a ele numa tela só — processos,
// atualizações e tempo, tarefas e prazos, documentos, agenda, financeiro,
// contatos, anexos, dados completos e de onde veio. Agenda e Financeiro só
// aparecem (e só são consultados) para quem tem acesso a eles.
//
// Contatos (T14): várias pessoas e canais por cliente. Um é o principal; quem
// recebe a cobrança é marcado no contato — o Financeiro só enxerga esses.
// Contato não se apaga: desativa.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { abrirDialogo } from '../../nucleo/dialogo.js';
import { ErroCampo } from '../../nucleo/formularios.js';
import { nomeDe, pode } from '../../nucleo/estado.js';
import { centavos, data, dataHora, documento, duracao, hoje, linkWhatsApp, moeda, noFuso, soDigitos, telefone } from '../../nucleo/formato.js';
import { aoClicar, desenhar, html } from '../../nucleo/html.js';
import { db } from '../../nucleo/supabase.js';
import { COLUNAS_CLIENTE, COLUNAS_DETALHES, COLUNAS_PROCESSO, diasParaAniversario, ESTADOS_CIVIS, TIPOS_PESSOA } from '../../dominio/clientes.js';
import { origemContato } from '../../dominio/contatos.js';
import { COLUNAS_TAREFA } from '../../dominio/tarefas.js';
import { COLUNAS_ATUALIZACAO, totais } from '../../dominio/tempo.js';
import { COLUNAS_LISTA_DOCUMENTO } from '../../documentos/acoes.js';
import { abrirAnexos } from '../anexos.js';
import { cabecalho, opcoes, seloCompromisso, seloContrato, vazio } from '../comum.js';
import { abrirHistorico } from '../historico.js';
import { formularioProcesso, tabelaProcessos } from '../processos.js';
import { iniciarCronometro } from '../atualizacoes/cronometro.js';
import { formularioAtualizacao } from '../atualizacoes/formulario.js';
import { ligarAcoesAtualizacoes, linhaDoTempo, notaRodando } from '../atualizacoes/lista.js';
import { tabelaDocumentos } from '../documentos/lista.js';
import { formularioTarefa } from '../tarefas/formulario.js';
import { ligarAcoesTarefas, tabelaTarefas } from '../tarefas/lista.js';
import { formularioCompleto } from './formulario.js';

// ---------------------------------------------------------------------------
// Peças da ficha
// ---------------------------------------------------------------------------

const painel = (titulo, acao, conteudo) => html`
  <section class="painel secao">
    <header class="painel__topo"><h2 class="painel__titulo">${titulo}</h2>${acao}</header>
    ${conteudo}
  </section>`;

const dados = (pares) => html`
  <dl class="cliente-dados">${pares.map(([nome, valor]) => html`<div><dt>${nome}</dt><dd>${valor || '—'}</dd></div>`)}</dl>`;

const grupo = (titulo, pares) => painel(titulo, '', html`<div class="painel__corpo">${dados(pares)}</div>`);

const compromissos = (lista) => (lista.length
  ? html`<ul class="cliente-registros">${lista.map((c) => html`
      <li><a href="#/agenda?dia=${noFuso(c.inicio).dia}">${c.titulo || 'Compromisso'}</a><span>${dataHora(c.inicio)} · ${nomeDe(c.membro_id)}</span>${seloCompromisso(c.situacao)}</li>`)}</ul>`
  : vazio('Nenhum compromisso neste período.'));

function painelTempo(id, cliente, atualizacoes, processos) {
  const t = totais(atualizacoes);
  const desde = atualizacoes.filter((a) => !a.cancelado_em).map((a) => noFuso(a.inicio).dia).sort()[0];
  const porMembro = Object.entries(t.porMembro).map(([m, n]) => `${nomeDe(m)}: ${duracao(n)}`).join(' · ');
  return painel('Atualizações e tempo', html`<a href="#/atualizacoes/relatorio?cliente=${id}">Relatório para o cliente</a>`, html`
    <div class="painel__corpo">
      <div class="cliente-totais">
        <p><strong>Tempo total: ${duracao(t.total)}${desde ? ` desde ${data(desde)}` : ''}</strong> · ${duracao(t.cronometrado)} cronometrado · ${duracao(t.manual)} à mão${notaRodando(t.rodando)}</p>
        ${porMembro ? html`<p class="sub">${porMembro} · Cada participante recebe o tempo integral da atividade.</p>` : ''}
      </div>
      ${linhaDoTempo(atualizacoes, [cliente], processos, { mostrarCliente: false })}
    </div>`);
}

function painelFinanceiro(contratos) {
  return painel('Financeiro', '', contratos.length
    ? html`
      <div class="tabela-rolagem"><table class="tabela">
        <thead><tr><th>Contrato</th><th>Situação</th><th class="num">Saldo</th><th class="num">Parcelas vencidas</th><th class="num">Saldo vencido</th></tr></thead>
        <tbody>${contratos.map((c) => html`
          <tr>
            <td><a href="#/financeiro/contratos/${c.id}">${c.descricao}</a></td>
            <td>${seloContrato(c.situacao)}</td>
            <td class="num">${moeda(centavos(c.saldo))}</td>
            <td class="num">${c.vencidas ?? 0}</td>
            <td class="num">${moeda(centavos(c.saldo_vencido))}</td>
          </tr>`)}
        </tbody>
      </table></div>`
    : vazio('Nenhum contrato vinculado.'));
}

const TIPOS_CONTATO = {
  proprio: 'O próprio cliente', responsavel: 'Responsável', financeiro: 'Financeiro / pagador',
  familiar: 'Familiar', recados: 'Recados', outro: 'Outro',
};

function canaisDoContato(c) {
  const canais = [];
  if (c.telefone) {
    canais.push(c.whatsapp
      ? html`<a href="${linkWhatsApp(c.telefone)}" target="_blank" rel="noopener">${telefone(c.telefone)}</a>`
      : html`<span>${telefone(c.telefone)}</span>`);
  }
  if (c.email) canais.push(html`<a href="mailto:${c.email}">${c.email}</a>`);
  return canais.map((x, i) => html`${i ? ' · ' : ''}${x}`);
}

function painelContatos(lista) {
  const ativos = lista.filter((c) => c.ativo);
  const inativos = lista.filter((c) => !c.ativo);
  const item = (c) => html`
    <li class="lista__item ${c.ativo ? '' : 'apagada'}">
      <span>
        <strong>${c.nome}</strong> <span class="sub">${TIPOS_CONTATO[c.tipo] ?? c.tipo}</span>
        ${c.principal ? html`<span class="selo selo--ok">Principal</span>` : ''}
        ${c.recebe_cobranca ? html`<span class="selo">Recebe cobrança</span>` : ''}
        ${c.ativo ? '' : html`<span class="selo">Inativo</span>`}
        <span class="sub">${canaisDoContato(c)}</span>
        ${c.observacoes ? html`<span class="sub">${c.observacoes}</span>` : ''}
      </span>
      ${pode.clientes() ? html`<span class="grupo-botoes">
        <button type="button" class="botao botao--pequeno botao--discreto" data-acao="editar-contato" data-id="${c.id}">Editar</button>
        ${c.ativo && !c.principal ? html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="principal-contato" data-id="${c.id}">Tornar principal</button>` : ''}
        ${c.principal ? '' : html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="ativo-contato" data-id="${c.id}">${c.ativo ? 'Desativar' : 'Reativar'}</button>`}
      </span>` : ''}
    </li>`;
  return painel('Contatos', pode.clientes() ? html`<button type="button" class="botao botao--pequeno" data-acao="novo-contato">Novo contato</button>` : '', html`
    ${ativos.length ? html`<ul class="lista">${ativos.map(item)}</ul>` : vazio('Nenhum contato ativo. Cadastre um contato e marque se ele recebe cobranças.')}
    ${inativos.length ? html`<details class="painel__corpo"><summary>${inativos.length} inativo(s)</summary><ul class="lista">${inativos.map(item)}</ul></details>` : ''}
    <p class="painel__rodape sub">A cobrança do Financeiro vai para quem está marcado como "Recebe cobrança". Registre como a pessoa autorizou o canal, quando for o caso (LGPD).</p>`);
}

function editarContato(clienteId, c = null) {
  return abrirDialogo({
    titulo: c ? `Editar contato — ${c.nome}` : 'Novo contato',
    corpo: html`
      <div class="campos">
        <label class="campo campo--8"><span>Nome</span><input name="nome" value="${c?.nome ?? ''}" required maxlength="200" autofocus></label>
        <label class="campo campo--4"><span>Quem é</span><select name="tipo">${opcoes(Object.entries(TIPOS_CONTATO), c?.tipo ?? 'outro')}</select></label>
        <label class="campo campo--6"><span>Telefone</span><input type="tel" name="telefone" value="${telefone(c?.telefone) || ''}" maxlength="20"></label>
        <label class="campo campo--6"><span>E-mail</span><input type="email" name="email" value="${c?.email ?? ''}" maxlength="200"></label>
        <label class="opcao campo--6"><input type="checkbox" name="whatsapp" ${c?.whatsapp !== false ? 'checked' : ''}> O telefone tem WhatsApp</label>
        <label class="opcao campo--6"><input type="checkbox" name="recebe_cobranca" ${c?.recebe_cobranca ? 'checked' : ''}> Recebe as mensagens de cobrança</label>
        <label class="campo"><span>Autorização do canal (LGPD)</span><input name="autorizacao" value="${c?.autorizacao ?? ''}" maxlength="500" placeholder="Ex.: autorizou por WhatsApp em 08/10/2026"></label>
        <label class="campo"><span>Observações</span><textarea name="observacoes" rows="2" maxlength="2000">${c?.observacoes ?? ''}</textarea></label>
      </div>`,
    aoEnviar: async (d) => {
      const fone = soDigitos(d.telefone);
      if (d.telefone && !/^\d{10,13}$/.test(fone)) throw new ErroCampo('telefone', 'Telefone precisa de DDD e 10 a 13 dígitos.');
      const email = (d.email ?? '').trim().toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new ErroCampo('email', 'Confira o e-mail.');
      if (!fone && !email) throw new ErroCampo('telefone', 'Informe telefone ou e-mail.');
      const registro = {
        nome: d.nome.trim(), tipo: d.tipo, telefone: fone || null, email: email || null, whatsapp: Boolean(d.whatsapp),
        recebe_cobranca: Boolean(d.recebe_cobranca), autorizacao: d.autorizacao?.trim() || null, observacoes: d.observacoes?.trim() || null,
      };
      if (c) await db.alterar('clientes_contatos', [['id', 'eq', c.id]], registro, 'id');
      else await db.inserir('clientes_contatos', { ...registro, cliente_id: clienteId }, 'id');
      avisar(c ? 'Contato salvo.' : 'Contato incluído.');
      return true;
    },
  });
}

function dadosCompletos(cliente, d, pj) {
  return html`
    ${grupo('Identificação', [
      ['Tipo de pessoa', TIPOS_PESSOA[d.tipo_pessoa] ?? (pj ? 'Pessoa jurídica' : 'Pessoa física')],
      ['Nome fantasia', d.nome_fantasia],
      ['Etiquetas', d.etiquetas?.length ? d.etiquetas.join(', ') : ''],
      [pj ? 'CNPJ' : 'CPF', documento(cliente.documento)],
      [pj ? 'Inscrição estadual' : 'RG', d.rg],
      [pj ? 'Constituição' : 'Nascimento', data(d.nascimento)],
      ['Nacionalidade', d.nacionalidade],
      ['Estado civil', ESTADOS_CIVIS[d.estado_civil]],
      ['Profissão', d.profissao],
      ['Filiação', d.filiacao],
      ['Concordância nos documentos', d.flexao === 'm' ? 'O cliente' : d.flexao === 'f' ? 'A cliente' : 'Neutra (a)'],
    ])}
    ${grupo('Endereço', [
      ['CEP', d.cep?.replace(/^(\d{5})(\d{3})$/, '$1-$2')],
      ['Logradouro', d.logradouro],
      ['Número', d.numero],
      ['Complemento', d.complemento],
      ['Bairro', d.bairro],
      ['Cidade', d.cidade],
      ['UF', d.uf],
    ])}
    ${grupo('Contato para recados', [
      ['Nome para recados', d.recado_nome],
      ['Relação / parentesco', d.recado_relacao],
      ['Telefone para recados', telefone(d.recado_telefone)],
      ['Observação para recados', d.recado_observacao],
    ])}
    ${grupo('Representante legal', [
      ['Nome do representante', d.representante_nome],
      ['CPF / CNPJ do representante', documento(d.representante_documento)],
      ['Relação com o cliente', d.representante_relacao],
      ['Qualificação do representante', d.representante_qualificacao],
    ])}
    ${grupo('Dados bancários', [['Banco', d.banco], ['Agência', d.agencia], ['Conta', d.conta], ['Chave Pix', d.pix]])}
    ${grupo('Organização', [['Responsável interno', nomeDe(d.responsavel_id)], ['Observações', cliente.observacoes]])}`;
}

function painelOrigem(contatos) {
  return painel('Veio de', '', contatos.length
    ? html`<ul class="cliente-registros painel__corpo">${contatos.map((c) => html`
        <li>
          <a href="#/contatos?busca=${encodeURIComponent(c.nome)}&situacao=todas">${origemContato(c)}</a>
          <span>${c.nome} · recebido em ${dataHora(c.recebido_em)}${c.convertido_em ? ` · convertido em ${dataHora(c.convertido_em)}` : ''}</span>
        </li>`)}</ul>`
    : vazio('Nenhum contato de origem vinculado.'));
}

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------

async function carregarFicha(id) {
  const agora = new Date().toISOString();
  const doCliente = [['cliente_id', 'eq', id]];
  const agenda = (filtros, ordem) => (pode.agenda()
    ? db.listar('compromissos', { select: 'id,titulo,inicio,fim,membro_id,situacao', filtros: [...doCliente, ['cancelado_em', 'is', null], ...filtros], ordem, limite: 5 })
    : []);

  const [cliente, detalhes, processos, contatos, futuros, anteriores, contratos, atualizacoes, documentos, tarefas, pessoas] = await Promise.all([
    db.um('clientes', { select: COLUNAS_CLIENTE, filtros: [['id', 'eq', id]] }),
    db.um('clientes_detalhes', { select: COLUNAS_DETALHES, filtros: doCliente }),
    db.todos('processos', { select: COLUNAS_PROCESSO, filtros: doCliente, ordem: 'criado_em.desc,id.desc' }),
    db.todos('contatos', { select: 'id,nome,canal,pagina,campanha,recebido_em,convertido_em', filtros: doCliente, ordem: 'recebido_em.desc,id.desc' }),
    agenda([['fim', 'gte', agora]], 'inicio.asc,id.asc'),
    agenda([['fim', 'lt', agora]], 'inicio.desc,id.desc'),
    pode.financeiro()
      ? db.todos('v_contratos', { select: 'id,descricao,saldo,vencidas,saldo_vencido,situacao', filtros: doCliente, ordem: 'criado_em.desc,id.desc' })
      : [],
    db.todos('atualizacoes', { select: COLUNAS_ATUALIZACAO, filtros: doCliente, ordem: 'inicio.desc,id.desc' }),
    db.todos('documentos', { select: COLUNAS_LISTA_DOCUMENTO, filtros: doCliente, ordem: 'criado_em.desc,id.desc' }),
    db.todos('v_tarefas', {
      select: COLUNAS_TAREFA,
      filtros: [...doCliente, ['cancelado_em', 'is', null], ['situacao', 'in', ['pendente', 'em_andamento']]],
      ordem: 'fatal_em.asc,id.asc',
    }),
    db.todos('clientes_contatos', { select: '*', filtros: doCliente, ordem: 'principal.desc,nome.asc,id.asc' }).catch(() => []),
  ]);
  return { cliente, detalhes, processos, contatos, futuros, anteriores, contratos, atualizacoes, documentos, tarefas, pessoas };
}

function tela(id, f) {
  const { cliente } = f;
  const d = f.detalhes ?? {};
  const pj = d.tipo_pessoa === 'juridica' || (!f.detalhes && cliente.documento?.length === 14);
  const aniversario = pj ? null : diasParaAniversario(d.nascimento, hoje());
  const quandoAniversario = aniversario === 0 ? 'hoje' : aniversario === 1 ? 'amanhã' : `em ${aniversario} dias`;

  return html`
    <a href="#/clientes" class="pagina__voltar">← Clientes</a>
    ${cabecalho(cliente.nome, `${d.nome_fantasia ? `${d.nome_fantasia} · ` : ''}${documento(cliente.documento) || 'Documento não informado'} · Responsável: ${nomeDe(d.responsavel_id)}`, html`
      <button type="button" class="botao botao--primario" data-acao="editar">Editar dados</button>
      <button type="button" class="botao" data-acao="anexos">Anexos</button>
      <button type="button" class="botao" data-acao="historico">Histórico</button>
      <button type="button" class="botao${cliente.ativo ? ' botao--discreto' : ''}" data-acao="atividade">${cliente.ativo ? 'Desativar' : 'Reativar'}</button>`)}
    ${cliente.ativo ? '' : html`<p class="nota">Cliente inativo. O cadastro e seus registros continuam disponíveis para consulta.</p>`}
    ${aniversario !== null && aniversario <= 7 ? html`<p class="nota nota--info">Aniversário ${quandoAniversario} · ${data(d.nascimento)}</p>` : ''}

    <div class="registro-acoes secao">
      <button type="button" class="botao botao--primario" data-acao="iniciar-cronometro">Iniciar cronômetro</button>
      <button type="button" class="botao" data-acao="lancar-atualizacao">Lançar atualização</button>
      <button type="button" class="botao" data-acao="nova-tarefa">Nova tarefa / prazo</button>
      <a class="botao" href="#/documentos/novo?cliente=${id}">Gerar documento</a>
      ${cliente.telefone ? html`<a class="botao" href="${linkWhatsApp(cliente.telefone)}" target="_blank" rel="noopener">WhatsApp · ${telefone(cliente.telefone)}</a>` : ''}
      ${cliente.email ? html`<a class="botao" href="mailto:${cliente.email}">${cliente.email}</a>` : ''}
    </div>

    ${painel('Processos e casos', html`<button type="button" class="botao botao--pequeno" data-acao="novo-processo">Novo processo</button>`,
      tabelaProcessos(f.processos, [], { mostrarCliente: false }))}
    ${painelTempo(id, cliente, f.atualizacoes, f.processos)}
    ${painel('Tarefas e prazos abertos', html`<a href="#/tarefas?visao=todas&cliente=${id}">Abrir Tarefas</a>`,
      tabelaTarefas(f.tarefas, { vazio: 'Nenhuma tarefa ou prazo em aberto para este cliente.' }))}
    ${painel('Documentos gerados', html`<a href="#/documentos?cliente=${id}">Abrir Documentos</a>`,
      tabelaDocumentos(f.documentos, [cliente], f.processos, { vazio: 'Nenhum documento gerado para este cliente.' }))}
    ${pode.agenda() ? painel('Agenda', html`<a href="#/agenda">Abrir Agenda</a>`, html`
      <div class="painel__corpo">
        <h3 class="cliente-subtitulo">Próximos compromissos (até 5)</h3>
        ${compromissos(f.futuros)}
        <h3 class="cliente-subtitulo secao">Últimos compromissos (até 5)</h3>
        ${compromissos(f.anteriores)}
      </div>`) : ''}
    ${pode.financeiro() ? painelFinanceiro(f.contratos) : ''}
    ${painelContatos(f.pessoas)}
    ${dadosCompletos(cliente, d, pj)}
    ${painelOrigem(f.contatos)}`;
}

export default async function telaCliente(ctx) {
  const id = ctx.params.id;
  let f = null;
  let limparAtualizacoes = () => {};
  let limparTarefas = () => {};

  const carregar = async () => {
    const lidos = await carregarFicha(id);
    if (!ctx.ativa()) return;
    f = lidos;
    if (!f.cliente) {
      desenhar(ctx.raiz, html`${cabecalho('Cliente não encontrado')}<a href="#/clientes">Voltar para Clientes</a>`);
      return;
    }
    desenhar(ctx.raiz, tela(id, f));
    const depoisDeMudar = () => (ctx.ativa() ? recarregar() : null);
    limparAtualizacoes();
    limparAtualizacoes = ligarAcoesAtualizacoes(ctx.raiz, f.atualizacoes, depoisDeMudar);
    limparTarefas();
    limparTarefas = ligarAcoesTarefas(ctx.raiz, f.tarefas, depoisDeMudar);
  };
  // Pedidos seguidos de recarga (o aviso do cronômetro e o fim de uma ação)
  // viram uma leitura só.
  let carregando = null;
  const recarregar = () => (carregando ??= carregar().finally(() => { carregando = null; }));

  await carregar();
  if (!ctx.ativa() || !f?.cliente) return;

  // Cronômetro parado pelo indicador da lateral, ou em outra aba: a linha do
  // tempo desta ficha muda. A tela se atualiza no lugar, sem perder a rolagem.
  const sincronizar = () => {
    if (ctx.ativa()) recarregar().catch(avisarErro);
  };
  addEventListener('fhl:atualizacoes', sincronizar);

  const depois = async (promessa) => {
    try {
      if (await promessa && ctx.ativa()) await recarregar();
    } catch (erro) {
      avisarErro(erro);
    }
  };

  const alternarAtividade = () => {
    const ativo = f.cliente.ativo;
    return abrirDialogo({
      titulo: ativo ? 'Desativar cliente' : 'Reativar cliente',
      rotuloOk: ativo ? 'Desativar' : 'Reativar',
      perigo: ativo,
      corpo: html`<p>${ativo
        ? 'O cliente sairá das sugestões de novos contratos e compromissos. Os registros existentes serão preservados.'
        : 'O cliente voltará às sugestões de novos contratos e compromissos.'}</p>`,
      aoEnviar: async () => {
        await db.alterar('clientes', [['id', 'eq', id]], { ativo: !ativo }, 'id');
        avisar(ativo ? 'Cliente desativado.' : 'Cliente reativado.');
        return true;
      },
    });
  };

  const processo = (el) => f.processos.find((p) => p.id === el.dataset.id);
  const pessoa = (el) => f.pessoas.find((p) => p.id === el.dataset.id);
  const limpar = aoClicar(ctx.raiz, {
    anexos: () => abrirAnexos({ titulo: `Anexos — ${f.cliente.nome}`, destino: { cliente_id: id }, podeGravar: pode.clientes(), categoria: 'documento_pessoal' }),
    'novo-contato': () => depois(editarContato(id)),
    'editar-contato': (el) => depois(editarContato(id, pessoa(el))),
    'principal-contato': (el) => depois(db.rpc('definir_contato_principal', { p_id: el.dataset.id }).then(() => {
      avisar('Contato principal trocado.');
      return true;
    })),
    'ativo-contato': (el) => {
      const c = pessoa(el);
      return depois(db.alterar('clientes_contatos', [['id', 'eq', c.id]], { ativo: !c.ativo }, 'id').then(() => {
        avisar(c.ativo ? 'Contato desativado. Continua no histórico.' : 'Contato reativado.');
        return true;
      }));
    },
    'nova-tarefa': () => depois(formularioTarefa({ cliente_id: id })),
    'iniciar-cronometro': () => depois(iniciarCronometro({ cliente_id: id })),
    'lancar-atualizacao': () => depois(formularioAtualizacao({ cliente_id: id })),
    editar: () => depois(formularioCompleto(id)),
    historico: () => abrirHistorico({
      titulo: f.cliente.nome,
      registros: [id, ...(f.detalhes ? [f.detalhes.id] : []), ...f.processos.map((p) => p.id), ...f.pessoas.map((p) => p.id)],
    }),
    atividade: () => depois(alternarAtividade()),
    'novo-processo': () => depois(formularioProcesso({ cliente_id: id })),
    'editar-processo': (el) => depois(formularioProcesso({ processo: processo(el) })),
    'historico-processo': (el) => abrirHistorico({ titulo: processo(el).titulo, registros: [el.dataset.id] }),
  });

  return () => {
    removeEventListener('fhl:atualizacoes', sincronizar);
    limpar();
    limparAtualizacoes();
    limparTarefas();
  };
}
