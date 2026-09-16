import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Table2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  listarFaltasSemCobertura,
  podeGerarPlanilhaFaltas,
  type FaltaSemCobertura,
} from "@/lib/faltas-sem-cobertura.functions";

const COLUNAS = [
  ["data", "Data"],
  ["posto", "Posto"],
  ["nome", "Nome"],
  ["cargo", "Cargo"],
  ["motivo", "Motivo"],
  ["cobertura", "Cobertura"],
  ["horario", "Horário"],
] as const;

function escapar(valor: string) {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nomeAba(nome: string, usados: Set<string>) {
  let base = (nome || "SEM EMPRESA IDENTIFICADA")
    .replace(/[\\/?*[\]:]/g, " ")
    .trim()
    .slice(0, 31);
  if (!base) base = "SEM EMPRESA";
  let final = base;
  let i = 2;
  while (usados.has(final.toLowerCase())) {
    const sufixo = ` (${i++})`;
    final = base.slice(0, 31 - sufixo.length) + sufixo;
  }
  usados.add(final.toLowerCase());
  return final;
}

function montarWorkbook(registros: FaltaSemCobertura[]) {
  const grupos = new Map<string, FaltaSemCobertura[]>();
  for (const r of registros) {
    const empresa = r.empresa?.trim() || "SEM EMPRESA IDENTIFICADA";
    const atual = grupos.get(empresa) ?? [];
    atual.push(r);
    grupos.set(empresa, atual);
  }

  const usados = new Set<string>();
  const abas = [...grupos.entries()]
    .map(([empresa, linhas]) => {
      const cabecalho = COLUNAS.map(
        ([, rotulo]) => `<Cell><Data ss:Type="String">${escapar(rotulo)}</Data></Cell>`,
      ).join("");
      const corpo = linhas
        .map(
          (l) =>
            `<Row>${COLUNAS.map(
              ([chave]) =>
                `<Cell><Data ss:Type="String">${escapar(String(l[chave] ?? ""))}</Data></Cell>`,
            ).join("")}</Row>`,
        )
        .join("");
      return `<Worksheet ss:Name="${escapar(nomeAba(empresa, usados))}"><Table><Row>${cabecalho}</Row>${corpo}</Table></Worksheet>`;
    })
    .join("");

  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${abas}</Workbook>`;
}

export function GerarExcelFaltasCard() {
  const verificar = useServerFn(podeGerarPlanilhaFaltas);
  const listar = useServerFn(listarFaltasSemCobertura);
  const [permitido, setPermitido] = useState<boolean | null>(null);
  const [registros, setRegistros] = useState<FaltaSemCobertura[]>([]);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const dados = await listar();
      setRegistros(dados);
    } catch (erro) {
      toast.error(
        erro instanceof Error ? erro.message : "Não foi possível carregar os lançamentos.",
      );
    } finally {
      setCarregando(false);
    }
  }, [listar]);

  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const { permitido: ok } = await verificar();
        if (!ativo) return;
        setPermitido(ok);
        if (ok) await carregar();
      } catch {
        if (ativo) setPermitido(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [verificar, carregar]);

  if (permitido !== true) return null;

  const baixar = () => {
    if (registros.length === 0) {
      toast.info("Nenhum lançamento para exportar.");
      return;
    }
    const blob = new Blob([montarWorkbook(registros)], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `faltas-sem-cobertura-${new Date().toISOString().slice(0, 10)}.xls`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Planilha gerada com uma aba por empresa.");
  };

  const empresas = new Set(registros.map((r) => r.empresa?.trim() || "SEM EMPRESA IDENTIFICADA"));

  return (
    <button
      type="button"
      onClick={baixar}
      disabled={carregando || registros.length === 0}
      className="group flex flex-col items-center gap-3 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      title={`Gerar Excel · ${registros.length} registro(s)${registros.length > 0 ? ` · ${empresas.size} empresa(s)` : ""}`}
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary transition-all duration-300 hover:bg-primary/20 hover:shadow-lg group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-primary">
        {carregando ? (
          <Loader2 className="size-[38px] animate-spin" />
        ) : (
          <Table2 className="size-[38px]" />
        )}
      </span>
      <span className="text-center text-sm font-semibold text-foreground">
        GERAR EXCEL DAS FALTAS SEM COBERTURAS
      </span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <RefreshCw className="size-3" />
        {registros.length} registro(s)
      </span>
    </button>
  );
}
