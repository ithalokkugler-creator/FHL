// Operação e LGPD (preparação T05, T06 e T16).
// ============================================
//
// O que o administrador (e quem tem acesso de auditoria) precisa olhar de
// tempos em tempos para saber que o sistema está são:
//
//   · idade da última cópia de segurança boa e falhas recentes;
//   · acessos (entradas, saídas, recuperação de senha) — lidos dos registros
//     do próprio Auth do Supabase, com o IP visto pelo provedor;
//   · erros técnicos das telas, sem conteúdo de formulário;
//   · convites de acesso que falharam;
//   · pedidos de titulares de dados (LGPD, art. 18), com prazo e decisão;
//   · minutos de inatividade até a tela encerrar a sessão.
//
// Só o administrador altera. A auditoria lê.

import { avisar, avisarErro } from '../nucleo/avisos.js';
import { abrirDialogo } from '../nucleo/dialogo.js';
import { membrosAtivos, nomeDe, pode } from '../nucleo/estado.js';
import { data, dataHora, hoje } from '../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../nucleo/html.js';
import { guardarConsulta } from '../nucleo/rotas.js';
import { db } from '../nucleo/supabase.js';
import { cabecalho, indicador, opcoes, plural, vazio } from './comum.js';

const ACOES_AUTH = {
  login: 'Entrou',
  logout: 'Saiu',
  user_recovery_requested: 'Pediu nova senha',
  user_updated_password: 'Trocou a senha',
  user_modified: 'Alterou o login',
  user_invited: 'Foi convidado',
  user_signedup: 'Criou o login',
  user_repeated_signup: 'Tentou criar login de novo',
  user_deleted: 'Login apagado',
  invite_accepted: 'Aceitou o convite',
};

const TIPOS_SOLICITACAO = {
  confirmacao: 'Confirmação de que há tratamento',
  acesso: 'Acesso aos dados',
  correcao: 'Correção',
  anonimizacao: 'Anonimização ou bloqueio',
  portabilidade: 'Portabilidade',
  eliminacao: 'Eliminação',
  informacao: 'Com quem os dados são compartilhados',
  revogacao: 'Revogação do consentimento',
  oposicao: 'Oposição ao tratamento',
};
const SITUACOES_SOLICITACAO = { aberta: ['Aberta', 'alerta'], em_analise: ['Em análise', 'alerta'], respondida: ['Respondida', 'ok'], indeferida: ['Indeferida', 'escuro'] };
const CANAIS = { email: 'E-mail', whatsapp: 'WhatsApp', telefone: 'Telefone', presencial: 'Presencial', carta: 'Carta', outro: 'Outro' };
const CONVITES = { pendente: ['Em preparo', ''], enviado: ['Enviado', 'ok'], falhou: ['Falhou', 'perigo'], aceito: ['Aceito', 'ok'] };

const selo = ([r, t]) => html`<span class="selo selo--${t || 'escuro'}">${r}</span>`;

function tamanho(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

export default async function telaOperacao(ctx) {
  const admin = pode.administrar();
  const f = { dias: [7, 30, 90].includes(Number(ctx.consulta.dias)) ? Number(ctx.consulta.dias) : 7 };

  const carregar = async () => {
    const [op, seguranca, solicitacoes, acessos, erros, backups, convites] = await Promise.all([
      db.rpc('estado_operacional'),
      db.um('config_seguranca', { select: '*' }),
      db.listar('solicitacoes_titular', { select: '*', ordem: 'recebida_em.desc,id.asc', limite: 200 }),
      db.rpc('acessos_recentes', { p_dias: f.dias }).catch(() => null),
      db.listar('erros_cliente', { select: '*', ordem: 'em.desc', limite: 100 }),
      db.listar('backups_execucoes', { select: '*', ordem: 'iniciado_em.desc', limite: 20 }),
      db.listar('convites_acesso', { select: '*', ordem: 'criado_em.desc', limite: 50 }),
    ]);
    if (!ctx.ativa()) return;
    desenhar(ctx.raiz, tela({ op, seguranca, solicitacoes, acessos, erros, backups, convites, admin, f }));
    $('[name="dias"]', ctx.raiz)?.addEventListener('change', (e) => {
      f.dias = Number(e.target.value);
      guardarConsulta(f);
      carregar().catch(avisarErro);
    });
    const form = $('[data-papel="seguranca"]', ctx.raiz);
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const minutos = Number(form.inatividade_minutos.value);
      if (!Number.isInteger(minutos) || minutos < 5 || minutos > 480) return avisar('Use de 5 a 480 minutos.', 'erro');
      try {
        await db.alterar('config_seguranca', [['id', 'eq', seguranca.id]], { inatividade_minutos: minutos }, 'id');
        avisar('Salvo. Vale a partir da próxima vez que cada pessoa abrir o sistema.');
        await carregar();
      } catch (erro) {
        avisarErro(erro);
      }
    });
  };
  await carregar();

  return aoClicar(ctx.raiz, {
    'nova-solicitacao': () => editarSolicitacao(null).then((ok) => ok && carregar()).catch(avisarErro),
    'editar-solicitacao': async (el) => {
      const s = await db.um('solicitacoes_titular', { select: '*', filtros: [['id', 'eq', el.dataset.id]] });
      if (await editarSolicitacao(s)) await carregar();
    },
  });
}

function tela({ op, seguranca, solicitacoes, acessos, erros, backups, convites, admin, f }) {
  const horas = op.horas_desde_backup;
  const semCopia = horas == null;
  const dia = hoje();
  return html`
    ${cabecalho('Operação e LGPD', admin ? 'Saúde do sistema, acessos e pedidos de titulares' : 'Somente leitura — só o administrador altera')}

    <div class="indicadores indicadores--4">
      ${indicador('Última cópia boa', semCopia ? 'Nenhuma' : horas < 48 ? `há ${horas} h` : `há ${Math.round(horas / 24)} dias`,
        semCopia ? 'rotina de cópia não configurada' : `${op.backups_falhos_7d} falha(s) em 7 dias`,
        { tom: semCopia || horas > 36 ? 'perigo' : op.backups_falhos_7d ? 'alerta' : '' })}
      ${indicador('Erros nas telas', String(op.erros_7d), 'nos últimos 7 dias', { tom: op.erros_7d ? 'alerta' : '' })}
      ${indicador('Pedidos LGPD abertos', String(op.solicitacoes_abertas), op.solicitacoes_vencidas ? `${op.solicitacoes_vencidas} com prazo vencido` : 'nenhum vencido',
        { tom: op.solicitacoes_vencidas ? 'perigo' : op.solicitacoes_abertas ? 'alerta' : '' })}
      ${indicador('Convites com problema', String(op.convites_pendentes), `${op.membros_ativos} membros ativos`, { tom: op.convites_pendentes ? 'alerta' : '', href: '#/membros' })}
    </div>

    <section class="painel">
      <header class="painel__topo">
        <h2 class="painel__titulo">Pedidos de titulares (LGPD)</h2>
        ${admin ? html`<button type="button" class="botao botao--pequeno" data-acao="nova-solicitacao">Registrar pedido</button>` : ''}
      </header>
      ${solicitacoes.length ? html`
        <div class="tabela-rolagem"><table class="tabela">
          <thead><tr><th>Recebido</th><th>Titular</th><th>Pedido</th><th>Prazo</th><th>Responsável</th><th>Situação</th><th class="acoes"><span class="sr-only">Ações</span></th></tr></thead>
          <tbody>${solicitacoes.map((s) => {
            const aberta = ['aberta', 'em_analise'].includes(s.situacao);
            return html`<tr>
              <td>${data(s.recebida_em)}<span class="sub">${CANAIS[s.canal] ?? s.canal}</span></td>
              <td>${s.titular_nome}</td>
              <td>${TIPOS_SOLICITACAO[s.tipo] ?? s.tipo}${s.decisao ? html`<span class="sub">${s.decisao}</span>` : ''}</td>
              <td class="${aberta && s.prazo < dia ? 'perigo' : ''}">${data(s.prazo)}${s.concluida_em ? html`<span class="sub">concluído ${data(s.concluida_em)}</span>` : ''}</td>
              <td>${s.responsavel_id ? nomeDe(s.responsavel_id) : '—'}</td>
              <td>${selo(SITUACOES_SOLICITACAO[s.situacao] ?? [s.situacao, ''])}</td>
              <td class="acoes">${admin ? html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="editar-solicitacao" data-id="${s.id}">${aberta ? 'Atualizar' : 'Ver'}</button>` : ''}</td>
            </tr>`;
          })}</tbody>
        </table></div>` : vazio('Nenhum pedido registrado.')}
      <p class="painel__rodape sub">Prazo padrão de 15 dias (art. 19, II, da LGPD) — ajuste caso a caso. Pedidos de eliminação esbarram nos deveres de guarda do escritório (art. 16): registre a decisão e o fundamento.</p>
    </section>

    <div class="grade grade--2 secao">
      <form class="painel" data-papel="seguranca" novalidate>
        <header class="painel__topo"><h2 class="painel__titulo">Sessão</h2></header>
        <div class="painel__corpo campos">
          <label class="campo campo--6"><span>Sair sozinho depois de (minutos sem uso)</span>
            <input type="number" name="inatividade_minutos" min="5" max="480" value="${seguranca?.inatividade_minutos ?? 30}" ${admin ? '' : 'disabled'}></label>
          <p class="campo campo--6 sub">Um minuto antes, aparece um aviso para continuar. Vale para todos.</p>
        </div>
        ${admin ? html`<footer class="painel__rodape"><button type="submit" class="botao botao--primario">Salvar</button></footer>` : ''}
      </form>

      <section class="painel">
        <header class="painel__topo"><h2 class="painel__titulo">Cópias de segurança</h2></header>
        ${backups.length ? html`
          <ul class="lista">${backups.map((b) => html`
            <li class="lista__item"><span>${dataHora(b.concluido_em ?? b.iniciado_em)}<span class="sub">${[b.destino, b.arquivos != null ? plural(b.arquivos, 'arquivo', 'arquivos') : null, b.sha256 ? `SHA-256 ${b.sha256.slice(0, 12)}…` : null, b.detalhe].filter(Boolean).join(' · ')}</span></span>
              <span class="num">${tamanho(b.tamanho_bytes)} ${selo(b.situacao === 'ok' ? ['OK', 'ok'] : ['Falhou', 'perigo'])}</span></li>`)}</ul>`
          : vazio('Nenhuma execução registrada. A rotina automática está descrita em docs/operacao/backup-restauracao.md e depende de configurar o destino.')}
      </section>
    </div>

    <section class="painel secao">
      <header class="painel__topo">
        <h2 class="painel__titulo">Acessos</h2>
        <label class="campo"><span class="sr-only">Período</span><select name="dias">${opcoes([[7, 'Últimos 7 dias'], [30, 'Últimos 30 dias'], [90, 'Últimos 90 dias']], f.dias)}</select></label>
      </header>
      ${acessos == null ? html`<p class="painel__corpo sub">Os registros do Auth não estão disponíveis agora.</p>`
        : acessos.length ? html`
          <div class="tabela-rolagem"><table class="tabela">
            <thead><tr><th>Quando</th><th>O quê</th><th>Login</th><th>IP</th></tr></thead>
            <tbody>${acessos.slice(0, 300).map((a) => html`<tr>
              <td>${dataHora(a.em)}</td><td>${ACOES_AUTH[a.acao] ?? a.acao}</td><td>${a.email ?? '—'}</td><td>${a.ip || '—'}</td></tr>`)}</tbody>
          </table></div>
          ${acessos.length > 300 ? html`<p class="painel__rodape sub">Mostrando 300 de ${acessos.length}.</p>` : ''}` : vazio('Nenhum acesso no período.')}
      <p class="painel__rodape sub">Lidos dos registros do Auth do Supabase (renovação automática de sessão não aparece). O plano gratuito guarda poucos dias desses registros.</p>
    </section>

    <div class="grade grade--2 secao">
      <section class="painel">
        <header class="painel__topo"><h2 class="painel__titulo">Erros nas telas</h2></header>
        ${erros.length ? html`
          <ul class="lista">${erros.map((e) => html`
            <li class="lista__item"><span>${e.mensagem || e.codigo || 'Erro'}<span class="sub">${dataHora(e.em)} · ${e.membro_id ? nomeDe(e.membro_id) : '—'} · ${e.rota || '—'}${e.versao ? ` · versão ${e.versao}` : ''}</span></span></li>`)}</ul>`
          : vazio('Nenhum erro registrado.')}
        <p class="painel__rodape sub">Sem conteúdo de formulário: e-mails e números longos são apagados antes de gravar.</p>
      </section>

      <section class="painel">
        <header class="painel__topo"><h2 class="painel__titulo">Convites de acesso</h2></header>
        ${convites.length ? html`
          <ul class="lista">${convites.map((c) => html`
            <li class="lista__item"><span>${nomeDe(c.membro_id)}<span class="sub">${c.email} · ${plural(c.tentativas, 'tentativa', 'tentativas')}${c.ultimo_erro ? ` · ${c.ultimo_erro}` : ''}</span></span>
              ${selo(CONVITES[c.estado] ?? [c.estado, ''])}</li>`)}</ul>`
          : vazio('Nenhum convite enviado pelo sistema.')}
      </section>
    </div>`;
}

function editarSolicitacao(s) {
  const novo = !s;
  return abrirDialogo({
    titulo: novo ? 'Registrar pedido de titular' : `Pedido de ${s.titular_nome}`,
    largo: true,
    corpo: html`
      <div class="campos">
        <label class="campo campo--8"><span>Nome do titular</span><input name="titular_nome" value="${s?.titular_nome ?? ''}" required maxlength="200" autofocus></label>
        <label class="campo campo--4"><span>Por onde chegou</span><select name="canal">${opcoes(Object.entries(CANAIS), s?.canal ?? 'email')}</select></label>
        <label class="campo campo--8"><span>O que pede</span><select name="tipo">${opcoes(Object.entries(TIPOS_SOLICITACAO), s?.tipo ?? 'acesso')}</select></label>
        <label class="campo campo--4"><span>Recebido em</span><input type="date" name="recebida_em" value="${s?.recebida_em ?? hoje()}" ${novo ? '' : 'disabled'} required></label>
        <label class="campo"><span>Descrição</span><textarea name="descricao" rows="3" maxlength="2000">${s?.descricao ?? ''}</textarea></label>
        <label class="campo campo--4"><span>Prazo</span><input type="date" name="prazo" value="${s?.prazo ?? ''}"><span class="campo__ajuda">Vazio: 15 dias.</span></label>
        <label class="campo campo--4"><span>Responsável</span><select name="responsavel_id">${opcoes(membrosAtivos().map((m) => [m.id, m.nome_curto]), s?.responsavel_id ?? '', { vazio: 'Ninguém ainda' })}</select></label>
        ${novo ? '' : html`
          <label class="campo campo--4"><span>Situação</span><select name="situacao">${opcoes(Object.entries(SITUACOES_SOLICITACAO).map(([v, [r]]) => [v, r]), s.situacao)}</select></label>
          <label class="campo campo--8"><span>Decisão / resposta dada</span><textarea name="decisao" rows="3" maxlength="2000">${s.decisao ?? ''}</textarea>
            <span class="campo__ajuda">Obrigatória para concluir. Diga o que foi feito e o fundamento.</span></label>
          <label class="campo campo--4"><span>Concluído em</span><input type="date" name="concluida_em" value="${s.concluida_em ?? ''}"></label>`}
      </div>`,
    aoEnviar: async (d) => {
      const registro = {
        titular_nome: d.titular_nome,
        canal: d.canal,
        tipo: d.tipo,
        descricao: d.descricao || null,
        responsavel_id: d.responsavel_id || null,
      };
      if (d.prazo) registro.prazo = d.prazo;
      if (novo) {
        registro.recebida_em = d.recebida_em;
        await db.inserir('solicitacoes_titular', registro, 'id');
      } else {
        registro.situacao = d.situacao;
        registro.decisao = d.decisao || null;
        const concluida = ['respondida', 'indeferida'].includes(d.situacao);
        registro.concluida_em = concluida ? d.concluida_em || hoje() : null;
        await db.alterar('solicitacoes_titular', [['id', 'eq', s.id]], registro, 'id');
      }
      avisar('Pedido salvo.');
      return true;
    },
  });
}
