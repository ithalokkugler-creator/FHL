-- Catálogo, permissões e versões. Usar somente no banco de testes.
begin;
create function pg_temp.recusa_modelo(p text, codigo text) returns boolean language plpgsql as $$
begin
  execute p;
  return false;
exception when others then
  if sqlstate = codigo then return true; end if;
  raise;
end $$;

create function pg_temp.testar_modelos() returns table(teste text,ok boolean) language plpgsql as $$
declare
  u_admin uuid := gen_random_uuid(); u_editor uuid := gen_random_uuid(); u_leitor uuid := gen_random_uuid();
  u_sem uuid := gen_random_uuid(); cliente uuid; outro uuid; caso uuid; legado uuid;
  membro_admin uuid; particular uuid; comparecimento uuid := gen_random_uuid();
  v_compar uuid; doc_particular uuid := gen_random_uuid();
  modelo uuid := gen_random_uuid(); v1 uuid; v2 uuid; doc uuid := gen_random_uuid(); copia uuid := gen_random_uuid();
  p jsonb; ep jsonb; res jsonb;
  def jsonb := '{"formato":1,"corpo":[{"tipo":"elemento","tag":"p","itens":[{"tipo":"campo","chave":"cliente.nome"}]}],"perguntas":[],"assinaturas":[]}';
begin
  insert into auth.users(id,email,email_confirmed_at,aud,role) values
    (u_admin,'modelos-admin@example.test',now(),'authenticated','authenticated'),
    (u_editor,'modelos-editor@example.test',now(),'authenticated','authenticated'),
    (u_leitor,'modelos-leitor@example.test',now(),'authenticated','authenticated'),
    (u_sem,'modelos-sem@example.test',now(),'authenticated','authenticated');
  insert into public.membros(user_id,nome,nome_curto,papel,acesso_clientes,acesso_agenda,edita_modelos_documento) values
    (u_admin,'Admin Modelos','Admin','admin','editar','todas',false),
    (u_editor,'Editor Modelos','Editor','socio','editar','propria',true),
    (u_leitor,'Leitor Modelos','Leitor','associado','editar','propria',false),
    (u_sem,'Sem Modelos','Sem modelos','associado','nenhum','nenhum',true);
  insert into public.clientes(nome) values ('Cliente A de testes') returning id into cliente;
  insert into public.clientes(nome) values ('Cliente B de testes') returning id into outro;
  insert into public.processos(cliente_id,titulo,area) values(outro,'Processo B','civel') returning id into caso;
  insert into public.documentos(modelo,titulo,cliente_id,conteudo)
    values ('declaracao_comparecimento','Declaração antiga',cliente,'<p>Original legado</p>') returning id into legado;
  select id into membro_admin from public.membros where user_id=u_admin;
  insert into public.compromissos(cliente_id,membro_id,tipo,modalidade,inicio,fim,particular,situacao)
    values (cliente,membro_admin,'atendimento','presencial',now()-interval '1 hour',now(),true,'realizado') returning id into particular;
  -- A carga da migração 48 já ocupa a chave; o teste usa um modelo próprio.
  update public.modelos_documento set chave_oficial = null where chave_oficial = 'declaracao_comparecimento';
  insert into public.modelos_documento(id,chave_oficial,tipo) values(comparecimento,'declaracao_comparecimento','declaracao_comparecimento');
  insert into public.modelos_documento_versoes(modelo_id,numero,nome,titulo,categoria,definicao,publicado_em)
    values(comparecimento,1,'Comparecimento','Declaração','Declaração',def,now()) returning id into v_compar;
  update public.modelos_documento set versao_atual_id=v_compar where id=comparecimento;
  p := jsonb_build_object('id',modelo,'nome','Modelo de teste','titulo','Declaração','categoria','Declaração','definicao',def);

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u_sem)::text,true);
  return query select 'Capacidade sem Clientes não pode criar', pg_temp.recusa_modelo(format('select public.modelo_documento_acao(''criar'',%L::jsonb)',p),'42501');

  perform set_config('request.jwt.claims',jsonb_build_object('sub',u_editor)::text,true);
  res := public.modelo_documento_acao('criar',p); v1 := (res->>'versao_id')::uuid;
  return query select 'Editor cria rascunho e reenvio devolve o mesmo id', v1=(public.modelo_documento_acao('criar',p)->>'versao_id')::uuid;
  return query select 'Editor não publica', pg_temp.recusa_modelo(format('select public.modelo_documento_acao(''publicar'',%L::jsonb)',
    jsonb_build_object('id',modelo,'versao_id',v1,'revisao',1)),'42501');
  res := public.modelo_documento_acao('salvar',p||jsonb_build_object('versao_id',v1,'revisao',1));
  return query select 'Salvar registra revisão de concorrência', res->>'revisao'='2';
  return query select 'Revisão inicial não sobrescreve edição mais nova', pg_temp.recusa_modelo(format('select public.modelo_documento_acao(''salvar'',%L::jsonb)',
    p||jsonb_build_object('versao_id',v1,'revisao',1)),'40001');
  return query select 'Recusa árvore com elemento executável', pg_temp.recusa_modelo(format('select public.modelo_documento_acao(''salvar'',%L::jsonb)',
    p||jsonb_build_object('versao_id',v1,'revisao',2,'definicao',jsonb_set(def,'{corpo,0,tag}','"script"'))),'22023');

  perform set_config('request.jwt.claims',jsonb_build_object('sub',u_leitor)::text,true);
  return query select 'Leitor não vê rascunho nem cria', not exists(select 1 from public.modelos_documento where id=modelo)
    and not exists(select 1 from public.modelos_documento_versoes where id=v1)
    and pg_temp.recusa_modelo(format('select public.modelo_documento_acao(''criar'',%L::jsonb)',p),'42501');

  perform set_config('request.jwt.claims',jsonb_build_object('sub',u_admin)::text,true);
  return query select 'Rascunho oficial exige campo da própria família',
    pg_temp.recusa_modelo(format('select public.modelo_documento_acao(''salvar'',%L::jsonb)',
      p||jsonb_build_object('id',comparecimento,'base_id',v_compar,
        'definicao',jsonb_set(def,'{corpo,0,itens,0,chave}','"oficial.inexistente"'))),'22023')
    and pg_temp.recusa_modelo(format('select public.modelo_documento_acao(''salvar'',%L::jsonb)',
      p||jsonb_build_object('id',comparecimento,'base_id',v_compar,
        'definicao',jsonb_set(def,'{corpo,0,itens,0,chave}','"oficial.contrato_pagamento"'))),'22023');
  res := public.modelo_documento_acao('salvar', p||jsonb_build_object('id',comparecimento,'base_id',v_compar,
    'definicao',jsonb_set(def,'{corpo,0,itens,0,chave}','"oficial.comparecimento"')));
  return query select 'Rascunho aceita campo oficial válido da família', res->>'versao_id' is not null;
  -- Simula rascunho antigo ou importado fora da RPC de autoria.
  perform set_config('role','none',true);
  update public.modelos_documento_versoes set definicao = jsonb_set(def,'{corpo,0,itens,0,chave}','"oficial.inexistente"')
    where id = (res->>'versao_id')::uuid;
  perform set_config('role','authenticated',true);
  return query select 'Publicação revalida rascunho oficial importado com campo inválido',
    pg_temp.recusa_modelo(format('select public.modelo_documento_acao(''publicar'',%L::jsonb)',
      jsonb_build_object('id',comparecimento,'versao_id',res->>'versao_id','revisao',1)),'22023');
  perform public.modelo_documento_acao('publicar',jsonb_build_object('id',modelo,'versao_id',v1,'revisao',2));
  return query select 'Publicação é idempotente e versão imutável',
    (public.modelo_documento_acao('publicar',jsonb_build_object('id',modelo,'versao_id',v1,'revisao',2))->>'versao_id')::uuid=v1
    and pg_temp.recusa_modelo(format('update public.modelos_documento_versoes set titulo=''Falso'' where id=%L',v1),'42501');
  ep := jsonb_build_object('id',doc,'modelo_catalogo_id',modelo,'modelo_versao_id',v1,'cliente_id',cliente,'acao','salvar','conteudo','<p>Texto emitido 1</p>');

  perform set_config('request.jwt.claims',jsonb_build_object('sub',u_leitor)::text,true);
  return query select 'Leitor passa a ver a edição vigente', exists(select 1 from public.modelos_documento_versoes where id=v1 and publicado_em is not null);
  return query select 'Emissão recusa processo de outro cliente', pg_temp.recusa_modelo(format('select public.emitir_documento_modelo(%L::jsonb)',
    ep||jsonb_build_object('processo_id',caso)),'P0001');
  perform public.emitir_documento_modelo(ep);
  return query select 'Emissão salva texto, versão e evita duplicata em reenvio', (public.emitir_documento_modelo(ep)->>'id')::uuid=doc
    and exists(select 1 from public.documentos where id=doc and modelo_versao_id=v1 and conteudo='<p>Texto emitido 1</p>');

  perform set_config('request.jwt.claims',jsonb_build_object('sub',u_admin)::text,true);
  res := public.modelo_documento_acao('salvar',p||jsonb_build_object('base_id',v1,'nome','Modelo revisado')); v2 := (res->>'versao_id')::uuid;
  perform public.modelo_documento_acao('publicar',jsonb_build_object('id',modelo,'versao_id',v2,'revisao',1));
  return query select 'A próxima versão não altera documento emitido', exists(select 1 from public.documentos where id=doc and modelo_versao_id=v1 and titulo='Modelo de teste');
  return query select 'Versão antiga não gera novo documento', pg_temp.recusa_modelo(format('select public.emitir_documento_modelo(%L::jsonb)',
    ep||jsonb_build_object('id',gen_random_uuid())),'40001');
  perform public.modelo_documento_acao('arquivar',jsonb_build_object('id',modelo,'motivo','Teste de arquivamento'));
  perform public.emitir_documento_modelo(jsonb_build_object('id',copia,'origem_id',doc,'acao','word'));
  return query select 'Reimpressão usa origem e funciona após arquivamento',
    exists(select 1 from public.documentos where id=copia and modelo_versao_id=v1 and dados->>'origem_documento'=doc::text and conteudo='<p>Texto emitido 1</p>');
  perform public.modelo_documento_acao('reativar',jsonb_build_object('id',modelo));
  res := public.modelo_documento_acao('restaurar',jsonb_build_object('id',modelo,'origem_id',v1));
  return query select 'Restaurar copia a versão antiga sem trocar a publicada',
    exists(select 1 from public.modelos_documento where id=modelo and versao_atual_id=v2)
    and exists(select 1 from public.modelos_documento_versoes where id=(res->>'versao_id')::uuid and origem_id=v1 and publicado_em is null);

  perform public.emitir_documento_modelo(jsonb_build_object('id',doc_particular,'modelo_catalogo_id',comparecimento,'modelo_versao_id',v_compar,
    'cliente_id',cliente,'compromisso_id',particular,'acao','salvar','conteudo','<p>Dado de agenda particular</p>'));
  perform public.modelo_documento_acao('arquivar',jsonb_build_object('id',comparecimento,'motivo','Teste do atalho legado'));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u_leitor)::text,true);
  return query select 'Fonte privada protege documento e auditoria',
    not exists(select 1 from public.documentos where id=doc_particular) and not exists(select 1 from public.auditoria where registro_id=doc_particular);
  return query select 'Fonte privada não pode ser copiada por id', pg_temp.recusa_modelo(format('select public.emitir_documento_modelo(%L::jsonb)',
    jsonb_build_object('id',gen_random_uuid(),'origem_id',doc_particular,'acao','word')),'42501');
  return query select 'Usuário comum detecta arquivo pela chave sem ler o catálogo arquivado',
    public.modelo_legado_arquivado('declaracao_comparecimento') and not exists(select 1 from public.modelos_documento where id=comparecimento);
  return query select 'Atalho legado não pode gravar nova emissão arquivada',
    pg_temp.recusa_modelo(format('insert into public.documentos(modelo,titulo,cliente_id,conteudo) values (''declaracao_comparecimento'',''Falso'',%L,''Novo'')',cliente),'P0001');
  insert into public.documentos(modelo,titulo,cliente_id,conteudo,dados)
    values ('declaracao_comparecimento','Declaração antiga',cliente,'<p>Original legado</p>',jsonb_build_object('origem_documento',legado,'acao','word')) returning id into copia;
  return query select 'Cópia histórica genuína continua disponível quando chave foi arquivada',
    exists(select 1 from public.documentos where id=copia and conteudo='<p>Original legado</p>');
  perform set_config('role','anon',true);
  return query select 'Anônimo não lê matrizes nem executa emissão',
    pg_temp.recusa_modelo('select * from public.modelos_documento_versoes','42501') and pg_temp.recusa_modelo('select public.emitir_documento_modelo(''{}'')','42501');
  perform set_config('role','none',true);
end $$;
select * from pg_temp.testar_modelos();
rollback;

