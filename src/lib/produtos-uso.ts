// Produtos de uso (insumos dos atendimentos). Quantidades em g (ou ml, 1 ml ≈ 1 g).
// Coloração aparece só pelo número ("Coloração 7.1"); os demais, pelo nome.

export type TipoProdutoUso = "coloracao" | "oxidante" | "descolorante" | "matizador" | "tratamento" | "outro";

export const TIPOS_USO: { id: TipoProdutoUso; rotulo: string }[] = [
  { id: "coloracao", rotulo: "Coloração" },
  { id: "oxidante", rotulo: "Oxidante" },
  { id: "descolorante", rotulo: "Descolorante" },
  { id: "matizador", rotulo: "Matizador" },
  { id: "tratamento", rotulo: "Tratamento" },
  { id: "outro", rotulo: "Outro" },
];

export type ProdutoUso = {
  id: string; tipo: TipoProdutoUso; familia: string | null; numero: string | null; nome: string;
  embalagem_qtd: number | null; unidade: "g" | "ml"; valor_compra_centavos: number;
  estoque_qtd: number; estoque_minimo_embalagens: number; observacao: string | null; ativo: boolean;
};

export const nomeProdutoUso = (p: Pick<ProdutoUso, "tipo" | "numero" | "nome">) =>
  p.tipo === "coloracao" ? `Coloração ${p.numero}` : p.nome;

/** Ordem do catálogo: tipo e depois o número (8.3, 8.31, 8.34, 8.37, 8.4); sem número, pelo nome. */
export function ordenarProdutosUso<T extends Pick<ProdutoUso, "tipo" | "numero" | "nome">>(lista: T[]) {
  const ordemTipo = (t: TipoProdutoUso) => TIPOS_USO.findIndex((x) => x.id === t);
  const valor = (n: string | null) => {
    const v = n ? Number.parseFloat(n.replace(",", ".")) : Number.NaN;
    return Number.isNaN(v) ? Number.POSITIVE_INFINITY : v;
  };
  return [...lista].sort((a, b) =>
    ordemTipo(a.tipo) - ordemTipo(b.tipo) || valor(a.numero) - valor(b.numero)
    || (a.numero ?? "").localeCompare(b.numero ?? "", "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Custo por g/ml em centavos (com casas decimais); sem embalagem, null. */
export const custoPorGrama = (p: Pick<ProdutoUso, "embalagem_qtd" | "valor_compra_centavos">) =>
  p.embalagem_qtd ? p.valor_compra_centavos / Number(p.embalagem_qtd) : null;

/** "R$ 0,500" — custo por g/ml com 3 casas */
export const formatarCustoGrama = (centavosPorGrama: number | null) =>
  centavosPorGrama === null ? "—" : `R$ ${(centavosPorGrama / 100).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;

/** "30 g", "12,5 g" */
export const formatarQuantidade = (qtd: number, unidade: string) =>
  `${Number(qtd).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${unidade}`;

/** Nome da embalagem: tubo (coloração), frasco (oxidante) ou embalagem */
export function nomeEmbalagem(tipo: TipoProdutoUso, quantidade: number) {
  const um = tipo === "coloracao" ? "tubo" : tipo === "oxidante" ? "frasco" : "embalagem";
  const plural = um === "embalagem" ? "embalagens" : `${um}s`;
  return Math.abs(quantidade) === 1 ? um : plural;
}

/** Quantas embalagens dá a quantidade (com 1 casa) */
export const emEmbalagens = (qtd: number, embalagem: number | null) =>
  embalagem ? Math.round((Number(qtd) / Number(embalagem)) * 10) / 10 : null;

/** Compra sugerida em embalagens inteiras: consumo médio mensal + mínimo − estoque */
export function compraSugerida(p: Pick<ProdutoUso, "embalagem_qtd" | "estoque_qtd" | "estoque_minimo_embalagens">, consumoMensal: number) {
  if (!p.embalagem_qtd) return 0;
  const falta = consumoMensal + Number(p.estoque_minimo_embalagens) * Number(p.embalagem_qtd) - Number(p.estoque_qtd);
  return falta > 0 ? Math.ceil(falta / Number(p.embalagem_qtd)) : 0;
}
