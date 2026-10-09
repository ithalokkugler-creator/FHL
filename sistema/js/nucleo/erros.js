// Erros técnicos da tela, para quem cuida do sistema (preparação T16).
// ===================================================================
//
// Exceção não tratada vira um registro curto: rota (sem o que vem depois do
// "?"), código, mensagem de até 300 caracteres, versão, navegador e um id de
// correlação. Nunca o conteúdo do formulário, o token ou o estado da tela; o
// banco ainda apaga e-mails e números longos antes de gravar
// (registrar_erro_cliente). O administrador e a auditoria leem em Operação.

import { db, sessaoAtual } from './supabase.js';

export const VERSAO_SISTEMA = '2026-10-08';

let recentes = [];

function registrar(erro) {
  if (!sessaoAtual()) return;
  const agora = Date.now();
  recentes = recentes.filter((t) => t > agora - 60_000);
  // Um laço de erro não vira uma enxurrada de registros.
  if (recentes.length >= 5) return;
  recentes.push(agora);

  const mensagem = String(erro?.message ?? erro ?? '').slice(0, 300);
  if (!mensagem) return;
  db.rpc('registrar_erro_cliente', {
    p: {
      rota: location.hash.replace(/^#/, '').split('?')[0].slice(0, 120),
      codigo: String(erro?.codigo || erro?.name || 'Erro').slice(0, 40),
      mensagem,
      versao: VERSAO_SISTEMA,
      correlacao: Math.random().toString(36).slice(2, 12),
      navegador: navigator.userAgent.slice(0, 120),
    },
  }).catch(() => {});
}

export function ligarRegistroDeErros() {
  addEventListener('error', (e) => registrar(e.error ?? e.message));
  addEventListener('unhandledrejection', (e) => registrar(e.reason));
}
