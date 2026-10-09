// Contadores do menu: tarefas atrasadas ou para hoje, contatos novos e
// intimações a conferir (F7). Vêm de uma função só (avisos_do_dia), que
// respeita as permissões — quem não vê Contatos não recebe esse número.

import { db } from './supabase.js';
import { estado } from './estado.js';

const ROTULOS = {
  '/tarefas': 'tarefas atrasadas ou para hoje',
  '/contatos': 'contatos novos',
  '/intimacoes': 'intimações a conferir',
  '/financeiro/alertas': 'alertas novos do Financeiro',
};

// Gravações que mudam algum contador (caminhos da Data API).
const MUDAM_CONTADORES = new Set([
  'tarefas', 'contatos', 'intimacoes',
  'rpc/criar_tarefa', 'rpc/reabrir_tarefa', 'rpc/criar_prazo_intimacao', 'rpc/lancar_audiencia_intimacao',
  'rpc/importar_intimacoes', 'rpc/marcar_alerta', 'rpc/fechar_mes', 'rpc/reabrir_mes', 'rpc/fechar_ano', 'rpc/reabrir_ano',
]);
export const mudaContadores = (caminho) => MUDAM_CONTADORES.has(caminho);

let geracao = 0;

/** Atualiza os números do menu. Falha de contador não impede abrir a tela,
 *  e uma resposta atrasada não sobrescreve a mais nova. */
export async function atualizarAvisos(raiz) {
  const esta = ++geracao;
  const membro = estado.membro?.id;
  if (!membro || raiz.dataset.tela !== 'sistema') return;

  const aplicar = (avisos) => {
    if (esta !== geracao || membro !== estado.membro?.id || raiz.dataset.tela !== 'sistema') return;
    const numeros = {
      '/tarefas': (avisos?.minhas_atrasadas ?? 0) + (avisos?.meus_prazos_hoje ?? 0),
      '/contatos': avisos?.contatos_novos ?? 0,
      '/intimacoes': avisos?.intimacoes_pendentes ?? 0,
      '/financeiro/alertas': avisos?.alertas_financeiros ?? 0,
    };
    for (const [caminho, numero] of Object.entries(numeros)) {
      const contagem = raiz.querySelector(`[data-caminho="${caminho}"] .menu__contagem`);
      if (!contagem) continue;
      contagem.hidden = !numero;
      contagem.textContent = String(numero);
      contagem.setAttribute('aria-label', `${numero} ${ROTULOS[caminho]}`);
    }
  };

  try {
    aplicar(await db.rpc('avisos_do_dia'));
  } catch (erro) {
    console.error('Não foi possível atualizar os avisos.', erro);
    aplicar(null);
  }
}
