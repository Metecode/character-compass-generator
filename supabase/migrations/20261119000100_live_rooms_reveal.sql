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

alter table public.room_items
  add column ord smallint;

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
--   'next' — göster → sonraki hücrenin tahmin adımı; son hücredeyse BITTI
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
    update public.rooms
    set reveal_index = p_position + 1, reveal_step = 'guess', version = version + 1
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

revoke all on function public.room_reveal_target(text, integer) from public, anon, authenticated;
revoke all on function public.room_guess(text, uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.room_reveal_step(text, uuid, integer, text, integer) from public, anon, authenticated;
revoke all on function public.room_hide_item(text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.room_reveal_target(text, integer) to service_role;
grant execute on function public.room_guess(text, uuid, integer, uuid) to service_role;
grant execute on function public.room_reveal_step(text, uuid, integer, text, integer) to service_role;
grant execute on function public.room_hide_item(text, uuid, integer, integer) to service_role;
