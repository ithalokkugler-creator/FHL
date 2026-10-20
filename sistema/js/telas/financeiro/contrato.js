// Um contrato: parcelas, recebimentos, cobranças, renegociações e histórico.
// ==========================================================================
//
// Nada aqui apaga. Parcela e contrato se cancelam com motivo; recebimento se
// estorna com motivo; vencimento alterado deixa a data antiga no histórico.
// Descrição, responsável e critério se corrigem em "Editar"; valor e parcelas,
// não — para isso há Renegociar, Redistribuir, Vencimento, Ajuste e Cancelar
// parcela, que deixam rastro do que mudou e por quê (o banco recusa mudar o
// valor de parcela de outro jeito). O código (C001/2026) não muda nunca.
//
// Out/2026: fixo + êxito (o êxito se apura no fim, à parte do fixo), acordo
// com repasse (a parte do cliente em cada recebimento, a registrar quando sai)
// e contrato encadeado (o anterior e o seguinte, com link).

import { divisaoDoRepasse, gerarParcelas, nomeDaParcela, posicoes } from '../../dominio/parcelas.js';
import { avisar, avisarErro } from '../../nucleo/avisos.js';
import { abrirDialogo, pedirMotivo } from '../../nucleo/dialogo.js';
import { membrosAtivos, nomeDe, pode } from '../../nucleo/estado.js';
import {
  ateDuasCasas, centavos, data, dataHora, decimal, entre, hoje, lerMoeda, lerNumero, moeda, paraReais, percentual, telefone,
} from '../../nucleo/formato.js';
import { $, aoClicar, desenhar, html } from '../../nucleo/html.js';
import { db } from '../../nucleo/supabase.js';
import { editarCliente } from '../clientes.js';
import {
  cabecalho, CANAIS, indicador, plural, seloContrato, seloParcela, seloRepasse, TIPOS_HONORARIO, vazio,
} from '../comum.js';
import { abrirHistorico } from '../historico.js';
import {
  apoio, atualizarParcelas, camposCriterio, concederAjuste, criterioDoContrato, criterioEmTexto, emitirRecibo, lerCriterio,
  memoria, memoriaGravada, nomeContaFinanceira, opcoes, receberParcela, registrarRepasse, renegociarContrato, rotuloParcela,
  temRepasse,
} from './base.js';
import { abrirAnexos } from '../anexos.js';
import { navegar } from '../../nucleo/rotas.js';

export default async function telaContrato(ctx) {
  const id = ctx.params.id;
  let dados;

  const mostrar = async () => {
    dados = await carregar(id);
    if (!ctx.ativa()) return;
    desenhar(ctx.raiz, dados.contrato ? tela(dados) : html`
      <a class="pagina__voltar" href="#/financeiro/contratos">← Contratos</a>
      <h1 class="pagina__titulo">Contrato não encontrado</h1>`);
  };
  await mostrar();

  const depois = (promessa) => promessa.then((feito) => feito && mostrar()).catch(avisarErro);
  const parcela = (el) => dados.parcelas.find((p) => p.id === el.dataset.id);
  const recebimento = (el) => dados.recebimentos.find((r) => r.id === el.dataset.id);

  return aoClicar(ctx.raiz, {
    receber: (el) => depois(receberParcela(parcela(el))),
    renegociar: () => depois(renegociarContrato(id)),
    ajuste: (el) => depois(concederAjuste(parcela(el))),
    'estornar-ajuste': async (el) => {
      const motivo = await pedirMotivo({ titulo: 'Estornar ajuste', texto: 'O ajuste deixa de valer e a parcela volta a exigir o valor anterior.', rotuloOk: 'Estornar' });
      if (motivo) depois(db.rpc('estornar_ajuste', { p_id: el.dataset.id, p_motivo: motivo }).then(() => avisar('Ajuste estornado.')).then(() => true));
    },
    redistribuir: () => depois(redistribuir(dados)),
    formalizacao: () => depois(confirmarFormalizacao(dados.contrato)),
    arquivar: async () => {
      const motivo = await pedirMotivo({ titulo: 'Arquivar contrato', texto: 'O contrato sai das listas do dia a dia e continua guardado, com tudo o que tem.', rotuloOk: 'Arquivar' });
      if (motivo) depois(db.rpc('arquivar_contrato', { p_id: id, p_motivo: motivo }).then(() => avisar('Contrato arquivado.')).then(() => true));
    },
    desarquivar: async () => {
      const motivo = await pedirMotivo({ titulo: 'Desarquivar contrato', rotuloOk: 'Desarquivar' });
      if (motivo) depois(db.rpc('desarquivar_contrato', { p_id: id, p_motivo: motivo }).then(() => avisar('Contrato desarquivado.')).then(() => true));
    },
    anexos: () => abrirAnexos({ titulo: dados.contrato.codigo ?? dados.contrato.descricao, destino: { contrato_id: id }, podeGravar: pode.lancar(), categoria: 'contrato' }),
    'anexos-renegociacao': (el) => abrirAnexos({ titulo: 'renegociação', destino: { renegociacao_id: el.dataset.id }, podeGravar: pode.lancar(), categoria: 'aditivo' }),
    comprovantes: (el) => abrirAnexos({ titulo: 'recebimento', destino: { recebimento_id: el.dataset.id }, podeGravar: pode.lancar(), categoria: 'comprovante' }),
    repassar: (el) => depois(registrarRepasse(recebimento(el))),
    'estornar-repasse': async (el) => {
      const r = recebimento(el);
      const motivo = await pedirMotivo({
        titulo: 'Estornar repasse',
        texto: `O repasse de ${moeda(centavos(r.valor_repasse))} em ${data(r.repasse_data)} deixa de contar e a parte do cliente volta a ficar pendente. O lançamento continua no histórico.`,
        rotuloOk: 'Estornar repasse',
      });
      if (motivo) depois(db.rpc('estornar_repasse', { p_id: r.repasse_id, p_motivo: motivo }).then(() => avisar('Repasse estornado.')).then(() => true));
    },
    recibo: (el) => {
      const doc = dados.recibos.get(el.dataset.id);
      if (doc) navegar(`/documentos/${doc}`);
      else emitirRecibo(el.dataset.id).catch(avisarErro);
    },
    apurar: () => depois(apurarExito(dados.contrato)),
    editar: () => depois(editarContrato(dados.contrato, dados.apoio)),
    'editar-cliente': () => depois(editarCliente(dados.contrato.cliente_id).then((c) => {
      if (c) avisar('Cliente salvo.');
      return c;
    })),

    calculo: async (el) => {
      const [{ parcela: p, calculo }] = await atualizarParcelas([parcela(el)]);
      abrirDialogo({
        titulo: `${rotuloParcela(p)} — atualizado para hoje`,
        somenteLeitura: true,
        corpo: html`${memoria(calculo)}<p class="memoria__criterio">Critério: ${criterioEmTexto(p)}.</p>`,
      });
    },

    memoria: (el) => {
      const r = recebimento(el);
      abrirDialogo({
        titulo: `Recebimento de ${data(r.data)}`,
        somenteLeitura: true,
        corpo: memoriaGravada(r.memoria_calculo),
      });
    },

    vencimento: (el) => {
      const p = parcela(el);
      depois(abrirDialogo({
        titulo: `Alterar vencimento — ${rotuloParcela(p)}`,
        corpo: html`
          <label class="campo">
            <span>Novo vencimento</span>
            <input type="date" name="vencimento" value="${p.vencimento}" required autofocus>
          </label>
          <label class="campo">
            <span>Motivo</span>
            <input name="motivo" required maxlength="500" placeholder="Ex.: cliente pediu para passar para o dia 20">
          </label>
          <p class="sub secao">O vencimento anterior (${data(p.vencimento)}) e o motivo ficam no histórico. Mês fechado não muda.</p>`,
        aoEnviar: async ({ vencimento, motivo }) => {
          await db.alterar('parcelas', [['id', 'eq', p.id]], { vencimento, motivo_alteracao: motivo }, 'id');
          avisar('Vencimento alterado.');
          return true;
        },
      }));
    },

    'cancelar-parcela': async (el) => {
      const p = parcela(el);
      const motivo = await pedirMotivo({
        titulo: `Cancelar ${rotuloParcela(p).toLowerCase()}`,
        texto: `O saldo de ${moeda(centavos(p.saldo))} deixa de ser cobrado. A parcela continua visível, como cancelada.`,
        rotuloOk: 'Cancelar parcela',
      });
      if (!motivo) return;
      depois(db.alterar('parcelas', [['id', 'eq', p.id]], { cancelado_em: new Date().toISOString(), motivo_cancelamento: motivo }, 'id')
        .then(() => avisar('Parcela cancelada.')).then(() => true));
    },

    estornar: async (el) => {
      const r = recebimento(el);
      const motivo = await pedirMotivo({
        titulo: 'Estornar recebimento',
        texto: `O recebimento de ${moeda(centavos(r.valor))} em ${data(r.data)} deixa de contar, e o saldo volta para a parcela. O lançamento continua visível, como estornado.`,
        rotuloOk: 'Estornar',
      });
      if (!motivo) return;
      depois(db.alterar('recebimentos', [['id', 'eq', r.id]], { estornado_em: new Date().toISOString(), motivo_estorno: motivo }, 'id')
        .then(() => avisar('Recebimento estornado.')).then(() => true));
    },

    'cancelar-contrato': async () => {
      const motivo = await pedirMotivo({
        titulo: 'Cancelar contrato',
        texto: 'As parcelas em aberto deixam de ser cobradas. O que já foi recebido continua contando.',
        rotuloOk: 'Cancelar contrato',
      });
      if (!motivo) return;
      depois(db.alterar('contratos', [['id', 'eq', id]], { cancelado_em: new Date().toISOString(), motivo_cancelamento: motivo }, 'id')
        .then(() => avisar('Contrato cancelado.')).then(() => true));
    },

    historico: async () => {
      // Os repasses ao cliente, inclusive os estornados, entram no histórico do contrato.
      const comRepasse = dados.recebimentos.filter((r) => Number(r.valor_repasse) > 0).map((r) => r.id);
      const repasses = comRepasse.length
        ? await db.todos('repasses_cliente', { select: 'id', filtros: [['recebimento_id', 'in', comRepasse]] }).catch(() => [])
        : [];
      return abrirHistorico({
        titulo: dados.contrato.descricao,
        registros: [
          id, dados.contrato.cliente_id,
          ...dados.parcelas.map((p) => p.id), ...dados.recebimentos.map((r) => r.id), ...dados.renegociacoes.map((r) => r.id),
          ...repasses.map((r) => r.id),
        ],
      });
    },
  });
}

async function carregar(id) {
  const [contrato, parcelas, recebimentos, renegociacoes, ajustes, suporte] = await Promise.all([
    db.um('v_contratos', { select: '*', filtros: [['id', 'eq', id]] }),
    db.todos('v_parcelas', { select: '*', filtros: [['contrato_id', 'eq', id]] }),
    db.listar('v_recebimentos', { select: '*', filtros: [['contrato_id', 'eq', id]], ordem: 'data.desc,criado_em.desc' }),
    db.listar('renegociacoes', { select: '*', filtros: [['contrato_id', 'eq', id]], ordem: 'criado_em.desc' }),
    db.listar('v_ajustes', { select: '*', filtros: [['contrato_id', 'eq', id]], ordem: 'data.desc,criado_em.desc' }),
    apoio(),
  ]);
  parcelas.sort((a, b) => a.numero - b.numero);
  const [cobrancas, recibos, anterior, seguintes] = contrato ? await Promise.all([
    db.listar('cobrancas', { select: '*', filtros: [['cliente_id', 'eq', contrato.cliente_id]], ordem: 'criado_em.desc', limite: 50 }),
    // O recibo já emitido de cada recebimento (o mais recente).
    recebimentos.length
      ? db.listar('documentos', {
        select: 'id,recebimento_id,criado_em',
        filtros: [['modelo', 'eq', 'recibo'], ['contrato_id', 'eq', id], ['cancelado_em', 'is', null]],
        ordem: 'criado_em.asc',
      }).catch(() => [])
      : [],
    // Contrato encadeado: o que vem antes deste e os que começam depois dele.
    contrato.inicia_apos_contrato_id
      ? db.um('v_contratos', { select: 'id,codigo,descricao,cancelado_em', filtros: [['id', 'eq', contrato.inicia_apos_contrato_id]] }).catch(() => null)
      : null,
    db.listar('v_contratos', { select: 'id,codigo,descricao,cancelado_em', filtros: [['inicia_apos_contrato_id', 'eq', id]], ordem: 'criado_em.asc' }).catch(() => []),
  ]) : [[], [], null, []];
  return {
    contrato, parcelas, recebimentos, renegociacoes, ajustes, cobrancas, apoio: suporte, anterior, seguintes,
    recibos: new Map(recibos.map((d) => [d.recebimento_id, d.id])),
  };
}

/** O número de honorários do cabeçalho e a linha de baixo, por tipo de contrato. */
function honorarios(c) {
  const resp = c.responsavel_id ? ` · ${nomeDe(c.responsavel_id)}` : '';
  // Acordo: o número é o que é do escritório; o bruto vai embaixo.
  if (c.tem_repasse) {
    return [moeda(centavos(c.exigivel_escritorio_total)),
      `${c.tipo_honorario === 'misto' ? 'Fixo + êxito em acordo' : 'Acordo'} · bruto de ${moeda(centavos(c.exigivel_total))}, o resto é do cliente${resp}`];
  }
  // Fixo + êxito: o fixo e, depois da apuração, o êxito somado.
  if (c.tipo_honorario === 'misto') {
    return c.valor_exito != null
      ? [moeda(centavos(c.valor_total) + centavos(c.valor_exito)),
        `Fixo de ${moeda(centavos(c.valor_total))} + êxito apurado de ${moeda(centavos(c.valor_exito))}${resp}`]
      : [moeda(centavos(c.valor_total)), `Fixo + ${percentual(c.exito_pct)} de êxito a apurar${resp}`];
  }
  if (c.valor_total == null) return [percentual(c.exito_pct), `${TIPOS_HONORARIO.exito}${resp}`];
  return [moeda(centavos(c.valor_total)), `${TIPOS_HONORARIO[c.tipo_honorario]}${c.exito_pct ? ` de ${percentual(c.exito_pct)}` : ''}${resp}`];
}

/** Valor da parcela ou do recebimento, com a parte do escritório embaixo quando é acordo. */
const comCota = (valor, escritorio) => html`${moeda(centavos(valor))}<span class="sub">escritório ${moeda(centavos(escritorio))}</span>`;

function tela({ contrato: c, parcelas, recebimentos, renegociacoes, ajustes, cobrancas, recibos, anterior, seguintes, apoio: { config } }) {
  // Consulta só lê; arquivado não muda sem desarquivar.
  const lanca = pode.lancar();
  const ativo = !c.cancelado_em && !c.arquivado_em && lanca;
  const semRecebimento = parcelas.filter((p) => ['a_vencer', 'vencida'].includes(p.situacao)
    && Number(p.pago_principal) === 0 && Number(p.ajustes_desconto) === 0 && Number(p.ajustes_acrescimo) === 0);
  const abertas = parcelas.filter((p) => ['a_vencer', 'vencida'].includes(p.situacao));
  const proprio = c.multa_pct != null;
  const posicao = posicoes(parcelas);
  const dataRenegociacao = new Map(renegociacoes.map((r) => [r.id, r.criado_em]));
  // Acordo com cota própria em multa e juros, e o que foi pago direto ao cliente.
  const cotasProprias = [...new Set(parcelas
    .filter((p) => temRepasse(p) && p.cota_encargos_pct != null && Number(p.cota_encargos_pct) !== Number(p.cota_escritorio_pct)
      && !['renegociada', 'cancelada'].includes(p.situacao))
    .map((p) => `${percentual(p.cota_escritorio_pct)} do acordo e ${percentual(p.cota_encargos_pct)} da multa, dos juros e da correção`))];
  const diretoAoCliente = recebimentos.filter((r) => !r.estornado_em).reduce((s, r) => s + centavos(r.valor_direto_cliente ?? 0), 0);

  const subtitulo = html`
    ${c.codigo ? html`<strong>${c.codigo}</strong> · ` : ''}${c.cliente_nome}${c.cliente_telefone ? ` · ${telefone(c.cliente_telefone)}` : ''}${c.processo ? ` · processo ${c.processo}` : ''}
    ${lanca ? html`<button type="button" class="botao-link" data-acao="editar-cliente">editar cliente</button>` : ''}`;

  return html`
    <a class="pagina__voltar" href="#/financeiro/contratos">← Contratos</a>
    ${cabecalho(c.descricao, subtitulo, html`
      ${pode.clientes()?html`<a class="botao" href="#/documentos/novo?modelo=contrato_honorarios&cliente=${c.cliente_id}&contrato=${c.id}">Gerar contrato</a><a class="botao" href="#/documentos/novo?modelo=prestacao_contas&cliente=${c.cliente_id}&contrato=${c.id}">Prestação de contas</a>`:''}
      ${seloContrato(c.rotulo ?? c.situacao)}
      <button type="button" class="botao" data-acao="historico">Histórico</button>
      <button type="button" class="botao" data-acao="anexos">Anexos</button>
      ${ativo ? html`<button type="button" class="botao" data-acao="editar">Editar</button>` : ''}
      ${ativo && (c.exito_pendente ?? c.situacao === 'a_apurar') ? html`<button type="button" class="botao botao--primario" data-acao="apurar">Apurar êxito</button>` : ''}
      ${ativo && abertas.length ? html`<button type="button" class="botao" data-acao="renegociar">Renegociar</button>` : ''}
      ${ativo && semRecebimento.length >= 2 ? html`<button type="button" class="botao" data-acao="redistribuir">Redistribuir valores</button>` : ''}
      ${ativo && c.situacao === 'quitado' ? html`<button type="button" class="botao" data-acao="arquivar">Arquivar</button>` : ''}
      ${c.arquivado_em && pode.administrar() ? html`<button type="button" class="botao" data-acao="desarquivar">Desarquivar</button>` : ''}
      ${ativo ? html`<button type="button" class="botao botao--discreto" data-acao="cancelar-contrato">Cancelar contrato</button>` : ''}`)}

    <p class="sub">${c.data_contrato
      ? html`Contrato de ${data(c.data_contrato)}${c.data_fim ? html` · vigência até ${data(c.data_fim)}` : ''}${c.motivo_vencimento_anterior ? html` · vencimento anterior confirmado: ${c.motivo_vencimento_anterior}` : ''}`
      : html`<span class="perigo">Data de formalização a confirmar</span> (contrato anterior a 08/10/2026)`}
      ${lanca && !c.cancelado_em ? html` <button type="button" class="botao-link" data-acao="formalizacao">${c.data_contrato ? 'corrigir data' : 'confirmar a data'}</button>` : ''}</p>
    ${anterior || seguintes.length ? html`<p class="sub">${anterior ? html`Começa depois de <a href="#/financeiro/contratos/${anterior.id}">${anterior.codigo ?? anterior.descricao}</a>${anterior.cancelado_em ? ' (cancelado)' : ''}` : ''}${anterior && seguintes.length ? ' · ' : ''}${seguintes.length ? html`Depois dele começa${seguintes.length > 1 ? 'm' : ''} ${seguintes.map((s, i) => html`${i ? ', ' : ''}<a href="#/financeiro/contratos/${s.id}">${s.codigo ?? s.descricao}</a>${s.cancelado_em ? ' (cancelado)' : ''}`)}` : ''}.</p>` : ''}
    ${Number(c.diferenca_plano) ? html`<p class="nota nota--perigo">As parcelas não fecham com o valor do contrato: diferença de ${moeda(centavos(c.diferenca_plano))}. Confira o histórico.</p>` : ''}
    ${Number(c.repasse_pendente) > 0 ? html`<p class="nota">Parte do cliente recebida e ainda não repassada: <strong>${moeda(centavos(c.repasse_pendente))}</strong>
      (${plural(c.repasses_pendentes, 'recebimento', 'recebimentos')}).${lanca ? ' Registre o repasse em Recebimentos, quando ele sair.' : ''}</p>` : ''}
    ${cotasProprias.length ? html`<p class="sub">Acordo: o escritório fica com ${cotasProprias.join('; ')}.</p>` : ''}
    ${diretoAoCliente ? html`<p class="sub">Pago pela parte contrária direto ao cliente, fora do caixa do escritório: ${moeda(diretoAoCliente)}.</p>` : ''}
    ${c.arquivado_em ? html`<p class="nota">Arquivado em ${dataHora(c.arquivado_em)} por ${nomeDe(c.arquivado_por)}. Motivo: ${c.motivo_arquivamento}</p>` : ''}

    ${c.cancelado_em ? html`
      <p class="nota nota--perigo">
        Cancelado em ${dataHora(c.cancelado_em)} por ${nomeDe(c.cancelado_por)}. Motivo: ${c.motivo_cancelamento}
      </p>` : ''}

    <div class="indicadores">
      ${indicador('Honorários', ...honorarios(c))}
      ${indicador('Recebido', moeda(centavos(c.recebido)), diretoAoCliente
        ? `inclui multa, juros e correção, e ${moeda(diretoAoCliente)} pagos direto ao cliente` : 'inclui multa, juros e correção recebidos', { tom: 'ok' })}
      ${indicador('Saldo em aberto', moeda(centavos(c.saldo)), !c.proximo_vencimento
        ? 'nada a vencer'
        : c.proximo_vencimento < hoje() ? `vencido desde ${data(c.proximo_vencimento)}` : `próximo vencimento ${data(c.proximo_vencimento)}`)}
      ${indicador('Vencido', moeda(centavos(c.saldo_vencido)), `${plural(c.vencidas, 'parcela', 'parcelas')}, sem encargos`,
        { tom: c.vencidas ? 'perigo' : '' })}
    </div>

    <p class="sub">Atraso: ${proprio ? 'critério próprio' : 'critério do escritório'} — ${criterioEmTexto(criterioDoContrato(c, config))}.${c.observacoes ? ` Observações: ${c.observacoes}` : ''}</p>

    <section class="painel secao">
      <header class="painel__topo"><h2 class="painel__titulo">Parcelas</h2></header>
      ${parcelas.length ? html`
        <div class="tabela-rolagem">
          <table class="tabela">
            <thead>
              <tr>
                <th>Parcela</th><th>Vencimento</th><th class="num">Valor</th><th class="num">Recebido</th>
                <th class="num">Saldo</th><th>Situação</th><th class="acoes"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              ${parcelas.map((p) => {
                const aberta = ['a_vencer', 'vencida'].includes(p.situacao);
                const ajustada = Number(p.ajustes_desconto) || Number(p.ajustes_acrescimo);
                const pos = posicao.get(p.id);
                const daParte = p.parte === 'exito' && c.tipo_honorario === 'misto' ? 'êxito ' : '';
                const onde = pos && (p.origem_renegociacao_id
                  ? `${daParte}${pos.posicao} de ${pos.total} da renegociação de ${dataHora(dataRenegociacao.get(p.origem_renegociacao_id)).slice(0, 10)}`
                  : `${daParte}${pos.posicao} de ${pos.total}`);
                return html`
                  <tr class="${['renegociada', 'cancelada'].includes(p.situacao) ? 'apagada' : ''}">
                    <td>${rotuloParcela(p)}${onde ? html`<span class="sub">${onde}</span>` : ''}</td>
                    <td class="num">${data(p.vencimento)}${p.situacao === 'vencida' ? html`<span class="sub perigo">${p.dias_atraso} dias</span>` : ''}</td>
                    <td class="num">${temRepasse(p) ? comCota(p.valor, p.valor_escritorio) : moeda(centavos(p.valor))}${ajustada ? html`<span class="sub">exige ${moeda(centavos(p.exigivel))}</span>` : ''}</td>
                    <td class="num">${moeda(centavos(p.pago_principal) + centavos(p.pago_encargos))}</td>
                    <td class="num">${aberta ? moeda(centavos(p.saldo)) : '—'}</td>
                    <td>${seloParcela(p.situacao, p.parcial)}${p.motivo_cancelamento ? html`<span class="sub">${p.motivo_cancelamento}</span>` : ''}</td>
                    <td class="acoes">
                      ${aberta && ativo ? html`
                        ${p.situacao === 'vencida' ? html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="calculo" data-id="${p.id}">Cálculo</button>` : ''}
                        <button type="button" class="botao botao--pequeno" data-acao="receber" data-id="${p.id}">Receber</button>
                        <button type="button" class="botao botao--pequeno botao--discreto" data-acao="vencimento" data-id="${p.id}">Vencimento</button>
                        ${pode.ajustar() ? html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="ajuste" data-id="${p.id}">Ajuste</button>` : ''}
                        <button type="button" class="botao botao--pequeno botao--discreto" data-acao="cancelar-parcela" data-id="${p.id}">Cancelar</button>` : ''}
                    </td>
                  </tr>`;
              })}
            </tbody>
          </table>
        </div>` : vazio(c.situacao === 'a_apurar' ? 'Êxito a apurar: as parcelas nascem quando o resultado sair.' : 'Sem parcelas.')}
      ${parcelas.length && c.tipo_honorario === 'misto' && c.exito_pendente ? html`
        <p class="painel__rodape sub">Êxito de ${percentual(c.exito_pct)} a apurar: as parcelas dele entram aqui quando o resultado sair.</p>` : ''}
    </section>

    <section class="painel secao">
      <header class="painel__topo"><h2 class="painel__titulo">Recebimentos</h2></header>
      ${recebimentos.length ? html`
        <div class="tabela-rolagem">
          <table class="tabela">
            <thead>
              <tr>
                <th>Data</th><th>Parcela</th><th class="num">Valor</th><th class="num">Saldo abatido</th>
                <th class="num">Encargos</th><th>Forma e conta</th><th>Lançado por</th><th class="acoes"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              ${recebimentos.map((r) => html`
                <tr class="${r.estornado_em ? 'apagada' : ''}">
                  <td class="num">${data(r.data)}</td>
                  <td>${nomeDaParcela(r.parcela_numero)}${r.observacao ? html`<span class="sub">${r.observacao}</span>` : ''}</td>
                  <td class="num">${moeda(centavos(r.valor))}${Number(r.valor_direto_cliente) > 0 ? html`
                    <span class="sub">honorários, na conta</span>
                    <span class="sub">+ ${moeda(centavos(r.valor_direto_cliente))} direto ao cliente</span>
                    ${r.estornado_em ? '' : html`<span class="sub">${seloRepasse('direto')}</span>`}` : Number(r.valor_repasse) > 0 ? html`
                    <span class="sub">escritório ${moeda(centavos(r.valor_escritorio))}</span>
                    <span class="sub">cliente ${moeda(centavos(r.valor_repasse))}</span>
                    ${r.estornado_em ? '' : html`<span class="sub">${seloRepasse(r.repasse_situacao)}${r.repasse_situacao === 'feito' ? ` ${data(r.repasse_data)}` : ''}</span>`}` : ''}</td>
                  <td class="num">${moeda(centavos(r.valor_principal))}</td>
                  <td class="num">${moeda(centavos(r.valor_encargos))}${r.encargos_discriminados && Number(r.valor_encargos)
                    ? html`<span class="sub">${[['correção', r.valor_correcao], ['multa', r.valor_multa], ['juros', r.valor_juros], ['acréscimo', r.valor_acrescimo]]
                      .filter(([, v]) => Number(v)).map(([n, v]) => `${n} ${moeda(centavos(v))}`).join(' · ')}</span>` : ''}</td>
                  <td>${r.forma_nome ?? '—'}<span class="sub">${nomeContaFinanceira(r.conta_financeira_nome)}</span>${r.repasse_situacao === 'feito' && !r.estornado_em
                    ? html`<span class="sub">repasse saiu de ${nomeContaFinanceira(r.repasse_conta_financeira_nome)}</span>` : ''}</td>
                  <td>${nomeDe(r.criado_por)}<span class="sub">${dataHora(r.criado_em)}</span></td>
                  <td class="acoes">
                    ${!r.estornado_em && lanca && r.repasse_situacao === 'pendente' ? html`<button type="button" class="botao botao--pequeno" data-acao="repassar" data-id="${r.id}">Registrar repasse</button>` : ''}
                    ${!r.estornado_em && lanca && !c.arquivado_em && r.repasse_situacao === 'feito' ? html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="estornar-repasse" data-id="${r.id}">Estornar repasse</button>` : ''}
                    ${r.memoria_calculo ? html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="memoria" data-id="${r.id}">Cálculo</button>` : ''}
                    ${recibos.has(r.id) || (lanca && !r.estornado_em) ? html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="recibo" data-id="${r.id}">${recibos.has(r.id) ? 'Ver recibo' : 'Emitir recibo'}</button>` : ''}
                    <button type="button" class="botao botao--pequeno botao--discreto" data-acao="comprovantes" data-id="${r.id}">Comprovantes</button>
                    ${r.estornado_em
                      ? html`<span class="selo selo--escuro">Estornado</span><span class="sub">${nomeDe(r.estornado_por)}: ${r.motivo_estorno}</span>`
                      : lanca && !c.arquivado_em ? html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="estornar" data-id="${r.id}">Estornar</button>` : ''}
                  </td>
                </tr>`)}
            </tbody>
          </table>
        </div>` : vazio('Nenhum recebimento ainda.')}
    </section>

    ${renegociacoes.length ? html`
      <section class="painel secao">
        <header class="painel__topo"><h2 class="painel__titulo">Renegociações</h2></header>
        <ul class="lista">
          ${renegociacoes.map((r) => html`
            <li class="lista__item">
              <span>${r.motivo}<span class="sub">${dataHora(r.criado_em)} · ${nomeDe(r.criado_por)}</span></span>
              <span class="num">${moeda(centavos(r.saldo_anterior))} → ${moeda(centavos(r.valor_renegociado))}
                <button type="button" class="botao botao--pequeno botao--discreto" data-acao="anexos-renegociacao" data-id="${r.id}">Aditivo</button></span>
            </li>`)}
        </ul>
      </section>` : ''}

    ${ajustes.length ? html`
      <section class="painel secao">
        <header class="painel__topo"><h2 class="painel__titulo">Descontos, abatimentos e acréscimos</h2></header>
        <ul class="lista">
          ${ajustes.map((a) => html`
            <li class="lista__item ${a.estornado_em ? 'apagada' : ''}">
              <span>${({ desconto: 'Desconto', abatimento: 'Abatimento', acrescimo: 'Acréscimo' })[a.tipo]} · ${rotuloParcela({ numero: a.parcela_numero })} · ${a.motivo}
                <span class="sub">${data(a.data)} · autorizado por ${nomeDe(a.autorizado_por)}${a.estornado_em ? ` · estornado: ${a.motivo_estorno}` : ''}</span></span>
              <span class="num">${a.tipo === 'acrescimo' ? '+' : '−'}${moeda(centavos(a.valor))}
                ${!a.estornado_em && pode.ajustar() ? html`<button type="button" class="botao botao--pequeno botao--discreto" data-acao="estornar-ajuste" data-id="${a.id}">Estornar</button>` : ''}</span>
            </li>`)}
        </ul>
      </section>` : ''}

    <section class="painel secao">
      <header class="painel__topo"><h2 class="painel__titulo">Cobranças deste cliente</h2></header>
      ${cobrancas.length ? html`
        <ul class="lista">
          ${cobrancas.map((k) => html`
            <li class="lista__item">
              <span>${CANAIS[k.canal] ?? k.canal} · ${nomeDe(k.criado_por)}${k.observacao ? html`<span class="sub">${k.observacao}</span>` : ''}</span>
              <span class="num">${dataHora(k.criado_em)}${k.total_na_data != null ? html`<span class="sub">${moeda(centavos(k.total_na_data))}</span>` : ''}</span>
            </li>`)}
        </ul>` : vazio('Nenhuma cobrança registrada. Registre em Em atraso › Preparar mensagem.')}
    </section>`;
}

function editarContrato(c, { config, formas }) {
  const proprio = c.multa_pct != null;
  const advogados = membrosAtivos().filter((m) => m.papel !== 'secretaria' || m.id === c.responsavel_id);

  return abrirDialogo({
    titulo: 'Editar contrato',
    largo: true,
    corpo: html`
      <div class="campos">
        <label class="campo campo--8">
          <span>Descrição</span>
          <input name="descricao" value="${c.descricao}" required maxlength="200" autofocus>
        </label>
        <label class="campo campo--4">
          <span>Nº do processo</span>
          <input name="processo" value="${c.processo ?? ''}" maxlength="40">
        </label>
        <label class="campo campo--6">
          <span>Forma de pagamento prevista</span>
          <select name="forma_prevista_id">${opcoes(formas.filter((f) => f.ativo || f.id === c.forma_prevista_id).map((f) => [f.id, f.nome]), c.forma_prevista_id, { vazio: 'Não definida' })}</select>
        </label>
        <label class="campo campo--6">
          <span>Sócio responsável</span>
          <select name="responsavel_id">${opcoes(advogados.map((m) => [m.id, m.nome_curto]), c.responsavel_id, { vazio: 'Não definido' })}</select>
        </label>
        <fieldset class="fieldset campos">
          <legend>Atraso</legend>
          <label class="opcao"><input type="radio" name="criterio" value="padrao" ${proprio ? '' : 'checked'}> Critério do escritório: ${criterioEmTexto(config)}</label>
          <label class="opcao"><input type="radio" name="criterio" value="proprio" ${proprio ? 'checked' : ''}> Critério próprio deste contrato</label>
          <div class="campos" data-papel="criterio" ${proprio ? '' : 'hidden'}>${camposCriterio(criterioDoContrato(c, config))}</div>
        </fieldset>
        <label class="campo">
          <span>Observações</span>
          <textarea name="observacoes" rows="2">${c.observacoes ?? ''}</textarea>
        </label>
      </div>
      <p class="sub secao">
        Valor e parcelas não mudam por aqui: para isso há Renegociar, Vencimento e Cancelar
        parcela. O critério novo vale para o cálculo de hoje em diante — recebimentos já
        lançados guardam o cálculo do dia.
      </p>`,

    aoAbrir: (dialogo, form) => {
      form.addEventListener('change', (e) => {
        if (e.target.name === 'criterio') $('[data-papel="criterio"]', form).hidden = form.criterio.value !== 'proprio';
      });
    },

    aoEnviar: async (d) => {
      const criterio = d.criterio === 'proprio'
        ? lerCriterio(d)
        : { multa_pct: null, juros_mes_pct: null, correcao: null, carencia_dias: null };
      await db.alterar('contratos', [['id', 'eq', c.id]], {
        descricao: d.descricao,
        processo: d.processo || null,
        forma_prevista_id: d.forma_prevista_id || null,
        responsavel_id: d.responsavel_id || null,
        observacoes: d.observacoes || null,
        ...criterio,
      }, 'id');
      avisar('Contrato salvo.');
      return true;
    },
  });
}

/** Formalização de contrato antigo (ou correção, com motivo). */
function confirmarFormalizacao(c) {
  const dia = hoje();
  return abrirDialogo({
    titulo: c.data_contrato ? 'Corrigir a data do contrato' : 'Confirmar a data do contrato',
    corpo: html`
      <p class="dialogo__texto">${c.data_contrato
        ? `Hoje está ${data(c.data_contrato)}. A correção fica no histórico, com o motivo.`
        : 'Contrato lançado antes de 08/10/2026: o sistema não sabe quando ele foi formalizado e não inventa a data.'}</p>
      <div class="campos">
        <label class="campo campo--6"><span>Data em que foi formalizado</span><input type="date" name="data" value="${c.data_contrato ?? ''}" max="${dia}" required autofocus></label>
        <label class="campo"><span>Motivo ${c.data_contrato ? '' : '(obrigatório se houver vencimento antes desta data)'}</span><input name="motivo" maxlength="500" ${c.data_contrato ? 'required' : ''}></label>
      </div>`,
    aoEnviar: async (d) => {
      await db.rpc('confirmar_formalizacao', { p_id: c.id, p_data: d.data, p_motivo: d.motivo || null });
      avisar('Data do contrato registrada.');
      return true;
    },
  });
}

/** Redistribui valores entre parcelas em aberto, sem mudar o total delas. */
function redistribuir({ contrato: c, parcelas }) {
  const livres = parcelas.filter((p) => ['a_vencer', 'vencida'].includes(p.situacao)
    && Number(p.pago_principal) === 0 && Number(p.ajustes_desconto) === 0 && Number(p.ajustes_acrescimo) === 0);
  const total = livres.reduce((s, p) => s + centavos(p.valor), 0);
  // Fixo e êxito, e cotas do escritório diferentes, não trocam valor entre si:
  // cada grupo mantém a própria soma (o banco confere o mesmo).
  const cota = (p) => Number(p.cota_escritorio_pct ?? 100);
  const grupo = (p) => `${p.parte === 'exito' ? 'exito' : 'fixo'}|${cota(p)}|${Number(p.cota_encargos_pct ?? cota(p))}`;
  const rotuloGrupo = (p) => `${p.parte === 'exito' ? 'Êxito' : 'Fixo'}${cota(p) < 100 ? ` · acordo, ${percentual(cota(p))} do escritório` : ''}`;
  const grupos = [...new Map(livres.map((p) => [grupo(p), { rotulo: rotuloGrupo(p), total: 0 }])).entries()];
  for (const p of livres) grupos.find(([g]) => g === grupo(p))[1].total += centavos(p.valor);
  return abrirDialogo({
    titulo: 'Redistribuir valores entre parcelas',
    largo: true,
    corpo: html`
      <p class="dialogo__texto">Muda valor e vencimento de parcelas em aberto, sem recebimento, mantendo a soma
        (${moeda(total)}) — o contrato continua fechando com o valor total. Para mudar o total, use Renegociar.</p>
      ${grupos.length > 1 ? html`<p class="nota">Cada grupo mantém a própria soma: ${grupos.map(([, g]) => `${g.rotulo}, ${moeda(g.total)}`).join('; ')}.
        Valor não passa do fixo para o êxito, nem entre cotas do escritório diferentes.</p>` : ''}
      <div class="tabela-rolagem">
        <table class="tabela parcelas-editor">
          <thead><tr><th>Parcela</th><th>Vencimento</th><th class="num">Valor</th></tr></thead>
          <tbody>${livres.map((p) => html`
            <tr><td>${rotuloParcela(p)}${grupos.length > 1 ? html`<span class="sub">${rotuloGrupo(p)}</span>` : ''}</td>
              <td><input type="date" name="v_${p.id}" value="${p.vencimento}" aria-label="Vencimento"></td>
              <td><input class="num" inputmode="decimal" name="valor_${p.id}" value="${decimal(centavos(p.valor))}" aria-label="Valor"></td></tr>`)}
          </tbody>
          <tfoot><tr><td colspan="2">Soma</td><td class="num" data-papel="soma"></td></tr></tfoot>
        </table>
      </div>
      <label class="campo secao"><span>Motivo</span><input name="motivo" required maxlength="500" placeholder="Ex.: cliente pediu para pagar mais nas primeiras"></label>`,
    aoAbrir: (dialogo, form) => {
      const soma = () => {
        const s = livres.reduce((t, p) => t + (lerMoeda(form[`valor_${p.id}`].value) || 0), 0);
        const celula = $('[data-papel="soma"]', dialogo);
        celula.textContent = s === total ? moeda(s) : `${moeda(s)} — diferença de ${moeda(total - s)}`;
        celula.classList.toggle('perigo', s !== total);
      };
      form.addEventListener('input', soma);
      soma();
    },
    aoEnviar: async (d, form) => {
      const novas = livres.map((p) => ({ id: p.id, valor: lerMoeda(form[`valor_${p.id}`].value), vencimento: form[`v_${p.id}`].value }));
      if (novas.some((n) => !(n.valor > 0) || !n.vencimento)) throw new Error('Toda parcela precisa de data e valor maior que zero.');
      const s = novas.reduce((t, n) => t + n.valor, 0);
      if (s !== total) throw new Error(`A soma (${moeda(s)}) precisa continuar ${moeda(total)}.`);
      for (const [g, { rotulo, total: doGrupo }] of grupos) {
        const nova = novas.filter((n) => grupo(livres.find((x) => x.id === n.id)) === g).reduce((t, n) => t + n.valor, 0);
        if (nova !== doGrupo) throw new Error(`As parcelas do grupo "${rotulo}" precisam continuar somando ${moeda(doGrupo)} (agora: ${moeda(nova)}).`);
      }
      const mudaram = novas.filter((n) => {
        const p = livres.find((x) => x.id === n.id);
        return n.valor !== centavos(p.valor) || n.vencimento !== p.vencimento;
      });
      if (!mudaram.length) throw new Error('Nada mudou.');
      await db.rpc('redistribuir_parcelas', {
        p: { contrato_id: c.id, motivo: d.motivo, parcelas: novas.map((n) => ({ id: n.id, valor: paraReais(n.valor), vencimento: n.vencimento })) },
      });
      avisar('Parcelas redistribuídas.');
      return true;
    },
  });
}

/**
 * Apurar o êxito — uma vez, no êxito puro e no fixo + êxito.
 *
 * Dois jeitos de lançar:
 *   · Só os honorários: o cliente recebe e paga ao escritório o percentual.
 *   · O acordo inteiro: a parte contrária paga o acordo ao escritório (entrada
 *     e parcelas), e a parte do cliente é repassada. Cada parcela cobra o
 *     bruto; a cota do escritório (o percentual, editável) separa o honorário.
 */
function apurarExito(contrato) {
  const dia = hoje();
  const fracao = Number(contrato.exito_pct) / 100;
  const misto = contrato.tipo_honorario === 'misto';

  return abrirDialogo({
    titulo: 'Apurar êxito',
    rotuloOk: 'Gerar parcelas',
    largo: true,
    corpo: html`
      <p class="dialogo__texto">
        ${misto ? html`Além do valor fixo, honorários` : 'Honorários'} de ${percentual(contrato.exito_pct)} sobre o que o cliente recebeu.
      </p>
      <fieldset class="fieldset campos">
        <legend>Como o dinheiro chega</legend>
        <label class="opcao campo"><input type="radio" name="modo" value="honorarios" checked>
          O cliente recebe e paga os honorários ao escritório</label>
        <label class="opcao campo"><input type="radio" name="modo" value="acordo">
          A parte contrária paga o acordo ao escritório, que repassa a parte do cliente</label>
      </fieldset>
      <div class="campos secao">
        <label class="campo campo--6">
          <span data-papel="rotulo-base">Quanto o cliente recebeu</span>
          <input name="base" class="num" inputmode="decimal" autofocus>
        </label>
        <label class="campo campo--6" data-modo="honorarios">
          <span>Honorários</span>
          <input name="valor" class="num" inputmode="decimal">
          <span class="campo__ajuda">Sai calculado da base; pode digitar direto.</span>
        </label>
        <label class="campo campo--6" data-modo="acordo" hidden>
          <span>Cota do escritório (%)</span>
          <input name="cota" class="num" inputmode="decimal" value="${String(Number(contrato.exito_pct)).replace('.', ',')}">
        </label>
        <label class="campo campo--6" data-modo="acordo" hidden>
          <span>Multa e juros: cota do escritório (%)</span>
          <input name="cota_encargos" class="num" inputmode="decimal" placeholder="a mesma">
          <span class="campo__ajuda">Vazio: a mesma do acordo.</span>
        </label>
        <label class="campo campo--4" data-modo="acordo" hidden>
          <span>Entrada (opcional)</span>
          <input name="entrada" class="num" inputmode="decimal" placeholder="0,00">
        </label>
        <label class="campo campo--4" data-modo="acordo" hidden>
          <span>Data da entrada</span>
          <input type="date" name="data_entrada" value="${dia}">
        </label>
        <label class="campo campo--4">
          <span>Número de parcelas</span>
          <input type="number" name="quantidade" min="1" max="120" value="1" required>
        </label>
        <label class="campo campo--6">
          <span>Primeiro vencimento</span>
          <input type="date" name="primeiro" value="${dia}" required>
        </label>
      </div>
      <p class="nota nota--info secao" data-papel="previa">Informe o valor.</p>`,

    aoAbrir: (dialogo, form) => {
      const previa = dialogo.querySelector('[data-papel="previa"]');
      const atualizar = () => {
        const acordo = form.modo.value === 'acordo';
        for (const el of dialogo.querySelectorAll('[data-modo]')) el.hidden = el.dataset.modo !== form.modo.value;
        dialogo.querySelector('[data-papel="rotulo-base"]').textContent = acordo ? 'Valor bruto do acordo' : 'Quanto o cliente recebeu';
        try {
          const r = montar(form);
          const valores = [...new Set(r.novas.filter((n) => n.numero > 0).map((n) => moeda(n.valor)))].join(' ou ');
          const entrada = r.novas.find((n) => n.numero === 0);
          const quantas = r.novas.filter((n) => n.numero > 0).length;
          const plano = `${entrada ? `Entrada de ${moeda(entrada.valor)} em ${data(entrada.vencimento)}${quantas ? ' + ' : ''}` : ''}`
            + (quantas ? `${quantas} × ${valores}, a partir de ${data(r.novas.find((n) => n.numero > 0).vencimento)}` : '');
          previa.textContent = acordo
            ? `${plano}. Do bruto de ${moeda(r.total)}: escritório (${percentual(r.cota)}) ${moeda(r.escritorio)} · cliente ${moeda(r.total - r.escritorio)}, repassado a cada recebimento.`
              + (r.cotaEncargos != null ? ` Multa e juros de atraso: ${percentual(r.cotaEncargos)} do escritório.` : '')
            : `${plano}.`;
        } catch (falha) {
          previa.textContent = falha.message;
        }
      };
      form.base.addEventListener('input', () => {
        const base = lerMoeda(form.base.value);
        if (base > 0) form.valor.value = decimal(Math.round(base * fracao));
      });
      form.addEventListener('input', atualizar);
      form.addEventListener('change', atualizar);
      atualizar();
    },

    aoEnviar: async (_, form) => {
      const r = montar(form);
      await db.rpc('apurar_exito', {
        p: {
          contrato_id: contrato.id,
          valor_total: paraReais(r.total),
          base: r.base > 0 ? paraReais(r.base) : null,
          ...(r.cota != null ? { cota_escritorio_pct: r.cota } : {}),
          ...(r.cotaEncargos != null ? { cota_encargos_pct: r.cotaEncargos } : {}),
          parcelas: r.novas.map((n) => ({ vencimento: n.vencimento, valor: paraReais(n.valor) })),
        },
      });
      avisar(r.cota != null
        ? 'Êxito apurado. O acordo já está nos recebíveis, com a parte do cliente separada.'
        : 'Êxito apurado. As parcelas já estão nos recebíveis.');
      return true;
    },
  });

  /** As parcelas e os números da apuração; lança erro em português. */
  function montar(form) {
    const base = lerMoeda(form.base.value);
    if (form.modo.value !== 'acordo') {
      const total = lerMoeda(form.valor.value);
      if (!(total > 0)) throw new Error('Informe o valor dos honorários.');
      const novas = gerarParcelas({ total, quantidade: Number(form.quantidade.value), primeiroVencimento: form.primeiro.value });
      return { total, base, cota: null, novas };
    }
    if (!(base > 0)) throw new Error('Informe o valor bruto do acordo.');
    const cota = lerNumero(form.cota.value);
    if (!entre(cota, 0.01, 100)) throw new Error('Informe a cota do escritório, de 0,01% a 100%.');
    if (!ateDuasCasas(cota)) throw new Error('A cota do escritório aceita até duas casas decimais (ex.: 30 ou 33,33).');
    const cotaEncargos = form.cota_encargos.value.trim() ? lerNumero(form.cota_encargos.value) : null;
    if (cotaEncargos != null && (!entre(cotaEncargos, 0, 100) || !ateDuasCasas(cotaEncargos))) {
      throw new Error('A cota em multa e juros vai de 0% a 100%, com até duas casas decimais — ou deixe vazio para usar a do acordo.');
    }
    if (cotaEncargos != null && cota >= 100) {
      throw new Error('Com 100% do acordo para o escritório, multa e juros também são dele: deixe vazio o campo de multa e juros.');
    }
    const novas = gerarParcelas({
      total: base,
      entrada: lerMoeda(form.entrada.value) ?? 0,
      dataEntrada: form.data_entrada.value,
      quantidade: Number(form.quantidade.value),
      primeiroVencimento: form.primeiro.value,
    });
    const escritorio = novas.reduce((s, n) => s + divisaoDoRepasse(n.valor, cota).escritorio, 0);
    return { total: base, base, cota, cotaEncargos, novas, escritorio };
  }
}
