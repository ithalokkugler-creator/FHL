-- =============================================================================
-- FHL ADVOCACIA — ÁREA DOS ADVOGADOS
-- 10 · Documentos: texto final preservado, cancelamento motivado e auditoria
-- =============================================================================
--
-- preparacao-novas-funcoes.md, F3. O texto que foi entregue ao cliente fica
-- gravado como estava: não se edita (o GRANT de UPDATE só cobre o
-- cancelamento). Para corrigir, gera-se outro documento. Imprimir ou baixar
-- de novo registra outra geração, ligada à primeira em `dados`.

create table public.documentos (
  id             uuid primary key default gen_random_uuid(),
  modelo         text not null check (modelo in (
                   'procuracao', 'contrato_honorarios', 'hipossuficiencia', 'declaracao_endereco',
                   'declaracao_comparecimento', 'ficha_atendimento', 'renuncia', 'prestacao_contas',
                   'relatorio_atividades')),
  titulo         text not null check (btrim(titulo) <> ''),
  cliente_id     uuid not null references public.clientes (id),
  processo_id    uuid references public.processos (id),
  -- De onde vieram os dados, quando o documento nasce de outra tela.
  contrato_id    uuid references public.contratos (id),
  compromisso_id uuid references public.compromissos (id),
  -- Complementos da tela (objeto, valores, advogados escolhidos…).
  dados          jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object'),
  -- HTML já higienizado pela lista branca da tela (nucleo/higienizar.js).
  conteudo       text not null check (char_length(conteudo) between 1 and 400000),
  cancelado_em        timestamptz,
  cancelado_por       uuid,
  motivo_cancelamento text,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid
);

create index documentos_cliente on public.documentos (cliente_id, criado_em desc);
create index documentos_processo on public.documentos (processo_id);
create index documentos_contrato on public.documentos (contrato_id);
create index documentos_compromisso on public.documentos (compromisso_id);

select privado.aplicar_padrao('public.documentos');

create trigger b_cancelamento before update on public.documentos
  for each row execute function privado.registrar_cancelamento();

-- Processo, contrato e compromisso de origem precisam ser do mesmo cliente.
create function privado.validar_documento()
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

  return new;
end
$$;

create trigger c_validar before insert on public.documentos
  for each row execute function privado.validar_documento();

-- -----------------------------------------------------------------------------
-- Políticas e privilégios
-- -----------------------------------------------------------------------------
alter table public.documentos enable row level security;

create policy "documentos: ver" on public.documentos
  for select to authenticated using ((select privado.edita_clientes()));
create policy "documentos: incluir" on public.documentos
  for insert to authenticated with check ((select privado.edita_clientes()));
create policy "documentos: alterar" on public.documentos
  for update to authenticated
  using ((select privado.edita_clientes())) with check ((select privado.edita_clientes()));

revoke all on public.documentos from anon, authenticated;
grant select on public.documentos to authenticated;
grant insert (modelo, titulo, cliente_id, processo_id, contrato_id, compromisso_id, dados, conteudo),
  update (cancelado_em, motivo_cancelamento)
  on public.documentos to authenticated;
grant all on public.documentos to service_role;

revoke execute on function privado.validar_documento() from public, anon;
