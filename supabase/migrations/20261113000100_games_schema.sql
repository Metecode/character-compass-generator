-- Aşama 2: tahmin oyununun sunucu tarafı (şema, yetkiler, foto kovası).
--
-- Erişim modeli: tarayıcı tablolara ve dosyalara HİÇ doğrudan erişmez. Her işlem
-- bir Edge Function'dan geçer; fonksiyonlar secret anahtarla (service_role) çalışır.
-- Bu yüzden:
--   * Tüm tablolarda RLS açık ve hiçbir policy yok (anon/authenticated için her şey kapalı).
--   * anon, authenticated ve PUBLIC rollerinden her yetki açıkça geri alınır.
--   * Yalnızca service_role'a gereken yetkiler açıkça verilir.

-- ---------------------------------------------------------------------------
-- Tablolar
-- ---------------------------------------------------------------------------

create table public.games (
  -- Tahmin edilemez oyun kodu (sunucuda kriptografik rastgele üretilir).
  code text primary key
    constraint games_code_format check (code ~ '^[A-Za-z0-9]{12,64}$'),
  title text not null default ''
    constraint games_title_length check (char_length(title) <= 60),
  grid_size smallint not null
    constraint games_grid_size check (grid_size in (2, 3, 4)),
  -- [{ color, label? }] — 2x2/4x4'te 4 çeyrek, 3x3'te 3 bant.
  regions jsonb not null
    constraint games_regions_array check (jsonb_typeof(regions) = 'array'),
  -- [{ name, bullets: [], photo_id: uuid | null }] — satır satır, uzunluğu grid_size².
  cells jsonb not null
    constraint games_cells_array check (jsonb_typeof(cells) = 'array'),
  expires_at timestamptz not null,
  -- Silme anahtarının SHA-256 özeti (hex). Anahtarın kendisi saklanmaz.
  delete_token_hash text not null
    constraint games_delete_token_hash_format check (delete_token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  -- İzin verilen en uzun süre 72 saat (küçük saat kayması payıyla).
  constraint games_expiry_window check (
    expires_at > created_at and expires_at <= created_at + interval '72 hours 5 minutes'
  )
);

comment on table public.games is
  'Tahmin oyunu anlık görüntüsü. expires_at geçince her fonksiyonda yok sayılır, cleanup fiziksel olarak siler.';

create index games_expires_at_idx on public.games (expires_at);

create table public.game_photos (
  id uuid primary key,
  game_code text not null references public.games (code) on delete cascade,
  -- Kovadaki yol: {game_code}/{id}.jpg
  storage_path text not null unique
);

create index game_photos_game_code_idx on public.game_photos (game_code);

create table public.rate_limits (
  -- SHA-256(tuz + IP) + ':' + işlem adı. Ham IP hiçbir yerde saklanmaz.
  key text primary key,
  count integer not null default 1,
  window_start timestamptz not null default now()
);

comment on table public.rate_limits is
  'Sabit pencereli hız limiti sayaçları. 1 saatten eski satırlar her dakika silinir (bkz. zamanlama migration''ı).';

create index rate_limits_window_start_idx on public.rate_limits (window_start);

-- ---------------------------------------------------------------------------
-- RLS: açık, policy yok
-- ---------------------------------------------------------------------------

alter table public.games enable row level security;
alter table public.game_photos enable row level security;
alter table public.rate_limits enable row level security;

-- ---------------------------------------------------------------------------
-- Yetkiler: yalnızca service_role
-- ---------------------------------------------------------------------------

revoke all on table public.games, public.game_photos, public.rate_limits
  from public, anon, authenticated;

grant select, insert, update, delete on table public.games to service_role;
grant select, insert, delete on table public.game_photos to service_role;
grant select, insert, update, delete on table public.rate_limits to service_role;

-- ---------------------------------------------------------------------------
-- SQL fonksiyonları (yalnızca service_role çalıştırabilir)
-- ---------------------------------------------------------------------------

-- Sabit pencereli sayaç: tek atomik upsert. İstek limitin içindeyse true döner.
create function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'pencere 1 sn ile 1 saat arasında olmalı';
  end if;

  insert into public.rate_limits as r (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update set
    count = case
      when r.window_start <= now() - make_interval(secs => p_window_seconds) then 1
      else r.count + 1
    end,
    window_start = case
      when r.window_start <= now() - make_interval(secs => p_window_seconds) then now()
      else r.window_start
    end
  returning r.count into v_count;

  return v_count <= p_max;
end;
$$;

-- health için: hiçbir veri döndürmeden gerçek bir sorgu çalıştırır (proje
-- duraklamasın diye veritabanı etkinliği sayılsın).
create function public.ping()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.games limit 1;
end;
$$;

-- Fonksiyonlar varsayılan olarak PUBLIC'e açıktır; kapat, yalnızca service_role'a ver.
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.ping() from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.ping() to service_role;

-- ---------------------------------------------------------------------------
-- Foto kovası (private). Kovaya hiçbir storage policy verilmez: anon ve
-- authenticated okuyamaz/yazamaz; yalnızca secret anahtarlı fonksiyonlar erişir.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-photos', 'game-photos', false, 153600, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
