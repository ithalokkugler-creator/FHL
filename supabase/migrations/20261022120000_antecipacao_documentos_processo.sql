-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- 40 · Pedidos do Vinícius (22/10): antecipação de parcelas e documentos
--      solicitados/entregues no processo
-- =============================================================================
--
--   · "Se o cliente paga R$ 500,00 por mês, mas realiza um pagamento de
--     R$ 750,00, o sistema quita a parcela do mês e abate os R$ 250,00
--     restantes da última parcela do contrato. Abater as parcelas de trás
--     para frente, de forma automática, seja o pagamento total ou parcial."
--     Até aqui o diálogo de receber recusava o que passasse do total da
--     parcela. receber_com_antecipacao() grava, numa transação só, o
--     recebimento que quita a parcela e um recebimento por parcela
--     antecipada — da última para a primeira, só as que ainda vão vencer, do
--     mesmo grupo (fixo ou êxito) e sem parte de cliente (acordo fica de
--     fora: quem paga é a parte contrária, e a conta do repasse é por
--     parcela). Cada parte antecipada guarda de qual pagamento veio
--     (recebimentos.antecipacao_de), para o recibo e o estorno: estornar o
--     pagamento estorna junto as partes antecipadas, e uma parte antecipada
--     não se estorna sozinha.
--
--     Segurança das finanças que já existem: a função roda com as
--     permissões de quem está logado (security INVOKER), então cada
--     recebimento passa pelas MESMAS travas de sempre — RLS do Financeiro,
--     saldo da parcela (validar_recebimento), mês fechado, conta financeira.
--     Nenhuma linha existente muda: a coluna nova nasce vazia, e os gatilhos
--     novos só agem em recebimento que traz antecipacao_de (ou que tem parte
--     antecipada) — nenhum dos que existem hoje. O texto que o sistema
--     escreve vai em descricao (a observação fica com o que a pessoa
--     digitou); o extrato marca a parte antecipada; o alerta de estorno do
--     pagamento traz o total, e as partes não repetem o alerta.
--
--   · "Na aba Processos e Casos, uma opção para registrar o documento
--     solicitado ou entregue, quem recebeu, a data e o prazo previsto para
--     retorno." processos_documentos, com o retorno registrado depois. Nada
--     se apaga: cancelar pede motivo, e tudo fica no histórico.

-- -----------------------------------------------------------------------------
-- Antecipação de parcelas
-- -----------------------------------------------------------------------------

alter table public.recebimentos
  add column antecipacao_de uuid references public.recebimentos (id);

comment on column public.recebimentos.antecipacao_de is
  'Parte antecipada de um pagamento: o recebimento (da parcela quitada) de onde veio o excedente.';

create index recebimentos_antecipacao on public.recebimentos (antecipacao_de) where antecipacao_de is not null;

grant insert (antecipacao_de) on public.recebimentos to authenticated;

-- Só uma parcela que ainda vai vencer, do mesmo contrato e grupo, na data do
-- pagamento de origem — que quitou a parcela dele —, abatendo saldo (sem
-- encargos) e sem parte de cliente. Roda depois de b_validar, que trava a
-- parcela e confere o saldo.
create function privado.validar_antecipacao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_origem          public.recebimentos;
  v_parcela         public.parcelas;
  v_parcela_origem  public.parcelas;
  v_aberto_origem   numeric;
begin
  if new.antecipacao_de is null then
    return new;
  end if;

  select * into v_origem from public.recebimentos where id = new.antecipacao_de;
  if not found or v_origem.estornado_em is not null or v_origem.antecipacao_de is not null
     or v_origem.parcela_id is null then
    raise exception 'A antecipação precisa vir de um pagamento de parcela válido.' using errcode = 'P0001';
  end if;
  select * into v_parcela from public.parcelas where id = new.parcela_id;
  select * into v_parcela_origem from public.parcelas where id = v_origem.parcela_id;

  if new.parcela_id is null or new.parcela_id = v_origem.parcela_id
     or v_parcela.contrato_id <> v_parcela_origem.contrato_id or v_parcela.parte <> v_parcela_origem.parte then
    raise exception 'A antecipação vai para outra parcela do mesmo contrato e do mesmo grupo.' using errcode = 'P0001';
  end if;
  if new.data <> v_origem.data or v_parcela.vencimento <= new.data then
    raise exception 'Só se antecipa parcela que ainda vai vencer, na data do pagamento.' using errcode = 'P0001';
  end if;
  if v_parcela.cota_escritorio_pct < 100 or v_parcela_origem.cota_escritorio_pct < 100 or new.direto_ao_cliente then
    raise exception 'Parcela de acordo (com parte do cliente) não recebe antecipação.' using errcode = 'P0001';
  end if;
  if new.valor_encargos <> 0 or new.valor <> new.valor_principal then
    raise exception 'A antecipação só abate o saldo da parcela, sem encargos.' using errcode = 'P0001';
  end if;

  -- O excedente só existe depois de quitar a parcela do pagamento de origem.
  select v_parcela_origem.valor
         + coalesce((select sum(case when a.tipo = 'acrescimo' then a.valor else -a.valor end)
                       from public.ajustes_financeiros a
                      where a.parcela_id = v_parcela_origem.id and a.estornado_em is null), 0)
         - coalesce((select sum(r.valor_principal) from public.recebimentos r
                      where r.parcela_id = v_parcela_origem.id and r.estornado_em is null), 0)
    into v_aberto_origem;
  if v_aberto_origem > 0 then
    raise exception 'A antecipação vem de um pagamento que quitou a parcela dele.' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger b_validar_antecipacao before insert on public.recebimentos
  for each row execute function privado.validar_antecipacao();

-- A parte antecipada não se estorna sozinha: o dinheiro entrou num pagamento
-- só, e estornar um pedaço deixaria o resto contando.
create function privado.estorno_antecipacao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.estornado_em is not null and old.estornado_em is null and new.antecipacao_de is not null
     and exists (select 1 from public.recebimentos o where o.id = new.antecipacao_de and o.estornado_em is null) then
    raise exception 'Esta parte é antecipação de outro pagamento: estorne o pagamento de origem, e ela é estornada junto.'
      using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger b_estorno_antecipacao before update on public.recebimentos
  for each row execute function privado.estorno_antecipacao();

-- Estornar o pagamento estorna junto as partes antecipadas dele, na mesma
-- transação (cada uma passa pelas travas de estorno de sempre).
create function privado.estornar_antecipacoes()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.estornado_em is not null and old.estornado_em is null and new.antecipacao_de is null then
    update public.recebimentos
       set estornado_em = new.estornado_em,
           motivo_estorno = 'Estorno do pagamento de origem: ' || new.motivo_estorno
     where antecipacao_de = new.id and estornado_em is null;
  end if;
  return null;
end
$$;

create trigger x_estornar_antecipacoes after update on public.recebimentos
  for each row execute function privado.estornar_antecipacoes();

-- Recebe { recebimento: {o lançamento que quita a parcela, como a tela manda
-- hoje}, excedente: o que passou do total atualizado }. Devolve
-- { id, total, antecipacoes: [{ parcela_id, numero, vencimento, valor }] }.
create function public.receber_com_antecipacao(p jsonb)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_r         jsonb := p -> 'recebimento';
  v_excedente numeric := round(coalesce(nullif(p ->> 'excedente', '')::numeric, 0), 2);
  v_data      date;
  v_parcela   record;
  v_alvo      record;
  v_plano     jsonb := '[]';
  v_resto     numeric;
  v_valor     numeric;
  v_origem    uuid;
  v_conta     uuid;
  v_forma     uuid;
  v_total     numeric;
  v_nome      text;
  v_destinos  text;
  v_numeros   text[];
begin
  if not privado.financeiro_lanca() then
    raise exception 'Seu acesso ao Financeiro não permite lançar recebimentos.' using errcode = '42501';
  end if;
  if jsonb_typeof(v_r) is distinct from 'object' or v_excedente <= 0 then
    raise exception 'Pagamento inválido para antecipação.' using errcode = '22023';
  end if;
  v_data := (v_r ->> 'data')::date;

  select vp.* into v_parcela from public.v_parcelas vp where vp.id = (v_r ->> 'parcela_id')::uuid;
  if not found then
    raise exception 'Parcela não encontrada.' using errcode = 'P0001';
  end if;
  if v_parcela.cota_escritorio_pct < 100 then
    raise exception 'Parcela de acordo (com parte do cliente) não recebe antecipação: receba cada parcela.' using errcode = 'P0001';
  end if;
  -- Antecipar só depois de quitar a parcela deste pagamento.
  if v_parcela.saldo <= 0 then
    raise exception 'Esta parcela já está paga (talvez em outra tela). Atualize a página.' using errcode = 'P0001';
  end if;
  if (v_r ->> 'valor_principal')::numeric is distinct from v_parcela.saldo then
    raise exception 'Para antecipar, o pagamento precisa quitar esta parcela primeiro (saldo de %). Se ela mudou em outra tela, atualize a página.',
      privado.reais(v_parcela.saldo) using errcode = 'P0001';
  end if;

  -- O plano: da última para a primeira, só as que ainda vão vencer, do mesmo grupo.
  v_resto := v_excedente;
  for v_alvo in
    select vp.id, vp.numero, vp.vencimento, vp.saldo
      from public.v_parcelas vp
     where vp.contrato_id = v_parcela.contrato_id
       and vp.id <> v_parcela.id
       and vp.parte = v_parcela.parte
       and vp.cota_escritorio_pct = 100
       and vp.situacao in ('a_vencer', 'vencida')
       and vp.saldo > 0
       and vp.vencimento > v_data
     order by vp.vencimento desc, vp.numero desc
  loop
    exit when v_resto <= 0;
    v_valor := least(v_resto, v_alvo.saldo);
    v_plano := v_plano || jsonb_build_object('parcela_id', v_alvo.id, 'numero', v_alvo.numero,
                                            'vencimento', v_alvo.vencimento, 'valor', v_valor);
    v_resto := v_resto - v_valor;
  end loop;
  if v_resto > 0 then
    raise exception 'O pagamento passa em % o que falta pagar nas próximas parcelas deste contrato.', privado.reais(v_resto)
      using errcode = 'P0001';
  end if;

  v_total := (v_r ->> 'valor')::numeric + v_excedente;
  v_nome := case when v_parcela.numero = 0 then 'da entrada' else 'da parcela ' || v_parcela.numero end;
  -- "parcela 6" ou "parcelas 6, 5 e 4", na ordem em que foram abatidas.
  select array_agg(case when (e.i ->> 'numero')::int = 0 then 'entrada' else e.i ->> 'numero' end order by e.ordem)
    into v_numeros
    from jsonb_array_elements(v_plano) with ordinality as e(i, ordem);
  v_destinos := case when cardinality(v_numeros) = 1 then 'parcela ' || v_numeros[1]
                     else 'parcelas ' || array_to_string(v_numeros[1:cardinality(v_numeros) - 1], ', ')
                          || ' e ' || v_numeros[cardinality(v_numeros)] end;

  -- O que o sistema escreve vai em descricao (aparece nos relatórios); a
  -- observação fica só com o que a pessoa digitou.
  insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, valor_correcao,
                                   valor_multa, valor_juros, valor_acrescimo, forma_id, conta_financeira_id,
                                   observacao, descricao, memoria_calculo)
  values (v_parcela.id, v_data, (v_r ->> 'valor')::numeric, (v_r ->> 'valor_principal')::numeric,
          coalesce(nullif(v_r ->> 'valor_encargos', '')::numeric, 0), nullif(v_r ->> 'valor_correcao', '')::numeric,
          nullif(v_r ->> 'valor_multa', '')::numeric, nullif(v_r ->> 'valor_juros', '')::numeric,
          nullif(v_r ->> 'valor_acrescimo', '')::numeric, nullif(v_r ->> 'forma_id', '')::uuid,
          nullif(v_r ->> 'conta_financeira_id', '')::uuid,
          nullif(btrim(v_r ->> 'observacao'), ''),
          'Pagamento de R$ ' || translate(to_char(v_total, 'FM999,999,999,990.00'), ',.', '.,') || ' com R$ '
            || translate(to_char(v_excedente, 'FM999,999,999,990.00'), ',.', '.,') || ' antecipados (' || v_destinos || ')',
          case when jsonb_typeof(v_r -> 'memoria_calculo') = 'object' then v_r -> 'memoria_calculo' end)
  returning id, conta_financeira_id, forma_id into v_origem, v_conta, v_forma;

  for v_alvo in select e.i from jsonb_array_elements(v_plano) as e(i) loop
    insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, forma_id,
                                     conta_financeira_id, descricao, antecipacao_de)
    values ((v_alvo.i ->> 'parcela_id')::uuid, v_data, (v_alvo.i ->> 'valor')::numeric,
            (v_alvo.i ->> 'valor')::numeric, 0, v_forma, v_conta,
            'Antecipação: parte do pagamento de R$ ' || translate(to_char(v_total, 'FM999,999,999,990.00'), ',.', '.,')
              || ' ' || v_nome || ' em ' || to_char(v_data, 'DD/MM/YYYY'),
            v_origem);
  end loop;

  return jsonb_build_object('id', v_origem, 'total', v_total, 'antecipacoes', v_plano);
end
$$;

revoke execute on function public.receber_com_antecipacao(jsonb) from public, anon;
grant execute on function public.receber_com_antecipacao(jsonb) to authenticated;

-- A consulta de recebimentos ganha a origem da antecipação (coluna nova no fim).
create or replace view public.v_recebimentos with (security_invoker = true) as
select
  r.id, r.parcela_id, r.cliente_id, cl.nome as cliente_nome,
  r.tipo_avulsa, r.descricao, r.data, r.valor, r.valor_principal, r.valor_encargos,
  r.forma_id, f.nome as forma_nome, r.memoria_calculo, r.observacao,
  r.estornado_em, r.estornado_por, r.motivo_estorno,
  r.criado_em, r.criado_por,
  p.numero as parcela_numero, p.contrato_id, c.descricao as contrato_descricao,
  r.conta_financeira_id, cf.nome as conta_financeira_nome,
  r.valor_multa, r.valor_juros, r.valor_correcao, r.valor_acrescimo,
  r.valor_multa is not null as encargos_discriminados,
  c.responsavel_id as contrato_responsavel_id,
  -- Acordo: a parte do cliente, o honorário e o repasse (no máximo um ativo).
  r.valor_repasse,
  r.valor - r.valor_repasse as valor_escritorio,
  coalesce(p.cota_escritorio_pct, 100) as cota_escritorio_pct,
  rp.id as repasse_id,
  rp.data as repasse_data,
  rp.conta_financeira_id as repasse_conta_financeira_id,
  cfr.nome as repasse_conta_financeira_nome,
  case when r.estornado_em is not null then 'nao_se_aplica'
       when r.direto_ao_cliente then 'direto'
       when r.valor_repasse = 0 then 'nao_se_aplica'
       when rp.id is not null then 'feito'
       else 'pendente' end as repasse_situacao,
  c.codigo as contrato_codigo,
  p.parte as parcela_parte,
  -- Acordo pago em parte direto ao cliente: o que foi a ele, fora do caixa.
  r.valor_direto_cliente,
  r.direto_ao_cliente,
  p.cota_encargos_pct,
  -- Antecipação: o pagamento (da parcela quitada) de onde veio esta parte.
  r.antecipacao_de
from public.recebimentos r
left join public.clientes cl on cl.id = r.cliente_id
left join public.formas_pagamento f on f.id = r.forma_id
left join public.parcelas p on p.id = r.parcela_id
left join public.contratos c on c.id = p.contrato_id
left join public.contas_financeiras cf on cf.id = r.conta_financeira_id
left join public.repasses_cliente rp on rp.recebimento_id = r.id and rp.estornado_em is null
left join public.contas_financeiras cfr on cfr.id = rp.conta_financeira_id;

-- No extrato das contas, a parte antecipada vem marcada (as colunas não mudam).
create or replace view public.v_movimentacoes_financeiras with (security_invoker = true) as
select 'recebimento'::text as origem, r.id as origem_id, 'entrada'::text as direcao,
       r.conta_financeira_id, r.data, r.valor, r.estornado_em,
       coalesce(cl.nome, 'Entrada avulsa') || case when r.antecipacao_de is not null then ' · antecipação' else '' end as descricao,
       r.cliente_id, null::uuid as despesa_id
  from public.recebimentos r left join public.clientes cl on cl.id = r.cliente_id
union all
select 'pagamento', p.id, 'saida', p.conta_financeira_id, p.data, p.valor, p.estornado_em, c.descricao, null, c.id
  from public.pagamentos_despesa p join public.contas c on c.id = p.conta_id
 where p.pago_por_id is null
union all
select 'reembolso_socio', p.id, 'saida', p.reembolso_conta_financeira_id, p.reembolsado_em, p.valor, p.estornado_em,
       'Reembolso: ' || c.descricao, null, c.id
  from public.pagamentos_despesa p join public.contas c on c.id = p.conta_id
 where p.reembolsado_em is not null
union all
select 'transferencia', t.id, 'saida', t.origem_id, t.data, t.valor, t.estornado_em, t.justificativa, null, null
  from public.transferencias_financeiras t
union all
select 'transferencia', t.id, 'entrada', t.destino_id, t.data, t.valor, t.estornado_em, t.justificativa, null, null
  from public.transferencias_financeiras t
union all
-- A parte do cliente que saiu para ele: sai da conta, não é despesa.
select 'repasse_cliente', rp.id, 'saida', rp.conta_financeira_id, rp.data, rp.valor, rp.estornado_em,
       'Repasse a ' || coalesce(cl.nome, 'cliente'), r.cliente_id, null
  from public.repasses_cliente rp
  join public.recebimentos r on r.id = rp.recebimento_id
  left join public.clientes cl on cl.id = r.cliente_id;

-- Estorno: um alerta por pagamento, com o total; as partes antecipadas não repetem.
create or replace function privado.evento_estorno()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_valor numeric := new.valor;
begin
  if new.estornado_em is not null and old.estornado_em is null then
    -- Antecipação (22/10): um alerta só, o do pagamento, com o total; as
    -- partes antecipadas, estornadas junto com ele, não repetem o aviso.
    if tg_table_name = 'recebimentos' then
      if (to_jsonb(new) ->> 'antecipacao_de') is not null then
        return null;
      end if;
      select v_valor + coalesce(sum(r.valor), 0) into v_valor from public.recebimentos r where r.antecipacao_de = new.id;
    end if;
    perform privado.publicar_evento('estorno', 'financeiro', 'alerta',
      'Estorno de ' || privado.reais(v_valor),
      'Motivo: ' || coalesce(new.motivo_estorno, '—'),
      tg_table_name, new.id, tg_table_name || ':' || new.id || ':estorno', null);
  end if;
  return null;
end
$$;

-- -----------------------------------------------------------------------------
-- Documentos solicitados e entregues no processo
-- -----------------------------------------------------------------------------

create table public.processos_documentos (
  id                  uuid primary key default gen_random_uuid(),
  processo_id         uuid not null references public.processos (id),
  cliente_id          uuid references public.clientes (id),
  documento           text not null check (char_length(documento) between 1 and 200),
  movimento           text not null default 'solicitado' check (movimento in ('solicitado', 'entregue')),
  data                date not null,
  quem_recebeu        text check (quem_recebeu is null or char_length(quem_recebeu) between 1 and 200),
  retorno_previsto    date,
  retornou_em         date,
  observacoes         text check (observacoes is null or char_length(observacoes) <= 2000),
  cancelado_em        timestamptz,
  cancelado_por       uuid,
  motivo_cancelamento text,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid,
  constraint processos_documentos_datas check (
    (retorno_previsto is null or retorno_previsto >= data) and (retornou_em is null or retornou_em >= data))
);

comment on table public.processos_documentos is
  'Documento solicitado ou entregue num processo: quem recebeu, quando, o retorno previsto e o retorno de fato.';

create index processos_documentos_processo on public.processos_documentos (processo_id);
create index processos_documentos_aguardando on public.processos_documentos (retorno_previsto)
  where retornou_em is null and cancelado_em is null;

select privado.aplicar_padrao('public.processos_documentos');

create trigger b_cancelamento before update on public.processos_documentos
  for each row execute function privado.registrar_cancelamento();

-- O cliente vem do processo; textos sem espaço sobrando; datas com sentido.
create function privado.validar_documento_processo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.processo_id is distinct from old.processo_id then
    raise exception 'O documento fica no processo em que foi registrado.' using errcode = 'P0001';
  end if;
  select pr.cliente_id into new.cliente_id from public.processos pr where pr.id = new.processo_id;
  if not found then
    raise exception 'Processo não encontrado.' using errcode = 'P0001';
  end if;

  new.documento := btrim(coalesce(new.documento, ''));
  if new.documento = '' then
    raise exception 'Informe o documento.' using errcode = 'P0001';
  end if;
  if char_length(new.documento) > 200 then
    raise exception 'O nome do documento pode ter até 200 letras.' using errcode = 'P0001';
  end if;
  new.quem_recebeu := nullif(btrim(new.quem_recebeu), '');
  new.observacoes := nullif(btrim(new.observacoes), '');

  if (tg_op = 'INSERT' or new.data is distinct from old.data) and new.data > privado.hoje() then
    raise exception 'A data do documento não pode estar no futuro.' using errcode = 'P0001';
  end if;
  -- Ano digitado errado (0202, 20261): o navegador aceita, o banco não.
  if new.data < date '2000-01-01' then
    raise exception 'Confira o ano da data do documento.' using errcode = 'P0001';
  end if;
  if new.retorno_previsto > new.data + interval '20 years' then
    raise exception 'Confira o ano do prazo previsto para retorno.' using errcode = 'P0001';
  end if;
  if new.retorno_previsto < new.data then
    raise exception 'O retorno previsto não pode ser antes da data do registro.' using errcode = 'P0001';
  end if;
  if new.retornou_em < new.data then
    raise exception 'O retorno não pode ser antes da data do registro.' using errcode = 'P0001';
  end if;
  if new.retornou_em is not null and (tg_op = 'INSERT' or new.retornou_em is distinct from old.retornou_em)
     and new.retornou_em > privado.hoje() then
    raise exception 'A data do retorno não pode estar no futuro.' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create trigger c_validar before insert or update on public.processos_documentos
  for each row execute function privado.validar_documento_processo();

-- Como as atualizações: quem edita Clientes vê e grava.
alter table public.processos_documentos enable row level security;
create policy "processos_documentos: ver" on public.processos_documentos
  for select to authenticated using ((select privado.edita_clientes()));
create policy "processos_documentos: incluir" on public.processos_documentos
  for insert to authenticated with check ((select privado.edita_clientes()));
create policy "processos_documentos: alterar" on public.processos_documentos
  for update to authenticated
  using ((select privado.edita_clientes())) with check ((select privado.edita_clientes()));

revoke all on public.processos_documentos from anon, authenticated;
grant select on public.processos_documentos to authenticated;
grant insert (processo_id, documento, movimento, data, quem_recebeu, retorno_previsto, retornou_em, observacoes),
      update (documento, movimento, data, quem_recebeu, retorno_previsto, retornou_em, observacoes,
              cancelado_em, motivo_cancelamento)
  on public.processos_documentos to authenticated;
grant all on public.processos_documentos to service_role;

-- Com o processo e o cliente, para o aviso de Hoje.
create view public.v_processos_documentos with (security_invoker = true) as
select d.id, d.processo_id, d.cliente_id, d.documento, d.movimento, d.data, d.quem_recebeu,
       d.retorno_previsto, d.retornou_em, d.observacoes, d.cancelado_em, d.cancelado_por, d.motivo_cancelamento,
       d.criado_em, d.criado_por, d.alterado_em, d.alterado_por,
       pr.titulo as processo_titulo, pr.numero as processo_numero, cl.nome as cliente_nome
  from public.processos_documentos d
  join public.processos pr on pr.id = d.processo_id
  left join public.clientes cl on cl.id = d.cliente_id;

revoke all on public.v_processos_documentos from anon, authenticated;
grant select on public.v_processos_documentos to authenticated, service_role;

-- Histórico dos documentos do processo: quem edita Clientes.
create or replace function privado.pode_ver_auditoria(p_tabela text, p_registro uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  -- Compromisso particular: o histórico é só do dono — nem quem audita lê
  -- (antes, o atalho de quem audita vinha primeiro e passava por cima).
  if p_tabela = 'compromissos' and exists (
    select 1 from public.compromissos c
     where c.id = p_registro and c.particular
       and c.membro_id is distinct from privado.meu_membro_id()) then
    return false;
  end if;
  if privado.audita() then
    return true;
  end if;
  if not privado.eh_membro() then
    return false;
  end if;

  case
    -- Cadastro de cliente (CPF, e-mail, telefone) só para quem lê Clientes,
    -- como a própria tabela (red team de 11/10). Processos, tarefas e
    -- feriados seguem visíveis a todo membro, como as tabelas.
    when p_tabela = 'clientes' then
      return privado.le_clientes();
    when p_tabela in ('processos', 'tarefas', 'feriados') then
      return true;
    when p_tabela in ('clientes_detalhes', 'contatos', 'atualizacoes', 'clientes_contatos', 'processos_documentos') then
      return privado.edita_clientes();
    when p_tabela = 'documentos' then
      return privado.edita_clientes() or (privado.financeiro_le() and exists (
        select 1 from public.documentos d where d.id = p_registro and d.modelo = 'recibo'));
    when p_tabela in ('intimacoes', 'intimacoes_consultas', 'config_prazos', 'processos_nao_acompanhados') then
      return privado.gerencia_prazos();
    when p_tabela in ('contratos', 'parcelas', 'recebimentos', 'renegociacoes',
                      'contas', 'contas_recorrentes', 'cobrancas', 'categorias',
                      'formas_pagamento', 'config_financeiro', 'pagamentos_despesa',
                      'contas_financeiras', 'transferencias_financeiras', 'ajustes_financeiros',
                      'fornecedores', 'centros_custo', 'anexos', 'anexos_versoes',
                      'importacoes', 'exportacoes', 'repasses_cliente') then
      return privado.financeiro_le();
    when p_tabela in ('fechamentos', 'divisao_cotas', 'fechamentos_anuais', 'fechamentos_anuais_versoes') then
      return privado.acesso_financeiro() = 'completo';
    when p_tabela = 'config_agenda' then
      return privado.acesso_agenda() <> 'nenhum';
    when p_tabela in ('publicacoes', 'campanhas', 'site_deploys') then
      return privado.edita_site();
    when p_tabela = 'compromissos' then
      return privado.acesso_agenda() <> 'nenhum' and exists (
        select 1 from public.compromissos c
        where c.id = p_registro
          and (c.membro_id = privado.meu_membro_id() or not c.particular));
    else
      return false;
  end case;
end
$$;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
