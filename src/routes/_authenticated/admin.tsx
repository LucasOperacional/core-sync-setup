import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useState, useEffect } from "react";
import {
  BarChart3,
  CalendarX2,
  ClipboardCheck,
  FileSignature,
  LayoutDashboard,
  LogOut,
  Sparkles,
  Users,
  ShieldCheck,
  ArrowRight,
  Trash2,
  Loader2,
  Home,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BotaoCorrecaoAutomatica } from "@/components/botao-correcao-automatica";
import { ImportPdfCard } from "@/components/ImportPdfCard";
import { ImportFaltasCard } from "@/components/ImportFaltasCard";
import { ImportAtestadosCard } from "@/components/ImportAtestadosCard";
import { CentralArquivosDashboards } from "@/components/CentralArquivosDashboards";
import { DominioEmailCard } from "@/components/DominioEmailCard";
import { BackupCompletoCard } from "@/components/BackupCompletoCard";
import { EmailVagasCard } from "@/components/EmailVagasCard";
import { WhatsAppAdminCard } from "@/components/WhatsAppAdminCard";

import { notificarCentralArquivos } from "@/lib/central-arquivos-db";
import ciopLogo from "@/assets/ciop-logo.png";

import { type Visit } from "@/lib/report-parser";
import { listVisitas, resetTudo } from "@/lib/visitas-db";

import { importarVisitasControl } from "@/lib/control-import";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Painel Administrativo" },
      {
        name: "description",
        content:
          "Painel administrativo: acesso a dashboards, usuários, canais e módulos operacionais.",
      },
      { property: "og:title", content: "Painel Administrativo" },
      {
        property: "og:description",
        content: "Central de administração dos módulos operacionais.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

const STORAGE_KEY = "nexti-visitas-v1";
const FALTAS_STORAGE_KEY = "nexti-faltas-rows-v1";
const ATESTADOS_STORAGE_KEY = "nexti-atestados-rows-v1";

const links = [
  {
    to: "/logs-atividades" as const,
    icon: History,
    title: "Logs de atividades",
    desc: "Todas as ações feitas pelos usuários no sistema.",
  },
  {
    to: "/control" as const,
    icon: BarChart3,
    title: "Control",
    desc: "Supervisão de postos e conformidade.",
  },
  {
    to: "/faltas" as const,
    icon: CalendarX2,
    title: "Faltas",
    desc: "Absenteísmo, KPIs e importações.",
  },
  {
    to: "/atestados" as const,
    icon: ClipboardCheck,
    title: "Atestados",
    desc: "Gestão de atestados médicos.",
  },
  {
    to: "/verificador-atestados" as const,
    icon: ShieldCheck,
    title: "Verificador",
    desc: "Análise de autenticidade de atestados.",
  },
  {
    to: "/protocolo-folhas-ponto" as const,
    icon: FileSignature,
    title: "Folhas de ponto",
    desc: "Protocolos de entrega.",
  },
  {
    to: "/assinatura-documentos" as const,
    icon: FileSignature,
    title: "Assinatura",
    desc: "CRT e PDFs assinados pelo celular.",
  },
  {
    to: "/gerentes" as const,
    icon: LayoutDashboard,
    title: "Gerentes",
    desc: "Visitas e relatórios por gerente.",
  },
  { to: "/usuarios" as const, icon: Users, title: "Usuários", desc: "Permissões e acessos." },
  {
    to: "/ia-operacional" as const,
    icon: Sparkles,
    title: "IA Operacional",
    desc: "Erros, recuperação, diagnósticos e configurações de APIs.",
  },
];

function AdminPage() {
  const navigate = useNavigate();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const doBanco = await listVisitas();
        if (doBanco.length > 0) {
          setVisits(doBanco);
          return;
        }
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Visit[];
          if (Array.isArray(parsed) && parsed.length > 0) setVisits(parsed);
        } catch {
          /* ignora cache inválido */
        }
      }
    }
    void load();
  }, []);

  async function handleImportedVisits(newVisits: Visit[]) {
    try {
      const r = await importarVisitasControl(newVisits);
      setVisits(r.visitas);

      if (!r.autenticado) {
        toast.error("Sessão expirada: entre novamente para gravar as visitas no dashboard.");
      } else if (r.erros.length > 0) {
        toast.error(`${r.salvas}/${r.lidas} visitas gravadas. Erro: ${r.erros[0]}`);
      } else {
        toast.success(`${r.salvas} visita(s) sincronizadas com o dashboard Control.`);
      }
    } catch (err) {
      toast.error(
        `Falha ao gravar as visitas: ${err instanceof Error ? err.message : "erro desconhecido"}`,
      );
    }
  }

  async function handleResetAll() {
    if (
      !window.confirm(
        "Tem certeza que deseja apagar TODOS os dados importados?\n\nIsso inclui:\n• Visitas, arquivos e gerentes do Control\n• Dados de Faltas\n• Dados de Atestados\n• Registros da Central de Arquivos\n\nEssa ação não pode ser desfeita.",
      )
    ) {
      return;
    }

    setResetting(true);
    try {
      const resumo = await resetTudo();

      try {
        localStorage.removeItem(FALTAS_STORAGE_KEY);
      } catch {
        /* ignore */
      }

      try {
        localStorage.removeItem(ATESTADOS_STORAGE_KEY);
      } catch {
        /* ignore */
      }

      try {
        const { data: allArquivos } = await supabase
          .from("arquivos_importados")
          .select("id, storage_bucket, storage_path");

        if (allArquivos && allArquivos.length > 0) {
          const byBucket = new Map<string, string[]>();
          for (const arq of allArquivos) {
            const bucket = arq.storage_bucket;
            const paths = byBucket.get(bucket) ?? [];
            paths.push(arq.storage_path);
            byBucket.set(bucket, paths);
          }

          for (const [bucket, paths] of byBucket) {
            for (let i = 0; i < paths.length; i += 100) {
              const batch = paths.slice(i, i + 100);
              await supabase.storage.from(bucket).remove(batch);
            }
          }

          await supabase.from("arquivos_importados").delete().not("id", "is", null);
        }

        await supabase.from("arquivos_sincronizacoes").delete().not("id", "is", null);
      } catch (err) {
        console.error("[admin] Erro ao limpar Central de Arquivos:", err);
      }

      try {
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith("nexti-")) localStorage.removeItem(k);
        }
        for (const k of Object.keys(sessionStorage)) {
          if (k.startsWith("nexti-")) sessionStorage.removeItem(k);
        }
      } catch {
        /* ignore */
      }

      setVisits([]);

      window.dispatchEvent(new Event("faltas-sync"));
      window.dispatchEvent(new Event("atestados-sync"));
      notificarCentralArquivos();

      const partes: string[] = [];
      if (resumo.visitas > 0) partes.push(`${resumo.visitas} visita(s)`);
      if (resumo.arquivos > 0) partes.push(`${resumo.arquivos} arquivo(s)`);
      if (resumo.gerentes > 0) partes.push(`${resumo.gerentes} gerente(s)`);
      if (resumo.storage > 0) partes.push(`${resumo.storage} arquivo(s) do storage`);

      toast.success(
        partes.length > 0
          ? `Dados zerados com sucesso: ${partes.join(", ")}.`
          : "Todos os dados importados foram apagados.",
      );

      if (resumo.erros.length > 0) {
        toast.warning(`Alguns erros ocorreram: ${resumo.erros.join("; ")}`);
      }
    } catch (err) {
      console.error("[admin] Erro ao zerar dados:", err);
      toast.error("Erro ao zerar os dados. Tente novamente.");
    } finally {
      setResetting(false);
    }
  }

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }, [navigate]);

  return (
    <main className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-8">
          <div className="flex items-center gap-3">
            <img
              src={ciopLogo}
              alt="Logo CIOP"
              className="size-12 drop-shadow-[0_4px_16px_rgba(220,38,38,0.35)]"
            />
            <h1 className="text-2xl font-bold sm:text-3xl">Painel Administrativo</h1>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Home className="size-4" />
              Painel Inicial
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <BotaoCorrecaoAutomatica />
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              <LogOut className="size-4" />
              Sair
            </button>
          </div>
        </div>
        <p className="mx-auto max-w-7xl px-6 pb-4 text-sm text-muted-foreground">
          Acesse os módulos operacionais e as configurações do sistema.
        </p>
      </header>

      <div className="mx-auto max-w-6xl space-y-10 px-6 py-10">
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Módulos
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="group relative flex cursor-pointer flex-col gap-3 rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
              >
                <img
                  src={ciopLogo}
                  alt=""
                  aria-hidden
                  className="absolute right-4 top-4 size-8 opacity-70 transition-opacity group-hover:opacity-100"
                />
                <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <l.icon className="size-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-card-foreground">{l.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{l.desc}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Acessar
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Comunicação e configurações
          </h2>
          <SecaoRecolhivel titulo="WhatsApp" descricao="Configuração do Evolution Go.">
            <WhatsAppAdminCard />
          </SecaoRecolhivel>
          <SecaoRecolhivel titulo="Domínio de e-mail" descricao="Remetente e verificação.">
            <DominioEmailCard />
          </SecaoRecolhivel>
          <SecaoRecolhivel titulo="E-mail de vagas" descricao="Envio das vagas aprovadas.">
            <EmailVagasCard />
          </SecaoRecolhivel>
          <SecaoRecolhivel titulo="Backup completo" descricao="Cópia de segurança do sistema.">
            <BackupCompletoCard />
          </SecaoRecolhivel>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Importações e arquivos
          </h2>
          <SecaoRecolhivel titulo="Importar visitas (PDF)" descricao="Sincroniza com o Control.">
            <ImportPdfCard onVisitsImported={handleImportedVisits} currentCount={visits.length} />
          </SecaoRecolhivel>
          <SecaoRecolhivel titulo="Importar faltas" descricao="Sincroniza com o painel de faltas.">
            <ImportFaltasCard />
          </SecaoRecolhivel>
          <SecaoRecolhivel
            titulo="Importar atestados"
            descricao="Sincroniza com o painel de atestados."
          >
            <ImportAtestadosCard />
          </SecaoRecolhivel>
          <SecaoRecolhivel titulo="Central de arquivos" descricao="Arquivos dos dashboards.">
            <CentralArquivosDashboards />
          </SecaoRecolhivel>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Zona de risco
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Zerar todos os dados importados
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Apaga todas as visitas, faltas, atestados, arquivos da Central e dados do storage.
                Essa ação não pode ser desfeita.
              </p>
            </div>
            <button
              type="button"
              disabled={resetting}
              onClick={() => void handleResetAll()}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-destructive px-5 py-2.5 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {resetting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Apagando...
                </>
              ) : (
                <>
                  <Trash2 className="size-4" />
                  Zerar tudo
                </>
              )}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function SecaoRecolhivel({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao: string;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-accent/50"
      >
        <span>
          <span className="block text-base font-semibold text-card-foreground">{titulo}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{descricao}</span>
        </span>
        <ChevronDown
          className={`size-5 shrink-0 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`}
        />
      </button>
      {aberto ? <div className="border-t border-border p-5">{children}</div> : null}
    </div>
  );
}
