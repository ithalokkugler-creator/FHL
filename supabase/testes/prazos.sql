-- F5/F6 manuais · 05/10/2026 · 53/53 aprovados em PostgreSQL 17 isolado.
-- Executar em ambiente isolado; toda escrita é desfeita. Não inclui cálculo/DJEN.
begin;
create function pg_temp.recusa_prazo(comando text,codigo text) returns boolean language plpgsql as $$
begin execute comando;return false;exception when others then return sqlstate=codigo;end $$;
create function pg_temp.testar_prazos_manual() returns table(teste text,ok boolean)
language plpgsql as $$
declare
 u uuid:=gen_random_uuid();us uuid:=gen_random_uuid();ua uuid:=gen_random_uuid();uo uuid:=gen_random_uuid();
 m uuid:=gen_random_uuid();s uuid:=gen_random_uuid();a uuid:=gen_random_uuid();o uuid:=gen_random_uuid();
 cl uuid;cl2 uuid;pr uuid;t uuid;tp uuid;i uuid;f uuid;comp uuid;p jsonb;total integer;
begin
 insert into auth.users(id,email,email_confirmed_at) values(u,'associado-prazo@example.test',now()),(us,'socia-prazo@example.test',now()),(ua,'admin-prazo@example.test',now()),(uo,'outro-prazo@example.test',now());
 insert into public.membros(id,user_id,nome,nome_curto,email,papel,acesso_agenda,acesso_clientes,acesso_prazos)
 values(m,u,'Associado teste','Associado','associado-prazo@example.test','associado','propria','nenhum','nenhum'),
 (s,us,'Sócia teste','Sócia','socia-prazo@example.test','socio','propria','editar','editar'),
 (a,ua,'Admin teste','Admin','admin-prazo@example.test','admin','todas','editar','editar'),
 (o,uo,'Outro teste','Outro','outro-prazo@example.test','associado','nenhum','nenhum','nenhum');
 insert into public.clientes(nome) values('Cliente prazo SQL') returning id into cl;
 insert into public.clientes(nome) values('Outro cliente prazo SQL') returning id into cl2;
 insert into public.processos(cliente_id,titulo,area,situacao) values(cl,'Caso prazo','civel','em_andamento') returning id into pr;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u)::text,true);
 perform set_config('role','authenticated',true);
 t:=public.criar_tarefa(jsonb_build_object('titulo','Tarefa comum','cliente_id',cl,'processo_id',pr,'responsavel_id',m));
 return query select 'Associado cria tarefa comum',exists(select 1 from public.tarefas where id=t and criado_por=m);
 return query select 'Associado lê tarefa e feriados',exists(select 1 from public.v_tarefas where id=t);
 p:=jsonb_build_object('tipo','prazo','titulo','Manifestação','cliente_id',cl,'processo_id',pr,'responsavel_id',m,
  'fatal_em',now()+interval '5 days','base_em',now(),'contagem','uteis','quantidade',5);
 return query select 'Associado não cria prazo',pg_temp.recusa_prazo(format('select public.criar_tarefa(%L::jsonb)',p),'P0001');
 return query select 'Compromisso direto não pode ser forjado na tarefa',pg_temp.recusa_prazo(format('update public.tarefas set compromisso_id=gen_random_uuid() where id=%L',t),'42501');
 return query select 'Conclusão não permite forjar autor ou data',pg_temp.recusa_prazo(format('update public.tarefas set concluida_por=%L where id=%L',s,t),'42501');
 return query select 'Cliente e processo devem coincidir',pg_temp.recusa_prazo(format('update public.tarefas set cliente_id=%L where id=%L',cl2,t),'P0001');
 comp:=public.criar_tarefa(jsonb_build_object('titulo','Delegação com bloqueio','responsavel_id',s,'cliente_id',cl,'bloquear',
  jsonb_build_object('inicio',now()+interval '1 day','fim',now()+interval '1 day 1 hour')));
 return query select 'Delegação bloqueia agenda do responsável em transação única',exists(select 1 from public.tarefas t join public.compromissos c on c.id=t.compromisso_id where t.id=comp and c.membro_id=s and c.tipo='bloqueio' and c.modalidade='diligencia');
 select count(*) into total from public.compromissos;
 return query select 'Bloqueio inválido não cria tarefa',pg_temp.recusa_prazo(format('select public.criar_tarefa(%L::jsonb)',jsonb_build_object('titulo','Falha','bloquear',jsonb_build_object('inicio',now(),'fim',now()))),'P0001');
 return query select 'Falha do bloqueio mantém quantidade de compromissos',(select count(*) from public.compromissos)=total;
 return query select 'Cancelar tarefa exige motivo',pg_temp.recusa_prazo(format('update public.tarefas set cancelado_em=now() where id=%L',t),'P0001');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uo)::text,true);
 update public.tarefas set titulo='Intruso' where id=t;
 return query select 'Terceiro não altera tarefa',exists(select 1 from public.tarefas where id=t and titulo='Tarefa comum');
 return query select 'Sem Agenda não cria bloqueio',pg_temp.recusa_prazo(format('select public.criar_tarefa(%L::jsonb)',jsonb_build_object('titulo','Falha Agenda','bloquear',jsonb_build_object('inicio',now(),'fim',now()+interval '1 hour'))),'P0001');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',us)::text,true);
 tp:=public.criar_tarefa(p);
 return query select 'Sócia cria prazo para associado',exists(select 1 from public.tarefas where id=tp and tipo='prazo' and responsavel_id=m and criado_por=s);
 return query select 'Entrega depois do fatal é recusada',pg_temp.recusa_prazo(format('update public.tarefas set entrega=(now()+interval ''10 days'')::date where id=%L',tp),'23514');
 insert into public.feriados(data,nome) values('2099-10-10','Feriado de teste') returning id into f;
 return query select 'Sócia cadastra feriado',exists(select 1 from public.feriados where id=f);
 return query select 'Feriado global duplicado é recusado',pg_temp.recusa_prazo('insert into public.feriados(data,nome) values(''2099-10-10'',''Duplicado'')','23505');
 insert into public.feriados(data,nome,tribunal) values('2099-10-10','Mesmo dia de outro tribunal','TJPR');
 return query select 'Tribunal específico aceita mesma data',exists(select 1 from public.feriados where data='2099-10-10' and tribunal='TJPR');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u)::text,true);
 return query select 'Associado não muda feriado',(select count(*) from public.feriados where id=f)=1;
 update public.feriados set nome='Intruso' where id=f;
 return query select 'RLS de feriados preserva nome',exists(select 1 from public.feriados where id=f and nome='Feriado de teste');
 return query select 'Responsável não muda fatal',pg_temp.recusa_prazo(format('update public.tarefas set fatal_em=fatal_em+interval ''1 day'' where id=%L',tp),'P0001');
 return query select 'Responsável não muda contagem',pg_temp.recusa_prazo(format('update public.tarefas set contagem=''horas'' where id=%L',tp),'P0001');
 return query select 'Responsável não forja memória',pg_temp.recusa_prazo(format('update public.tarefas set memoria_prazo=''{}'' where id=%L',tp),'P0001');
 update public.tarefas set situacao='concluida' where id=tp;
 return query select 'Responsável sem Prazos conclui com login e relógio',exists(select 1 from public.tarefas where id=tp and concluida_em is not null and concluida_por=m);
 return query select 'Conclusão fica na auditoria',exists(select 1 from public.auditoria where registro_id=tp and depois->>'situacao'='concluida' and membro_id=m);
 return query select 'Reabrir diretamente sem motivo é recusado',pg_temp.recusa_prazo(format('update public.tarefas set situacao=''pendente'' where id=%L',tp),'P0001');
 return query select 'RPC reabrir sem motivo é recusado',pg_temp.recusa_prazo(format('select public.reabrir_tarefa(%L,'''')',tp),'P0001');
 perform public.reabrir_tarefa(tp,'Nova providência');
 return query select 'Reabertura limpa conclusão e guarda motivo',exists(select 1 from public.tarefas where id=tp and situacao='pendente' and concluida_em is null and motivo_reabertura='Nova providência');
 update public.tarefas set situacao='concluida' where id=tp;
 return query select 'Motivo antigo não autoriza nova reabertura direta',pg_temp.recusa_prazo(format('update public.tarefas set situacao=''pendente'' where id=%L',tp),'P0001');
 perform public.reabrir_tarefa(tp,'Nova providência');
 return query select 'Novo pedido pelo RPC aceita motivo repetido sem deixar sinal',exists(select 1 from public.tarefas where id=tp and situacao='pendente') and coalesce(current_setting('fhl.reabrir_tarefa',true),'')<>'reabrir';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',us)::text,true);
 insert into public.intimacoes(fonte,disponibilizada_em,publicada_em,texto,cliente_id,processo_id,membro_id)
 values('manual',privado.hoje(),privado.hoje(),'Teor fictício',cl,pr,s) returning id into i;
 return query select 'Intimação manual começa pendente',exists(select 1 from public.intimacoes where id=i and situacao='pendente' and conferida_em is null);
 return query select 'Teor salvo é imutável',pg_temp.recusa_prazo(format('update public.intimacoes set texto=''Alterado'' where id=%L',i),'42501');
 return query select 'Não forja conferência por coluna',pg_temp.recusa_prazo(format('update public.intimacoes set conferida_por=%L where id=%L',m,i),'42501');
 return query select 'DJEN não entra por INSERT direto',pg_temp.recusa_prazo('insert into public.intimacoes(fonte,disponibilizada_em,texto) values(''djen'',current_date,''Forjado'')','42501');
 return query select 'Consulta ao diário não pode ser inventada',pg_temp.recusa_prazo('insert into public.intimacoes_consultas(de,ate,oabs,situacao) values(current_date,current_date,array[''PR 1''],''ok'')','42501');
 select count(*) into total from public.tarefas;
 return query select 'Falha no prazo não confere intimação',pg_temp.recusa_prazo(format('select public.criar_prazo_intimacao(%L,%L::jsonb)',i,p||jsonb_build_object('quantidade',0)),'23514') and exists(select 1 from public.intimacoes where id=i and situacao='pendente') and (select count(*) from public.tarefas)=total;
 return query select 'Prazo exige tipo explícito',pg_temp.recusa_prazo(format('select public.criar_prazo_intimacao(%L,%L::jsonb)',i,p-'tipo'),'P0001');
 t:=public.criar_prazo_intimacao(i,p);
 return query select 'Prazo guarda intimação de origem',exists(select 1 from public.tarefas where id=t and intimacao_id=i);
 return query select 'Prazo confere intimação atomicamente',exists(select 1 from public.intimacoes where id=i and situacao='conferida' and conferida_por=s and conferida_em is not null);
 return query select 'Audiência em agenda alheia é recusada',pg_temp.recusa_prazo(format('select public.lancar_audiencia_intimacao(%L,%L::jsonb)',i,jsonb_build_object('tipo','audiencia','membro_id',m,'cliente_id',cl,'modalidade','presencial','inicio',now(),'fim',now()+interval '1 hour')),'42501');
 comp:=public.lancar_audiencia_intimacao(i,jsonb_build_object('tipo','audiencia','membro_id',s,'cliente_id',cl,'modalidade','presencial','inicio',now(),'fim',now()+interval '1 hour'));
 return query select 'Audiência e vínculo gravados juntos',exists(select 1 from public.intimacoes where id=i and compromisso_id=comp and situacao='conferida') and exists(select 1 from public.compromissos where id=comp and tipo='audiencia');
 return query select 'Audiência duplicada é recusada',pg_temp.recusa_prazo(format('select public.lancar_audiencia_intimacao(%L,%L::jsonb)',i,jsonb_build_object('tipo','audiencia')),'P0001');
 update public.intimacoes set situacao='arquivada',observacoes='Não é do escritório' where id=i;
 return query select 'Arquivar preserva teor e autor da conferência',exists(select 1 from public.intimacoes where id=i and texto='Teor fictício' and conferida_por=s);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u)::text,true);
 return query select 'Sem Prazos não lê intimações, consultas nem auditoria',not exists(select 1 from public.intimacoes where id=i) and not exists(select 1 from public.intimacoes_consultas) and not exists(select 1 from public.auditoria where registro_id=i);
 return query select 'Sem Prazos não gera prazo de intimação',pg_temp.recusa_prazo(format('select public.criar_prazo_intimacao(%L,%L::jsonb)',i,p),'42501');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ua)::text,true);
 update public.tarefas set fatal_em=now()-interval '1 hour',base_em=now()-interval '5 days',entrega=null where id=t;
 return query select 'View marca fatal vencido',exists(select 1 from public.v_tarefas where id=t and alerta='vencida');
 update public.tarefas set fatal_em=(privado.hoje()::text||' 23:59:00 America/Sao_Paulo')::timestamptz where id=t;
 return query select 'View marca fatal hoje',exists(select 1 from public.v_tarefas where id=t and alerta='fatal_hoje');
 update public.tarefas set fatal_em=now()+interval '5 days',entrega=privado.hoje()-1 where id=t;
 return query select 'View marca entrega atrasada',exists(select 1 from public.v_tarefas where id=t and alerta='atrasada');
 update public.tarefas set entrega=privado.hoje()+1 where id=t;
 return query select 'View marca em dia',exists(select 1 from public.v_tarefas where id=t and alerta='em_dia');
 perform set_config('role','none',true);update public.membros set ativo=false where id=m;perform set_config('role','authenticated',true);
 update public.tarefas set cancelado_em=now(),motivo_cancelamento='Cancelado pelo admin' where id=t;
 return query select 'Admin cancela tarefa de responsável inativo',exists(select 1 from public.tarefas where id=t and cancelado_por=a and cancelado_em is not null);
 return query select 'Cancelada não pode mudar',pg_temp.recusa_prazo(format('update public.tarefas set titulo=''Alterado'' where id=%L',t),'P0001');
 return query select 'Tarefa não pode ser apagada',pg_temp.recusa_prazo(format('delete from public.tarefas where id=%L',t),'42501');
 perform set_config('role','anon',true);
 return query select 'Anônimo não lê tabelas ou view',pg_temp.recusa_prazo('select * from public.v_tarefas','42501') and pg_temp.recusa_prazo('select * from public.intimacoes','42501') and pg_temp.recusa_prazo('select * from public.feriados','42501');
 return query select 'Anônimo não chama funções',pg_temp.recusa_prazo('select public.criar_tarefa(''{}'')','42501') and pg_temp.recusa_prazo(format('select public.reabrir_tarefa(%L,''Motivo'')',t),'42501');
 perform set_config('role','none',true);
end $$;
select * from pg_temp.testar_prazos_manual();
rollback;
