interface ImportMetaEnv {
  /** https://<proje>.supabase.co — yalnızca oyun linki isteklerinde kullanılır. */
  readonly VITE_SUPABASE_URL?: string
  /** sb_publishable_… (herkese açık anahtar; secret anahtar asla buraya girmez). */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
