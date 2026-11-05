"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Camera, Trash2 } from "lucide-react";
import { classeBotao } from "@/components/ui";

const LADO = 320;

/** Recorta o centro da foto em quadrado e reduz, para carregar rápido na agenda. */
async function prepararFoto(arquivo: File): Promise<string> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const lado = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = LADO;
    canvas.height = LADO;
    canvas.getContext("2d")!.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, LADO, LADO);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Escolher, trocar ou remover a foto da profissional. Só é gravada ao salvar o formulário. */
export function CampoFoto({ urlAtual }: { urlAtual: string | null }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [nova, setNova] = useState<string | null>(null);
  const [remover, setRemover] = useState(false);
  const [erro, setErro] = useState("");
  const previa = nova ?? (remover ? null : urlAtual);

  const aoEscolher = async (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    try {
      setNova(await prepararFoto(arquivo));
      setRemover(false);
      setErro("");
    } catch {
      setErro("Não foi possível ler essa foto. Tente uma imagem JPG ou PNG.");
    }
  };

  return (
    <div className="flex flex-col gap-1 text-sm sm:col-span-2">
      <span className="font-medium">Foto (opcional)</span>
      <div className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="foto_nova" value={nova ?? ""} />
        <input type="hidden" name="foto_remover" value={remover ? "1" : ""} />
        {previa ? (
          // Prévia local ou link temporário do Storage
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previa} alt="Foto da profissional" className="size-16 rounded-full border border-borda object-cover" />
        ) : (
          <span className="flex size-16 items-center justify-center rounded-full border border-dashed border-borda text-suave">
            <Camera size={22} aria-hidden />
          </span>
        )}
        <input ref={entrada} type="file" accept="image/*" onChange={aoEscolher} className="sr-only" aria-label="Escolher foto" tabIndex={-1} />
        <button type="button" onClick={() => entrada.current?.click()} className={classeBotao("secundario")}>
          <Camera size={16} aria-hidden /> {previa ? "Trocar foto" : "Carregar foto"}
        </button>
        {previa && (
          <button type="button" onClick={() => { setNova(null); setRemover(true); }} className={classeBotao("fantasma")}>
            <Trash2 size={16} aria-hidden /> Remover
          </button>
        )}
      </div>
      {erro ? <span role="alert" className="text-xs text-erro">{erro}</span>
        : <span className="text-xs text-suave">Aparece em círculo na agenda. Prefira uma foto com o rosto centralizado.</span>}
    </div>
  );
}
