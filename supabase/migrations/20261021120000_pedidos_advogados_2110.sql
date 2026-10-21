-- =============================================================================
-- FONSECA LISBOA ADVOCACIA — ÁREA DOS ADVOGADOS
-- 38 · Pedidos dos advogados de 21/10: filiação em mãe e pai, e processos que
--      o escritório não acompanha
-- =============================================================================
--
-- Pedidos no grupo do escritório (21/10/2026):
--
--   · Guilherme: "na filiação, é possível inserir 2 espaços, para a filiação
--     materna e filiação paterna". Até aqui era um texto só ("MÃE / PAI").
--     Ganham colunas próprias. O texto antigo NÃO é dividido aqui: nos 11
--     cadastros com barra, a ordem não é sempre mãe / pai (conferido pelo
--     formato dos nomes, sem ler os dados). Fica em `filiacao`, e a tela de
--     cadastro mostra o texto antigo com os botões para separar — quem
--     escolhe a ordem é quem conhece o cliente. Os documentos usam mãe e pai
--     quando há; senão, o texto antigo, como antes.
--
--   · Vinícius: "como o Marlon saiu, as intimações dele vêm para nós também".
--     A busca no DJEN já não usa a OAB do Marlon (desativado em Membros). Elas
--     chegam porque a procuração desses processos tem também Vinícius,
--     Guilherme ou Juliana — e o DJEN intima todos os advogados constituídos.
--     Tirar pelo nome do Marlon esconderia processos que são do escritório
--     (em 21/10: 47 das 92 intimações tinham o Marlon; 19 delas em processos
--     cadastrados aqui). Por isso a escolha é por PROCESSO: "não acompanhar"
--     (com motivo, quem e quando). As pendentes daquele número são arquivadas
--     na hora, e as que chegarem depois entram já arquivadas — continuam
--     guardadas, como prova de que chegaram. "Voltar a acompanhar" cancela a
--     marcação com motivo; o que já foi arquivado continua em Arquivadas.

-- -----------------------------------------------------------------------------
-- Filiação: mãe e pai
-- -----------------------------------------------------------------------------

alter table public.clientes_detalhes
  add column filiacao_mae text check (char_length(filiacao_mae) <= 300),
  add column filiacao_pai text check (char_length(filiacao_pai) <= 300);

comment on column public.clientes_detalhes.filiacao is
  'Filiação num texto só, como era até 21/10/2026. Sai quando mãe ou pai são preenchidos (o valor fica na auditoria).';
comment on column public.clientes_detalhes.filiacao_mae is 'Filiação materna (nome da mãe).';
comment on column public.clientes_detalhes.filiacao_pai is 'Filiação paterna (nome do pai).';

grant insert (filiacao_mae, filiacao_pai), update (filiacao_mae, filiacao_pai)
  on public.clientes_detalhes to authenticated;

-- salvar_cliente grava mãe e pai.
create or replace function public.salvar_cliente(p jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id    uuid;
  v_det   jsonb;
  v_campo text;
  v_etiq  text[];
begin
  if not privado.eh_membro() then
    raise exception 'Seu acesso não permite cadastrar clientes.' using errcode = '42501';
  end if;
  if p ? 'detalhes' and not privado.edita_clientes() then
    raise exception 'Seu acesso não permite editar o cadastro completo.' using errcode = '42501';
  end if;
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'Cadastro inválido.' using errcode = '22023';
  end if;
  if p ? 'detalhes' and jsonb_typeof(p -> 'detalhes') is distinct from 'object' then
    raise exception 'Dados completos inválidos.' using errcode = '22023';
  end if;
  foreach v_campo in array array['id', 'nome', 'documento', 'telefone', 'email', 'observacoes'] loop
    if p ? v_campo and jsonb_typeof(p -> v_campo) not in ('string', 'null') then
      raise exception 'Campo de cadastro inválido: %.', v_campo using errcode = '22023';
    end if;
  end loop;

  v_id := nullif(btrim(p ->> 'id'), '')::uuid;
  if v_id is null then
    insert into public.clientes (nome, documento, telefone, email, observacoes)
    values (btrim(p ->> 'nome'),
            nullif(btrim(p ->> 'documento'), ''),
            nullif(btrim(p ->> 'telefone'), ''),
            nullif(lower(btrim(p ->> 'email')), ''),
            nullif(btrim(p ->> 'observacoes'), ''))
    returning id into v_id;
  else
    update public.clientes
       set nome = btrim(p ->> 'nome'),
           documento = nullif(btrim(p ->> 'documento'), ''),
           telefone = nullif(btrim(p ->> 'telefone'), ''),
           email = nullif(lower(btrim(p ->> 'email')), ''),
           observacoes = nullif(btrim(p ->> 'observacoes'), '')
     where id = v_id;
    if not found then
      raise exception 'Cliente não encontrado.' using errcode = 'P0001';
    end if;
  end if;

  if p ? 'detalhes' then
    v_det := p -> 'detalhes';
    if v_det ? 'etiquetas' and jsonb_typeof(v_det -> 'etiquetas') not in ('array', 'null') then
      raise exception 'Campo de cadastro inválido: etiquetas.' using errcode = '22023';
    end if;
    v_etiq := array(select jsonb_array_elements_text(coalesce(nullif(v_det -> 'etiquetas', 'null'::jsonb), '[]'::jsonb)));
    foreach v_campo in array array[
      'tipo_pessoa', 'flexao', 'rg', 'nascimento', 'nacionalidade', 'estado_civil', 'profissao', 'filiacao',
      'filiacao_mae', 'filiacao_pai', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf',
      'recado_nome', 'recado_relacao', 'recado_telefone', 'recado_observacao',
      'representante_nome', 'representante_documento', 'representante_relacao', 'representante_qualificacao',
      'banco', 'agencia', 'conta', 'pix', 'responsavel_id', 'nome_fantasia'
    ] loop
      if v_det ? v_campo and jsonb_typeof(v_det -> v_campo) not in ('string', 'null') then
        raise exception 'Campo de cadastro inválido: %.', v_campo using errcode = '22023';
      end if;
      v_det := jsonb_set(v_det, array[v_campo], coalesce(to_jsonb(nullif(btrim(v_det ->> v_campo), '')), 'null'::jsonb));
    end loop;

    insert into public.clientes_detalhes (
      cliente_id, tipo_pessoa, flexao, rg, nascimento, nacionalidade, estado_civil, profissao, filiacao,
      filiacao_mae, filiacao_pai, cep, logradouro, numero, complemento, bairro, cidade, uf,
      recado_nome, recado_relacao, recado_telefone, recado_observacao,
      representante_nome, representante_documento, representante_relacao, representante_qualificacao,
      banco, agencia, conta, pix, responsavel_id, nome_fantasia, etiquetas)
    values (
      v_id, coalesce(v_det ->> 'tipo_pessoa', 'fisica'), v_det ->> 'flexao', v_det ->> 'rg', (v_det ->> 'nascimento')::date,
      v_det ->> 'nacionalidade', v_det ->> 'estado_civil', v_det ->> 'profissao', v_det ->> 'filiacao',
      v_det ->> 'filiacao_mae', v_det ->> 'filiacao_pai', v_det ->> 'cep', v_det ->> 'logradouro', v_det ->> 'numero', v_det ->> 'complemento', v_det ->> 'bairro',
      v_det ->> 'cidade', v_det ->> 'uf',
      v_det ->> 'recado_nome', v_det ->> 'recado_relacao', v_det ->> 'recado_telefone', v_det ->> 'recado_observacao',
      v_det ->> 'representante_nome', v_det ->> 'representante_documento', v_det ->> 'representante_relacao',
      v_det ->> 'representante_qualificacao',
      v_det ->> 'banco', v_det ->> 'agencia', v_det ->> 'conta', v_det ->> 'pix', (v_det ->> 'responsavel_id')::uuid,
      v_det ->> 'nome_fantasia', v_etiq)
    on conflict (cliente_id) do update set
      tipo_pessoa = excluded.tipo_pessoa, flexao = excluded.flexao, rg = excluded.rg,
      nascimento = excluded.nascimento, nacionalidade = excluded.nacionalidade,
      estado_civil = excluded.estado_civil, profissao = excluded.profissao, filiacao = excluded.filiacao,
      -- Tela aberta antes de 21/10 não manda mãe e pai: não apaga o que há.
      -- (Pelo pedido original: o laço acima cria em v_det a chave de todo campo.)
      filiacao_mae = case when (p -> 'detalhes') ? 'filiacao_mae' then excluded.filiacao_mae else public.clientes_detalhes.filiacao_mae end,
      filiacao_pai = case when (p -> 'detalhes') ? 'filiacao_pai' then excluded.filiacao_pai else public.clientes_detalhes.filiacao_pai end,
      cep = excluded.cep, logradouro = excluded.logradouro, numero = excluded.numero,
      complemento = excluded.complemento, bairro = excluded.bairro, cidade = excluded.cidade, uf = excluded.uf,
      recado_nome = excluded.recado_nome, recado_relacao = excluded.recado_relacao,
      recado_telefone = excluded.recado_telefone, recado_observacao = excluded.recado_observacao,
      representante_nome = excluded.representante_nome, representante_documento = excluded.representante_documento,
      representante_relacao = excluded.representante_relacao,
      representante_qualificacao = excluded.representante_qualificacao,
      banco = excluded.banco, agencia = excluded.agencia, conta = excluded.conta, pix = excluded.pix,
      responsavel_id = excluded.responsavel_id,
      nome_fantasia = case when v_det ? 'nome_fantasia' then excluded.nome_fantasia else public.clientes_detalhes.nome_fantasia end,
      etiquetas = case when v_det ? 'etiquetas' then excluded.etiquetas else public.clientes_detalhes.etiquetas end;
  end if;

  return v_id;
end
$$;

-- -----------------------------------------------------------------------------
-- Processos que o escritório não acompanha
-- -----------------------------------------------------------------------------

create table public.processos_nao_acompanhados (
  id                  uuid primary key default gen_random_uuid(),
  numero              text not null check (numero ~ '^[0-9]{20}$'),
  motivo              text not null check (char_length(btrim(motivo)) between 3 and 1000),
  cancelado_em        timestamptz,
  cancelado_por       uuid,
  motivo_cancelamento text,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,
  alterado_em  timestamptz,
  alterado_por uuid
);

-- Uma marcação ativa por número; depois de "voltar a acompanhar", pode marcar de novo.
create unique index processos_nao_acompanhados_numero
  on public.processos_nao_acompanhados (numero) where cancelado_em is null;

select privado.aplicar_padrao('public.processos_nao_acompanhados');

create trigger b_cancelamento before update on public.processos_nao_acompanhados
  for each row execute function privado.registrar_cancelamento();

alter table public.processos_nao_acompanhados enable row level security;
create policy "processos_nao_acompanhados: ver" on public.processos_nao_acompanhados
  for select to authenticated using ((select privado.gerencia_prazos()));
create policy "processos_nao_acompanhados: alterar" on public.processos_nao_acompanhados
  for update to authenticated
  using ((select privado.gerencia_prazos())) with check ((select privado.gerencia_prazos()));

-- Marcar só pela função (que arquiva as pendentes junto); desmarcar é cancelar.
revoke all on public.processos_nao_acompanhados from anon, authenticated;
grant select on public.processos_nao_acompanhados to authenticated;
grant update (cancelado_em, motivo_cancelamento) on public.processos_nao_acompanhados to authenticated;
grant all on public.processos_nao_acompanhados to service_role;

create function public.nao_acompanhar_processo(p_numero text, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_num    text := regexp_replace(coalesce(p_numero, ''), '[^0-9]', '', 'g');
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_id     uuid;
  v_qtd    integer;
begin
  if not privado.gerencia_prazos() then
    raise exception 'Seu acesso não inclui as intimações.' using errcode = '42501';
  end if;
  if v_num !~ '^[0-9]{20}$' then
    raise exception 'Só dá para deixar de acompanhar um processo com número CNJ.' using errcode = 'P0001';
  end if;
  if char_length(v_motivo) < 3 then
    raise exception 'Informe o motivo (ex.: o Marlon está cuidando deste processo).' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.processos_nao_acompanhados where numero = v_num and cancelado_em is null) then
    raise exception 'Este processo já está na lista dos que o escritório não acompanha.' using errcode = 'P0001';
  end if;

  insert into public.processos_nao_acompanhados (numero, motivo)
  values (v_num, left(v_motivo, 1000))
  returning id into v_id;

  -- As pendentes deste número saem da conferência; o teor fica guardado.
  update public.intimacoes
     set situacao = 'arquivada',
         observacoes = concat_ws(E'\n', nullif(btrim(observacoes), ''),
                                 'Arquivada: processo que o escritório não acompanha — ' || left(v_motivo, 1000))
   where numero_processo = v_num
     and situacao = 'pendente';
  get diagnostics v_qtd = row_count;

  return jsonb_build_object('id', v_id, 'arquivadas', v_qtd);
end
$$;

revoke execute on function public.nao_acompanhar_processo(text, text) from public, anon;
grant execute on function public.nao_acompanhar_processo(text, text) to authenticated;

-- A importação do DJEN arquiva na chegada o que é de processo não acompanhado.
create or replace function public.importar_intimacoes(p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_servico boolean := coalesce((select auth.jwt()) ->> 'role', '') = 'service_role';
  v_item    jsonb;
  v_ids     uuid[];
  v_proc    uuid;
  v_cli     uuid;
  v_membro  uuid;
  v_num     text;
  v_link    text;
  v_disp    date;
  v_pub     date;
  v_total   integer := 0;
  v_novas   integer := 0;
  v_qtd     integer;
  v_consulta uuid;
  v_motivo  text;
  v_arquivadas integer := 0;
begin
  if not (privado.gerencia_prazos() or v_servico) then
    raise exception 'Seu acesso não inclui as intimações.' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p -> 'itens', '[]'::jsonb)) > 5000 then
    raise exception 'Resultado grande demais para uma importação. Busque um período menor.' using errcode = 'P0001';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p -> 'itens', '[]'::jsonb)) loop
    v_total := v_total + 1;
    v_proc := null;
    v_cli := null;
    v_num := nullif(regexp_replace(coalesce(v_item ->> 'numero_processo', ''), '[^0-9]', '', 'g'), '');
    if v_num !~ '^[0-9]{20}$' then
      v_num := null;
    end if;
    v_link := case when v_item ->> 'link' ~ '^https?://[^[:space:]]+$' then v_item ->> 'link' end;
    v_disp := (v_item ->> 'disponibilizada_em')::date;
    v_pub := nullif(v_item ->> 'publicada_em', '')::date;
    if v_pub < v_disp then
      v_pub := null;
    end if;

    -- Liga ao processo pelo número — só quando há exatamente um.
    if v_num is not null then
      select array_agg(pr.id) into v_ids from public.processos pr where pr.numero = v_num;
      if cardinality(v_ids) = 1 then
        v_proc := v_ids[1];
        select pr.cliente_id into v_cli from public.processos pr where pr.id = v_proc;
      end if;
    end if;

    -- Processo que o escritório não acompanha (ex.: o Marlon levou o
    -- cliente): a comunicação entra, para constar, mas já arquivada.
    v_motivo := null;
    if v_num is not null then
      select n.motivo into v_motivo from public.processos_nao_acompanhados n
       where n.numero = v_num and n.cancelado_em is null;
    end if;

    v_membro := nullif(v_item ->> 'membro_id', '')::uuid;
    if v_membro is not null and not exists (select 1 from public.membros where id = v_membro and ativo) then
      v_membro := null;
    end if;

    insert into public.intimacoes (
      djen_id, djen_hash, fonte, disponibilizada_em, publicada_em, tribunal, orgao,
      tipo_comunicacao, tipo_documento, classe, numero_processo, texto, link,
      destinatarios, advogados, membro_id, processo_id, cliente_id, situacao, observacoes)
    values (
      (v_item ->> 'djen_id')::bigint, left(v_item ->> 'djen_hash', 200), 'djen', v_disp, v_pub,
      left(v_item ->> 'tribunal', 100), left(v_item ->> 'orgao', 300), left(v_item ->> 'tipo_comunicacao', 100),
      left(v_item ->> 'tipo_documento', 100), left(v_item ->> 'classe', 200), v_num,
      coalesce(nullif(left(btrim(v_item ->> 'texto'), 400000), ''), '(comunicação sem teor no DJEN)'), v_link,
      case when jsonb_typeof(v_item -> 'destinatarios') = 'array' then v_item -> 'destinatarios' else '[]'::jsonb end,
      case when jsonb_typeof(v_item -> 'advogados') = 'array' then v_item -> 'advogados' else '[]'::jsonb end,
      v_membro, v_proc, v_cli,
      -- Comunicação cancelada no DJEN entra já arquivada, para constar.
      case when (v_item ->> 'ativo')::boolean is false or v_motivo is not null then 'arquivada' else 'pendente' end,
      case when (v_item ->> 'ativo')::boolean is false then 'Cancelada no DJEN.'
           when v_motivo is not null then 'Arquivada na chegada: processo que o escritório não acompanha — ' || v_motivo end)
    on conflict (djen_id) do nothing;

    get diagnostics v_qtd = row_count;
    v_novas := v_novas + v_qtd;
    if v_motivo is not null then
      v_arquivadas := v_arquivadas + v_qtd;
    end if;
  end loop;

  insert into public.intimacoes_consultas (de, ate, oabs, encontradas, novas, situacao, detalhe, automatica)
  values ((p -> 'consulta' ->> 'de')::date, (p -> 'consulta' ->> 'ate')::date,
          array(select jsonb_array_elements_text(coalesce(p -> 'consulta' -> 'oabs', '[]'::jsonb))),
          v_total, v_novas, coalesce(p -> 'consulta' ->> 'situacao', 'ok'),
          nullif(left(p -> 'consulta' ->> 'detalhe', 1000), ''),
          v_servico or coalesce((p -> 'consulta' ->> 'automatica')::boolean, false))
  returning id into v_consulta;

  return jsonb_build_object('encontradas', v_total, 'novas', v_novas, 'arquivadas', v_arquivadas, 'consulta_id', v_consulta);
end
$$;

revoke execute on function public.importar_intimacoes(jsonb) from public, anon;
grant execute on function public.importar_intimacoes(jsonb) to authenticated, service_role;

-- Histórico da marcação: quem lê as intimações.
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
    when p_tabela in ('clientes_detalhes', 'contatos', 'atualizacoes', 'clientes_contatos') then
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
