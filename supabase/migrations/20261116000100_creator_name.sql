-- Oyun linki daveti: oyunu kuranın adı (isteğe bağlı).
--
-- Ekleyici: mevcut oyunlarda boş kalır; eski istemciler alanı göndermez.
-- Kurallar oyuncu adıyla aynı (doğrulama create-game'de, _shared/validate.ts);
-- burada yalnızca uzunluk için güvenlik ağı var. Oyunla birlikte silinir.

alter table public.games add column if not exists creator_name text
  constraint games_creator_name_length
    check (creator_name is null or char_length(creator_name) between 1 and 20);

comment on column public.games.creator_name is
  'Oyunu kuranın kendi yazdığı ad (≤ 20 karakter, isteğe bağlı). Oyuncuya davet metninde gösterilir.';
