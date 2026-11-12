-- Aşama 2: zamanlanmış görevler.
--
-- 1) cleanup-expired-games: 15 dakikada bir cleanup Edge Function'ını çağırır
--    (pg_cron + pg_net; Supabase dokümanındaki önerilen yöntem). Dosyalar SQL ile
--    değil fonksiyon içinden Storage API ile silinir.
-- 2) purge-rate-limits: her dakika 1 saatten eski hız limiti satırlarını siler.
--
-- Çağrı sırrı neden secret API anahtarı değil:
--   pg_net, istek kuyruktayken başlıkları çözülmüş halde net.http_request_queue
--   tablosuna yazar. Oraya secret anahtar düşerse tüm veritabanının anahtarı
--   açığa çıkar. Bunun yerine yalnızca cleanup'ı tetikleyebilen ayrı bir sır
--   kullanılır. Sır veritabanının içinde rastgele üretilir ve Vault'ta durur;
--   repoya, ortam dosyalarına ya da terminale hiç düşmez. Fonksiyon gelen
--   başlığı public.verify_cleanup_secret ile veritabanında doğrular.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Vault kayıtları (yoksa oluştur; migration tekrar çalışırsa sır değişmez)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'project_url') then
    -- Gizli değil; Vault'ta tutulması Supabase dokümanının önerisi.
    perform vault.create_secret(
      'https://iwdywhvfipdcuhfwlkba.supabase.co',
      'project_url',
      'Edge Function çağrıları için proje adresi'
    );
  end if;

  if not exists (select 1 from vault.secrets where name = 'cleanup_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'cleanup_secret',
      'cleanup Edge Function çağrı sırrı (yalnızca pg_cron kullanır)'
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sır doğrulama (yalnızca service_role çalıştırabilir)
-- ---------------------------------------------------------------------------

create function public.verify_cleanup_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select ds.decrypted_secret = p_secret
      from vault.decrypted_secrets ds
      where ds.name = 'cleanup_secret'
      limit 1
    ),
    false
  )
  and char_length(coalesce(p_secret, '')) = 64;
$$;

revoke all on function public.verify_cleanup_secret(text) from public, anon, authenticated;
grant execute on function public.verify_cleanup_secret(text) to service_role;

-- ---------------------------------------------------------------------------
-- Zamanlama
-- ---------------------------------------------------------------------------

-- Migration tekrar çalışırsa çift iş oluşmasın.
select cron.unschedule(jobid) from cron.job
where jobname in ('cleanup-expired-games', 'purge-rate-limits');

select cron.schedule(
  'cleanup-expired-games',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $job$
);

select cron.schedule(
  'purge-rate-limits',
  '* * * * *',
  $job$ delete from public.rate_limits where window_start < now() - interval '1 hour'; $job$
);
