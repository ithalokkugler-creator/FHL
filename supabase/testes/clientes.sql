-- Clientes E0/F1/F2. Somente em banco LOCAL ou isolado.
-- Tudo é desfeito no ROLLBACK; F3–F4 ampliarão este arquivo.
begin;
create function pg_temp.recusa_contato(comando text) returns boolean language plpgsql as $$
begin
  execute comando;
  return false;
exception when insufficient_privilege or check_violation or raise_exception then return true;
end $$;

create function pg_temp.testar_contatos() returns table(teste text, ok boolean)
language plpgsql as $$
declare
  u uuid := gen_random_uuid(); m uuid; c uuid; cli uuid; j jsonb;
  u_intruso uuid := gen_random_uuid(); u_sec uuid := gen_random_uuid(); u_socia uuid := gen_random_uuid();
  p jsonb := '{"nome":"Pessoa SQL Fictícia","email":"ficticio@example.test","mensagem":"Teste isolado","consent":"1"}';
begin
  insert into auth.users(id,email,email_confirmed_at,aud,role)
    values(u,'contatos@example.test',now(),'authenticated','authenticated');
  insert into auth.users(id,email,email_confirmed_at,aud,role) values
    (u_intruso,'intruso-contatos@example.test',now(),'authenticated','authenticated'),
    (u_sec,'sec-contatos@example.test',now(),'authenticated','authenticated'),
    (u_socia,'socia-contatos@example.test',now(),'authenticated','authenticated');
  insert into public.membros(user_id,nome,nome_curto,email,papel,acesso_clientes,acesso_prazos) values
    (u_sec,'Secretária SQL Fictícia','Secretária SQL','sec-contatos@example.test','secretaria','editar','nenhum'),
    (u_socia,'Sócia SQL Fictícia','Sócia SQL','socia-contatos@example.test','socio','nenhum','editar');
  insert into public.membros(user_id,nome,nome_curto,email,papel,acesso_clientes,acesso_prazos)
    values(u,'Equipe Fictícia','Equipe Fictícia','contatos@example.test','associado','editar','nenhum') returning id into m;
  insert into public.clientes(nome) values('Cliente SQL Fictício') returning id into cli;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u)::text,true);
  perform set_config('role','authenticated',true);
  j := public.iniciar_sessao();
  return query select 'Sessão retorna acessos a Clientes e Prazos', j->>'acesso_clientes' = 'editar' and j->>'acesso_prazos' = 'nenhum';
  insert into public.contatos(canal,nome,email,responsavel_id) values('telefone','Manual Fictício','manual@example.test',m) returning id into c;
  return query select 'Equipe autorizada inclui contato manual', exists(select 1 from public.contatos where id=c);
  return query select 'Equipe não inclui contato fingindo ser do site', pg_temp.recusa_contato('insert into public.contatos(canal,nome,email) values(''site'',''Falso'',''falso@example.test'')');
  return query select 'Mensagem original não pode ser adulterada', pg_temp.recusa_contato(format('update public.contatos set mensagem=''alterada'' where id=%L',c));
  return query select 'Consentimento não pode ser adulterado', pg_temp.recusa_contato(format('update public.contatos set consentimento_em=now() where id=%L',c));
  return query select 'Conversão exige cliente', pg_temp.recusa_contato(format('update public.contatos set situacao=''convertido'' where id=%L',c));
  update public.contatos set situacao='convertido',cliente_id=cli where id=c;
  return query select 'Conversão carimba data do servidor', exists(select 1 from public.contatos where id=c and convertido_em is not null);
  return query select 'Equipe autorizada lê auditoria do contato', exists(select 1 from public.auditoria where tabela='contatos' and registro_id=c);
  return query select 'Equipe não apaga contatos', pg_temp.recusa_contato(format('delete from public.contatos where id=%L',c));
  return query select 'Equipe não lê hashes técnicos', pg_temp.recusa_contato('select * from public.contatos_envios');
  return query select 'Equipe não executa RPC pública de ingresso', pg_temp.recusa_contato(format('select public.registrar_contato(%L::jsonb,''teste'')',p));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u_intruso)::text,true);
  return query select 'Login sem membro não recebe nenhum acesso novo', public.iniciar_sessao() is null and not privado.edita_clientes() and not privado.gerencia_prazos();
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u_sec)::text,true);
  j := public.iniciar_sessao();
  return query select 'Secretária pode ter Clientes sem Prazos', j->>'acesso_clientes'='editar' and j->>'acesso_prazos'='nenhum' and privado.edita_clientes() and not privado.gerencia_prazos();
  return query select 'Secretária autorizada vê contatos', exists(select 1 from public.contatos where id=c);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u_socia)::text,true);
  j := public.iniciar_sessao();
  return query select 'Sócia respeita os dois acessos independentes', j->>'acesso_clientes'='nenhum' and j->>'acesso_prazos'='editar' and not privado.edita_clientes() and privado.gerencia_prazos();
  return query select 'Prazos sozinho não libera contato ou sua auditoria', not exists(select 1 from public.contatos where id=c) and not exists(select 1 from public.auditoria where tabela='contatos' and registro_id=c);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u)::text,true);
  perform set_config('role','none',true);
  update public.membros set acesso_clientes='nenhum' where id=m;
  perform set_config('role','authenticated',true);
  return query select 'Sem acesso a Clientes, contato é invisível', not exists(select 1 from public.contatos where id=c);
  return query select 'Sem acesso a Clientes, inclusão é recusada', pg_temp.recusa_contato('insert into public.contatos(canal,nome,email) values(''telefone'',''Falso'',''falso@example.test'')');
  perform set_config('role','none',true);
  update public.membros set papel='admin',acesso_prazos='nenhum' where id=m;
  perform set_config('role','authenticated',true);
  j := public.iniciar_sessao();
  return query select 'Admin recebe ambos acessos máximos apesar dos campos', j->>'acesso_clientes'='editar' and j->>'acesso_prazos'='editar';
  perform set_config('role','none',true);
  update public.membros set ativo=false where id=m;
  perform set_config('role','authenticated',true);
  return query select 'Membro inativo perde sessão e contatos', public.iniciar_sessao() is null and not exists(select 1 from public.contatos where id=c);
  perform set_config('role','anon',true);
  return query select 'Anônimo não lê contatos', pg_temp.recusa_contato('select * from public.contatos');
  return query select 'Anônimo não executa RPC de ingresso', pg_temp.recusa_contato(format('select public.registrar_contato(%L::jsonb,''teste'')',p));
  perform set_config('role','none',true);
  delete from public.contatos_envios; -- ambiente isolado, desfeito no fim
  -- A fixture só envelhece envios desta transação; não depende do banco vazio.
  update public.contatos set recebido_em=now()-interval '2 hours' where canal='site';
  perform set_config('request.jwt.claims','{}',true);
  perform set_config('role','service_role',true);
  c := public.registrar_contato(p,'hash-ficticio');
  return query select 'Servidor inclui site com consentimento e sem IP bruto', exists(select 1 from public.contatos where id=c and consentimento_em is not null and canal='site');
  perform public.registrar_contato(p,'hash-ficticio'); perform public.registrar_contato(p,'hash-ficticio');
  return query select 'Quarto envio do mesmo IP em dez minutos é recusado', pg_temp.recusa_contato(format('select public.registrar_contato(%L::jsonb,''hash-ficticio'')',p));
  return query select 'Sem consentimento, ingresso é recusado', pg_temp.recusa_contato(format('select public.registrar_contato(%L::jsonb,''outro-hash'')',p-'consent'));
  for i in 4..30 loop perform public.registrar_contato(p,'hash-ficticio-'||i); end loop;
  return query select 'Teto global de trinta envios por hora é aplicado', pg_temp.recusa_contato(format('select public.registrar_contato(%L::jsonb,''hash-final'')',p));
  perform set_config('role','none',true);
  return query select 'Alterações de contatos entram no histórico', exists(select 1 from public.auditoria where tabela='contatos' and registro_id=c);
end $$;
select * from pg_temp.testar_contatos();

-- A exceção esperada desfaz também as gravações e os carimbos do RPC.
create function pg_temp.recusa_cliente(comando text,codigo text) returns boolean language plpgsql as $$
begin
  execute comando;
  return false;
exception when others then
  if sqlstate=codigo then return true; end if;
  raise;
end $$;
create function pg_temp.testar_clientes_processos() returns table(teste text,ok boolean)
language plpgsql as $$
declare
  u uuid:=gen_random_uuid(); sem_acesso uuid:=gen_random_uuid(); intruso uuid:=gen_random_uuid();
  m uuid; cli uuid; outro uuid; detalhe uuid; caso uuid; n integer; q jsonb; j jsonb;
begin
  perform set_config('role','none',true);
  insert into auth.users(id,email,email_confirmed_at,aud,role) values
    (u,'f2-editor@example.test',now(),'authenticated','authenticated'),
    (sem_acesso,'f2-sem-clientes@example.test',now(),'authenticated','authenticated'),
    (intruso,'f2-intruso@example.test',now(),'authenticated','authenticated');
  insert into public.membros(user_id,nome,nome_curto,email,papel,acesso_clientes,acesso_agenda,acesso_financeiro)
    values(u,'Editor F2 Fictício','Editor F2','f2-editor@example.test','associado','editar','nenhum','nenhum') returning id into m;
  insert into public.membros(user_id,nome,nome_curto,email,papel,acesso_clientes)
    values(sem_acesso,'Sem Clientes F2','Sem Clientes F2','f2-sem-clientes@example.test','secretaria','nenhum');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u)::text,true);
  perform set_config('role','authenticated',true);
  q:=jsonb_build_object('nome','  José SQL Fictício  ','documento','12345678909','telefone','41900000000','email','F2@EXAMPLE.TEST',
    'ativo',false,'criado_em','2000-01-01','detalhes',jsonb_build_object('tipo_pessoa','fisica','flexao','f','rg',' RG fictício ',
      'nascimento','1990-10-07','cep','83203000','cidade','Paranaguá','uf','PR','recado_nome','Parente','recado_relacao','Mãe',
      'recado_telefone','41900000001','representante_nome','Representante','representante_documento','98765432100',
      'banco','Banco Fictício','pix','f2@example.test','responsavel_id',m,'cliente_id',gen_random_uuid(),'criado_em','2000-01-01'));
  cli:=public.salvar_cliente(q);
  select id into detalhe from public.clientes_detalhes where cliente_id=cli;
  return query select 'Cadastro completo salva as duas partes e retorna o cliente',cli is not null and detalhe is not null and cli<>detalhe;
  return query select 'RPC normaliza nome, e-mail e dados completos',exists(select 1 from public.clientes where id=cli and nome='José SQL Fictício' and email='f2@example.test') and exists(select 1 from public.clientes_detalhes where id=detalhe and rg='RG fictício' and recado_relacao='Mãe' and representante_nome='Representante');
  return query select 'RPC ignora vínculo, ativo e carimbos fornecidos',exists(select 1 from public.clientes where id=cli and ativo and criado_em>='2026-01-01') and exists(select 1 from public.clientes_detalhes where id=detalhe and cliente_id=cli and criado_em>='2026-01-01');
  return query select 'Clientes independe de permissão para Agenda e Financeiro',privado.edita_clientes() and (public.iniciar_sessao()->>'acesso_agenda')='nenhum' and (public.iniciar_sessao()->>'acesso_financeiro')='nenhum';
  return query select 'Cadastro atômico gera os dois históricos',exists(select 1 from public.auditoria where tabela='clientes' and registro_id=cli) and exists(select 1 from public.auditoria where tabela='clientes_detalhes' and registro_id=detalhe);
  q:=q||jsonb_build_object('id',cli,'nome','José SQL Editado','detalhes',jsonb_build_object('tipo_pessoa','fisica','banco','Novo Banco','recado_relacao','  ','responsavel_id',m));
  perform public.salvar_cliente(q);
  return query select 'Edição atualiza detalhe existente e normaliza vazio para null',exists(select 1 from public.clientes_detalhes where id=detalhe and banco='Novo Banco' and recado_relacao is null) and (select count(*)=1 from public.clientes_detalhes where cliente_id=cli);
  return query select 'Edição registra os valores anteriores das duas partes',exists(select 1 from public.auditoria where tabela='clientes' and registro_id=cli and antes->>'nome'='José SQL Fictício' and depois->>'nome'='José SQL Editado') and exists(select 1 from public.auditoria where tabela='clientes_detalhes' and registro_id=detalhe and antes->>'banco'='Banco Fictício' and depois->>'banco'='Novo Banco');
  select count(*) into n from public.auditoria where registro_id in(cli,detalhe);
  j:=q||jsonb_build_object('nome','Não deve gravar','detalhes',jsonb_build_object('tipo_pessoa','fisica','cep','123'));
  return query select 'Erro de detalhe recusa o RPC inteiro',pg_temp.recusa_cliente(format('select public.salvar_cliente(%L::jsonb)',j),'23514');
  return query select 'Erro de detalhe desfaz básico e auditoria',exists(select 1 from public.clientes where id=cli and nome='José SQL Editado') and (select count(*)=n from public.auditoria where registro_id in(cli,detalhe));
  j:=jsonb_build_object('nome','Inclusão que deve falhar','detalhes',jsonb_build_object('cep','123'));
  return query select 'Erro em detalhe de novo cadastro não deixa cliente órfão',pg_temp.recusa_cliente(format('select public.salvar_cliente(%L::jsonb)',j),'23514') and not exists(select 1 from public.clientes where nome='Inclusão que deve falhar');
  outro:=public.salvar_cliente('{"nome":"Outro SQL Fictício","documento":"98765432100","detalhes":{"tipo_pessoa":"fisica"}}');
  j:=jsonb_build_object('id',outro,'nome','Duplicado','documento','12345678909','detalhes',jsonb_build_object('banco','Banco incorreto'));
  return query select 'CPF duplicado recusa a transação',pg_temp.recusa_cliente(format('select public.salvar_cliente(%L::jsonb)',j),'23505') and exists(select 1 from public.clientes where id=outro and nome='Outro SQL Fictício');
  return query select 'RPC recusa detalhe em vez de objeto',pg_temp.recusa_cliente('select public.salvar_cliente(''{"nome":"Falso","detalhes":null}''::jsonb)','22023');
  return query select 'RPC recusa campo de identificação não textual',pg_temp.recusa_cliente('select public.salvar_cliente(''{"nome":{"texto":"Falso"}}''::jsonb)','22023');
  return query select 'RPC recusa cliente inexistente',pg_temp.recusa_cliente(format('select public.salvar_cliente(%L::jsonb)',jsonb_build_object('id',gen_random_uuid(),'nome','Não existe')),'P0001');
  perform public.salvar_cliente(jsonb_build_object('id',cli,'nome','José Mínimo','documento','12345678909'));
  return query select 'Salvar somente cadastro mínimo preserva dados completos',exists(select 1 from public.clientes_detalhes where id=detalhe and banco='Novo Banco');
  insert into public.processos(cliente_id,numero,titulo,area,responsavel_id) values(cli,'00012342220258160001','Processo SQL Fictício','civel',m) returning id into caso;
  return query select 'CNJ válido pode ser salvo pelo membro autorizado',exists(select 1 from public.processos where id=caso);
  return query select 'Mesmo CNJ não pode ser duplicado para o cliente',pg_temp.recusa_cliente(format('insert into public.processos(cliente_id,numero,titulo,area) values(%L,''00012342220258160001'',''Duplicado'',''civel'')',cli),'23505');
  insert into public.processos(cliente_id,numero,titulo,area) values(outro,'00012342220258160001','Outro cliente no mesmo processo','civel');
  return query select 'Mesmo CNJ aceita clientes distintos',(select count(*)=2 from public.processos where numero='00012342220258160001' and cliente_id in(cli,outro));
  return query select 'CNJ inválido é recusado pelo banco',pg_temp.recusa_cliente(format('insert into public.processos(cliente_id,numero,titulo,area) values(%L,''00012348920258160001'',''Inválido'',''civel'')',cli),'23514');
  return query select 'CNJ com letras é recusado sem erro de conversão',pg_temp.recusa_cliente(format('insert into public.processos(cliente_id,numero,titulo,area) values(%L,''abcdefghijklmnopqrst'',''Inválido'',''civel'')',cli),'23514');
  insert into public.processos(cliente_id,referencia,titulo,area) values(cli,'PROTOCOLO-1','Consultivo 1','contratual'),(cli,'PROTOCOLO-2','Consultivo 2','contratual');
  return query select 'Vários casos sem número CNJ são permitidos',(select count(*)=2 from public.processos where cliente_id=cli and numero is null);
  update public.processos set situacao='encerrado' where id=caso;
  return query select 'Mudança de situação de processo entra no histórico',exists(select 1 from public.auditoria where registro_id=caso and tabela='processos' and antes->>'situacao'='em_andamento' and depois->>'situacao'='encerrado');
  return query select 'Processo não pode trocar de cliente por PATCH',pg_temp.recusa_cliente(format('update public.processos set cliente_id=%L where id=%L',outro,caso),'42501');
  return query select 'Detalhe não pode trocar de cliente por PATCH',pg_temp.recusa_cliente(format('update public.clientes_detalhes set cliente_id=%L where id=%L',outro,detalhe),'42501');
  return query select 'Carimbos de detalhe não podem ser adulterados',pg_temp.recusa_cliente(format('update public.clientes_detalhes set criado_em=now() where id=%L',detalhe),'42501');
  return query select 'Processos e detalhes não podem ser apagados',pg_temp.recusa_cliente(format('delete from public.processos where id=%L',caso),'42501') and pg_temp.recusa_cliente(format('delete from public.clientes_detalhes where id=%L',detalhe),'42501');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',sem_acesso)::text,true);
  return query select 'Sem Clientes pode consultar o mínimo e os processos',exists(select 1 from public.clientes where id=cli) and exists(select 1 from public.processos where id=caso);
  return query select 'Sem Clientes não vê dados completos ou seu histórico',not exists(select 1 from public.clientes_detalhes where id=detalhe) and not exists(select 1 from public.auditoria where tabela='clientes_detalhes' and registro_id=detalhe);
  return query select 'Sem Clientes não grava dados completos pelo RPC',pg_temp.recusa_cliente(format('select public.salvar_cliente(%L::jsonb)',q),'42501');
  perform public.salvar_cliente(jsonb_build_object('id',cli,'nome','Cadastro mínimo pela Secretária','documento','12345678909'));
  return query select 'Sem Clientes mantém o cadastro rápido de Agenda e Financeiro',exists(select 1 from public.clientes where id=cli and nome='Cadastro mínimo pela Secretária');
  return query select 'Sem Clientes não inclui processos',pg_temp.recusa_cliente(format('insert into public.processos(cliente_id,titulo,area) values(%L,''Falso'',''civel'')',cli),'42501');
  update public.processos set situacao='suspenso' where id=caso;
  return query select 'Sem Clientes não altera processos por RLS',exists(select 1 from public.processos where id=caso and situacao='encerrado');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',intruso)::text,true);
  return query select 'Login sem membro não vê mínimo, detalhes ou processos',not exists(select 1 from public.clientes where id=cli) and not exists(select 1 from public.clientes_detalhes where id=detalhe) and not exists(select 1 from public.processos where id=caso);
  return query select 'Login sem membro não executa salvar_cliente',pg_temp.recusa_cliente('select public.salvar_cliente(''{"nome":"Intruso"}''::jsonb)','42501');
  perform set_config('role','none',true);
  update public.membros set ativo=false where id=m;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u)::text,true);
  perform set_config('role','authenticated',true);
  return query select 'Membro inativo perde acesso a cadastro e processos',not exists(select 1 from public.clientes_detalhes where id=detalhe) and not exists(select 1 from public.processos where id=caso) and pg_temp.recusa_cliente(format('select public.salvar_cliente(%L::jsonb)',q),'42501');
  perform set_config('role','anon',true);
  return query select 'Anônimo não lê processos nem dados completos',pg_temp.recusa_cliente('select * from public.processos','42501') and pg_temp.recusa_cliente('select * from public.clientes_detalhes','42501');
  return query select 'Anônimo não executa salvar_cliente',pg_temp.recusa_cliente('select public.salvar_cliente(''{"nome":"Anônimo"}''::jsonb)','42501');
  perform set_config('role','none',true);
end $$;
select * from pg_temp.testar_clientes_processos();
rollback;
