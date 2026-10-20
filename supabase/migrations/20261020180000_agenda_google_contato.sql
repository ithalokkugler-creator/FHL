-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- 33 · Google Agenda do escritório: a subagenda de cada membro
-- =============================================================================
--
-- O escritório mantém uma agenda única no Google, na conta
-- contato@advocaciafl.com.br (Google Workspace), com uma subagenda por
-- advogado. Cada página de agendamento de horário ("Atendimento com …") só
-- considera ocupado o que está na subagenda do próprio advogado.
--
-- "Pôr no Google Agenda" passa a abrir o Google nessa conta e já na
-- subagenda do responsável pelo compromisso. Esta coluna guarda o ID dessa
-- subagenda (Google Agenda → Configurações da agenda → Integrar agenda →
-- ID da agenda). Em branco, o evento vai para a agenda principal do
-- escritório, que nenhuma página de agendamento consulta.
--
-- Os IDs ficam só no banco, preenchidos em Membros → Editar.

alter table public.membros add column google_agenda text
  constraint membros_google_agenda_check
  check (length(google_agenda) <= 200 and google_agenda ~ '^[^[:space:]@]+@[^[:space:]@]+$');

comment on column public.membros.google_agenda is
  'ID da subagenda do membro na conta Google do escritório (contato@advocaciafl.com.br). Nulo: agenda principal.';

-- Quem altera membros (só o administrador, pela política "membros: alterar")
-- pode preencher a coluna; todos os membros já leem a tabela.
grant insert (google_agenda), update (google_agenda) on public.membros to authenticated;
