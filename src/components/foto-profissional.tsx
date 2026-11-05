/** Foto em círculo com a borda na cor da profissional; sem foto, mostra só a bolinha da cor. */
export function FotoProfissional({ url, cor, tamanho = 32 }: { url?: string | null; cor: string; tamanho?: number }) {
  if (!url) return <span className="size-3 shrink-0 rounded-full" style={{ background: cor }} aria-hidden />;
  return (
    // Link temporário do Storage: não passa pelo otimizador de imagens do Next
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={tamanho} height={tamanho} className="shrink-0 rounded-full border-2 object-cover"
      style={{ width: tamanho, height: tamanho, borderColor: cor }} />
  );
}
