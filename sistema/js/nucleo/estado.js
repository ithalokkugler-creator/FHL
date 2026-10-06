// Quem entrou e o que pode fazer.
// ================================
//
// As funções `pode` só decidem o que APARECE — menu, botões. Quem decide o
// que se pode ler e gravar é o banco (políticas em supabase/migrations/). Um
// botão escondido a mais é incômodo; uma política errada seria vazamento.

import { db } from './supabase.js';

export const estado = {
  membro: null, // o retorno de iniciar_sessao()
  membros: [],
  porId: new Map(),
};

export const pode = {
  agenda: () => (estado.membro?.acesso_agenda ?? 'nenhum') !== 'nenhum',
  agendaDeTodos: () => estado.membro?.acesso_agenda === 'todas',
  financeiro: () => ['lancamentos', 'completo'].includes(estado.membro?.acesso_financeiro),
  fechamento: () => estado.membro?.acesso_financeiro === 'completo',
  site: () => estado.membro?.acesso_site === 'editar',
  clientes: () => estado.membro?.acesso_clientes === 'editar',
  prazos: () => estado.membro?.acesso_prazos === 'editar',
  administrar: () => estado.membro?.papel === 'admin',
};

export async function carregarMembros() {
  estado.membros = await db.listar('membros', {
    select: 'id,nome,nome_curto,papel,oab,cor,email,user_id,acesso_agenda,acesso_financeiro,acesso_site,acesso_clientes,acesso_prazos,ativo',
    ordem: 'nome_curto.asc',
  });
  estado.porId = new Map(estado.membros.map((m) => [m.id, m]));
}

export const membro = (id) => estado.porId.get(id) ?? null;
export const nomeDe = (id) => membro(id)?.nome_curto ?? '—';
export const corDe = (id) => membro(id)?.cor ?? '#465953';
export const membrosAtivos = () => estado.membros.filter((m) => m.ativo);

export const PAPEIS = {
  admin: 'Administrador',
  socio: 'Sócio',
  secretaria: 'Secretária',
  associado: 'Advogado associado',
};

export const NIVEIS_AGENDA = {
  nenhum: 'Sem acesso',
  propria: 'Vê a de todos, edita a própria',
  todas: 'Vê e edita todas',
};

export const NIVEIS_FINANCEIRO = {
  nenhum: 'Sem acesso',
  lancamentos: 'Lança, sem ver fechamento e divisão',
  completo: 'Completo',
};

export const NIVEIS_SITE = {
  nenhum: 'Sem acesso',
  editar: 'Escreve e publica no site',
};

export const NIVEIS_CLIENTES = {
  nenhum: 'Sem acesso',
  editar: 'Clientes, contatos, atualizações e documentos',
};

export const NIVEIS_PRAZOS = {
  nenhum: 'Sem acesso',
  editar: 'Intimações, feriados e prazos processuais',
};

const LIGACOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/** "Vinícius Rangel de Lima de Paula Lisboa" → "VL". */
export function iniciais(nome) {
  const partes = String(nome ?? '').split(/\s+/).filter((p) => p && !LIGACOES.has(p.toLowerCase()));
  if (!partes.length) return '?';
  const ultima = partes.length > 1 ? partes.at(-1)[0] : '';
  return (partes[0][0] + ultima).toUpperCase();
}
