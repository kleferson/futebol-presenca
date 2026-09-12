-- Futebol Presença — Schema Supabase
-- Rode no SQL Editor do Supabase (na ordem).

-- 1) Tabelas
-- OBS: a coluna group_name guarda "Observações" (opcional, pode ser vazio).
-- Mantido o nome da coluna por compatibilidade com bancos já criados.
create table if not exists public.match_info (
  id uuid primary key default gen_random_uuid(),
  group_name text not null default '',
  date date not null,
  time time not null,
  location text not null default 'A definir',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.confirmations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.match_info(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- Evita nome duplicado no mesmo jogo (case-insensitive, sem espaços extras o app dá trim)
create unique index if not exists confirmations_match_name_unique
  on public.confirmations (match_id, lower(name));

create index if not exists confirmations_match_created_idx
  on public.confirmations (match_id, created_at);

-- 2) RLS
alter table public.match_info enable row level security;
alter table public.confirmations enable row level security;

-- Leitura pública
drop policy if exists "match_info leitura publica" on public.match_info;
create policy "match_info leitura publica"
  on public.match_info for select to anon, authenticated using (true);

drop policy if exists "confirmations leitura publica" on public.confirmations;
create policy "confirmations leitura publica"
  on public.confirmations for select to anon, authenticated using (true);

-- Qualquer visitante pode confirmar (insert). Sem update público.
drop policy if exists "confirmations insert publico" on public.confirmations;
create policy "confirmations insert publico"
  on public.confirmations for insert to anon, authenticated with check (char_length(trim(name)) between 2 and 40);

-- Só ADMIN logado pode criar/editar/remover jogos e remover confirmações
-- (multi-jogos: cada linha de match_info é uma página independente,
--  confirmations.match_id separa as presenças por jogo)
drop policy if exists "match_info update admin" on public.match_info;
create policy "match_info update admin"
  on public.match_info for update to authenticated using (true) with check (true);

drop policy if exists "match_info insert admin" on public.match_info;
create policy "match_info insert admin"
  on public.match_info for insert to authenticated with check (true);

drop policy if exists "confirmations delete admin" on public.confirmations;
create policy "confirmations delete admin"
  on public.confirmations for delete to authenticated using (true);

drop policy if exists "match_info delete admin" on public.match_info;
create policy "match_info delete admin"
  on public.match_info for delete to authenticated using (true);

-- Índice para listar vários jogos em ordem cronológica
create index if not exists match_info_date_time_idx
  on public.match_info (date, time);

-- 3) updated_at automático
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists match_info_updated_at on public.match_info;
create trigger match_info_updated_at
  before update on public.match_info
  for each row execute function public.handle_updated_at();

-- 4) Jogo inicial de exemplo (ajuste depois pelo painel ADMIN)
insert into public.match_info (group_name, date, time, location)
values ('', current_date + 7, '15:00', 'Quadra a definir')
on conflict do nothing;

-- 5) Realtime (lista atualiza sozinha em todos os aparelhos).
-- Pode rodar quantas vezes quiser (só adiciona se ainda não estiver).
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'confirmations') then
    alter publication supabase_realtime add table public.confirmations;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_info') then
    alter publication supabase_realtime add table public.match_info;
  end if;
end $$;

-- 6) MIGRAÇÃO (rode 1x se seu banco já existe com "Nome do grupo"):
-- Limpa o valor padrão antigo "Futebol da Galera" para observações vazias.
-- update public.match_info set group_name = ''
-- where trim(group_name) = 'Futebol da Galera';
-- alter table public.match_info alter column group_name set default '';
