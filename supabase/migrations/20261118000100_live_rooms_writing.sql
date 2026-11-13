-- Aşama 4 / B: oyunu başlatma, halka ataması, taslak kaydı, hazır olma, yazmanın bitişi.
--
-- Erişim modeli aynı: fonksiyonlar security invoker, yalnızca service_role çalıştırabilir.
-- Aşama geçişleri oda satırı kilitlenerek yapılır (select … for update). Taslak kaydı
-- oda satırını paylaşımlı kilitler: aşama ilerlerken yarım kalan kayıt olmaz.

-- ---------------------------------------------------------------------------
-- room_enter_reveal: YAZMA → AÇILIŞ. Çağıran oda satırını kilitlemiş olmalı.
-- C parçası açılış sırasını burada kuracak (create or replace).
-- ---------------------------------------------------------------------------

create function public.room_enter_reveal(p_code text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.rooms
  set phase = 'reveal', reveal_index = null, reveal_step = null, version = version + 1
  where code = p_code and phase = 'writing';
end;
$$;

-- ---------------------------------------------------------------------------
-- room_start: LOBI → YAZMA. Yalnızca admin; oyuncu sayısı mod alt sınırını
-- sağlamalı. Oyuncular rastgele halkaya dizilir; her oyuncu kendinden sonraki
-- p_targets kişiye p_slots'ar madde yazar (boş satırlar burada açılır).
-- Döner: { ok } ya da { ok:false, error[, needed] }.
-- error: not_found | not_admin | not_lobby | too_few | too_many
-- ---------------------------------------------------------------------------

create function public.room_start(
  p_code text,
  p_admin uuid,
  p_min_players integer,
  p_max_players integer,
  p_targets integer,
  p_slots integer
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

  -- Halka: i. oyuncu (1 tabanlı) → i+1 … i+p_targets (mod n).
  insert into public.room_items (room_code, author_id, target_id, slot)
  select p_code, v_ids[i], v_ids[((i - 1 + d) % v_n) + 1], s
  from generate_series(1, v_n) as i,
       generate_series(1, p_targets) as d,
       generate_series(0, p_slots - 1) as s;

  update public.rooms
  set phase = 'writing',
      grid_size = case when v_n <= 4 then 2 when v_n <= 9 then 3 else 4 end,
      writing_ends_at = now() + make_interval(secs => write_seconds),
      version = version + 1
  where code = p_code;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- room_save_items: oyuncunun kendi maddelerini yazar (yalnızca kendisine atanmış
-- satırlar) ve isteğe bağlı olarak hazır durumunu değiştirir. Süre bittikten sonra
-- p_grace_seconds boyunca metin kabul edilir; hazır durumu ise değişmez.
-- Herkes hazırsa aşama hemen AÇILIŞ'a geçer.
-- p_items: [{ "target": uuid, "slot": 0-2, "text": "…" }]
-- Döner: { ok, changed, advanced } ya da { ok:false, error }.
-- error: not_found | not_writing | time_up | not_assigned
-- ---------------------------------------------------------------------------

create function public.room_save_items(
  p_code text,
  p_player uuid,
  p_items jsonb,
  p_ready boolean,
  p_grace_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_expected integer := jsonb_array_length(p_items);
  v_match integer;
  v_was boolean;
  v_changed boolean := false;
  v_advanced boolean := false;
begin
  -- Hazır durumu değişebilecekse özel kilit (aşama ilerleyebilir), yoksa paylaşımlı.
  if p_ready is null then
    select * into v_room from public.rooms where code = p_code and expires_at > now() for share;
  else
    select * into v_room from public.rooms where code = p_code and expires_at > now() for update;
  end if;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_room.phase <> 'writing' then
    return jsonb_build_object('ok', false, 'error', 'not_writing');
  end if;
  if now() > v_room.writing_ends_at + make_interval(secs => p_grace_seconds) then
    return jsonb_build_object('ok', false, 'error', 'time_up');
  end if;

  if v_expected > 0 then
    select count(*) into v_match
    from public.room_items i
    join jsonb_to_recordset(p_items) as x(target uuid, slot smallint, text text)
      on i.target_id = x.target and i.slot = x.slot
    where i.room_code = p_code and i.author_id = p_player;
    if v_match <> v_expected then
      return jsonb_build_object('ok', false, 'error', 'not_assigned');
    end if;

    update public.room_items i
    set text = x.text
    from jsonb_to_recordset(p_items) as x(target uuid, slot smallint, text text)
    where i.room_code = p_code and i.author_id = p_player
      and i.target_id = x.target and i.slot = x.slot
      and i.text is distinct from x.text;
  end if;

  if p_ready is not null and now() <= v_room.writing_ends_at then
    select ready_at is not null into v_was from public.room_players
    where id = p_player and room_code = p_code;
    if v_was is distinct from p_ready then
      update public.room_players
      set ready_at = case when p_ready then now() end
      where id = p_player;
      v_changed := true;
    end if;
  end if;

  if v_changed then
    if p_ready and not exists (
      select 1 from public.room_players where room_code = p_code and ready_at is null
    ) then
      perform public.room_enter_reveal(p_code);
      v_advanced := true;
    else
      update public.rooms set version = version + 1 where code = p_code;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'changed', v_changed, 'advanced', v_advanced);
end;
$$;

-- ---------------------------------------------------------------------------
-- room_end_writing: admin yazmayı erken bitirir. Aşama hemen ilerlemez: bitiş anı
-- şimdiye çekilir, istemciler son taslaklarını kayıt payı içinde gönderir, paydan
-- sonraki ilk durum isteği room_finish_writing ile aşamayı ilerletir.
-- error: not_found | not_admin | not_writing
-- ---------------------------------------------------------------------------

create function public.room_end_writing(p_code text, p_admin uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room public.rooms;
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
  if v_room.phase <> 'writing' then
    return jsonb_build_object('ok', false, 'error', 'not_writing');
  end if;
  update public.rooms
  set writing_ends_at = least(writing_ends_at, now()), version = version + 1
  where code = p_code;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- room_finish_writing: süre ve kayıt payı dolduysa YAZMA → AÇILIŞ (cron yok;
-- get-room-state çağırır). Döner: ilerledi mi?
-- ---------------------------------------------------------------------------

create function public.room_finish_writing(p_code text, p_grace_seconds integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  select * into v_room from public.rooms
  where code = p_code and expires_at > now()
  for update;
  if not found or v_room.phase <> 'writing'
     or now() <= v_room.writing_ends_at + make_interval(secs => p_grace_seconds) then
    return false;
  end if;
  perform public.room_enter_reveal(p_code);
  return true;
end;
$$;

revoke all on function public.room_enter_reveal(text) from public, anon, authenticated;
revoke all on function public.room_start(text, uuid, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.room_save_items(text, uuid, jsonb, boolean, integer) from public, anon, authenticated;
revoke all on function public.room_end_writing(text, uuid) from public, anon, authenticated;
revoke all on function public.room_finish_writing(text, integer) from public, anon, authenticated;
grant execute on function public.room_enter_reveal(text) to service_role;
grant execute on function public.room_start(text, uuid, integer, integer, integer, integer) to service_role;
grant execute on function public.room_save_items(text, uuid, jsonb, boolean, integer) to service_role;
grant execute on function public.room_end_writing(text, uuid) to service_role;
grant execute on function public.room_finish_writing(text, integer) to service_role;
