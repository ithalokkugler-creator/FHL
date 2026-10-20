-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- 35 · Google Agenda: destravar e desligar com WHERE
-- =============================================================================
--
-- Na primeira rodada em produção (20/10/2026), a sincronização trouxe e
-- enviou tudo, mas google_agenda_destravar voltou 400: o Supabase carrega o
-- safeupdate nas chamadas da Data API, e ele recusa UPDATE e DELETE sem WHERE
-- — mesmo dentro de uma função. A trava ficava presa até vencer (140 s) e a
-- tela não via a hora da última sincronização. A prévia local não tem o
-- safeupdate; por isso passou nos testes.
--
-- A tabela tem uma linha só (unica); o WHERE é só para o safeupdate.

create or replace function public.google_agenda_destravar(p_erro text default null)
returns void
language sql security definer set search_path = ''
as $$
  update privado.google_conexao
     set travado_ate = null,
         ultima_sincronizacao = case when p_erro is null then now() else ultima_sincronizacao end,
         ultimo_erro = left(p_erro, 500),
         ultimo_erro_em = case when p_erro is null then null else now() end
   where unica
$$;

create or replace function public.google_agenda_remover()
returns void
language sql security definer set search_path = ''
as $$ delete from privado.google_conexao where unica $$;
