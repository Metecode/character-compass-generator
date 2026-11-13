-- Aşama 4: canlı oda (şema, yetkiler, foto kovası, atomik işlemler).
--
-- Erişim modeli Aşama 2-3 ile aynı: RLS açık, policy yok; anon/authenticated/PUBLIC
-- için her yetki geri alınır, yalnızca service_role'a verilir. Tarayıcı yalnızca
-- Edge Function'ları çağırır (create-room, join-room, get-room-state, room-action,
-- room-admin). Canlı kanal (Realtime Broadcast) yalnızca içi boş "değişti" sinyali taşır.
--
-- Oyuncu kimliği: katılırken verilen oturum anahtarının SHA-256 özeti
-- (room_players.session_hash). Admin = oturumu rooms.admin_player_id ile eşleşen oyuncu.
-- Yazarlık (room_items.author_id) hiçbir istemciye gönderilmez.

-- ---------------------------------------------------------------------------
-- Tablolar
-- ---------------------------------------------------------------------------

create table public.rooms (
  code text primary key
    constraint rooms_code_format check (code ~ '^[A-Za-z0-9]{12,64}$'),
  -- Realtime konu adı: room-{channel_id}. Oda kodundan ayrı; yalnızca katılmış
  -- oyuncunun durum yanıtında döner.
  channel_id text not null unique
    constraint rooms_channel_format check (channel_id ~ '^[A-Za-z0-9]{22}$'),
  mode text not null
    constraint rooms_mode check (mode in ('classic', 'quick')),
  write_seconds smallint not null
    constraint rooms_write_seconds check (write_seconds in (120, 180, 300)),
  allow_profanity boolean not null default true,
  phase text not null default 'lobby'
    constraint rooms_phase check (phase in ('lobby', 'writing', 'reveal', 'done')),
  -- Katılmamış ziyaretçiye gösterilen kurucu adı (oda kurulurken yazılan ad).
  creator_name text not null
    constraint rooms_creator_name_length check (char_length(creator_name) between 1 and 20),
  admin_player_id uuid,
  grid_size smallint
    constraint rooms_grid_size check (grid_size in (2, 3, 4)),
  writing_ends_at timestamptz,
  reveal_index smallint,
  reveal_step text
    constraint rooms_reveal_step check (reveal_step in ('guess', 'shown')),
  -- Her durum değişikliğinde artar (istemci aynı sürümü yeniden çizmez).
  version integer not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  expires_at timestamptz not null,
  -- Oda en geç kuruluştan 2 saat sonra silinir (küçük saat kayması payıyla).
  constraint rooms_expiry_window check (
    expires_at > created_at and expires_at <= created_at + interval '2 hours 5 minutes'
  )
);

comment on table public.rooms is
  'Canlı oda. expires_at geçince her fonksiyonda yok sayılır, cleanup fiziksel olarak siler.';

create index rooms_expires_at_idx on public.rooms (expires_at);

create table public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references public.rooms (code) on delete cascade,
  -- "En eski oyuncu" sırası (admin devri).
  seq bigint generated always as identity,
  name text not null
    constraint room_players_name_length check (char_length(name) between 1 and 20),
  -- Türkçe küçük harfli ad (toLocaleLowerCase('tr'), fonksiyonda üretilir); oda içinde tekil.
  name_key text not null,
  photo_path text not null,
  -- Oda bitene kadar geçerli imzalı adres (tek sefer üretilir, tarayıcı önbelleği bozulmaz).
  photo_url text not null,
  session_hash text not null unique
    constraint room_players_session_hash_format check (session_hash ~ '^[0-9a-f]{64}$'),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ring_pos smallint,
  cell_index smallint,
  ready_at timestamptz,
  score smallint not null default 0,
  constraint room_players_name_unique unique (room_code, name_key)
);

create index room_players_room_code_idx on public.room_players (room_code, seq);

alter table public.rooms
  add constraint rooms_admin_player_fk foreign key (admin_player_id)
  references public.room_players (id) on delete set null;

create table public.room_items (
  id bigint generated always as identity primary key,
  room_code text not null references public.rooms (code) on delete cascade,
  author_id uuid not null references public.room_players (id) on delete cascade,
  target_id uuid not null references public.room_players (id) on delete cascade,
  slot smallint not null constraint room_items_slot check (slot between 0 and 2),
  text text not null default ''
    constraint room_items_text_length check (char_length(text) <= 40),
  hidden boolean not null default false,
  constraint room_items_unique unique (author_id, target_id, slot),
  constraint room_items_not_self check (author_id <> target_id)
);

create index room_items_room_code_idx on public.room_items (room_code);
create index room_items_target_idx on public.room_items (target_id);

create table public.room_guesses (
  room_code text not null references public.rooms (code) on delete cascade,
  cell_index smallint not null constraint room_guesses_cell check (cell_index between 0 and 15),
  player_id uuid not null references public.room_players (id) on delete cascade,
  guessed_id uuid not null references public.room_players (id) on delete cascade,
  correct boolean,
  created_at timestamptz not null default now(),
  primary key (room_code, cell_index, player_id)
);

-- ---------------------------------------------------------------------------
-- RLS: açık, policy yok
-- ---------------------------------------------------------------------------

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_items enable row level security;
alter table public.room_guesses enable row level security;

-- ---------------------------------------------------------------------------
-- Yetkiler: yalnızca service_role
-- ---------------------------------------------------------------------------

revoke all on table public.rooms, public.room_players, public.room_items, public.room_guesses
  from public, anon, authenticated;

grant select, insert, update, delete on table
  public.rooms, public.room_players, public.room_items, public.room_guesses
  to service_role;

-- ---------------------------------------------------------------------------
-- room_join: oda kilitlenir; lobi, kapasite, ad tekilliği ve sistem geneli oyuncu
-- tavanı tek işlemde denetlenir. Döner: { ok, player_id } ya da { ok:false, error }.
-- error: not_found | closed | full | name_taken | busy
-- ---------------------------------------------------------------------------

create function public.room_join(
  p_code text,
  p_name text,
  p_name_key text,
  p_photo_path text,
  p_photo_url text,
  p_session_hash text,
  p_max_players integer,
  p_max_active_players integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_count integer;
  v_active integer;
  v_id uuid;
begin
  select * into v_room from public.rooms
  where code = p_code and expires_at > now()
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_room.phase <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;

  select count(*) into v_count from public.room_players where room_code = p_code;
  if v_count >= p_max_players then
    return jsonb_build_object('ok', false, 'error', 'full');
  end if;

  if exists (select 1 from public.room_players where room_code = p_code and name_key = p_name_key) then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
  end if;

  -- Realtime bağlantı payı: süresi dolmamış, bitmemiş odalardaki toplam oyuncu.
  select count(*) into v_active
  from public.room_players p
  join public.rooms r on r.code = p.room_code
  where r.expires_at > now() and r.phase <> 'done';
  if v_active >= p_max_active_players then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;

  insert into public.room_players (room_code, name, name_key, photo_path, photo_url, session_hash)
  values (p_code, p_name, p_name_key, p_photo_path, p_photo_url, p_session_hash)
  returning id into v_id;

  -- İlk oyuncu (oda kuran) admin olur.
  update public.rooms
  set admin_player_id = coalesce(admin_player_id, v_id), version = version + 1
  where code = p_code;

  return jsonb_build_object('ok', true, 'player_id', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- room_remove_player: yalnızca lobide. p_by_admin verilirse (kick) çağıranın admin
-- olması ve kendini çıkarmaması gerekir. Admin çıkarsa admin en eski oyuncuya geçer.
-- Döner: { ok, photo_path, empty } ya da { ok:false, error }.
-- error: not_found | not_lobby | forbidden | no_player
-- ---------------------------------------------------------------------------

create function public.room_remove_player(p_code text, p_player_id uuid, p_by_admin uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_path text;
  v_next uuid;
begin
  select * into v_room from public.rooms
  where code = p_code and expires_at > now()
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_room.phase <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'not_lobby');
  end if;
  if p_by_admin is not null then
    if v_room.admin_player_id is distinct from p_by_admin or p_player_id = p_by_admin then
      return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;
  end if;

  delete from public.room_players
  where id = p_player_id and room_code = p_code
  returning photo_path into v_path;
  if v_path is null then
    return jsonb_build_object('ok', false, 'error', 'no_player');
  end if;

  if v_room.admin_player_id = p_player_id or v_room.admin_player_id is null then
    select id into v_next from public.room_players
    where room_code = p_code order by seq limit 1;
    update public.rooms set admin_player_id = v_next, version = version + 1 where code = p_code;
  else
    update public.rooms set version = version + 1 where code = p_code;
  end if;

  return jsonb_build_object(
    'ok', true,
    'photo_path', v_path,
    'empty', not exists (select 1 from public.room_players where room_code = p_code)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- room_handover_admin: admin p_timeout saniyedir görünmüyorsa ve oyun bitmediyse,
-- son p_online saniyede görünen en eski oyuncu admin olur. Döner: değişti mi?
-- ---------------------------------------------------------------------------

create function public.room_handover_admin(p_code text, p_timeout_seconds integer, p_online_seconds integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_admin_seen timestamptz;
  v_next uuid;
begin
  select * into v_room from public.rooms
  where code = p_code and expires_at > now()
  for update;
  if not found or v_room.phase = 'done' then
    return false;
  end if;

  select last_seen_at into v_admin_seen from public.room_players
  where id = v_room.admin_player_id;
  if v_admin_seen is not null and v_admin_seen > now() - make_interval(secs => p_timeout_seconds) then
    return false;
  end if;

  select id into v_next from public.room_players
  where room_code = p_code
    and id is distinct from v_room.admin_player_id
    and last_seen_at > now() - make_interval(secs => p_online_seconds)
  order by seq
  limit 1;
  if v_next is null then
    return false;
  end if;

  update public.rooms set admin_player_id = v_next, version = version + 1 where code = p_code;
  return true;
end;
$$;

revoke all on function public.room_join(text, text, text, text, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.room_remove_player(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.room_handover_admin(text, integer, integer) from public, anon, authenticated;
grant execute on function public.room_join(text, text, text, text, text, text, integer, integer) to service_role;
grant execute on function public.room_remove_player(text, uuid, uuid) to service_role;
grant execute on function public.room_handover_admin(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Oda foto kovası (private, policy yok). game-photos'tan ayrı: oradaki yetim
-- klasör taraması oda klasörlerini silmesin.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('room-photos', 'room-photos', false, 153600, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
