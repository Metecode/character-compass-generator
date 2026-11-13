-- Aşama 3: tahmin oyununun oynanması (tahminler, ipuçları, bulanık fotoğraflar).
--
-- Erişim modeli Aşama 2 ile aynı: RLS açık, policy yok; anon/authenticated/PUBLIC
-- için her yetki geri alınır, yalnızca service_role'a gereken yetkiler verilir.
-- Tarayıcı bu tablolara hiç erişmez; her şey Edge Function'dan geçer.
--
-- Silme: guesses ve guess_hints, games satırına "on delete cascade" ile bağlı.
-- cleanup süresi dolan oyunun games satırını sildiğinde bunlar da silinir.
-- Bulanık dosyalar oyunun kovadaki klasöründe ({code}/...) durduğu için
-- deleteGameCompletely ve yetim klasör temizliği onları da kapsar.
--
-- Bu migration yalnızca ekleme yapar; Aşama 2'deki ön yüz ve fonksiyonlar etkilenmez.

-- ---------------------------------------------------------------------------
-- Bulanık foto yolu (ipucu). Boşsa o hücrede ipucu yok.
-- ---------------------------------------------------------------------------

alter table public.game_photos add column blur_path text unique;

-- ---------------------------------------------------------------------------
-- Tahminler
-- ---------------------------------------------------------------------------

create table public.guesses (
  id uuid primary key default gen_random_uuid(),
  game_code text not null references public.games (code) on delete cascade,
  -- SHA-256(kod | cihaz kimliği), hex. Cihaz kimliğinin kendisi saklanmaz.
  device_hash text not null
    constraint guesses_device_hash_format check (device_hash ~ '^[0-9a-f]{64}$'),
  player_name text not null
    constraint guesses_player_name_length check (char_length(player_name) between 1 and 20),
  -- Hücre başına seçilen isim; oynanmayan hücrede null. Uzunluğu grid_size².
  answers jsonb not null
    constraint guesses_answers_array check (jsonb_typeof(answers) = 'array'),
  -- İpucu açılan hücre indeksleri.
  hints jsonb not null default '[]'::jsonb
    constraint guesses_hints_array check (jsonb_typeof(hints) = 'array'),
  -- Puanın iki katı (yarım puanlar tamsayı kalsın diye).
  points2 integer not null constraint guesses_points2_range check (points2 between 0 and 32),
  created_at timestamptz not null default now(),
  constraint guesses_one_per_device unique (game_code, device_hash)
);

comment on table public.guesses is
  'Tahmin oyunu sonuçları. Oyunla birlikte silinir (cascade). Cihaz kimliği yalnızca özet olarak tutulur.';

-- Sıralama: puan azalan, eşitlikte önce gönderen.
create index guesses_ranking_idx on public.guesses (game_code, points2 desc, created_at asc);

-- ---------------------------------------------------------------------------
-- İpuçları (tahmin gönderilmeden önce açılır, bu yüzden ayrı tablo)
-- ---------------------------------------------------------------------------

create table public.guess_hints (
  game_code text not null references public.games (code) on delete cascade,
  device_hash text not null
    constraint guess_hints_device_hash_format check (device_hash ~ '^[0-9a-f]{64}$'),
  cell smallint not null constraint guess_hints_cell_range check (cell between 0 and 15),
  created_at timestamptz not null default now(),
  primary key (game_code, device_hash, cell)
);

comment on table public.guess_hints is
  'Cihaz başına açılan ipuçları; tahmin puanlanırken okunur. Oyunla birlikte silinir (cascade).';

-- ---------------------------------------------------------------------------
-- RLS ve yetkiler
-- ---------------------------------------------------------------------------

alter table public.guesses enable row level security;
alter table public.guess_hints enable row level security;

revoke all on table public.guesses, public.guess_hints from public, anon, authenticated;

grant select, insert, delete on table public.guesses to service_role;
grant select, insert, delete on table public.guess_hints to service_role;

-- ---------------------------------------------------------------------------
-- Tahmin kaydı: tek işlemde sınır ve tekil cihaz denetimi.
-- Oyun başına danışma kilidi, aynı anda gelen isteklerin 200 sınırını
-- aşmasını ya da aynı cihazın iki kez yazmasını önler.
-- Döner: 'ok' | 'duplicate' | 'full' | 'not_found'
-- ---------------------------------------------------------------------------

create function public.submit_guess(
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

  insert into public.guesses (game_code, device_hash, player_name, answers, hints, points2)
  values (p_code, p_device_hash, p_player_name, p_answers, p_hints, p_points2);
  return 'ok';
end;
$$;

revoke all on function public.submit_guess(text, text, text, jsonb, jsonb, integer, integer)
  from public, anon, authenticated;
grant execute on function public.submit_guess(text, text, text, jsonb, jsonb, integer, integer)
  to service_role;

-- Kova: bulanık dosyalar da image/jpeg ve 150 KB sınırının altında; ayar değişmez.
