// Exemplos e contadores exclusivos da prévia em memória.
import { hoje, somarDias } from '../../sistema/js/nucleo/formato.js';
import { tarefasParaHoje } from '../../sistema/js/dominio/avisos-do-dia.js';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

export function complementarAvisos(d) {
  d.clientes_detalhes.push({ id: id(401), cliente_id: id(201), tipo_pessoa: 'fisica', nascimento: '1984' + hoje().slice(4) });
  d.compromissos.push({ ...d.compromissos[0], id: id(605), titulo: 'Atendimento Fictício de Amanhã',
    inicio: somarDias(hoje(), 1) + 'T14:00:00-03:00', fim: somarDias(hoje(), 1) + 'T15:00:00-03:00' });
  d.compromissos.push({ ...d.compromissos[0], id: id(606), titulo: 'PARTICULAR AMANHÃ OCULTO', particular: true,
    inicio: somarDias(hoje(), 1) + 'T16:00:00-03:00', fim: somarDias(hoje(), 1) + 'T17:00:00-03:00' });
  d.publicacoes = [
    { id: id(981), titulo: 'Publicação Fictícia Antiga', slug: 'publicacao-ficticia-antiga', publicado: true, data: somarDias(hoje(), -34) },
    { id: id(982), titulo: 'Rascunho Fictício Recente', slug: 'rascunho-ficticio-recente', publicado: false, data: hoje() },
  ];
  return d;
}

export function avisosFicticios(d, m) {
  const minhas = tarefasParaHoje(d.tarefas.filter((t) => t.responsavel_id === m.id));
  return {
    minhas_atrasadas: minhas.filter((t) => t.grupo === 'atrasadas').length,
    meus_prazos_hoje: minhas.filter((t) => t.grupo === 'hoje').length,
    ...(m.papel === 'admin' || m.acesso_clientes === 'editar' ? {
      contatos_novos: d.contatos.filter((c) => c.situacao === 'novo').length,
      contatos_site_novos: d.contatos.filter((c) => c.situacao === 'novo' && c.canal === 'site').length,
    } : {}),
    ...(m.papel === 'admin' || m.acesso_prazos === 'editar' ? {
      intimacoes_pendentes: d.intimacoes.filter((i) => i.situacao === 'pendente').length,
    } : {}),
  };
}
