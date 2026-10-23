-- Regressões da auditoria de 23/10. Somente PostgreSQL fictício local.
create or replace function pg_temp.como(p_user uuid,p_papel text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('role','none',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role',p_papel)::text,true);
  perform set_config('role',p_papel,true);
end
$$;
create or replace function pg_temp.erro(p_sql text)
returns text language plpgsql as $$
begin execute p_sql; return 'aceitou'; exception when others then return sqlstate||' '||sqlerrm; end
$$;
create or replace function pg_temp.t(p_ok boolean,p_teste text,p_detalhe anyelement)
returns jsonb language sql as $$select jsonb_build_object('ok',coalesce(p_ok,false),'t',p_teste,'d',p_detalhe::text)$$;

create or replace function pg_temp.testar_ajustes_financeiro()
returns table(n bigint,ok boolean,teste text,detalhe text) language plpgsql as $fn$
declare
 res jsonb:='[]'; etapa text:='preparação'; u uuid:=gen_random_uuid(); uc uuid:=gen_random_uuid(); us uuid:=gen_random_uuid();
 cli uuid; c uuid; c2 uuid; p1 uuid; p2 uuid; p3 uuid; aj uuid; aj2 uuid; r1 uuid; r2 uuid; r3 uuid;
 hoje date:=privado.hoje(); texto text; j jsonb; valor numeric; antes integer; depois integer;
begin
 begin
  insert into auth.users(id,email,email_confirmed_at,aud,role) values
    (u,'fix-fin-admin@teste.local',now(),'authenticated','authenticated'),
    (uc,'fix-fin-cons@teste.local',now(),'authenticated','authenticated'),
    (us,'fix-fin-sec@teste.local',now(),'authenticated','authenticated');
  update public.membros set email='fix-fin-admin@teste.local' where nome_curto='Vinícius';
  insert into public.membros(user_id,nome,nome_curto,email,papel,acesso_financeiro)
    values(uc,'Consulta financeira','FixCons','fix-fin-cons@teste.local','associado','consulta');
  insert into public.membros(user_id,nome,nome_curto,email,papel,acesso_financeiro)
    values(us,'Secretária fictícia','FixSec','fix-fin-sec@teste.local','associado','lancamentos');
  perform pg_temp.como(u); perform public.iniciar_sessao();
  insert into public.clientes(nome) values('Cliente fictício correções financeiras') returning id into cli;

  etapa:='saldo negativo';
  c:=public.criar_contrato(jsonb_build_object('cliente_id',cli,'descricao','Acréscimo fictício','valor_total',500,
    'parcelas',jsonb_build_array(jsonb_build_object('numero',1,'valor',500,'vencimento',hoje+1))));
  select id into p1 from public.parcelas where contrato_id=c;
  aj:=public.conceder_ajuste(jsonb_build_object('parcela_id',p1,'tipo','acrescimo','valor',100,'motivo','Fictício'));
  insert into public.recebimentos(parcela_id,data,valor,valor_principal,valor_encargos) values(p1,hoje,600,600,0) returning id into r1;
  texto:=pg_temp.erro(format('select public.estornar_ajuste(%L,%L)',aj,'Fictício'));
  res:=res||pg_temp.t(texto like '%saldo negativo%','AF01 estorno de acréscimo recebido é recusado',texto);
  select saldo into valor from public.v_parcelas where id=p1;
  res:=res||pg_temp.t(valor=0 and exists(select 1 from public.ajustes_financeiros where id=aj and estornado_em is null),'AF02 recusa conserva ajuste, recebimento e saldo',valor);
  update public.recebimentos set estornado_em=now(),motivo_estorno='Correção fictícia' where id=r1;
  perform public.estornar_ajuste(aj,'Correção fictícia');
  select saldo into valor from public.v_parcelas where id=p1;
  res:=res||pg_temp.t(valor=500,'AF03 depois de estornar recebimento, acréscimo pode ser estornado',valor);

  etapa:='precisão';
  c2:=public.criar_contrato(jsonb_build_object('cliente_id',cli,'descricao','Redistribuição fictícia','valor_total',1000,
    'parcelas',jsonb_build_array(jsonb_build_object('numero',1,'valor',500,'vencimento',hoje+1),jsonb_build_object('numero',2,'valor',500,'vencimento',hoje+2))));
  select id into p1 from public.parcelas where contrato_id=c2 and numero=1;
  select id into p2 from public.parcelas where contrato_id=c2 and numero=2;
  texto:=pg_temp.erro(format($q$select public.redistribuir_parcelas(jsonb_build_object('contrato_id',%L,'motivo','Fictício','parcelas',jsonb_build_array(jsonb_build_object('id',%L,'valor',499.995),jsonb_build_object('id',%L,'valor',500.005))))$q$,c2,p1,p2));
  res:=res||pg_temp.t(texto like '%duas casas%','AF04 redistribuição recusa frações antes do arredondamento',texto);
  select sum(pa.valor) into valor from public.parcelas pa where pa.contrato_id=c2;
  res:=res||pg_temp.t(valor=1000,'AF05 redistribuição recusada não muda o plano',valor);
  texto:=pg_temp.erro(format($q$select public.renegociar(jsonb_build_object('contrato_id',%L,'motivo','Fictício','parcelas',jsonb_build_array(%L),'novas',jsonb_build_array(jsonb_build_object('valor',166.665,'vencimento',%L),jsonb_build_object('valor',333.335,'vencimento',%L))))$q$,c2,p1,hoje+3,hoje+4));
  res:=res||pg_temp.t(texto like '%duas casas%','AF06 renegociação recusa frações antes da gravação',texto);
  res:=res||pg_temp.t(not exists(select 1 from public.renegociacoes where contrato_id=c2),'AF07 nenhuma renegociação parcial fica gravada',c2);
  perform public.redistribuir_parcelas(jsonb_build_object('contrato_id',c2,'motivo','Fictício','parcelas',jsonb_build_array(jsonb_build_object('id',p1,'valor',499.99),jsonb_build_object('id',p2,'valor',500.01))));
  select sum(pa.valor) into valor from public.parcelas pa where pa.contrato_id=c2;
  res:=res||pg_temp.t(valor=1000,'AF08 redistribuição legítima de centavo mantém total',valor);
  texto:=pg_temp.erro(format($q$select public.conceder_ajuste(jsonb_build_object('parcela_id',%L,'tipo','desconto','valor',0.005,'motivo','Fictício'))$q$,p1));
  res:=res||pg_temp.t(texto like '%duas casas%','AF09 ajuste recusa fração de centavo',texto);

  etapa:='valores especiais';
  texto:=pg_temp.erro(format($q$select public.criar_contrato(jsonb_build_object('cliente_id',%L,'descricao','Inválido','valor_total','NaN','parcelas',jsonb_build_array(jsonb_build_object('numero',1,'valor','NaN','vencimento',%L))))$q$,cli,hoje+1));
  res:=res||pg_temp.t(texto like '%finito%','AF10 NaN não cria contrato',texto);
  texto:=pg_temp.erro(format($q$insert into public.recebimentos(tipo_avulsa,data,valor,valor_principal,valor_encargos) values('outros',%L,'NaN','NaN',0)$q$,hoje));
  res:=res||pg_temp.t(texto like '%finito%','AF11 API direta de recebimento recusa NaN',texto);
  texto:=pg_temp.erro($q$insert into public.contas_financeiras(nome,saldo_inicial) values('Inválida NaN','NaN')$q$);
  res:=res||pg_temp.t(texto like '%finito%','AF12 saldo inicial direto recusa NaN',texto);
  texto:=pg_temp.erro(format($q$select public.renegociar(jsonb_build_object('contrato_id',%L,'motivo','Fictício','parcelas',jsonb_build_array(%L),'novas',jsonb_build_array(jsonb_build_object('valor','NaN','vencimento',%L))))$q$,c2,p1,hoje+3));
  res:=res||pg_temp.t(texto like '%finito%','AF13 renegociação recusa NaN',texto);
  texto:=pg_temp.erro(format($q$select public.conceder_ajuste(jsonb_build_object('parcela_id',%L,'tipo','acrescimo','valor','NaN','motivo','Fictício'))$q$,p1));
  res:=res||pg_temp.t(texto like '%finito%','AF14 acréscimo recusa NaN',texto);

  etapa:='arquivamento';
  c:=public.criar_contrato(jsonb_build_object('cliente_id',cli,'descricao','Arquivado fictício','valor_total',500,
    'parcelas',jsonb_build_array(jsonb_build_object('numero',1,'valor',500,'vencimento',hoje+1))));
  select id into p1 from public.parcelas where contrato_id=c;
  aj:=public.conceder_ajuste(jsonb_build_object('parcela_id',p1,'tipo','desconto','valor',500,'motivo','Fictício'));
  perform public.arquivar_contrato(c,'Fictício');
  texto:=pg_temp.erro(format('select public.estornar_ajuste(%L,%L)',aj,'Fictício'));
  res:=res||pg_temp.t(texto like '%desarquive%','AF15 desconto não reabre dívida no arquivado',texto);
  select saldo into valor from public.v_contratos where id=c;
  res:=res||pg_temp.t(valor=0,'AF16 arquivado permanece quitado após recusa',valor);
  perform public.desarquivar_contrato(c,'Fictício'); perform public.estornar_ajuste(aj,'Fictício');
  insert into public.recebimentos(parcela_id,data,valor,valor_principal,valor_encargos) values(p1,hoje,500,500,0) returning id into r1;
  perform public.arquivar_contrato(c,'Fictício');
  texto:=pg_temp.erro(format($q$update public.recebimentos set estornado_em=now(),motivo_estorno='Fictício' where id=%L$q$,r1));
  res:=res||pg_temp.t(texto like '%desarquive%','AF17 recebimento não reabre dívida no arquivado pela API',texto);
  update public.recebimentos set observacao='Observação preservada no arquivado' where id=r1;
  res:=res||pg_temp.t(exists(select 1 from public.recebimentos where id=r1 and observacao='Observação preservada no arquivado'),'AF18 observação continua editável no arquivado',r1);
  perform public.desarquivar_contrato(c,'Fictício');
  update public.recebimentos set estornado_em=now(),motivo_estorno='Fictício' where id=r1;
  select saldo into valor from public.v_contratos where id=c;
  res:=res||pg_temp.t(valor=500,'AF19 desarquivar permite estorno e reabertura explícita',valor);

  etapa:='cota do acordo';
  c:=public.criar_contrato(jsonb_build_object('cliente_id',cli,'descricao','Acordo fictício','valor_total',333.33,'cota_escritorio_pct',30,
    'parcelas',jsonb_build_array(jsonb_build_object('numero',1,'valor',333.33,'vencimento',hoje+1))));
  select id into p1 from public.parcelas where contrato_id=c;
  insert into public.recebimentos(parcela_id,data,valor,valor_principal,valor_encargos) values(p1,hoje,111.11,111.11,0) returning id into r1;
  insert into public.recebimentos(parcela_id,data,valor,valor_principal,valor_encargos) values(p1,hoje,111.11,111.11,0) returning id into r2;
  insert into public.recebimentos(parcela_id,data,valor,valor_principal,valor_encargos) values(p1,hoje,111.11,111.11,0) returning id into r3;
  texto:=pg_temp.erro(format($q$update public.recebimentos set estornado_em=now(),motivo_estorno='Fictício' where id=%L$q$,r2));
  res:=res||pg_temp.t(texto like '%pagamentos posteriores%','AF20 estorno intermediário com diferença orienta ordem reversa',texto);
  select sum(r.valor-r.valor_repasse) into valor from public.recebimentos r where r.parcela_id=p1 and r.estornado_em is null;
  res:=res||pg_temp.t(valor=100,'AF21 recusa não recalcula nem modifica repasses anteriores',valor);
  update public.recebimentos set observacao='Anotação do acordo' where id=r2;
  res:=res||pg_temp.t(exists(select 1 from public.recebimentos where id=r2 and observacao='Anotação do acordo'),'AF22 observação não passa por bloqueio de arredondamento',r2);
  update public.recebimentos set estornado_em=now(),motivo_estorno='Fictício' where id=r3;
  select sum(r.valor-r.valor_repasse) into valor from public.recebimentos r where r.parcela_id=p1 and r.estornado_em is null;
  res:=res||pg_temp.t(valor=66.67,'AF23 último ativo pode ser estornado mantendo cota acumulada',valor);
  update public.recebimentos set estornado_em=now(),motivo_estorno='Fictício' where id=r2;
  select sum(r.valor-r.valor_repasse) into valor from public.recebimentos r where r.parcela_id=p1 and r.estornado_em is null;
  res:=res||pg_temp.t(valor=33.33,'AF24 após desfazer posteriores, pagamento desejado pode ser estornado',valor);

  etapa:='antecipação';
  c:=public.criar_contrato(jsonb_build_object('cliente_id',cli,'descricao','Antecipação fictícia','valor_total',1000,
    'parcelas',jsonb_build_array(jsonb_build_object('numero',1,'valor',500,'vencimento',hoje+1),jsonb_build_object('numero',2,'valor',500,'vencimento',hoje+2))));
  select id into p1 from public.parcelas where contrato_id=c and numero=1;
  select id into p2 from public.parcelas where contrato_id=c and numero=2;
  j:=jsonb_build_object('recebimento',jsonb_build_object('parcela_id',p1,'data',hoje,'valor',500,'valor_principal',500,'valor_encargos',0),'excedente',0.005);
  texto:=pg_temp.erro(format('select public.receber_com_antecipacao(%L::jsonb)',j));
  res:=res||pg_temp.t(texto like '%duas casas%','AF25 excedente não é arredondado silenciosamente',texto);
  j:=public.receber_com_antecipacao(jsonb_set(j,'{excedente}','250'));
  r1:=(j->>'id')::uuid;
  select id into r2 from public.recebimentos where antecipacao_de=r1;
  texto:=pg_temp.erro(format($q$update public.recebimentos set estornado_em=now(),motivo_estorno='Fictício' where id=%L$q$,r2));
  res:=res||pg_temp.t(texto like '%estorne o pagamento de origem%','AF26 filho direto é recusado antes de disputar trava do pai',texto);
  update public.recebimentos set estornado_em=now(),motivo_estorno='Fictício' where id=r1;
  res:=res||pg_temp.t(not exists(select 1 from public.recebimentos where (id=r1 or antecipacao_de=r1) and estornado_em is null),'AF27 estorno do pai continua atômico incluindo filhos',r1);
  texto:=pg_temp.erro(format($q$insert into public.recebimentos(parcela_id,data,valor,valor_principal,valor_encargos,antecipacao_de) values(%L,%L,1,1,0,%L)$q$,p2,hoje,r1));
  res:=res||pg_temp.t(texto like '%pagamento de parcela válido%','AF28 filho novo não pode usar pai estornado',texto);
  perform pg_temp.como(uc);
  texto:=pg_temp.erro(format('select public.receber_com_antecipacao(%L::jsonb)',jsonb_build_object('recebimento',jsonb_build_object('parcela_id',p1,'data',hoje,'valor',500,'valor_principal',500),'excedente',250)));
  res:=res||pg_temp.t(texto like '42501%','AF29 consulta continua sem poder lançar antecipação',texto);
  perform pg_temp.como(us);
  j:=public.receber_com_antecipacao(jsonb_build_object('recebimento',jsonb_build_object('parcela_id',p1,'data',hoje,'valor',500,'valor_principal',500,'valor_encargos',0),'excedente',250));
  r1:=(j->>'id')::uuid;
  res:=res||pg_temp.t((j->>'total')::numeric=750,'AF32 lançamentos continua autorizado a antecipar sem acesso a Clientes',j);
  update public.recebimentos set estornado_em=now(),motivo_estorno='Fictício secretária' where id=r1;
  res:=res||pg_temp.t(not exists(select 1 from public.recebimentos where (id=r1 or antecipacao_de=r1) and estornado_em is null),'AF33 lançamentos pode estornar o conjunto sem privilégio extra',r1);
  perform pg_temp.como(u);
  res:=res||pg_temp.t(not has_function_privilege('anon','public.receber_com_antecipacao(jsonb)','execute'),'AF34 função continua sem execução anônima','permissões'::text);
  perform public.fechar_mes(hoje);
  texto:=pg_temp.erro(format($q$select public.receber_com_antecipacao(jsonb_build_object('recebimento',jsonb_build_object('parcela_id',%L,'data',%L,'valor',500,'valor_principal',500,'valor_encargos',0),'excedente',250))$q$,p1,hoje));
  res:=res||pg_temp.t(texto like '%fechado%','AF30 travas novas preservam mês fechado',texto);
  select count(*) into antes from public.recebimentos where parcela_id in(p1,p2) and estornado_em is null;
  res:=res||pg_temp.t(antes=0,'AF31 mês fechado não deixa gravação parcial',antes);

  raise exception 'FIM_DOS_TESTES';
 exception when others then
  if sqlerrm<>'FIM_DOS_TESTES' then res:=res||jsonb_build_object('ok',false,'t','ERRO em '||etapa,'d',sqlerrm||' ['||sqlstate||']'); end if;
 end;
 return query select e.i,(e.x->>'ok')::boolean,e.x->>'t',e.x->>'d' from jsonb_array_elements(res) with ordinality e(x,i);
end
$fn$;
select * from pg_temp.testar_ajustes_financeiro();
