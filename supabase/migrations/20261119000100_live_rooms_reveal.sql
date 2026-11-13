-- Aşama 4 / C: açılış (tahmin → göster), madde gizleme, skor, BITTI ve 30 dk sonra silinme.
--
-- Erişim modeli aynı: fonksiyonlar security invoker, yalnızca service_role çalıştırabilir.
-- Aşama ve adım geçişleri ile tahminler oda satırını özel kilitler (tahmin sürümü artırır;
-- paylaşımlı kilit + update eşzamanlı tahminlerde kilitlenirdi). "Aç" puanları hesaplarken araya tahmin giremez.
--
-- Açılış sırası: oyunculara rastgele hücre verilir (room_players.cell_index); hücreler
-- küçükten büyüğe açılır. rooms.reveal_index = kaçıncı oyuncunun hücresinde olunduğu
-- (0 tabanlı), rooms.reveal_step = 'guess' (maddeler açık, tahmin alınıyor) | 'shown'
-- (foto ve isim açık, puanlar verildi).
--
-- Maddeler istemciye kimlikleriyle gitmez: sıralı kimlik halka sırasını, o da yazarlığı
-- ele verirdi. Bunun yerine hücre içinde rastgele bir sıra (room_items.ord) atanır;
-- admin gizlerken (hücre, ord) çiftini gönderir.
--
-- Tahmin kuralı: bir hücreye madde yazmakla görevli olan oyuncu (boş bırakmış olsa da)
-- o hücrede tahmin yapamaz; cevabı biliyor. Hedefin kendisi tahmin edebilir.
-- Hücre başına tahmin edebilecek kişi (oyuncu − hücreye yazan) p_min_guessers'tan azsa
-- (Klasik + 4 oyuncu) oda TAHMİNSİZ oynanır: rooms.guessing = false, başlatılırken yazılır.
-- Tahminsiz odada her hücre doğrudan açılır, puan yok.
-- Son hücre: tahminli odada da tahmin adımı yoktur (tek aday kalır), doğrudan açılır.

alter table public.room_items
  add column ord smallint;

alter table public.rooms
  add column guessing boolean;

comment on column public.rooms.guessing is
  'Başlatılırken hesaplanır: hücre başına en az p_min_guessers kişi tahmin edebiliyor mu. Lobide null.';

-- ---------------------------------------------------------------------------
-- room_start (B'deki sürümün yerine): ek olarak tahminli mi hesaplanır.
-- Hücreye yazan sayısı = p_targets (halkada her hedefe önceki p_targets kişi yazar).
-- ---------------------------------------------------------------------------

drop function public.room_start(text, uuid, integer, integer, integer, integer);

create function public.room_start(
  p_code text,
  p_admin uuid,
  p_min_players integer,
  p_max_players integer,
  p_targets integer,
  p_slots integer,
  p_min_guessers integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_ids uuid[];
  v_n integer;
begin
  select * into v_room from public.rooms
  where code = p_code and expires_at > now()
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_room.admin_player_id is distinct from p_admin then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;
  if v_room.phase <> 'lobby' then
    return jsonb_build_object('ok', false, 'error', 'not_lobby');
  end if;

  select array_agg(id order by random()) into v_ids
  from public.room_players where room_code = p_code;
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n < p_min_players then
    return jsonb_build_object('ok', false, 'error', 'too_few', 'needed', p_min_players - v_n);
  end if;
  if v_n > p_max_players or p_targets >= v_n then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  update public.room_players p
  set ring_pos = r.pos - 1, ready_at = null, score = 0
  from unnest(v_ids) with ordinality as r(id, pos)
  where p.id = r.id;

  insert into public.room_items (room_code, author_id, target_id, slot)
  select p_code, v_ids[i], v_ids[((i - 1 + d) % v_n) + 1], s
  from generate_series(1, v_n) as i,
       generate_series(1, p_targets) as d,
       generate_series(0, p_slots - 1) as s;

  update public.rooms
  set phase = 'writing',
      grid_size = case when v_n <= 4 then 2 when v_n <= 9 then 3 else 4 end,
      guessing = (v_n - p_targets) >= p_min_guessers,
      writing_ends_at = now() + make_interval(secs => write_seconds),
      version = version + 1
  where code = p_code;

  return jsonb_build_object('ok', true, 'guessing', (v_n - p_targets) >= p_min_guessers);
end;
$$;

comment on column public.room_items.ord is
  'Açılışta hücre içindeki rastgele sıra; istemciye madde kimliği yerine bu gider.';

-- ---------------------------------------------------------------------------
-- room_enter_reveal: YAZMA → AÇILIŞ (B'deki sürümün yerine). Çağıran oda satırını
-- kilitlemiş olmalı. Oyuncular ızgaranın rastgele hücrelerine dağılır, maddelere
-- hücre içi rastgele sıra verilir, ilk hücre tahmin adımında açılır.
-- ---------------------------------------------------------------------------

create or replace function public.room_enter_reveal(p_code text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_grid integer;
begin
  select grid_size into v_grid from public.rooms where code = p_code and phase = 'writing';
  if not found or v_grid is null then
    return;
  end if;

  with cells as (
    select c, row_number() over (order by random()) as rn
    from generate_series(0, v_grid * v_grid - 1) as c
  ),
  ps as (
    select id, row_number() over (order by random()) as rn
    from public.room_players where room_code = p_code
  )
  update public.room_players p
  set cell_index = cells.c
  from ps join cells using (rn)
  where p.id = ps.id;

  update public.room_items i
  set ord = x.o
  from (
    select id, (row_number() over (partition by target_id order by random()) - 1)::smallint as o
    from public.room_items where room_code = p_code
  ) x
  where i.id = x.id;

  update public.rooms
  set phase = 'reveal', reveal_index = 0, reveal_step = 'guess', version = version + 1
  where code = p_code and phase = 'writing';
end;
$$;

-- Açılıştaki k. hedef (cell_index sırasıyla). Bulunamazsa null.
create function public.room_reveal_target(p_code text, p_position integer)
returns public.room_players
language sql
stable
security invoker
set search_path = ''
as $$
  select * from public.room_players
  where room_code = p_code and cell_index is not null
  order by cell_index
  offset greatest(p_position, 0) limit 1;
$$;

-- ---------------------------------------------------------------------------
-- room_guess: oyuncunun o anki hücre için tahmini (tahmin adımında değiştirilebilir).
-- p_position, istemcinin gördüğü sıra; uymazsa 'stale'. Döner: { ok } ya da
-- { ok:false, error }. error: not_found | not_reveal | stale | not_allowed | invalid_guess
-- ---------------------------------------------------------------------------

create function public.room_guess(p_code text, p_player uuid, p_position integer, p_guessed uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_target public.room_players;
  v_guessed_cell smallint;
begin
  select * into v_room from public.rooms where code = p_code and expires_at > now() for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_room.phase <> 'reveal' then
    return jsonb_build_object('ok', false, 'error', 'not_reveal');
  end if;
  if v_room.guessing is not true then
    return jsonb_build_object('ok', false, 'error', 'no_guessing');
  end if;
  if v_room.reveal_step <> 'guess' or v_room.reveal_index is distinct from p_position then
    return jsonb_build_object('ok', false, 'error', 'stale');
  end if;

  v_target := public.room_reveal_target(p_code, p_position);
  if v_target.id is null then
    return jsonb_build_object('ok', false, 'error', 'stale');
  end if;
  if exists (
    select 1 from public.room_items where target_id = v_target.id and author_id = p_player
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;

  -- Tahmin edilen kişi bu odada olmalı ve hücresi henüz açılmamış olmalı.
  select cell_index into v_guessed_cell from public.room_players
  where id = p_guessed and room_code = p_code;
  if v_guessed_cell is null or v_guessed_cell < v_target.cell_index then
    return jsonb_build_object('ok', false, 'error', 'invalid_guess');
  end if;

  insert into public.room_guesses (room_code, cell_index, player_id, guessed_id)
  values (p_code, v_target.cell_index, p_player, p_guessed)
  on conflict (room_code, cell_index, player_id)
  do update set guessed_id = excluded.guessed_id, created_at = now()
  where public.room_guesses.guessed_id is distinct from excluded.guessed_id;

  -- Sürüm artar ki admin "x/y tahmin etti" sayısını yeniden çizsin (sinyal yalnızca admine).
  update public.rooms set version = version + 1 where code = p_code;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- room_reveal_step: admin düğmesi.
--   'open' — tahmin → göster: doğru tahminler işaretlenir, bilenlere 1 puan.
--            (Tahminsiz odada yalnızca ilk hücre için: açılış kapalı başlar.)
--   'next' — göster → sonraki hücrenin tahmin adımı (tahminsiz odada ve son hücrede
--            doğrudan gösterme adımı); son hücredeyse BITTI
--            (finished_at = şimdi, oda en geç p_done_ttl_seconds sonra silinir).
-- p_position uymazsa 'stale' (çift dokunma, iki sekme). Döner: { ok, done }.
-- error: not_found | not_admin | not_reveal | stale
-- ---------------------------------------------------------------------------

create function public.room_reveal_step(
  p_code text,
  p_admin uuid,
  p_position integer,
  p_action text,
  p_done_ttl_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_target public.room_players;
  v_total integer;
begin
  select * into v_room from public.rooms where code = p_code and expires_at > now() for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_room.admin_player_id is distinct from p_admin then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;
  if v_room.phase <> 'reveal' then
    return jsonb_build_object('ok', false, 'error', 'not_reveal');
  end if;
  if v_room.reveal_index is distinct from p_position
     or (p_action = 'open' and v_room.reveal_step <> 'guess')
     or (p_action = 'next' and v_room.reveal_step <> 'shown')
     or p_action not in ('open', 'next') then
    return jsonb_build_object('ok', false, 'error', 'stale');
  end if;

  if p_action = 'open' then
    v_target := public.room_reveal_target(p_code, p_position);
    update public.room_guesses
    set correct = (guessed_id = v_target.id)
    where room_code = p_code and cell_index = v_target.cell_index;

    update public.room_players p
    set score = p.score + 1
    from public.room_guesses g
    where g.room_code = p_code and g.cell_index = v_target.cell_index
      and g.correct and p.id = g.player_id;

    update public.rooms set reveal_step = 'shown', version = version + 1 where code = p_code;
    return jsonb_build_object('ok', true, 'done', false);
  end if;

  select count(*) into v_total from public.room_players
  where room_code = p_code and cell_index is not null;
  if p_position + 1 < v_total then
    -- Tahminsiz odada ve son hücrede (tek aday) tahmin adımı yok: doğrudan açılır.
    update public.rooms
    set reveal_index = p_position + 1,
        reveal_step = case
          when v_room.guessing is not true or p_position + 2 >= v_total then 'shown'
          else 'guess'
        end,
        version = version + 1
    where code = p_code;
    return jsonb_build_object('ok', true, 'done', false);
  end if;

  update public.rooms
  set phase = 'done',
      reveal_step = null,
      finished_at = now(),
      expires_at = least(expires_at, now() + make_interval(secs => p_done_ttl_seconds)),
      version = version + 1
  where code = p_code;
  return jsonb_build_object('ok', true, 'done', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- room_hide_item: admin bir maddeyi gizler (açılışta ve sonuçta görünmez; geri
-- alınamaz). Yalnızca açılmış ya da o an açık hücrelerde. error: not_found |
-- not_admin | not_reveal | no_item
-- ---------------------------------------------------------------------------

create function public.room_hide_item(p_code text, p_admin uuid, p_cell integer, p_ord integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_current smallint;
  v_target uuid;
begin
  select * into v_room from public.rooms where code = p_code and expires_at > now() for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_room.admin_player_id is distinct from p_admin then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;
  if v_room.phase not in ('reveal', 'done') then
    return jsonb_build_object('ok', false, 'error', 'not_reveal');
  end if;

  if v_room.phase = 'reveal' then
    select cell_index into v_current from public.room_reveal_target(p_code, v_room.reveal_index);
    if p_cell > v_current then
      return jsonb_build_object('ok', false, 'error', 'no_item');
    end if;
  end if;

  select id into v_target from public.room_players where room_code = p_code and cell_index = p_cell;
  if v_target is null then
    return jsonb_build_object('ok', false, 'error', 'no_item');
  end if;

  update public.room_items set hidden = true
  where room_code = p_code and target_id = v_target and ord = p_ord and not hidden;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_item');
  end if;

  update public.rooms set version = version + 1 where code = p_code;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.room_start(text, uuid, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.room_start(text, uuid, integer, integer, integer, integer, integer) to service_role;
revoke all on function public.room_reveal_target(text, integer) from public, anon, authenticated;
revoke all on function public.room_guess(text, uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.room_reveal_step(text, uuid, integer, text, integer) from public, anon, authenticated;
revoke all on function public.room_hide_item(text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.room_reveal_target(text, integer) to service_role;
grant execute on function public.room_guess(text, uuid, integer, uuid) to service_role;
grant execute on function public.room_reveal_step(text, uuid, integer, text, integer) to service_role;
grant execute on function public.room_hide_item(text, uuid, integer, integer) to service_role;
