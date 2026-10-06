-- F7 · contadores da pessoa conectada; preserva as políticas RLS das tabelas.
create function public.avisos_do_dia()
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
 v_eu uuid := privado.meu_membro_id();
 v jsonb;
begin
 if v_eu is null then return null; end if;
 with classificadas as (
   select coalesce(t.entrega < privado.hoje(), false) or coalesce(t.fatal_em < now(), false) as atrasada,
     coalesce(t.entrega = privado.hoje(), false) or coalesce((t.fatal_em at time zone 'America/Sao_Paulo')::date = privado.hoje(), false) as hoje
   from public.tarefas t where t.responsavel_id = v_eu and t.situacao <> 'concluida' and t.cancelado_em is null
 ) select jsonb_build_object('minhas_atrasadas', count(*) filter (where atrasada),
     'meus_prazos_hoje', count(*) filter (where hoje and not atrasada)) into v from classificadas;
 if privado.edita_clientes() then
   v := v || jsonb_build_object('contatos_novos', (select count(*) from public.contatos where situacao = 'novo'),
     'contatos_site_novos', (select count(*) from public.contatos where situacao = 'novo' and canal = 'site'));
 end if;
 if privado.gerencia_prazos() then
   v := v || jsonb_build_object('intimacoes_pendentes', (select count(*) from public.intimacoes where situacao = 'pendente'));
 end if;
 return v;
end;
$$;
revoke all on function public.avisos_do_dia() from public, anon;
grant execute on function public.avisos_do_dia() to authenticated, service_role;
comment on function public.avisos_do_dia() is 'Contadores pessoais e dos módulos autorizados. Cada tarefa conta uma vez; não envia mensagens.';
