// Fechamento do exercício (DOCX §10, preparação T10).
// ===================================================
//
// A posição em 31/12 não é a soma dos meses nem a situação de hoje: uma
// parcela de dezembro paga em janeiro estava vencida em 31/12. A prévia
// calcula a posição de cada contrato na data de corte, com o que existia e
// valia naquele dia. O ano fecha depois dos doze meses fechados; a foto
// aprovada é uma versão que não muda — reabrir e fechar de novo cria outra.
// Ano fechado bloqueia qualquer lançamento com data nele.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { abrirDialogo, pedirMotivo } from '../../nucleo/dialogo.js';
import { nomeDe, pode } from '../../nucleo/estado.js';
import { centavos, data, dataHora, hoje, mesAbreviado, moeda } from '../../nucleo/formato.js';
import { aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, cabecalhoImpressao, indicador, plural, vazio } from '../comum.js';
import { abrirHistorico } from '../historico.js';

export async function telaFechamentoAnual(ctx, abas) {
  let ano = Number(/^\d{4}$/.test(ctx.consulta.ano ?? '') ? ctx.consulta.ano : Number(hoje().slice(0, 4)) - 1);
  let dados;

  const mostrar = async () => {
    const registro = await db.um('fechamentos_anuais', { select: '*', filtros: [['ano', 'eq', ano]] });
    const [previa, versoes] = await Promise.all([
      db.rpc('previa_fechamento_anual', { p_ano: ano }),
      registro ? db.listar('fechamentos_anuais_versoes', {
        select: 'id,versao,corte,regra,foto,criado_em,criado_por', filtros: [['fechamento_id', 'eq', registro.id]], ordem: 'versao.desc',
      }) : [],
    ]);
    const aprovada = registro?.fechado ? versoes.find((v) => v.versao === registro.versao) : null;
    dados = { registro, previa, versoes, foto: aprovada?.foto ?? previa, aprovada };
    if (ctx.ativa()) desenhar(ctx.raiz, tela(ano, dados, abas));
  };
  await mostrar();

  const trocarAno = (delta) => {
    ano += delta;
    guardarConsulta({ aba: 'anual', ano });
    mostrar().catch(avisarErro);
  };

  return aoClicar(ctx.raiz, {
    'ano-anterior': () => trocarAno(-1),
    'ano-seguinte': () => trocarAno(1),
    imprimir: () => print(),
    historico: () => abrirHistorico({ titulo: `exercício de ${ano}`, registros: [dados.registro.id, ...dados.versoes.map((v) => v.id)] }),
    fechar: async () => {
      const t = dados.previa.totais;
      const ok = await abrirDialogo({
        titulo: `Fechar o exercício de ${ano}`,
        rotuloOk: 'Fechar o ano',
        corpo: html`
          <p class="dialogo__texto">A foto de hoje vira a versão aprovada de ${ano}: receitas e despesas, a posição de cada contrato em
            31/12 e as pendências. Depois disso, nenhum lançamento com data em ${ano} entra ou muda sem reabrir o ano.</p>
          <ul class="lista">
            <li class="lista__item"><span>Receitas recebidas</span><span class="num">${moeda(centavos(t.receitas_recebidas))}</span></li>
            <li class="lista__item"><span>Despesas pagas</span><span class="num">${moeda(centavos(t.despesas_pagas))}</span></li>
            <li class="lista__item"><span>Vencido em 31/12</span><span class="num">${moeda(centavos(t.vencido_no_corte))}</span></li>
            <li class="lista__item"><span>Contratos com pendência</span><span class="num">${t.contratos_com_pendencia}</span></li>
          </ul>`,
        aoEnviar: async () => {
          await db.rpc('fechar_ano', { p_ano: ano });
          return true;
        },
      });
      if (ok) {
        avisar(`Exercício de ${ano} fechado.`);
        await mostrar().catch(avisarErro);
      }
    },
    reabrir: async () => {
      const motivo = await pedirMotivo({
        titulo: `Reabrir o exercício de ${ano}`,
        texto: 'A versão aprovada continua guardada. Os meses continuam fechados: reabra cada um que precisar mudar, também com motivo.',
        rotuloOk: 'Reabrir o ano',
      });
      if (!motivo) return;
      try {
        await db.rpc('reabrir_ano', { p_ano: ano, p_motivo: motivo });
        avisar(`Exercício de ${ano} reaberto.`);
        await mostrar();
      } catch (erro) {
        avisarErro(erro);
      }
    },
  });
}

function tela(ano, { registro, previa, versoes, foto, aprovada }, abas) {
  const fechado = Boolean(registro?.fechado);
  const admin = pode.administrar();
  const t = foto.totais;
  const abertos = previa.pendencias.meses_abertos ?? [];
  const terminou = `${ano}-12-31` < hoje();

  return html`
    ${cabecalhoImpressao()}
    ${cabecalho(`Exercício de ${ano}`, fechado
      ? `Fechado em ${dataHora(registro.fechado_em)} por ${nomeDe(registro.fechado_por)} — versão ${registro.versao}`
      : 'Aberto — prévia calculada agora', html`
      <div class="seletor-mes" role="group" aria-label="Ano">
        <button type="button" data-acao="ano-anterior" aria-label="Ano anterior">‹</button>
        <strong>${ano}</strong>
        <button type="button" data-acao="ano-seguinte" aria-label="Ano seguinte">›</button>
      </div>
      <button type="button" class="botao" data-acao="imprimir">Imprimir / PDF</button>
      <a class="botao" href="#/financeiro/relatorios?relatorio=anual&ano=${ano}">Planilha</a>
      ${registro ? html`<button type="button" class="botao" data-acao="historico">Histórico</button>` : ''}
      ${admin && fechado ? html`<button type="button" class="botao botao--discreto" data-acao="reabrir">Reabrir o ano</button>` : ''}
      ${admin && !fechado && terminou ? html`<button type="button" class="botao botao--primario" data-acao="fechar" ${abertos.length ? 'disabled' : ''}>Fechar o ano</button>` : ''}`)}
    ${abas}

    ${fechado
      ? html`<p class="nota nota--info">Exercício fechado: lançamentos com data em ${ano} só mudam se o administrador reabrir o ano. Os números abaixo são os da versão aprovada.</p>`
      : !terminou ? html`<p class="nota">O ano de ${ano} ainda não terminou: a posição é uma prévia.</p>`
        : abertos.length ? html`<p class="nota nota--perigo">Para fechar o ano, feche antes ${abertos.length === 1 ? 'o mês' : `os ${abertos.length} meses`} ${abertos.map((m) => mesAbreviado(m)).join(', ')} em Fechamento › Mensal.</p>`
          : html`<p class="nota nota--info">Todos os meses de ${ano} estão fechados. ${admin ? 'Confira a prévia e feche o ano.' : 'O administrador pode fechar o ano.'}</p>`}
    ${registro?.reaberto_em && !fechado ? html`<p class="nota">Reaberto em ${dataHora(registro.reaberto_em)} por ${nomeDe(registro.reaberto_por)}: ${registro.motivo_reabertura}</p>` : ''}

    <div class="indicadores indicadores--4">
      ${indicador('Receitas previstas', moeda(centavos(t.receitas_previstas)), 'parcelas que venceram no ano')}
      ${indicador('Receitas recebidas', moeda(centavos(t.receitas_recebidas)), 'caixa do ano', { tom: 'ok' })}
      ${indicador('Despesas previstas', moeda(centavos(t.despesas_previstas)), 'competência do ano')}
      ${indicador('Despesas pagas', moeda(centavos(t.despesas_pagas)), 'caixa do ano')}
      ${indicador('Saldo previsto', moeda(centavos(t.saldo_previsto)), 'receitas − despesas previstas')}
      ${indicador('Saldo realizado', moeda(centavos(t.saldo_realizado)), 'recebido − pago', { tom: Number(t.saldo_realizado) < 0 ? 'perigo' : '' })}
      ${indicador('Vencido em 31/12', moeda(centavos(t.vencido_no_corte)), `${plural(t.contratos_com_pendencia, 'contrato', 'contratos')} com pendência`, { tom: Number(t.vencido_no_corte) ? 'perigo' : '' })}
      ${indicador('Taxa de recebimento', t.taxa_recebimento == null ? 'Não se aplica' : `${String(t.taxa_recebimento).replace('.', ',')}%`, 'do que venceu no ano, quanto entrou até 31/12')}
    </div>

    <div class="grade grade--2">
      <section class="painel">
        <header class="painel__topo"><h2 class="painel__titulo">Mês a mês</h2></header>
        <div class="tabela-rolagem">
          <table class="tabela">
            <thead><tr><th>Mês</th><th>Fechamento</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Resultado</th></tr></thead>
            <tbody>${(foto.meses ?? []).map((m) => html`
              <tr><td><a href="#/financeiro/fechamento?mes=${m.competencia}">${mesAbreviado(m.competencia)}</a></td>
                <td>${m.fechado ? html`<span class="selo selo--ok">Fechado</span>` : html`<span class="selo selo--alerta">Aberto</span>`}</td>
                <td class="num">${moeda(centavos(m.entradas))}</td><td class="num">${moeda(centavos(m.saidas))}</td>
                <td class="num">${moeda(centavos(m.resultado))}</td></tr>`)}
            </tbody>
          </table>
        </div>
      </section>
      <section class="painel">
        <header class="painel__topo"><h2 class="painel__titulo">Pendências</h2></header>
        <ul class="lista">
          <li class="lista__item"><span>Meses sem fechamento</span><span class="num${abertos.length ? ' perigo' : ''}">${abertos.length}</span></li>
          <li class="lista__item"><span>Contratos cujas parcelas não fecham com o total</span><span class="num${previa.pendencias.contratos_plano_divergente ? ' perigo' : ''}">${previa.pendencias.contratos_plano_divergente}</span></li>
          <li class="lista__item"><span>Contratos com data de formalização a confirmar</span><span class="num">${previa.pendencias.contratos_formalizacao_a_confirmar}</span></li>
          <li class="lista__item"><span>Recebimentos do ano sem conta financeira (legado)</span><span class="num">${previa.pendencias.recebimentos_sem_conta}</span></li>
        </ul>
      </section>
    </div>

    <section class="painel secao">
      <header class="painel__topo"><h2 class="painel__titulo">Posição de cada contrato em 31/12/${ano}</h2></header>
      ${(foto.posicao ?? []).length ? html`
        <div class="tabela-rolagem">
          <table class="tabela">
            <thead><tr><th>Contrato</th><th class="num">Exigível</th><th class="num">Recebido</th><th class="num">Vencido</th><th class="num">A vencer</th><th>Próximo vencimento</th><th>Situação</th></tr></thead>
            <tbody>${foto.posicao.map((l) => html`
              <tr><td><a href="#/financeiro/contratos/${l.contrato_id}">${l.codigo ? html`<strong>${l.codigo}</strong> · ` : ''}${l.cliente_nome}</a><span class="sub">${l.descricao}</span></td>
                <td class="num">${moeda(centavos(l.exigivel))}</td><td class="num">${moeda(centavos(l.recebido_principal))}</td>
                <td class="num${Number(l.saldo_vencido) ? ' perigo' : ''}">${moeda(centavos(l.saldo_vencido))}</td>
                <td class="num">${moeda(centavos(l.saldo_futuro))}</td>
                <td class="num">${l.proximo_vencimento ? data(l.proximo_vencimento) : '—'}</td>
                <td>${({ com_pendencia: 'Com pendência', em_dia: 'Em dia', quitado: 'Quitado', a_apurar: 'Êxito a apurar', sem_parcelas: 'Sem parcelas' })[l.situacao] ?? l.situacao}</td></tr>`)}
            </tbody>
          </table>
        </div>` : vazio('Nenhum contrato existia em 31/12.')}
      <p class="painel__rodape sub">Contratos antigos sem data de formalização entram pela data em que foram cadastrados no sistema. ${aprovada ? `Foto da versão ${aprovada.versao}, regra ${aprovada.regra}.` : ''}</p>
    </section>

    ${versoes.length ? html`
      <section class="painel secao nao-imprimir">
        <header class="painel__topo"><h2 class="painel__titulo">Versões aprovadas</h2></header>
        <ul class="lista">${versoes.map((v) => html`
          <li class="lista__item"><span>Versão ${v.versao}<span class="sub">${dataHora(v.criado_em)} por ${nomeDe(v.criado_por)} · regra ${v.regra}</span></span>
            <span class="num">${moeda(centavos(v.foto.totais.saldo_realizado))}</span></li>`)}</ul>
      </section>` : ''}`;
}
