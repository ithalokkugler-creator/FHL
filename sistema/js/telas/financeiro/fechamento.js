// Fechamento do mês (preparação 6.4 E e 6.6).
// ===========================================
//
// A foto do mês: entradas, saídas, resultado e quanto cabe a cada sócio.
// Fechado, nenhum lançamento daquele mês muda sem reabrir — e reabrir exige
// motivo, que fica no histórico.

import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { gerarCsv, baixarArquivo } from '../../nucleo/csv.js';
import { abrirDialogo, pedirMotivo } from '../../nucleo/dialogo.js';
import { nomeDe, pode } from '../../nucleo/estado.js';
import {
  centavos, dataHora, hoje, inicioDoMes, moeda, nomeDoMes, percentual, somarMeses,
} from '../../nucleo/formato.js';
import { aoClicar, desenhar, html } from '../../nucleo/html.js';
import { guardarConsulta } from '../../nucleo/rotas.js';
import { db } from '../../nucleo/supabase.js';
import { cabecalho, cabecalhoImpressao, capitalizar, indicador, mesDaConsulta, plural, seletorMes, vazio } from '../comum.js';
import { abrirHistorico } from '../historico.js';
import { garantirContasDoMes } from './base.js';

export default async function telaFechamento(ctx) {
  // Por padrão, o mês que acabou de passar: é esse que se fecha.
  let mes = mesDaConsulta(ctx.consulta.mes, somarMeses(inicioDoMes(hoje()), -1));
  let dados;

  const mostrar = async () => {
    dados = await carregar(mes);
    if (ctx.ativa()) desenhar(ctx.raiz, tela(mes, dados));
  };
  await mostrar();

  const trocarMes = (delta) => {
    mes = somarMeses(mes, delta);
    guardarConsulta({ mes });
    mostrar().catch(avisarErro);
  };

  return aoClicar(ctx.raiz, {
    'mes-anterior': () => trocarMes(-1),
    'mes-seguinte': () => trocarMes(1),
    imprimir: () => print(),
    planilha: () => baixarArquivo(`fechamento-${mes.slice(0, 7)}.csv`, planilha(mes, dados.foto)),
    historico: () => abrirHistorico({ titulo: `fechamento de ${nomeDoMes(mes)}`, registros: [dados.registro.id] }),

    fechar: async () => {
      const p = dados.foto.pendencias;
      const ok = await abrirDialogo({
        titulo: `Fechar ${nomeDoMes(mes)}`,
        rotuloOk: 'Fechar o mês',
        corpo: html`
          <p class="dialogo__texto">
            Depois de fechado, nenhum recebimento ou conta paga de ${nomeDoMes(mes)} pode ser
            lançado, alterado ou estornado sem reabrir o mês. O resultado e a divisão ficam
            gravados como estão agora.
          </p>
          ${p.parcelas_vencidas || p.contas_sem_baixa ? html`
            <p class="nota"><strong>Há pendências:</strong> ${[
              p.parcelas_vencidas ? `${plural(p.parcelas_vencidas, 'parcela vencida', 'parcelas vencidas')} sem baixa (${moeda(centavos(p.parcelas_vencidas_saldo))})` : '',
              p.contas_sem_baixa ? `${plural(p.contas_sem_baixa, 'conta do mês', 'contas do mês')} sem pagamento` : '',
            ].filter(Boolean).join(' e ')}. Se forem lançamentos esquecidos, lance antes de fechar.</p>` : ''}`,
        aoEnviar: async () => {
          await db.rpc('fechar_mes', { p_competencia: mes });
          return true;
        },
      });
      if (ok) {
        avisar('Mês fechado.');
        await mostrar().catch(avisarErro);
      }
    },

    reabrir: async () => {
      const motivo = await pedirMotivo({
        titulo: `Reabrir ${nomeDoMes(mes)}`,
        texto: 'Os lançamentos do mês voltam a aceitar mudanças. A foto anterior continua no histórico; ao fechar de novo, o sistema grava a nova.',
        rotuloOk: 'Reabrir',
      });
      if (!motivo) return;
      try {
        await db.rpc('reabrir_mes', { p_competencia: mes, p_motivo: motivo });
        avisar('Mês reaberto.');
        await mostrar();
      } catch (erro) {
        avisarErro(erro);
      }
    },
  });
}

async function carregar(mes) {
  // Mês que ninguém abriu ainda não tem as contas fixas: sem isto, o aluguel
  // não aparecia nas pendências da prévia.
  if (mes <= inicioDoMes(hoje())) await garantirContasDoMes(mes);
  const [registro, lista] = await Promise.all([
    db.um('fechamentos', { select: '*', filtros: [['competencia', 'eq', mes]] }),
    db.listar('fechamentos', { select: 'id,competencia,fechado,fechado_em,fechado_por,reaberto_em,reaberto_por,motivo_reabertura', ordem: 'competencia.desc', limite: 24 }),
  ]);
  const foto = registro?.fechado ? registro : await db.rpc('previa_fechamento', { p_competencia: mes });
  return { registro, foto, lista };
}

const MODELOS = { igual: 'partes iguais', cotas: 'cotas definidas' };

function tela(mes, { registro, foto, lista }) {
  const fechado = Boolean(registro?.fechado);
  const t = foto.totais;
  const d = foto.divisao;
  const p = foto.pendencias;
  const admin = pode.administrar();
  const futuro = mes > inicioDoMes(hoje());
  const cotasErradas = d.modelo === 'cotas' && Math.abs(Number(d.soma_percentuais) - 100) >= 0.01;

  return html`
    ${cabecalhoImpressao()}

    ${cabecalho(`Fechamento de ${nomeDoMes(mes)}`, fechado ? `Fechado em ${dataHora(registro.fechado_em)} por ${nomeDe(registro.fechado_por)}` : 'Aberto — valores calculados agora', html`
      ${seletorMes(mes)}
      <button type="button" class="botao" data-acao="imprimir">Imprimir / PDF</button>
      <button type="button" class="botao" data-acao="planilha">Planilha</button>
      ${registro ? html`<button type="button" class="botao" data-acao="historico">Histórico</button>` : ''}
      ${admin && fechado ? html`<button type="button" class="botao botao--discreto" data-acao="reabrir">Reabrir</button>` : ''}
      ${admin && !fechado && !futuro ? html`<button type="button" class="botao botao--primario" data-acao="fechar">Fechar o mês</button>` : ''}`)}

    ${fechado
      ? html`<p class="nota nota--info">Mês fechado: lançamentos de ${nomeDoMes(mes)} só mudam se o administrador reabrir.</p>`
      : html`<p class="nota">Mês aberto. ${registro?.reaberto_em ? `Reaberto em ${dataHora(registro.reaberto_em)} por ${nomeDe(registro.reaberto_por)}: ${registro.motivo_reabertura}. ` : ''}${admin ? '' : 'Só o administrador fecha o mês.'}</p>`}

    <div class="indicadores">
      ${indicador('Entradas', moeda(centavos(t.entradas)), plural(Number(t.recebimentos), 'recebimento', 'recebimentos'), { tom: 'ok' })}
      ${indicador('Saídas', moeda(centavos(t.saidas)), 'contas pagas no mês')}
      ${indicador('Resultado', moeda(centavos(t.resultado)), 'entradas − saídas', { tom: Number(t.resultado) < 0 ? 'perigo' : '' })}
    </div>

    <div class="grade grade--2">
      <section class="painel">
        <header class="painel__topo"><h2 class="painel__titulo">Entradas</h2></header>
        <table class="tabela">
          <tbody>
            <tr><td>Parcelas de contratos</td><td class="num">${moeda(centavos(t.principal_parcelas))}</td></tr>
            <tr><td>Multa, juros e correção recebidos</td><td class="num">${moeda(centavos(t.encargos))}</td></tr>
            <tr><td>Entradas avulsas</td><td class="num">${moeda(centavos(t.avulsas))}</td></tr>
            ${t.entradas_por_forma.map((f) => html`<tr><td class="sub">por ${f.forma}</td><td class="num sub">${moeda(centavos(f.valor))}</td></tr>`)}
          </tbody>
        </table>
      </section>
      <section class="painel">
        <header class="painel__topo">
          <h2 class="painel__titulo">Saídas por categoria</h2>
          <a class="botao botao--pequeno nao-imprimir" href="#/financeiro/relatorios?tipo=mes&mes=${mes.slice(0, 7)}">Lançamentos</a>
        </header>
        ${t.saidas_por_categoria.length ? html`
          <table class="tabela">
            <tbody>${t.saidas_por_categoria.map((c) => html`<tr><td>${c.categoria}</td><td class="num">${moeda(centavos(c.valor))}</td></tr>`)}</tbody>
          </table>` : vazio('Nenhuma conta paga no mês.')}
      </section>
    </div>

    <section class="painel secao">
      <header class="painel__topo">
        <h2 class="painel__titulo">Divisão entre os sócios</h2>
        <a class="botao botao--pequeno" href="#/financeiro/configuracoes">Regra</a>
      </header>
      <div class="painel__corpo">
        <p class="sub">Regra: ${MODELOS[d.modelo] ?? d.modelo}, sobre ${d.despesas_antes ? 'o resultado (depois das despesas)' : 'as entradas (antes das despesas)'} — base de ${moeda(centavos(d.base))}.</p>
        ${cotasErradas ? html`<p class="nota nota--perigo">As cotas somam ${percentual(d.soma_percentuais)}, e não 100%. Ajuste em Configurações antes de fechar.</p>` : ''}
        ${Number(d.base) < 0 ? html`<p class="nota">O resultado do mês ficou negativo: os valores abaixo são quanto cabe a cada sócio cobrir.</p>` : ''}
      </div>
      ${d.socios.length ? html`
        <div class="tabela-rolagem">
          <table class="tabela">
            <thead><tr><th>Sócio</th><th class="num">Parte</th><th class="num">Valor</th><th class="num">Reembolso pendente</th><th class="num">Total a receber</th></tr></thead>
            <tbody>
              ${d.socios.map((s) => html`
                <tr>
                  <td>${s.nome}</td>
                  <td class="num">${percentual(s.percentual)}</td>
                  <td class="num">${moeda(centavos(s.valor))}</td>
                  <td class="num">${moeda(centavos(s.reembolso_pendente))}</td>
                  <td class="num forte">${moeda(centavos(s.valor) + centavos(s.reembolso_pendente))}</td>
                </tr>`)}
            </tbody>
          </table>
        </div>` : vazio('Ninguém participa da divisão. Marque os sócios em Configurações.')}
    </section>

    <section class="painel secao">
      <header class="painel__topo"><h2 class="painel__titulo">Pendências${fechado ? ' no dia do fechamento' : ''}</h2></header>
      <ul class="lista">
        <li><a class="lista__item" href="#/financeiro/atraso">
          <span>Parcelas vencidas até o fim do mês, sem baixa</span>
          <span class="num${p.parcelas_vencidas ? ' perigo' : ''}">${p.parcelas_vencidas} · ${moeda(centavos(p.parcelas_vencidas_saldo))}</span>
        </a></li>
        <li><a class="lista__item" href="#/financeiro/contas?mes=${mes}">
          <span>Contas do mês sem pagamento</span>
          <span class="num${p.contas_sem_baixa ? ' perigo' : ''}">${p.contas_sem_baixa} · ${moeda(centavos(p.contas_sem_baixa_valor))}</span>
        </a></li>
      </ul>
    </section>

    ${lista.length ? html`
      <section class="painel secao nao-imprimir">
        <header class="painel__topo"><h2 class="painel__titulo">Meses fechados</h2></header>
        <ul class="lista">
          ${lista.map((f) => html`
            <li><a class="lista__item" href="#/financeiro/fechamento?mes=${f.competencia}">
              <span>${capitalizar(nomeDoMes(f.competencia))}<span class="sub">${f.fechado ? `fechado em ${dataHora(f.fechado_em)} por ${nomeDe(f.fechado_por)}` : `reaberto em ${dataHora(f.reaberto_em)} por ${nomeDe(f.reaberto_por)}`}</span></span>
              ${f.fechado ? html`<span class="selo selo--ok">Fechado</span>` : html`<span class="selo selo--alerta">Reaberto</span>`}
            </a></li>`)}
        </ul>
      </section>` : ''}`;
}

function planilha(mes, { totais: t, divisao: d }) {
  const linhas = [
    ['Entradas', centavos(t.entradas)],
    ['  Parcelas de contratos', centavos(t.principal_parcelas)],
    ['  Multa, juros e correção', centavos(t.encargos)],
    ['  Entradas avulsas', centavos(t.avulsas)],
    ['Saídas', centavos(t.saidas)],
    ...t.saidas_por_categoria.map((c) => [`  ${c.categoria}`, centavos(c.valor)]),
    ['Resultado', centavos(t.resultado)],
    [`Base da divisão (${MODELOS[d.modelo] ?? d.modelo})`, centavos(d.base)],
    ...d.socios.map((s) => [`  ${s.nome} (${String(s.percentual).replace('.', ',')}%)`, centavos(s.valor)]),
    ...d.socios.filter((s) => Number(s.reembolso_pendente)).map((s) => [`  Reembolso pendente — ${s.nome}`, centavos(s.reembolso_pendente)]),
  ];
  return gerarCsv(
    [
      { titulo: `Fechamento ${mes.slice(5, 7)}/${mes.slice(0, 4)}`, valor: (l) => l[0] },
      { titulo: 'Valor', valor: (l) => l[1], tipo: 'moeda' },
    ],
    linhas,
  );
}
