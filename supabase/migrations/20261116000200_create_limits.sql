-- create-game: çok pencereli hız limiti (saatlik + günlük) ve tekrar deneme süresi.
--
-- Ekleyici: rate_limit_hit (diğer fonksiyonlar kullanıyor) aynen kalır. Limit
-- değerleri burada değil, supabase/functions/_shared/limits.ts'te (CREATE_GAME_LIMITS);
-- fonksiyon onları parametre olarak alır.

-- ---------------------------------------------------------------------------
-- rate_limit_take: verilen anahtarların hepsi limitin içindeyse hepsini 1 artırır
-- ve 0 döner. Biri doluysa hiçbirini artırmaz ve en geç açılacak dolu pencerenin
-- açılmasına kalan saniyeyi döner (en az 1). Reddedilen istek kotadan düşmez.
-- Anahtarlar her zaman aynı sırada gelir (limits.ts), kilit sırası sabittir.
-- ---------------------------------------------------------------------------

create function public.rate_limit_take(p_keys text[], p_maxes integer[], p_windows integer[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer := coalesce(array_length(p_keys, 1), 0);
  v_count integer;
  v_start timestamptz;
  v_retry integer := 0;
begin
  if n = 0
    or n <> coalesce(array_length(p_maxes, 1), 0)
    or n <> coalesce(array_length(p_windows, 1), 0) then
    raise exception 'anahtar, limit ve pencere dizileri aynı uzunlukta olmalı';
  end if;

  for i in 1..n loop
    if p_windows[i] < 1 or p_windows[i] > 86400 then
      raise exception 'pencere 1 sn ile 1 gün arasında olmalı';
    end if;

    insert into public.rate_limits (key, count, window_start)
    values (p_keys[i], 0, now())
    on conflict (key) do nothing;

    select r.count, r.window_start into v_count, v_start
    from public.rate_limits r
    where r.key = p_keys[i]
    for update;

    if v_start <= now() - make_interval(secs => p_windows[i]) then
      update public.rate_limits set count = 0, window_start = now() where key = p_keys[i];
      v_count := 0;
      v_start := now();
    end if;

    if v_count >= p_maxes[i] then
      v_retry := greatest(
        v_retry,
        greatest(1, ceil(extract(epoch from (v_start + make_interval(secs => p_windows[i]) - now())))::integer)
      );
    end if;
  end loop;

  if v_retry > 0 then
    return v_retry;
  end if;

  update public.rate_limits set count = count + 1 where key = any (p_keys);
  return 0;
end;
$$;

revoke all on function public.rate_limit_take(text[], integer[], integer[]) from public, anon, authenticated;
grant execute on function public.rate_limit_take(text[], integer[], integer[]) to service_role;

-- ---------------------------------------------------------------------------
-- Sayaç temizliği: günlük pencere için satırlar 1 gün tutulur (önceden 1 saat).
-- Saatlik anahtarların süresi geçmiş satırları zaten bir sonraki istekte sıfırlanır.
-- cron.schedule aynı adla çağrılınca mevcut işi günceller.
-- ---------------------------------------------------------------------------

select cron.schedule(
  'purge-rate-limits',
  '* * * * *',
  $job$ delete from public.rate_limits where window_start < now() - interval '1 day'; $job$
);

comment on table public.rate_limits is
  'Sabit pencereli hız limiti sayaçları. 1 günden eski satırlar her dakika silinir (purge-rate-limits).';
