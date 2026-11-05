import "server-only";
import type { criarClienteServidor } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof criarClienteServidor>>;

export const BUCKET_FOTOS = "fotos-profissionais";

/** Links temporários das fotos da equipe (o espaço é privado). Sem link, a tela mostra só a cor. */
export async function linksDasFotos(supabase: Supabase, caminhos: (string | null | undefined)[]) {
  const validos = caminhos.filter((c): c is string => Boolean(c));
  if (!validos.length) return new Map<string, string>();
  const { data } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrls(validos, 60 * 60 * 12);
  return new Map((data ?? []).filter((d) => d.path && d.signedUrl).map((d) => [d.path as string, d.signedUrl]));
}
