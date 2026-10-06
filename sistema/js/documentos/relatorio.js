// Relatório de atividades para o cliente (F4).
// ============================================
//
// O tempo de trabalho do escritório, atividade por atividade — a prova de
// quanto foi feito (CLAUDE.md §4, Atualizações). Ficam de fora as canceladas
// e os cronômetros ainda rodando. O relato é interno: só entra no papel
// quando alguém marca "Incluir relatos internos".

import { data, duracao, hora, noFuso, numeroCnj } from '../nucleo/formato.js';
import { html } from '../nucleo/html.js';
import { minutosDe, TIPOS_ATUALIZACAO, totais } from '../dominio/tempo.js';
import { folha } from './partes.js';

export function montarRelatorio({ cliente, atividades, processos = [], membros = [], de, ate, dia, incluirRelato = false }) {
  const concluidas = atividades.filter((a) => a.fim && !a.cancelado_em);
  const t = totais(concluidas);
  const nomes = new Map(membros.map((m) => [m.id, m.nome]));
  const casos = new Map(processos.map((p) => [p.id, numeroCnj(p.numero) || p.referencia || p.titulo]));
  const quem = (a) => [...new Set([a.membro_id, ...(a.participantes ?? [])])].map((id) => nomes.get(id) || 'Membro').join(' + ');

  // Atividade que passou da meia-noite mostra também o dia em que terminou.
  const horario = (a) => {
    const outroDia = noFuso(a.fim).dia !== noFuso(a.inicio).dia;
    return html`${data(noFuso(a.inicio).dia)}<br>${hora(a.inicio)}–${outroDia ? `${data(noFuso(a.fim).dia)} ` : ''}${hora(a.fim)}`;
  };

  const linhas = concluidas.map((a) => html`
    <tr>
      <td>${horario(a)}</td>
      <td>${duracao(minutosDe(a))}</td>
      <td>${quem(a)}</td>
      <td>${TIPOS_ATUALIZACAO[a.tipo]}</td>
      <td>${casos.has(a.processo_id) ? html`<span class="doc-num">${casos.get(a.processo_id)}</span>` : '—'}</td>
      ${incluirRelato ? html`<td>${a.relato || '—'}</td>` : ''}
    </tr>`);

  return folha('RELATÓRIO DE ATIVIDADES', html`
    <p><strong>Cliente:</strong> ${cliente.nome}<br><strong>Período:</strong> ${data(de)} a ${data(ate)}</p>
    <p><strong>Tempo total:</strong> ${duracao(t.total)} · ${duracao(t.cronometrado)} cronometrado · ${duracao(t.manual)} lançado à mão.<br><strong>Atividades concluídas:</strong> ${concluidas.length}.</p>
    <table class="doc-tabela">
      <thead><tr><th>Data / horário</th><th>Duração</th><th>Quem</th><th>Tipo</th><th>Processo / caso</th>${incluirRelato ? html`<th>Relato</th>` : ''}</tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <h2>Tempo por membro</h2>
    <ul>${Object.entries(t.porMembro).map(([id, n]) => html`<li>${nomes.get(id) || 'Membro'}: ${duracao(n)}</li>`)}</ul>
    <p class="doc-nota">O tempo de uma atividade com participantes aparece integralmente para cada participante; o total do cliente conta a atividade uma vez. Atividades em andamento e canceladas ficam fora deste relatório.</p>`, dia);
}
