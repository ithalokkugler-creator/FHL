-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 26 · Importação assistida da planilha financeira
-- =============================================================================
--
-- preparacao-financeiro-docx.md, T15 (R74 e §18 do DOCX).
--
-- A planilha oficial ainda não chegou. O sistema aceita um MODELO de
-- importação (uma linha por parcela ou por despesa, colunas documentadas na
-- tela) e não deduz regra nenhuma do nome do arquivo:
--
--   1. a tela lê o CSV/XLSX (sem executar fórmula nem seguir link) e manda as
--      linhas para a área de preparação, com o hash do arquivo;
--   2. o banco valida linha a linha, aponta divergências (soma das parcelas,
--      código repetido, data fora do período aberto) e os cadastros que já
--      existem (mesmo CPF/CNPJ = mesmo cliente);
--   3. linha de teste ou repetida é EXCLUÍDA à mão, com motivo — nunca some;
--   4. só lote sem erro é aprovado e carregado, inteiro, numa transação: se
--      a última linha falhar, nada entra. A chave de origem de cada contrato e
--      despesa impede carregar o mesmo dado duas vezes, mesmo em outro lote.
--
-- Gatilhos e permissões continuam valendo na carga: período fechado,
-- "nada se apaga", soma das parcelas, conta financeira ativa.

create table public.importacoes (
  id                  uuid primary key default gen_random_uuid(),
  nome_arquivo        text not null check (btrim(nome_arquivo) <> ''),
  sha256              text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  versao_parser       text not null,
  estado              text not null default 'rascunho' check (estado in ('rascunho', 'validada', 'carregada', 'cancelada')),
  totais              jsonb not null default '{}'::jsonb,
  validada_em         timestamptz,
  carregada_em        timestamptz,
  carregada_por       uuid,
  cancelado_em        timestamptz,
  cancelado_por       uuid,
  motivo_cancelamento text,
  criado_em           timestamptz not null default now(),
  criado_por          uuid,
  alterado_em         timestamptz,
  alterado_por        uuid
);
create index importacoes_sha on public.importacoes (sha256);
select privado.aplicar_padrao('public.importacoes');
create trigger b_cancelamento before update on public.importacoes
  for each row execute function privado.registrar_cancelamento();

-- Quem cancela só grava data e motivo; o estado acompanha.
create function privado.importacao_cancelada()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.cancelado_em is not null and old.cancelado_em is null then
    new.estado := 'cancelada';
  end if;
  return new;
end
$$;
create trigger c_estado_cancelada before update on public.importacoes
  for each row execute function privado.importacao_cancelada();

create table public.importacao_linhas (
  id            uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references public.importacoes (id),
  aba           text not null default '',
  linha         integer not null check (linha >= 1),
  tipo          text not null check (tipo in ('parcela', 'despesa')),
  -- As células como vieram, e o registro já normalizado pela tela.
  dados         jsonb not null,
  normalizado   jsonb not null,
  mensagens     jsonb not null default '[]'::jsonb,
  estado        text not null default 'pendente' check (estado in ('pendente', 'ok', 'aviso', 'erro', 'excluida')),
  motivo_exclusao text,
  -- Contrato (ou despesa) a que a linha pertence: a mesma chave em dois lotes
  -- aponta para o mesmo registro já carregado.
  chave_origem  text not null,
  registro_id   uuid,
  criado_em     timestamptz not null default now(),
  criado_por    uuid,
  alterado_em   timestamptz,
  alterado_por  uuid,
  unique (importacao_id, aba, linha)
);
create index importacao_linhas_importacao on public.importacao_linhas (importacao_id, estado);
select privado.aplicar_padrao('public.importacao_linhas');

create table public.importacao_vinculos (
  chave_origem  text primary key,
  tipo          text not null check (tipo in ('contrato', 'despesa')),
  registro_id   uuid not null,
  importacao_id uuid not null references public.importacoes (id),
  criado_em     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 1 · Área de preparação
-- -----------------------------------------------------------------------------
create function public.registrar_importacao(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id   uuid;
  v_ant  public.importacoes;
begin
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para importar no Financeiro.' using errcode = '42501';
  end if;
  if jsonb_typeof(p -> 'linhas') is distinct from 'array' or jsonb_array_length(p -> 'linhas') = 0 then
    raise exception 'O arquivo não tem linhas para importar.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p -> 'linhas') > 20000 then
    raise exception 'Arquivo grande demais para uma importação (máximo 20.000 linhas).' using errcode = 'P0001';
  end if;

  select * into v_ant from public.importacoes
   where sha256 = lower(p ->> 'sha256') and estado = 'carregada' limit 1;
  if found then
    raise exception 'Este mesmo arquivo já foi carregado em %.', to_char(v_ant.carregada_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
      using errcode = 'P0001';
  end if;

  insert into public.importacoes (nome_arquivo, sha256, versao_parser)
  values (left(p ->> 'nome_arquivo', 200), lower(p ->> 'sha256'), coalesce(p ->> 'versao_parser', '?'))
  returning id into v_id;

  insert into public.importacao_linhas (importacao_id, aba, linha, tipo, dados, normalizado, mensagens, chave_origem)
  select v_id, coalesce(l ->> 'aba', ''), (l ->> 'linha')::integer, l ->> 'tipo',
         coalesce(l -> 'dados', '{}'::jsonb), coalesce(l -> 'normalizado', '{}'::jsonb),
         coalesce(l -> 'mensagens', '[]'::jsonb), l ->> 'chave_origem'
    from jsonb_array_elements(p -> 'linhas') l;

  perform public.validar_importacao(v_id);
  return v_id;
end
$$;

-- -----------------------------------------------------------------------------
-- 2 · Validação (refaz a cada chamada; não grava nada fora da preparação)
-- -----------------------------------------------------------------------------
create function public.validar_importacao(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_imp    public.importacoes;
  l        record;
  v_msgs   jsonb;
  v_estado text;
  n        jsonb;
  v_totais jsonb;
  v_dif    record;
begin
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para importar no Financeiro.' using errcode = '42501';
  end if;
  select * into v_imp from public.importacoes where id = p_id for update;
  if not found or v_imp.estado in ('carregada', 'cancelada') then
    raise exception 'Importação não encontrada, já carregada ou cancelada.' using errcode = 'P0001';
  end if;

  for l in select * from public.importacao_linhas where importacao_id = p_id and estado <> 'excluida' loop
    n := l.normalizado;
    -- Mensagens da leitura do arquivo (na tela) + as do banco.
    v_msgs := coalesce((select jsonb_agg(m) from jsonb_array_elements(l.mensagens) m where m ->> 'origem' = 'arquivo'), '[]'::jsonb);

    if l.tipo = 'parcela' then
      if coalesce(btrim(n ->> 'cliente_nome'), '') = '' then
        v_msgs := v_msgs || jsonb_build_object('nivel', 'erro', 'texto', 'Sem nome do cliente.');
      end if;
      if n ->> 'documento' is not null and n ->> 'documento' !~ '^([0-9]{11}|[0-9A-Z]{12}[0-9]{2})$' then
        v_msgs := v_msgs || jsonb_build_object('nivel', 'erro', 'texto', 'CPF/CNPJ inválido.');
      end if;
      if coalesce(btrim(n ->> 'descricao'), '') = '' then
        v_msgs := v_msgs || jsonb_build_object('nivel', 'erro', 'texto', 'Sem descrição do contrato.');
      end if;
      if (n ->> 'vencimento') is null then
        v_msgs := v_msgs || jsonb_build_object('nivel', 'erro', 'texto', 'Sem vencimento.');
      end if;
      if coalesce((n ->> 'valor')::numeric, 0) <= 0 then
        v_msgs := v_msgs || jsonb_build_object('nivel', 'erro', 'texto', 'Valor da parcela ausente ou zero.');
      end if;
      if coalesce((n ->> 'valor_pago')::numeric, 0) > 0 and (n ->> 'data_pagamento') is null then
        v_msgs := v_msgs || jsonb_build_object('nivel', 'erro', 'texto', 'Há valor pago sem data de pagamento.');
      end if;
      if (n ->> 'data_pagamento')::date > privado.hoje() then
        v_msgs := v_msgs || jsonb_build_object('nivel', 'erro', 'texto', 'Data de pagamento no futuro.');
      end if;
      if n ->> 'codigo' is not null and exists (select 1 from public.contratos c where c.codigo = n ->> 'codigo')
         and not exists (select 1 from public.importacao_vinculos iv where iv.chave_origem = l.chave_origem) then
        v_msgs := v_msgs || jsonb_build_object('nivel', 'erro', 'texto', 'Já existe contrato com o código ' || (n ->> 'codigo') || '.');
      end if;
      if exists (select 1 from public.importacao_vinculos iv where iv.chave_origem = l.chave_origem) then
        v_msgs := v_msgs || jsonb_build_object('nivel', 'aviso', 'texto', 'Contrato já carregado antes: a linha será ignorada.');
      end if;
      if n ->> 'documento' is not null and exists (select 1 from public.clientes c where c.documento = n ->> 'documento') then
        v_msgs := v_msgs || jsonb_build_object('nivel', 'aviso', 'texto', 'Cliente já cadastrado (mesmo CPF/CNPJ): o contrato vai para ele.');
      end if;
      if (n ->> 'data_pagamento') is not null
         and exists (select 1 from public.fechamentos f where f.competencia = privado.inicio_mes((n ->> 'data_pagamento')::date) and f.fechado) then
        v_msgs := v_msgs || jsonb_build_object('nivel', 'erro', 'texto', 'Pagamento em mês fechado: reabra o mês ou corrija a data.');
      end if;
    else
      if coalesce(btrim(n ->> 'descricao'), '') = '' then
        v_msgs := v_msgs || jsonb_build_object('nivel', 'erro', 'texto', 'Sem descrição da despesa.');
      end if;
      if (n ->> 'vencimento') is null then
        v_msgs := v_msgs || jsonb_build_object('nivel', 'erro', 'texto', 'Sem vencimento.');
      end if;
      if coalesce((n ->> 'valor')::numeric, 0) <= 0 then
        v_msgs := v_msgs || jsonb_build_object('nivel', 'erro', 'texto', 'Valor da despesa ausente ou zero.');
      end if;
      if coalesce((n ->> 'valor_pago')::numeric, 0) > coalesce((n ->> 'valor')::numeric, 0) then
        v_msgs := v_msgs || jsonb_build_object('nivel', 'erro', 'texto', 'Pago maior que o valor da despesa.');
      end if;
      if coalesce((n ->> 'valor_pago')::numeric, 0) > 0 and (n ->> 'data_pagamento') is null then
        v_msgs := v_msgs || jsonb_build_object('nivel', 'erro', 'texto', 'Há valor pago sem data de pagamento.');
      end if;
      if n ->> 'categoria' is not null and not exists (select 1 from public.categorias c where lower(c.nome) = lower(n ->> 'categoria')) then
        v_msgs := v_msgs || jsonb_build_object('nivel', 'aviso', 'texto', 'Categoria desconhecida: vai como "Outros".');
      end if;
      if exists (select 1 from public.importacao_vinculos iv where iv.chave_origem = l.chave_origem) then
        v_msgs := v_msgs || jsonb_build_object('nivel', 'aviso', 'texto', 'Despesa já carregada antes: a linha será ignorada.');
      end if;
    end if;

    v_estado := case when exists (select 1 from jsonb_array_elements(v_msgs) m where m ->> 'nivel' = 'erro') then 'erro'
                     when jsonb_array_length(v_msgs) > 0 then 'aviso' else 'ok' end;
    update public.importacao_linhas set mensagens = v_msgs, estado = v_estado where id = l.id;
  end loop;

  -- Número de parcela repetido no mesmo contrato.
  update public.importacao_linhas x
     set estado = 'erro',
         mensagens = x.mensagens || jsonb_build_object('nivel', 'erro', 'texto', 'Número de parcela repetido neste contrato.')
   where x.importacao_id = p_id and x.tipo = 'parcela' and x.estado <> 'excluida' and x.normalizado ->> 'parcela' is not null
     and exists (select 1 from public.importacao_linhas y
                  where y.importacao_id = p_id and y.id <> x.id and y.estado <> 'excluida'
                    and y.chave_origem = x.chave_origem and y.normalizado ->> 'parcela' = x.normalizado ->> 'parcela');

  -- Por contrato: o total informado fecha com a soma das parcelas?
  for v_dif in
    select chave_origem, max((normalizado ->> 'valor_total')::numeric) as total, sum((normalizado ->> 'valor')::numeric) as soma
      from public.importacao_linhas
     where importacao_id = p_id and tipo = 'parcela' and estado <> 'excluida'
     group by chave_origem
    having max((normalizado ->> 'valor_total')::numeric) is not null
       and max((normalizado ->> 'valor_total')::numeric) <> sum((normalizado ->> 'valor')::numeric)
  loop
    update public.importacao_linhas
       set estado = 'erro',
           mensagens = mensagens || jsonb_build_object('nivel', 'erro', 'texto',
             'As parcelas deste contrato somam ' || privado.reais(v_dif.soma) || ', mas o total informado é ' || privado.reais(v_dif.total) || '.')
     where importacao_id = p_id and chave_origem = v_dif.chave_origem and estado <> 'excluida';
  end loop;

  select jsonb_build_object(
           'linhas', count(*),
           'ok', count(*) filter (where estado = 'ok'),
           'avisos', count(*) filter (where estado = 'aviso'),
           'erros', count(*) filter (where estado = 'erro'),
           'excluidas', count(*) filter (where estado = 'excluida'),
           'contratos', count(distinct chave_origem) filter (where tipo = 'parcela' and estado <> 'excluida'),
           'despesas', count(*) filter (where tipo = 'despesa' and estado <> 'excluida'),
           'valor_parcelas', coalesce(sum((normalizado ->> 'valor')::numeric) filter (where tipo = 'parcela' and estado <> 'excluida'), 0),
           'valor_recebido', coalesce(sum((normalizado ->> 'valor_pago')::numeric) filter (where tipo = 'parcela' and estado <> 'excluida'), 0),
           'valor_despesas', coalesce(sum((normalizado ->> 'valor')::numeric) filter (where tipo = 'despesa' and estado <> 'excluida'), 0))
    into v_totais
    from public.importacao_linhas where importacao_id = p_id;

  update public.importacoes
     set totais = v_totais,
         estado = case when (v_totais ->> 'erros')::int = 0 and ((v_totais ->> 'linhas')::int - (v_totais ->> 'excluidas')::int) > 0
                       then 'validada' else 'rascunho' end,
         validada_em = now()
   where id = p_id;
  return v_totais;
end
$$;

create function public.excluir_linha_importacao(p_linha uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_imp uuid;
begin
  if not privado.financeiro_lanca() then
    raise exception 'Sem permissão para importar no Financeiro.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo (ex.: registro de teste, linha repetida).' using errcode = 'P0001';
  end if;
  update public.importacao_linhas l
     set estado = 'excluida', motivo_exclusao = btrim(p_motivo)
    from public.importacoes i
   where l.id = p_linha and i.id = l.importacao_id and i.estado in ('rascunho', 'validada')
  returning l.importacao_id into v_imp;
  if v_imp is null then
    raise exception 'Linha não encontrada ou importação já carregada.' using errcode = 'P0001';
  end if;
  perform public.validar_importacao(v_imp);
end
$$;

-- -----------------------------------------------------------------------------
-- 3 · Aprovar e carregar — tudo numa transação
-- -----------------------------------------------------------------------------
create function public.carregar_importacao(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_imp      public.importacoes;
  v_totais   jsonb;
  g          record;
  l          record;
  v_cliente  uuid;
  v_contrato uuid;
  v_cod      text;
  v_cod_ano  smallint;
  v_cod_num  integer;
  v_parcela  uuid;
  v_conta    uuid;
  v_categ    uuid;
  v_outros   uuid;
  v_num      integer;
  v_pago     numeric;
  v_contratos integer := 0;
  v_despesas integer := 0;
  v_recebimentos integer := 0;
  v_pagamentos integer := 0;
begin
  if not privado.financeiro_completo() then
    raise exception 'Só o Financeiro completo aprova e carrega uma importação.' using errcode = '42501';
  end if;

  v_totais := public.validar_importacao(p_id);
  select * into v_imp from public.importacoes where id = p_id for update;
  if v_imp.estado <> 'validada' then
    raise exception 'A importação tem erros (%). Corrija ou exclua as linhas antes de carregar.', v_totais ->> 'erros'
      using errcode = 'P0001';
  end if;
  select id into v_outros from public.categorias where nome = 'Outros';

  -- Contratos: um grupo por chave de origem.
  for g in
    select chave_origem, min(linha) as primeira
      from public.importacao_linhas
     where importacao_id = p_id and tipo = 'parcela' and estado in ('ok', 'aviso')
       and not exists (select 1 from public.importacao_vinculos iv where iv.chave_origem = importacao_linhas.chave_origem)
     group by chave_origem
     order by min(linha)
  loop
    select normalizado as n into l from public.importacao_linhas
     where importacao_id = p_id and chave_origem = g.chave_origem and linha = g.primeira and estado <> 'excluida' limit 1;

    v_cliente := null;
    if l.n ->> 'documento' is not null then
      select id into v_cliente from public.clientes where documento = l.n ->> 'documento';
    end if;
    if v_cliente is null then
      insert into public.clientes (nome, documento, telefone, email, observacoes)
      values (btrim(l.n ->> 'cliente_nome'), l.n ->> 'documento', l.n ->> 'telefone', l.n ->> 'email',
              'Importado da planilha ' || v_imp.nome_arquivo)
      returning id into v_cliente;
    end if;

    -- Código legado aceito fica como veio, fora da sequência nova.
    if l.n ->> 'codigo' is not null then
      v_cod := l.n ->> 'codigo';
      v_cod_ano := null;
      v_cod_num := null;
    else
      select a.codigo, a.ano, a.numero into v_cod, v_cod_ano, v_cod_num
        from privado.alocar_codigo(coalesce((l.n ->> 'data_contrato')::date, privado.hoje())) a;
    end if;

    insert into public.contratos (cliente_id, processo, descricao, tipo_honorario, valor_total, responsavel_id,
                                  observacoes, codigo, ano_codigo, numero_codigo, data_contrato, data_contrato_origem)
    select v_cliente, l.n ->> 'processo', btrim(l.n ->> 'descricao'), 'fixo',
           (select sum((x.normalizado ->> 'valor')::numeric) from public.importacao_linhas x
             where x.importacao_id = p_id and x.chave_origem = g.chave_origem and x.estado in ('ok', 'aviso')),
           null, 'Importado da planilha ' || v_imp.nome_arquivo || ' (lote ' || p_id || ')',
           v_cod, v_cod_ano, v_cod_num,
           (l.n ->> 'data_contrato')::date,
           case when l.n ->> 'data_contrato' is null then 'a_confirmar' else 'informada' end
    returning id into v_contrato;
    v_contratos := v_contratos + 1;

    v_num := 0;
    for l in
      select * from public.importacao_linhas
       where importacao_id = p_id and chave_origem = g.chave_origem and estado in ('ok', 'aviso')
       order by (normalizado ->> 'vencimento')::date, linha
    loop
      v_num := coalesce((l.normalizado ->> 'parcela')::integer, v_num + 1);
      insert into public.parcelas (contrato_id, numero, vencimento, valor)
      values (v_contrato, v_num, (l.normalizado ->> 'vencimento')::date, (l.normalizado ->> 'valor')::numeric)
      returning id into v_parcela;

      v_pago := coalesce((l.normalizado ->> 'valor_pago')::numeric, 0);
      if v_pago > 0 then
        insert into public.recebimentos (parcela_id, data, valor, valor_principal, valor_encargos, observacao)
        values (v_parcela, (l.normalizado ->> 'data_pagamento')::date, v_pago,
                least(v_pago, (l.normalizado ->> 'valor')::numeric),
                greatest(v_pago - (l.normalizado ->> 'valor')::numeric, 0),
                'Importado (linha ' || l.linha || ')');
        v_recebimentos := v_recebimentos + 1;
      end if;
      update public.importacao_linhas set registro_id = v_parcela where id = l.id;
    end loop;

    insert into public.importacao_vinculos (chave_origem, tipo, registro_id, importacao_id)
    values (g.chave_origem, 'contrato', v_contrato, p_id);
  end loop;

  -- Despesas.
  for l in
    select * from public.importacao_linhas
     where importacao_id = p_id and tipo = 'despesa' and estado in ('ok', 'aviso')
       and not exists (select 1 from public.importacao_vinculos iv where iv.chave_origem = importacao_linhas.chave_origem)
     order by linha
  loop
    select id into v_categ from public.categorias where lower(nome) = lower(l.normalizado ->> 'categoria');
    insert into public.contas (descricao, categoria_id, valor, vencimento, competencia, competencia_manual, tipo, observacao)
    values (btrim(l.normalizado ->> 'descricao'), coalesce(v_categ, v_outros), (l.normalizado ->> 'valor')::numeric,
            (l.normalizado ->> 'vencimento')::date,
            privado.inicio_mes(coalesce((l.normalizado ->> 'competencia')::date, (l.normalizado ->> 'vencimento')::date)),
            l.normalizado ->> 'competencia' is not null,
            coalesce(l.normalizado ->> 'tipo_despesa', 'variavel'),
            'Importado da planilha ' || v_imp.nome_arquivo)
    returning id into v_conta;
    v_despesas := v_despesas + 1;

    v_pago := coalesce((l.normalizado ->> 'valor_pago')::numeric, 0);
    if v_pago > 0 then
      insert into public.pagamentos_despesa (conta_id, valor, data, origem, observacao)
      values (v_conta, v_pago, (l.normalizado ->> 'data_pagamento')::date, 'importacao', 'Importado (linha ' || l.linha || ')');
      v_pagamentos := v_pagamentos + 1;
    end if;
    update public.importacao_linhas set registro_id = v_conta where id = l.id;
    insert into public.importacao_vinculos (chave_origem, tipo, registro_id, importacao_id)
    values (l.chave_origem, 'despesa', v_conta, p_id);
  end loop;

  update public.importacoes
     set estado = 'carregada', carregada_em = now(), carregada_por = privado.meu_membro_id(),
         totais = totais || jsonb_build_object('carregados', jsonb_build_object(
           'contratos', v_contratos, 'despesas', v_despesas, 'recebimentos', v_recebimentos, 'pagamentos', v_pagamentos))
   where id = p_id;

  return jsonb_build_object('contratos', v_contratos, 'despesas', v_despesas,
                            'recebimentos', v_recebimentos, 'pagamentos', v_pagamentos);
end
$$;

-- -----------------------------------------------------------------------------
-- Políticas e privilégios: tudo se escreve pelas funções
-- -----------------------------------------------------------------------------
alter table public.importacoes enable row level security;
alter table public.importacao_linhas enable row level security;
alter table public.importacao_vinculos enable row level security;

create policy "importacoes: ver" on public.importacoes
  for select to authenticated using ((select privado.financeiro_lanca()) or (select privado.audita()));
create policy "importacoes: alterar" on public.importacoes
  for update to authenticated
  using ((select privado.financeiro_lanca()) and estado in ('rascunho', 'validada'))
  with check ((select privado.financeiro_lanca()));
create policy "importacao_linhas: ver" on public.importacao_linhas
  for select to authenticated using ((select privado.financeiro_lanca()) or (select privado.audita()));
create policy "importacao_vinculos: ver" on public.importacao_vinculos
  for select to authenticated using ((select privado.financeiro_lanca()) or (select privado.audita()));

revoke all on public.importacoes, public.importacao_linhas, public.importacao_vinculos from anon, authenticated;
grant select on public.importacoes, public.importacao_linhas, public.importacao_vinculos to authenticated;
grant update (cancelado_em, motivo_cancelamento) on public.importacoes to authenticated;
grant all on public.importacoes, public.importacao_linhas, public.importacao_vinculos to service_role;

revoke execute on function public.registrar_importacao(jsonb), public.validar_importacao(uuid),
  public.excluir_linha_importacao(uuid, text), public.carregar_importacao(uuid) from public, anon;
grant execute on function public.registrar_importacao(jsonb), public.validar_importacao(uuid),
  public.excluir_linha_importacao(uuid, text), public.carregar_importacao(uuid) to authenticated;
revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
