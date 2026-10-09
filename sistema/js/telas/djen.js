// Busca no DJEN pelo navegador (preparação F6 §10.3–10.7).
// ========================================================
//
// A API pública do CNJ só responde a pedidos vindos do Brasil — por isso
// quem consulta é o navegador de quem está no escritório, nunca o servidor.
//
//   buscarNoDiario: uma OAB por vez (as dos membros ativos), página por
//     página, com pausa entre pedidos e parando no limite do CNJ (429 ou
//     x-ratelimit-remaining = 0). O resultado vai para importar_intimacoes,
//     que grava cada comunicação uma vez só e registra a consulta.
//   capturarDoDia: a "captura diária" — com a busca automática ligada, a
//     primeira pessoa com acesso a Prazos que abre o sistema num dia útil
//     busca desde a última consulta completa. Duas pessoas ao mesmo tempo
//     não duplicam nada (o id do DJEN é único).
//
// Nada vira prazo sozinho: tudo entra como "pendente" para conferência.

import { DJEN_URL } from '../config.js';
import { avisar } from '../nucleo/avisos.js';
import { membrosAtivos, pode } from '../nucleo/estado.js';
import { hoje } from '../nucleo/formato.js';
import { db } from '../nucleo/supabase.js';
import { capturaPendente, lerOab, normalizarComunicacao, periodoDaBusca } from '../dominio/djen.js';
import { diasNaoUteis } from '../dominio/feriados.js';
import { consultarOab } from '../dominio/consulta-djen.js';
import { dataDaPublicacao, ehDiaUtil } from '../dominio/prazos.js';

const PAUSA_MS = 700;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** As OABs que a busca vai usar e quem ficou de fora por não ter OAB legível. */
export function oabsDosMembros() {
  const usadas = [];
  const semOab = [];
  const vistas = new Set();
  for (const m of membrosAtivos()) {
    const oab = lerOab(m.oab);
    if (!oab) {
      if (['admin', 'socio', 'associado'].includes(m.papel)) semOab.push(m);
      continue;
    }
    const chave = `${oab.numero}/${oab.uf}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    usadas.push({ ...oab, chave, membro_id: m.id, nome: m.nome_curto });
  }
  return { usadas, semOab };
}

/**
 * Busca, importa e registra a consulta.
 * @returns {Promise<{ encontradas: number, novas: number, situacao: 'ok'|'parcial'|'falhou', detalhe: string }>}
 */
export async function buscarNoDiario({ de, ate, automatica = false, aoProgresso, sinal } = {}) {
  const { usadas } = oabsDosMembros();
  if (!usadas.length) throw new Error('Nenhum membro ativo tem OAB cadastrada (ex.: "OAB/PR 105.790"). Preencha em Membros.');
  // Não calcular publicação com um calendário vazio quando a leitura falha.
  const feriados = await db.todos('feriados', { select: 'id,data,nome,tribunal,ativo' });

  const porId = new Map();
  const problemas = [];
  let completas = 0;
  for (const [i, oab] of usadas.entries()) {
    if (i) await esperar(PAUSA_MS);
    try {
      const resultado = await consultarOab(DJEN_URL, oab, { de, ate }, { aoProgresso, sinal });
      // A mesma comunicação para dois advogados do escritório entra uma vez,
      // ligada ao primeiro.
      for (const item of resultado.itens) {
        if (item?.id != null && porId.has(String(item.id))) continue;
        try {
          const n = normalizarComunicacao(item, oab.membro_id);
          if (item?.id == null || !n.disponibilizada_em) throw new Error('comunicação sem identificador ou data válida');
          porId.set(String(item.id), n);
        } catch {
          problemas.push(`${oab.chave}: uma comunicação inválida precisa de nova consulta.`);
        }
      }
      if (resultado.completa) completas++;
      else problemas.push(`${oab.chave}: ${resultado.erro}`);
      if (resultado.limitada || sinal?.aborted) {
        if (i < usadas.length - 1) problemas.push('Outras OABs ficaram sem consulta.');
        break;
      }
    } catch (erro) {
      problemas.push(`${oab.chave}: ${erro.name === 'TimeoutError' ? 'sem resposta em 20 s' : erro.message}`);
      if (sinal?.aborted) break;
    }
  }

  // Publicação = primeiro dia útil depois da disponibilização, com os
  // feriados do tribunal da comunicação (Lei 11.419/2006, art. 4º, §3º).
  const anos = [Number(de.slice(0, 4)), Number(ate.slice(0, 4)), Number(ate.slice(0, 4)) + 1];
  const cache = new Map();
  const naoUteis = (tribunal) => {
    if (!cache.has(tribunal)) cache.set(tribunal, diasNaoUteis(feriados, tribunal, [...new Set(anos)]));
    return cache.get(tribunal);
  };
  const itens = [...porId.values()].filter((n) => n.disponibilizada_em).map((n) => ({
    ...n, publicada_em: dataDaPublicacao(n.disponibilizada_em, naoUteis(n.tribunal)),
  }));

  const situacao = !problemas.length ? 'ok' : completas || itens.length ? 'parcial' : 'falhou';
  const detalhe = problemas.length
    ? `${completas} de ${usadas.length} OAB(s) completas. ${problemas.join(' · ')}`
    : `${usadas.length} OAB(s) consultadas.`;
  aoProgresso?.('Gravando…');
  const r = await db.rpc('importar_intimacoes', {
    p: { itens, consulta: { de, ate, oabs: usadas.map((o) => o.chave), situacao, detalhe, automatica } },
  });
  dispatchEvent(new CustomEvent('fhl:gravou', { detail: { caminho: 'intimacoes' } }));
  return { encontradas: r.encontradas, novas: r.novas, situacao, detalhe };
}

let capturando = null;

/** A captura diária. Silenciosa: só avisa se trouxe algo ou se falhou. */
export function capturarDoDia() {
  if (!pode.prazos() || capturando) return capturando;
  capturando = (async () => {
    const dia = hoje();
    // O mesmo navegador não tenta duas vezes no mesmo dia, mesmo recarregando.
    const chave = `fhl:djen:${dia}`;
    try {
      if (localStorage.getItem(chave)) return null;
    } catch { /* sem armazenamento: segue, o banco decide */ }

    const [config, consultas, feriados] = await Promise.all([
      db.um('config_prazos', { select: '*' }),
      db.listar('intimacoes_consultas', { select: 'de,ate,situacao,criado_em', ordem: 'criado_em.desc', limite: 30 }),
      db.todos('feriados', { select: 'id,data,nome,tribunal,ativo' }),
    ]);
    if (!config?.busca_automatica) return null;
    const diaUtil = ehDiaUtil(dia, diasNaoUteis(feriados, null, [Number(dia.slice(0, 4))]));
    if (!capturaPendente(consultas, dia, diaUtil)) return null;
    if (!oabsDosMembros().usadas.length) return null;

    try {
      localStorage.setItem(chave, new Date().toISOString());
    } catch { /* idem */ }
    const ultimaCompleta = consultas.find((c) => c.situacao === 'ok');
    const periodo = periodoDaBusca(ultimaCompleta, dia, config.dias_primeira_busca);
    const r = await buscarNoDiario({ ...periodo, automatica: true });
    if (r.novas) avisar(`Diário de hoje: ${r.novas} intimação(ões) nova(s) para conferir.`, 'ok', 8000);
    else if (r.situacao !== 'ok') avisar('A busca automática no diário ficou incompleta. Veja em Intimações.', 'erro', 8000);
    return r;
  })().catch((erro) => {
    console.error('Captura diária do DJEN.', erro);
    return null;
  }).finally(() => {
    capturando = null;
  });
  return capturando;
}
