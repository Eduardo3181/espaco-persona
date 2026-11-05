"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { Camera, Trash2 } from "lucide-react";
import { classeBotao } from "@/components/ui";
import { salvarFoto } from "./actions";

const LADO = 320;
const ERRO_LEITURA = "Não foi possível ler essa foto. Tente uma imagem JPG ou PNG.";

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

/** Escolhe a foto e grava na hora; quem ainda não foi cadastrada guarda para gravar junto com o formulário. */
function useFoto(profissionalId: string | undefined, urlAtual: string | null) {
  const [nova, setNova] = useState<string | null>(null);
  const [removida, setRemovida] = useState(false);
  const [erro, setErro] = useState("");
  const [gravada, setGravada] = useState(false);
  const [enviando, iniciar] = useTransition();

  const gravar = (foto: string | null) => {
    setGravada(false);
    iniciar(async () => {
      const resultado = await salvarFoto(profissionalId!, foto);
      if (resultado.erro) { setErro(resultado.erro); return; }
      setNova(foto);
      setRemovida(!foto);
      setErro("");
      setGravada(true);
    });
  };

  const aoEscolher = async (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    let foto: string;
    try {
      foto = await prepararFoto(arquivo);
    } catch {
      setErro(ERRO_LEITURA);
      return;
    }
    if (profissionalId) {
      gravar(foto);
    } else {
      setNova(foto);
      setRemovida(false);
      setErro("");
    }
  };

  const remover = () => {
    if (profissionalId) gravar(null);
    else setNova(null);
  };

  return {
    nova, removida, erro, gravada, enviando, aoEscolher, remover,
    previa: nova ?? (removida ? null : urlAtual),
  };
}

/** Campo de foto do formulário da Equipe. */
export function CampoFoto({ profissionalId, urlAtual }: { profissionalId?: string; urlAtual: string | null }) {
  const f = useFoto(profissionalId, urlAtual);
  const entrada = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-1 text-sm sm:col-span-2">
      <span className="font-medium">Foto (opcional)</span>
      <div className="flex flex-wrap items-center gap-3">
        {!profissionalId && <input type="hidden" name="foto_nova" value={f.nova ?? ""} />}
        {f.previa ? (
          // Prévia local ou link temporário do Storage
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.previa} alt="Foto da profissional" className="size-16 rounded-full border border-borda object-cover" />
        ) : (
          <span className="flex size-16 items-center justify-center rounded-full border border-dashed border-borda text-suave">
            <Camera size={22} aria-hidden />
          </span>
        )}
        <input ref={entrada} type="file" accept="image/*" onChange={f.aoEscolher} className="sr-only" aria-label="Escolher foto" tabIndex={-1} />
        <button type="button" disabled={f.enviando} onClick={() => entrada.current?.click()} className={classeBotao("secundario")}>
          <Camera size={16} aria-hidden /> {f.enviando ? "Gravando…" : f.previa ? "Trocar foto" : "Carregar foto"}
        </button>
        {f.previa && (
          <button type="button" disabled={f.enviando} onClick={f.remover} className={classeBotao("fantasma")}>
            <Trash2 size={16} aria-hidden /> Remover
          </button>
        )}
      </div>
      {f.erro ? <span role="alert" className="text-xs text-erro">{f.erro}</span>
        : f.gravada ? <span role="status" className="text-xs font-semibold text-sucesso">{f.removida ? "Foto removida." : "Foto gravada."}</span>
        : <span className="text-xs text-suave">
            {profissionalId ? "A foto é gravada assim que você escolher. " : "A foto será gravada ao salvar o cadastro. "}
            Aparece em círculo na agenda; prefira uma foto com o rosto centralizado.
          </span>}
    </div>
  );
}

/** Foto no cartão da Equipe: clicou, escolheu, gravou. */
export function FotoDoCartao({ profissionalId, nome, urlAtual, cor }: { profissionalId: string; nome: string; urlAtual: string | null; cor: string }) {
  const f = useFoto(profissionalId, urlAtual);
  const entrada = useRef<HTMLInputElement>(null);

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <input ref={entrada} type="file" accept="image/*" onChange={f.aoEscolher} className="sr-only" aria-label={`Escolher foto de ${nome}`} tabIndex={-1} />
      <button type="button" disabled={f.enviando} onClick={() => entrada.current?.click()} title={f.previa ? "Trocar foto" : "Carregar foto"}
        aria-label={`${f.previa ? "Trocar" : "Carregar"} foto de ${nome}`}
        className={`flex size-12 items-center justify-center overflow-hidden rounded-full border-2 ${f.enviando ? "opacity-50" : "hover:opacity-80"}`}
        style={{ borderColor: cor }}>
        {f.previa ? (
          // Prévia local ou link temporário do Storage
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.previa} alt="" className="size-full object-cover" />
        ) : <Camera size={20} className="text-suave" aria-hidden />}
      </button>
      {f.erro && <span role="alert" className="w-24 text-center text-xs text-erro">{f.erro}</span>}
    </div>
  );
}
