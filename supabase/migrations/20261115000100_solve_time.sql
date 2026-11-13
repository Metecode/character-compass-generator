-- Tahmin oyunu: çözme süresi.
--
-- Ekleyici: mevcut tahminler korunur (süreleri boş kalır, eşitlikte en alta düşer).
-- Erişim modeli aynı: RLS açık, policy yok, yalnızca service_role'a GRANT.
--
-- Silme: guess_starts, games satırına cascade ile bağlı; cleanup oyunu sildiğinde
-- başlangıç kayıtları da silinir.

-- ---------------------------------------------------------------------------
-- Başlangıç zamanları (oyuncu adını girip oyuna başladığında, cihaz başına bir kez)
-- ---------------------------------------------------------------------------

create table public.guess_starts (
  game_code text not null references public.games (code) on delete cascade,
  device_hash text not null
    constraint guess_starts_device_hash_format check (device_hash ~ '^[0-9a-f]{64}$'),
  started_at timestamptz not null default now(),
  primary key (game_code, device_hash)
);

comment on table public.guess_starts is
  'Cihaz başına oyuna başlama zamanı; çözme süresi bundan hesaplanır. Oyunla birlikte silinir (cascade).';

alter table public.guess_starts enable row level security;
revoke all on table public.guess_starts from public, anon, authenticated;
grant select, insert, delete on table public.guess_starts to service_role;

-- ---------------------------------------------------------------------------
-- Tahminlerde süre (saniye). Başlangıç kaydı yoksa boş.
-- ---------------------------------------------------------------------------

alter table public.guesses add column duration_seconds integer
  constraint guesses_duration_seconds_range check (duration_seconds is null or duration_seconds >= 0);

-- Sıralama: puan azalan, süre artan (boş en sonda), önce gönderen.
create index guesses_ranking_time_idx
  on public.guesses (game_code, points2 desc, duration_seconds asc nulls last, created_at asc);
drop index if exists public.guesses_ranking_idx;

-- ---------------------------------------------------------------------------
-- Başlangıcı yaz: yalnızca ilk seferde (yenileme sıfırlamaz). Oyun canlı değilse
-- yazılmaz. Döner: başlangıç zamanı ya da oyun yoksa null.
-- ---------------------------------------------------------------------------

create function public.start_guess(p_code text, p_device_hash text)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_started timestamptz;
begin
  if not exists (select 1 from public.games where code = p_code and expires_at > now()) then
    return null;
  end if;

  insert into public.guess_starts (game_code, device_hash)
  values (p_code, p_device_hash)
  on conflict (game_code, device_hash) do nothing;

  select started_at into v_started
  from public.guess_starts
  where game_code = p_code and device_hash = p_device_hash;
  return v_started;
end;
$$;

revoke all on function public.start_guess(text, text) from public, anon, authenticated;
grant execute on function public.start_guess(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- submit_guess: aynı imza, süre sunucu saatiyle hesaplanır (gönderim - başlangıç).
-- İmza değişmediği için mevcut submit-guess fonksiyonu da çalışmaya devam eder.
-- ---------------------------------------------------------------------------

create or replace function public.submit_guess(
  p_code text,
  p_device_hash text,
  p_player_name text,
  p_answers jsonb,
  p_hints jsonb,
  p_points2 integer,
  p_max integer
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
  v_started timestamptz;
  v_duration integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('guess:' || p_code, 0));

  if not exists (select 1 from public.games where code = p_code and expires_at > now()) then
    return 'not_found';
  end if;

  if exists (
    select 1 from public.guesses where game_code = p_code and device_hash = p_device_hash
  ) then
    return 'duplicate';
  end if;

  select count(*) into v_count from public.guesses where game_code = p_code;
  if v_count >= p_max then
    return 'full';
  end if;

  select started_at into v_started
  from public.guess_starts
  where game_code = p_code and device_hash = p_device_hash;
  if v_started is not null then
    v_duration := greatest(0, floor(extract(epoch from (now() - v_started)))::integer);
  end if;

  insert into public.guesses (game_code, device_hash, player_name, answers, hints, points2, duration_seconds)
  values (p_code, p_device_hash, p_player_name, p_answers, p_hints, p_points2, v_duration);
  return 'ok';
end;
$$;
