-- 23/10: regressões de texto, concorrência e autorização. Só banco local.
begin;
create function pg_temp.recusa_sistema(comando text, codigo text) returns boolean language plpgsql as $$
begin execute comando; return false; exception when others then
  if sqlstate = codigo then return true; end if; raise;
end $$;
create function pg_temp.testar_ajustes_sistema() returns table(teste text, ok boolean) language plpgsql as $$
declare u uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid(); us uuid:=gen_random_uuid();
  m uuid; m2 uuid; c uuid; a uuid; j jsonb; versao timestamptz;
begin
  insert into auth.users(id,email) values(u,'sistema23@example.test'),(u2,'sistema23-outro@example.test'),(us,'sistema23-sem@example.test');
  insert into public.membros(user_id,nome,nome_curto,email,papel,acesso_clientes)
    values(u,'Autor fictício','Autor23','sistema23@example.test','associado','editar') returning id into m;
  insert into public.membros(user_id,nome,nome_curto,email,papel,acesso_clientes)
    values(u2,'Outro fictício','Outro23','sistema23-outro@example.test','associado','editar') returning id into m2;
  insert into public.membros(user_id,nome,nome_curto,email,papel,acesso_clientes)
    values(us,'Sem clientes fictício','Sem23','sistema23-sem@example.test','associado','nenhum');
  insert into public.clientes(nome) values('Cliente fictício sistema 23') returning id into c;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u)::text,true);
  perform set_config('role','authenticated',true);
  a:=public.iniciar_cronometro(jsonb_build_object('cliente_id',c,'relato','Relato original'));
  perform public.parar_cronometro(a);
  return query select 'CS01 parada antiga sem texto preserva relato',exists(select 1 from public.atualizacoes where id=a and relato='Relato original');
  a:=public.iniciar_cronometro(jsonb_build_object('cliente_id',c,'relato','Texto a limpar'));
  update public.atualizacoes set proxima_providencia='Providência a limpar' where id=a;
  perform public.parar_cronometro(a,'','');
  return query select 'CS02 vazio explícito na RPC antiga limpa os dois textos',exists(select 1 from public.atualizacoes where id=a and relato is null and proxima_providencia is null and fim is not null);
  a:=public.iniciar_cronometro(jsonb_build_object('cliente_id',c,'relato','Antes'));
  select alterado_em into versao from public.atualizacoes where id=a;
  j:=public.salvar_anotacoes_cronometro(a,versao,'{"relato":"Depois"}');
  return query select 'CS03 nova RPC salva apenas os campos enviados',j->>'relato'='Depois' and j->>'proxima_providencia' is null;
  return query select 'CS04 versão antiga recusa e preserva texto mais novo',pg_temp.recusa_sistema(format('select public.salvar_anotacoes_cronometro(%L,%L,%L)',a,versao,'{"proxima_providencia":"Rascunho antigo"}'),'40001')
    and exists(select 1 from public.atualizacoes where id=a and relato='Depois' and proxima_providencia is null);
  return query select 'CS05 parada com versão antiga não para nem apaga relato',pg_temp.recusa_sistema(format('select public.parar_cronometro_seguro(%L,%L,%L)',a,versao,'{"relato":"Perderia depois"}'),'40001')
    and exists(select 1 from public.atualizacoes where id=a and fim is null and relato='Depois');
  versao:=(j->>'alterado_em')::timestamptz;
  j:=public.salvar_anotacoes_cronometro(a,versao,'{"proxima_providencia":"Conferir documentos"}');
  return query select 'CS06 providência não altera relato omitido',j->>'relato'='Depois' and j->>'proxima_providencia'='Conferir documentos';
  versao:=(j->>'alterado_em')::timestamptz;
  return query select 'CS07 não aceita campos de identidade no JSON',pg_temp.recusa_sistema(format('select public.salvar_anotacoes_cronometro(%L,%L,%L)',a,versao,'{"membro_id":"forjado"}'),'22023');
  return query select 'CS08 não aceita relato objeto',pg_temp.recusa_sistema(format('select public.salvar_anotacoes_cronometro(%L,%L,%L)',a,versao,'{"relato":{}}'),'22023');
  return query select 'CS09 não aceita texto acima do tamanho da tela',pg_temp.recusa_sistema(format('select public.salvar_anotacoes_cronometro(%L,%L,%L)',a,versao,jsonb_build_object('relato',repeat('x',30001))),'22023');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u2)::text,true);
  return query select 'CS10 RLS impede outro autor de salvar anotações',pg_temp.recusa_sistema(format('select public.salvar_anotacoes_cronometro(%L,%L,%L)',a,versao,'{}'),'P0001');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',us)::text,true);
  return query select 'CS11 sem Clientes não salva nem para',pg_temp.recusa_sistema(format('select public.salvar_anotacoes_cronometro(%L,%L,%L)',a,versao,'{}'),'42501')
    and pg_temp.recusa_sistema(format('select public.parar_cronometro_seguro(%L,%L,%L)',a,versao,'{}'),'42501');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u)::text,true);
  perform public.parar_cronometro_seguro(a,versao,'{"relato":""}');
  return query select 'CS12 parada segura limpa campo escolhido e preserva o omitido',exists(select 1 from public.atualizacoes where id=a and fim is not null and relato is null and proxima_providencia='Conferir documentos');
  return query select 'CS13 não reescreve atividade já parada',pg_temp.recusa_sistema(format('select public.salvar_anotacoes_cronometro(%L,%L,%L)',a,versao,'{"relato":"Antigo"}'),'P0001');
  return query select 'CS14 membro não consulta identidades privadas Google',pg_temp.recusa_sistema('select public.google_agenda_possiveis_transferencias(''x'',''[]'')','42501');
  perform set_config('role','anon',true);
  return query select 'CS15 anônimo não executa novas RPCs',pg_temp.recusa_sistema(format('select public.salvar_anotacoes_cronometro(%L,null,''{}'')',a),'42501')
    and pg_temp.recusa_sistema(format('select public.parar_cronometro_seguro(%L,null,''{}'')',a),'42501');
  perform set_config('role','none',true);
end $$;
select * from pg_temp.testar_ajustes_sistema();
rollback;
