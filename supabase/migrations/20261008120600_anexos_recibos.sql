-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 23 · Anexos privados com versões, e recibo individual do recebimento
-- =============================================================================
--
-- preparacao-financeiro-docx.md, T07 (R25, R33, R42, R44, R45, R53, R71).
--
--   · Balde PRIVADO `anexos`, separado do balde público `site`. Ninguém lê um
--     arquivo por endereço adivinhado: o download é por link assinado, de
--     curta duração, e só sai para quem pode ver o registro de destino.
--   · Cada anexo se liga a UM destino com chave estrangeira de verdade —
--     cliente, contrato, renegociação, recebimento, despesa ou pagamento.
--     Anexo de cliente segue Clientes; os demais, o Financeiro.
--   · Fluxo: reservar (o banco cria a versão e o caminho opaco) → enviar o
--     arquivo para esse caminho → a função de borda `finalizar-anexo` baixa
--     com a chave do servidor, confere tamanho, tipo real (assinatura dos
--     bytes) e calcula o SHA-256 → só então a versão vale. O navegador não
--     declara tamanho, tipo nem hash. Envio interrompido fica "reservado",
--     nunca vira anexo válido.
--   · Versão nova é objeto novo: a anterior não é sobrescrita (sem upsert,
--     sem política de UPDATE no balde).
--   · Recibo: modelo `recibo` em Documentos, ligado ao recebimento. O texto
--     final fica gravado como foi emitido; um estorno posterior não o altera
--     (a tela mostra que o recebimento foi estornado).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos', 'anexos', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create table public.anexos (
  id                   uuid primary key default gen_random_uuid(),
  categoria            text not null check (categoria in (
                         'contrato', 'aditivo', 'comprovante', 'procuracao', 'documento_pessoal',
                         'contrato_social', 'recibo', 'nota_fiscal', 'outro')),
  descricao            text not null check (btrim(descricao) <> ''),
  cliente_id           uuid references public.clientes (id),
  contrato_id          uuid references public.contratos (id),
  renegociacao_id      uuid references public.renegociacoes (id),
  recebimento_id       uuid references public.recebimentos (id),
  conta_id             uuid references public.contas (id),
  pagamento_despesa_id uuid references public.pagamentos_despesa (id),
  versao_atual         integer not null default 0,
  cancelado_em         timestamptz,
  cancelado_por        uuid,
  motivo_cancelamento  text,
  criado_em            timestamptz not null default now(),
  criado_por           uuid,
  alterado_em          timestamptz,
  alterado_por         uuid,
  constraint anexo_um_destino check (
    num_nonnulls(cliente_id, contrato_id, renegociacao_id, recebimento_id, conta_id, pagamento_despesa_id) = 1)
);

create index anexos_cliente on public.anexos (cliente_id);
create index anexos_contrato on public.anexos (contrato_id);
create index anexos_renegociacao on public.anexos (renegociacao_id);
create index anexos_recebimento on public.anexos (recebimento_id);
create index anexos_conta on public.anexos (conta_id);
create index anexos_pagamento on public.anexos (pagamento_despesa_id);
select privado.aplicar_padrao('public.anexos');
create trigger b_cancelamento before update on public.anexos
  for each row execute function privado.registrar_cancelamento();

create table public.anexos_versoes (
  id             uuid primary key default gen_random_uuid(),
  anexo_id       uuid not null references public.anexos (id),
  versao         integer not null check (versao >= 1),
  -- Caminho no balde: só ids opacos, nunca nome, CPF ou telefone.
  objeto         text not null unique,
  nome_original  text not null check (char_length(nome_original) between 1 and 200),
  mime           text,
  tamanho        bigint check (tamanho > 0),
  sha256         text check (sha256 ~ '^[0-9a-f]{64}$'),
  estado         text not null default 'reservado' check (estado in ('reservado', 'verificado', 'recusado')),
  verificado_em  timestamptz,
  motivo_recusa  text,
  criado_em      timestamptz not null default now(),
  criado_por     uuid,
  alterado_em    timestamptz,
  alterado_por   uuid,
  unique (anexo_id, versao),
  constraint versao_verificada check (estado <> 'verificado' or (mime is not null and tamanho is not null and sha256 is not null))
);
select privado.aplicar_padrao('public.anexos_versoes');

-- Versão verificada não muda nunca mais.
create function privado.proteger_versao()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.estado <> 'reservado' then
    raise exception 'Versão de anexo já finalizada não muda. Envie uma nova versão.' using errcode = 'P0001';
  end if;
  if (new.anexo_id, new.versao, new.objeto, new.nome_original) is distinct from
     (old.anexo_id, old.versao, old.objeto, old.nome_original) then
    raise exception 'A reserva do anexo não muda.' using errcode = 'P0001';
  end if;
  return new;
end
$$;
create trigger b_proteger before update on public.anexos_versoes
  for each row execute function privado.proteger_versao();

-- Quem pode gravar no destino do anexo.
create function privado.pode_gravar_anexo(p jsonb)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p ->> 'cliente_id' is not null then
    return privado.edita_clientes() and exists (select 1 from public.clientes where id = (p ->> 'cliente_id')::uuid);
  end if;
  if not privado.financeiro_lanca() then
    return false;
  end if;
  return case
    when p ->> 'contrato_id' is not null then exists (select 1 from public.contratos where id = (p ->> 'contrato_id')::uuid)
    when p ->> 'renegociacao_id' is not null then exists (select 1 from public.renegociacoes where id = (p ->> 'renegociacao_id')::uuid)
    when p ->> 'recebimento_id' is not null then exists (select 1 from public.recebimentos where id = (p ->> 'recebimento_id')::uuid)
    when p ->> 'conta_id' is not null then exists (select 1 from public.contas where id = (p ->> 'conta_id')::uuid)
    when p ->> 'pagamento_despesa_id' is not null then exists (select 1 from public.pagamentos_despesa where id = (p ->> 'pagamento_despesa_id')::uuid)
    else false
  end;
end
$$;

-- Reserva uma versão (de um anexo novo ou de um existente) e devolve o
-- caminho onde o arquivo deve ser enviado.
create function public.reservar_anexo(p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_anexo  public.anexos;
  v_destino jsonb;
  v_versao integer;
  v_id     uuid := gen_random_uuid();
  v_nome   text := left(regexp_replace(coalesce(p ->> 'nome_original', ''), '^.*[\\/]', ''), 200);
begin
  if btrim(v_nome) = '' then
    raise exception 'Informe o arquivo.' using errcode = 'P0001';
  end if;

  if nullif(p ->> 'anexo_id', '') is not null then
    select * into v_anexo from public.anexos where id = (p ->> 'anexo_id')::uuid for update;
    if not found or v_anexo.cancelado_em is not null then
      raise exception 'Anexo não encontrado ou cancelado.' using errcode = 'P0001';
    end if;
    v_destino := jsonb_strip_nulls(jsonb_build_object(
      'cliente_id', v_anexo.cliente_id, 'contrato_id', v_anexo.contrato_id, 'renegociacao_id', v_anexo.renegociacao_id,
      'recebimento_id', v_anexo.recebimento_id, 'conta_id', v_anexo.conta_id,
      'pagamento_despesa_id', v_anexo.pagamento_despesa_id));
    if not privado.pode_gravar_anexo(v_destino) then
      raise exception 'Seu acesso não permite anexar arquivos aqui.' using errcode = '42501';
    end if;
  else
    v_destino := jsonb_strip_nulls(jsonb_build_object(
      'cliente_id', nullif(p ->> 'cliente_id', ''), 'contrato_id', nullif(p ->> 'contrato_id', ''),
      'renegociacao_id', nullif(p ->> 'renegociacao_id', ''), 'recebimento_id', nullif(p ->> 'recebimento_id', ''),
      'conta_id', nullif(p ->> 'conta_id', ''), 'pagamento_despesa_id', nullif(p ->> 'pagamento_despesa_id', '')));
    if (select count(*) from jsonb_object_keys(v_destino)) <> 1 then
      raise exception 'O anexo precisa de um destino só.' using errcode = 'P0001';
    end if;
    if not privado.pode_gravar_anexo(v_destino) then
      raise exception 'Seu acesso não permite anexar arquivos aqui.' using errcode = '42501';
    end if;
    insert into public.anexos (categoria, descricao, cliente_id, contrato_id, renegociacao_id, recebimento_id,
                               conta_id, pagamento_despesa_id)
    values (coalesce(nullif(p ->> 'categoria', ''), 'outro'), coalesce(nullif(btrim(p ->> 'descricao'), ''), v_nome),
            (v_destino ->> 'cliente_id')::uuid, (v_destino ->> 'contrato_id')::uuid,
            (v_destino ->> 'renegociacao_id')::uuid, (v_destino ->> 'recebimento_id')::uuid,
            (v_destino ->> 'conta_id')::uuid, (v_destino ->> 'pagamento_despesa_id')::uuid)
    returning * into v_anexo;
  end if;

  select coalesce(max(v.versao), 0) + 1 into v_versao from public.anexos_versoes v where v.anexo_id = v_anexo.id;
  insert into public.anexos_versoes (id, anexo_id, versao, objeto, nome_original)
  values (v_id, v_anexo.id, v_versao, v_anexo.id || '/' || v_id, v_nome);

  return jsonb_build_object('anexo_id', v_anexo.id, 'versao_id', v_id, 'versao', v_versao,
                            'balde', 'anexos', 'objeto', v_anexo.id || '/' || v_id);
end
$$;

-- Só a função de borda, com a chave do servidor, finaliza: ela leu o
-- arquivo de verdade. O navegador não chega aqui.
create function public.finalizar_anexo_servico(p_versao uuid, p_aprovado boolean, p_mime text, p_tamanho bigint,
                                               p_sha256 text, p_motivo text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.anexos_versoes;
begin
  if coalesce((select auth.jwt()) ->> 'role', '') <> 'service_role' then
    raise exception 'Só o servidor finaliza anexos.' using errcode = '42501';
  end if;
  select * into v from public.anexos_versoes where id = p_versao for update;
  if not found or v.estado <> 'reservado' then
    raise exception 'Reserva de anexo não encontrada ou já finalizada.' using errcode = 'P0001';
  end if;
  if p_aprovado then
    update public.anexos_versoes
       set estado = 'verificado', mime = p_mime, tamanho = p_tamanho, sha256 = lower(p_sha256), verificado_em = now()
     where id = p_versao;
    update public.anexos set versao_atual = greatest(versao_atual, v.versao) where id = v.anexo_id;
  else
    update public.anexos_versoes
       set estado = 'recusado', motivo_recusa = coalesce(p_motivo, 'Arquivo recusado na verificação.')
     where id = p_versao;
  end if;
end
$$;

create view public.v_anexos with (security_invoker = true) as
select a.id, a.categoria, a.descricao, a.cliente_id, a.contrato_id, a.renegociacao_id, a.recebimento_id,
       a.conta_id, a.pagamento_despesa_id, a.versao_atual, a.cancelado_em, a.motivo_cancelamento,
       a.criado_em, a.criado_por,
       v.id as versao_id, v.objeto, v.nome_original, v.mime, v.tamanho, v.sha256, v.verificado_em,
       v.criado_por as versao_criada_por, v.criado_em as versao_criada_em
  from public.anexos a
  left join public.anexos_versoes v on v.anexo_id = a.id and v.versao = a.versao_atual;

-- -----------------------------------------------------------------------------
-- Políticas: tabela e balde seguem o destino do anexo
-- -----------------------------------------------------------------------------
alter table public.anexos enable row level security;
alter table public.anexos_versoes enable row level security;

create policy "anexos: ver" on public.anexos
  for select to authenticated
  using (case when cliente_id is not null then (select privado.edita_clientes())
              else (select privado.financeiro_le()) end
         or (select privado.audita()));
create policy "anexos: alterar" on public.anexos
  for update to authenticated
  using (case when cliente_id is not null then (select privado.edita_clientes())
              else (select privado.financeiro_lanca()) end)
  with check (case when cliente_id is not null then (select privado.edita_clientes())
                   else (select privado.financeiro_lanca()) end);

create policy "anexos_versoes: ver" on public.anexos_versoes
  for select to authenticated
  using (exists (select 1 from public.anexos a where a.id = anexo_id));

create policy "anexos: enviar arquivo reservado" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'anexos' and exists (
    select 1 from public.anexos_versoes v
     where v.objeto = name and v.estado = 'reservado' and v.criado_por = (select privado.meu_membro_id())));
create policy "anexos: ler arquivo verificado" on storage.objects
  for select to authenticated
  using (bucket_id = 'anexos' and exists (
    select 1 from public.anexos_versoes v
      join public.anexos a on a.id = v.anexo_id
     where v.objeto = name and v.estado = 'verificado' and a.cancelado_em is null));

revoke all on public.anexos, public.anexos_versoes, public.v_anexos from anon, authenticated;
grant select on public.anexos, public.anexos_versoes, public.v_anexos to authenticated;
grant update (descricao, categoria, cancelado_em, motivo_cancelamento) on public.anexos to authenticated;
grant all on public.anexos, public.anexos_versoes, public.v_anexos to service_role;

revoke execute on function public.reservar_anexo(jsonb),
  public.finalizar_anexo_servico(uuid, boolean, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.reservar_anexo(jsonb) to authenticated;
grant execute on function public.finalizar_anexo_servico(uuid, boolean, text, bigint, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- Recibo individual em Documentos
-- -----------------------------------------------------------------------------
alter table public.documentos drop constraint documentos_modelo_check;
alter table public.documentos add constraint documentos_modelo_check check (modelo in (
  'procuracao', 'contrato_honorarios', 'hipossuficiencia', 'declaracao_endereco',
  'declaracao_comparecimento', 'ficha_atendimento', 'renuncia', 'prestacao_contas',
  'relatorio_atividades', 'recibo'));
alter table public.documentos
  add column recebimento_id uuid references public.recebimentos (id),
  add constraint documento_recibo check ((modelo = 'recibo') = (recebimento_id is not null));
create index documentos_recebimento on public.documentos (recebimento_id);

create or replace function privado.validar_documento()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.processo_id is not null and not exists (
    select 1 from public.processos where id = new.processo_id and cliente_id = new.cliente_id
  ) then
    raise exception 'O processo não pertence a este cliente.' using errcode = 'P0001';
  end if;

  if new.contrato_id is not null and not exists (
    select 1 from public.contratos where id = new.contrato_id and cliente_id = new.cliente_id
  ) then
    raise exception 'O contrato não pertence a este cliente.' using errcode = 'P0001';
  end if;

  if new.compromisso_id is not null and not exists (
    select 1 from public.compromissos where id = new.compromisso_id and cliente_id = new.cliente_id
  ) then
    raise exception 'O compromisso não pertence a este cliente.' using errcode = 'P0001';
  end if;

  if new.recebimento_id is not null and not exists (
    select 1 from public.recebimentos where id = new.recebimento_id and cliente_id = new.cliente_id
  ) then
    raise exception 'O recebimento não pertence a este cliente.' using errcode = 'P0001';
  end if;

  return new;
end
$$;

-- Recibo é documento do Financeiro: quem lança emite, quem consulta lê —
-- sem precisar do acesso a Clientes.
drop policy "documentos: ver" on public.documentos;
drop policy "documentos: incluir" on public.documentos;
drop policy "documentos: alterar" on public.documentos;
create policy "documentos: ver" on public.documentos
  for select to authenticated
  using ((modelo <> 'recibo' and (select privado.edita_clientes())) or (modelo = 'recibo' and (select privado.financeiro_le())));
create policy "documentos: incluir" on public.documentos
  for insert to authenticated
  with check ((modelo <> 'recibo' and (select privado.edita_clientes())) or (modelo = 'recibo' and (select privado.financeiro_lanca())));
create policy "documentos: alterar" on public.documentos
  for update to authenticated
  using ((modelo <> 'recibo' and (select privado.edita_clientes())) or (modelo = 'recibo' and (select privado.financeiro_lanca())))
  with check ((modelo <> 'recibo' and (select privado.edita_clientes())) or (modelo = 'recibo' and (select privado.financeiro_lanca())));

grant insert (recebimento_id) on public.documentos to authenticated;

revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to service_role;
grant execute on function privado.pode_gravar_anexo(jsonb) to authenticated;
