-- F7 · execute em PostgreSQL isolado. Todas as escritas são desfeitas.
begin;
create function pg_temp.testar_avisos() returns table(teste text, ok boolean)
language plpgsql as $$
declare
 u uuid:=gen_random_uuid(); us uuid:=gen_random_uuid(); ua uuid:=gen_random_uuid(); ux uuid:=gen_random_uuid();
 m uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); a uuid:=gen_random_uuid();
 v jsonb; t uuid; contato uuid; intimacao uuid; site bigint; total bigint;
begin
 insert into auth.users(id,email,email_confirmed_at) values
   (u,'avisos-associado@example.test',now()),(us,'avisos-secretaria@example.test',now()),
   (ua,'avisos-admin@example.test',now()),(ux,'avisos-sem-membro@example.test',now());
 insert into public.membros(id,user_id,nome,nome_curto,email,papel,acesso_clientes,acesso_prazos)
 values (m,u,'Associado avisos','Associado','avisos-associado@example.test','associado','nenhum','nenhum'),
   (s,us,'Secretária avisos','Secretária','avisos-secretaria@example.test','secretaria','editar','nenhum'),
   (a,ua,'Admin avisos','Admin','avisos-admin@example.test','admin','nenhum','nenhum');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ua)::text,true);
 insert into public.tarefas(titulo,responsavel_id,entrega) values ('Atrasada',m,privado.hoje()-1),('Hoje',m,privado.hoje()),('Outra pessoa',a,privado.hoje()),('Futura',m,privado.hoje()+7),('Sem data',m,null);
 insert into public.tarefas(tipo,titulo,responsavel_id,entrega,fatal_em,contagem,base_em,quantidade)
 values ('prazo','Entrega e fatal hoje',m,privado.hoje(),now(),'horas',now()-interval '1 hour',1),
   ('prazo','Entrega ontem e fatal hoje',m,privado.hoje()-1,now(),'horas',now()-interval '1 hour',1),
   ('prazo','Fatal vencido sem entrega',m,null,now()-interval '1 hour','horas',now()-interval '2 hours',1);
 insert into public.tarefas(titulo,responsavel_id,entrega,situacao) values('Concluída',m,privado.hoje()-1,'concluida');
 insert into public.tarefas(titulo,responsavel_id,entrega,cancelado_em,motivo_cancelamento) values('Cancelada',m,privado.hoje()-1,now(),'Teste');
 insert into public.contatos(canal,nome,email,situacao,consentimento_em,mensagem)
 values ('site','Contato novo F7','f7@example.test','novo',now(),'Teste de avisos') returning id into contato;
 insert into public.contatos(canal,nome,email,situacao) values('telefone','Contato manual F7','manual@example.test','novo');
 insert into public.contatos(canal,nome,email,situacao) values('telefone','Contato atendido F7','atendido@example.test','contatado');
 insert into public.intimacoes(disponibilizada_em,texto) values(privado.hoje(),'Intimação manual F7') returning id into intimacao;
 select count(*) into total from public.contatos where situacao='novo';
 select count(*) into site from public.contatos where situacao='novo' and canal='site';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u)::text,true);
 perform set_config('role','authenticated',true);
 v:=public.avisos_do_dia();
 return query select 'Conta só minhas atrasadas e fatal vencido sem entrega', (v->>'minhas_atrasadas')::integer=3;
 return query select 'Entrega e fatal hoje contam uma vez, sem repetir atrasada', (v->>'meus_prazos_hoje')::integer=2;
 return query select 'Sem Clientes omite contadores de contatos', not (v ? 'contatos_novos') and not (v ? 'contatos_site_novos');
 return query select 'Sem Prazos omite intimações', not (v ? 'intimacoes_pendentes');
 update public.tarefas set situacao='concluida' where titulo='Hoje' and responsavel_id=m;
 return query select 'Conclusão atualiza contador', (public.avisos_do_dia()->>'meus_prazos_hoje')::integer=1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',us)::text,true);
 v:=public.avisos_do_dia();
 return query select 'Secretária sem tarefa retorna zero', (v->>'minhas_atrasadas')::integer=0 and (v->>'meus_prazos_hoje')::integer=0;
 return query select 'Secretária com Clientes conta contatos de todos os canais', (v->>'contatos_novos')::bigint=total;
 return query select 'Painel do site conta somente novos do site', (v->>'contatos_site_novos')::bigint=site;
 return query select 'Secretária sem Prazos continua sem intimações', not (v ? 'intimacoes_pendentes');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ua)::text,true);
 v:=public.avisos_do_dia();
 return query select 'Administrador recebe contadores apesar dos campos nenhum', v ? 'contatos_novos' and v ? 'intimacoes_pendentes';
 return query select 'Administrador não conta tarefas alheias', (v->>'meus_prazos_hoje')::integer=1 and (v->>'minhas_atrasadas')::integer=0;
 return query select 'Intimações pendentes são contadas', (v->>'intimacoes_pendentes')::bigint=(select count(*) from public.intimacoes where situacao='pendente');
 update public.intimacoes set situacao='conferida' where id=intimacao;
 return query select 'Conferência retira uma intimação do contador', (public.avisos_do_dia()->>'intimacoes_pendentes')::bigint=(v->>'intimacoes_pendentes')::bigint-1;
 update public.contatos set situacao='contatado' where id=contato;
 return query select 'Responder retira contato do total e do site', (public.avisos_do_dia()->>'contatos_novos')::bigint=total-1 and (public.avisos_do_dia()->>'contatos_site_novos')::bigint=site-1;
 update public.membros set acesso_clientes='nenhum' where id=s;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',us)::text,true);
 return query select 'Revogação de Clientes omite contadores imediatamente', not (public.avisos_do_dia() ? 'contatos_novos');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ux)::text,true);
 return query select 'Usuário sem membro recebe null', public.avisos_do_dia() is null;
 perform set_config('request.jwt.claims','{}',true);
 return query select 'Sem usuário recebe null', public.avisos_do_dia() is null;
 perform set_config('role','none',true);
 update public.membros set ativo=false where id=m;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u)::text,true);
 perform set_config('role','authenticated',true);
 return query select 'Membro inativo recebe null', public.avisos_do_dia() is null;
 return query select 'Anon não pode executar RPC', not has_function_privilege('anon','public.avisos_do_dia()','execute');
 return query select 'Authenticated tem execute', has_function_privilege('authenticated','public.avisos_do_dia()','execute');
 return query select 'RPC preserva RLS como invocador', not (select prosecdef from pg_proc where oid='public.avisos_do_dia()'::regprocedure);
end $$;
select * from pg_temp.testar_avisos();
rollback;
