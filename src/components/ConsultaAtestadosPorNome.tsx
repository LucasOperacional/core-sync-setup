/**
 * Consulta de atestados entregues por nome do colaborador.
 *
 * Digite parte do nome: o card sugere os nomes encontrados nos atestados
 * importados e mostra quantos atestados a pessoa entregou, o total de dias de
 * afastamento e a lista de cada atestado.
 */
import { useMemo, useState } from "react";
import { Search, UserSearch, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { normalizeText } from "@/lib/dashboard-utils";

export interface AtestadoConsultaItem {
  colaborador: string;
  posto: string;
  cargo: string;
  cid: string;
  medico: string;
  dias: number;
  dataInicio: string;
  dataFim: string;
}

export function ConsultaAtestadosPorNome({ registros }: { registros: AtestadoConsultaItem[] }) {
  const [termo, setTermo] = useState("");
  const [selecionado, setSelecionado] = useState("");

  const porNome = useMemo(() => {
    const mapa = new Map<string, AtestadoConsultaItem[]>();
    for (const r of registros) {
      const nome = r.colaborador.trim();
      if (!nome) continue;
      const atual = mapa.get(nome);
      if (atual) atual.push(r);
      else mapa.set(nome, [r]);
    }
    return mapa;
  }, [registros]);

  const sugestoes = useMemo(() => {
    const t = normalizeText(termo.trim());
    const todos = Array.from(porNome, ([nome, itens]) => ({
      nome,
      qtd: itens.length,
      dias: itens.reduce((a, i) => a + i.dias, 0),
    })).sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome));
    if (!t) return todos.slice(0, 8);
    return todos.filter((s) => normalizeText(s.nome).includes(t)).slice(0, 12);
  }, [porNome, termo]);

  const itens = selecionado ? (porNome.get(selecionado) ?? []) : [];
  const totalDias = itens.reduce((a, i) => a + i.dias, 0);
  const cids = Array.from(new Set(itens.map((i) => i.cid).filter(Boolean)));

  return (
    <section className="panel space-y-4 p-5">
      <div className="flex items-center gap-2">
        <UserSearch className="size-4 text-primary" />
        <h2 className="text-base font-semibold text-foreground">
          Consultar atestados entregues por nome
        </h2>
      </div>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Nome do colaborador
        <span className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={termo}
            onChange={(e) => {
              setTermo(e.target.value);
              setSelecionado("");
            }}
            placeholder="Digite parte do nome…"
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-9 text-sm text-foreground outline-none focus:border-primary"
          />
          {termo ? (
            <button
              type="button"
              onClick={() => {
                setTermo("");
                setSelecionado("");
              }}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-secondary"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </span>
      </label>

      {sugestoes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum colaborador encontrado com esse nome nos atestados importados.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sugestoes.map((s) => (
            <button
              key={s.nome}
              type="button"
              onClick={() => setSelecionado(s.nome === selecionado ? "" : s.nome)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                s.nome === selecionado
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-secondary text-foreground hover:bg-secondary/80"
              }`}
            >
              <span className="max-w-[16rem] truncate">{s.nome}</span>
              <Badge variant="secondary" className="text-xs">
                {s.qtd} {s.qtd === 1 ? "atestado" : "atestados"}
              </Badge>
            </button>
          ))}
        </div>
      )}

      {selecionado ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-foreground">{selecionado}</p>
            <Badge className="text-xs">
              {itens.length} {itens.length === 1 ? "atestado entregue" : "atestados entregues"}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {totalDias} {totalDias === 1 ? "dia de afastamento" : "dias de afastamento"}
            </Badge>
            {cids.length > 0 ? (
              <Badge variant="outline" className="text-xs">
                CIDs: {cids.join(", ")}
              </Badge>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary text-left">
                  <th className="px-3 py-2 font-medium text-muted-foreground">Início</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Fim</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Dias</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">CID</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Médico</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Posto</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i, idx) => (
                  <tr
                    key={`${i.dataInicio}-${idx}`}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2 text-foreground">{i.dataInicio || "—"}</td>
                    <td className="px-3 py-2 text-foreground">{i.dataFim || "—"}</td>
                    <td className="px-3 py-2 text-foreground">{i.dias}</td>
                    <td className="px-3 py-2 text-foreground">{i.cid || "—"}</td>
                    <td className="px-3 py-2 text-foreground">{i.medico || "—"}</td>
                    <td className="px-3 py-2 text-foreground">{i.posto || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Selecione um nome para ver a quantidade de atestados entregues e os detalhes de cada um.
        </p>
      )}
    </section>
  );
}
