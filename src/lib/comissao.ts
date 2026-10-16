// Regra de comissão em três níveis: vale a mais específica.
//   exceção por serviço → por categoria → padrão da profissional
// (A mesma lógica existe no banco: função public.comissao_servico.)

export type RegraComissao = {
  id: string;
  profissional_id: string;
  tipo: "padrao" | "categoria" | "servico";
  categoria_id: string | null;
  servico_id: string | null;
  percentual: number;
};

export type ComissaoResolvida = { percentual: number; origem: "serviço" | "categoria" | "padrão" } | null;

export function resolverComissao(
  regras: RegraComissao[],
  profissionalId: string,
  servico: { id: string; categoria_id: string },
): ComissaoResolvida {
  const daProf = regras.filter((r) => r.profissional_id === profissionalId);
  const porServico = daProf.find((r) => r.tipo === "servico" && r.servico_id === servico.id);
  if (porServico) return { percentual: Number(porServico.percentual), origem: "serviço" };
  const porCategoria = daProf.find((r) => r.tipo === "categoria" && r.categoria_id === servico.categoria_id);
  if (porCategoria) return { percentual: Number(porCategoria.percentual), origem: "categoria" };
  const padrao = daProf.find((r) => r.tipo === "padrao");
  if (padrao) return { percentual: Number(padrao.percentual), origem: "padrão" };
  return null;
}

/** Comissão que valeria se não houvesse a exceção do serviço (para mostrar como "herdado"). */
export function comissaoHerdada(
  regras: RegraComissao[],
  profissionalId: string,
  categoriaId: string,
): ComissaoResolvida {
  return resolverComissao(
    regras.filter((r) => r.tipo !== "servico"),
    profissionalId,
    { id: "", categoria_id: categoriaId },
  );
}
