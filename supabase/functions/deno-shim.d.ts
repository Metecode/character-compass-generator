/**
 * Yalnızca `pnpm typecheck` için (tsconfig.functions.json). Deno çalışma
 * zamanında bu dosya yüklenmez; gerçek tipler Deno'nun kendisinden gelir.
 */
declare namespace Deno {
  const env: { get(name: string): string | undefined }
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown
}
