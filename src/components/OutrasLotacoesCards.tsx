import { useState } from "react";
import {
  ShieldAlert,
  EyeOff,
  Baby,
  Gavel,
  Moon,
  DoorOpen,
  Briefcase,
  UserCog,
  MapPinned,
  SprayCan,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCategoriasPostos } from "@/lib/postos-cards";

const CATEGORIAS_FIXAS = [
  {
    chave: "inss",
    titulo: "INSS",
    icone: <ShieldAlert className="h-4 w-4" />,
    corBorda: "border-red-400/30",
    corFundo: "bg-red-500/5",
    corValor: "text-red-600 dark:text-red-400",
  },
  {
    chave: "desaparecidos",
    titulo: "DESAPARECIDOS",
    icone: <EyeOff className="h-4 w-4" />,
    corBorda: "border-orange-400/30",
    corFundo: "bg-orange-500/5",
    corValor: "text-orange-600 dark:text-orange-400",
  },
  {
    chave: "maternidade",
    titulo: "MATERNIDADE",
    icone: <Baby className="h-4 w-4" />,
    corBorda: "border-pink-400/30",
    corFundo: "bg-pink-500/5",
    corValor: "text-pink-600 dark:text-pink-400",
  },
  {
    chave: "audiencia",
    titulo: "AUDIENCIA",
    icone: <Gavel className="h-4 w-4" />,
    corBorda: "border-purple-400/30",
    corFundo: "bg-purple-500/5",
    corValor: "text-purple-600 dark:text-purple-400",
  },
  {
    chave: "jatista",
    titulo: "JATISTA",
    icone: <SprayCan className="h-4 w-4" />,
    corBorda: "border-cyan-400/30",
    corFundo: "bg-cyan-500/5",
    corValor: "text-cyan-600 dark:text-cyan-400",
  },
];

const RESERVAS = [
  {
    chave: "reserva-noturno",
    titulo: "RESERVA - PORTARIA - NOTURNO",
    icone: <Moon className="h-4 w-4" />,
    corBorda: "border-violet-400/30",
    corFundo: "bg-violet-500/5",
    corValor: "text-violet-600 dark:text-violet-400",
  },
  {
    chave: "reserva-portaria-diurno",
    titulo: "RESERVA - PORTARIA - DIURNO",
    icone: <DoorOpen className="h-4 w-4" />,
    corBorda: "border-blue-400/30",
    corFundo: "bg-blue-500/5",
    corValor: "text-blue-600 dark:text-blue-400",
  },
  {
    chave: "reserva-asg-tektron",
    titulo: "RESERVA - ASG - TEKTRON",
    icone: <Briefcase className="h-4 w-4" />,
    corBorda: "border-emerald-400/30",
    corFundo: "bg-emerald-500/5",
    corValor: "text-emerald-600 dark:text-emerald-400",
  },
  {
    chave: "reserva-encarregados",
    titulo: "RESERVA ENCARREGADOS",
    icone: <UserCog className="h-4 w-4" />,
    corBorda: "border-amber-400/30",
    corFundo: "bg-amber-500/5",
    corValor: "text-amber-600 dark:text-amber-400",
  },
];

function CardContador({
  titulo,
  valor,
  icone,
  corBorda,
  corFundo,
  corValor,
  carregando,
  nomes,
}: {
  titulo: string;
  valor: number;
  icone: React.ReactNode;
  corBorda: string;
  corFundo: string;
  corValor: string;
  carregando?: boolean;
  nomes?: { nome: string; empresa: string }[] | undefined;
}) {
  const [aberto, setAberto] = useState(false);
  const temNomes = !carregando && nomes;
  const nomesExistentes = temNomes && nomes!.length > 0;

  function alternar() {
    if (nomesExistentes) setAberto((prev) => !prev);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (nomesExistentes && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      setAberto((prev) => !prev);
    }
  }

  return (
    <div
      role={nomesExistentes ? "button" : undefined}
      tabIndex={nomesExistentes ? 0 : -1}
      onClick={alternar}
      onKeyDown={handleKeyDown}
      className={`group relative overflow-hidden rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg ${corBorda} ${corFundo} ${nomesExistentes ? "cursor-pointer" : ""}`}
      aria-label={
        nomesExistentes
          ? `${titulo}: clique para ${aberto ? "ocultar" : "ver"} os nomes`
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {titulo}
        </span>
        <span
          className={`shrink-0 opacity-70 transition-opacity group-hover:opacity-100 ${corValor}`}
        >
          {icone}
        </span>
      </div>
      {carregando ? (
        <Skeleton className="mt-3 h-8 w-20" />
      ) : (
        <p className={`mt-2 text-3xl font-bold leading-none tabular-nums ${corValor}`}>
          {valor.toLocaleString("pt-BR")}
        </p>
      )}
      {temNomes && (
        <div className="mt-2">
          {nomesExistentes ? (
            aberto ? (
              <>
                <ul className="max-h-36 space-y-1 overflow-y-auto pr-1">
                  {nomes!.map((pessoa) => (
                    <li
                      key={`${pessoa.empresa}|${pessoa.nome}`}
                      className="truncate text-[11px] font-medium text-foreground"
                      title={`${pessoa.nome}${pessoa.empresa ? ` — ${pessoa.empresa}` : ""}`}
                    >
                      {pessoa.nome}
                      {pessoa.empresa ? (
                        <span className="text-muted-foreground"> · {pessoa.empresa}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[10px] text-muted-foreground">Clique para ocultar</p>
              </>
            ) : (
              <p className={`text-[11px] font-medium ${corValor}`}>Clique para ver os nomes</p>
            )
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Nenhuma folha protocolada neste posto
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function OutrasLotacoesCards() {
  const { categorias, carregando: isLoading } = useCategoriasPostos();

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <MapPinned className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">
          Contadores por lotação (folhas, ativos e NEXTI)
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CATEGORIAS_FIXAS.map((cat) => (
          <CardContador
            key={cat.chave}
            titulo={cat.titulo}
            valor={categorias[cat.chave]?.length ?? 0}
            nomes={categorias[cat.chave]}
            carregando={isLoading}
            icone={cat.icone}
            corBorda={cat.corBorda}
            corFundo={cat.corFundo}
            corValor={cat.corValor}
          />
        ))}
        {RESERVAS.map((res) => (
          <CardContador
            key={res.chave}
            titulo={res.titulo}
            valor={categorias[res.chave]?.length ?? 0}
            nomes={categorias[res.chave]}
            carregando={isLoading}
            icone={res.icone}
            corBorda={res.corBorda}
            corFundo={res.corFundo}
            corValor={res.corValor}
          />
        ))}
      </div>
    </div>
  );
}
