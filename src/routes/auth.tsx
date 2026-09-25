import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogIn, Mail, Lock, Shield, User, Building2, UserPlus, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cadastrarConta, type CadastroRole } from "@/lib/cadastro.functions";
import { entrarComUsuario } from "@/lib/auth.functions";
import { ThemeToggle } from "@/components/ThemeToggle";
import loginBgAsset from "@/assets/video-autenticacao-claro.webm.asset.json";
import logoBranca from "@/assets/logo-nxs-plus-branca.png.asset.json";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Acesso | NXS GESTÃO" },
      {
        name: "description",
        content:
          "Entre para acessar o NXS GESTÃO — Portal de Indicadores: gestão inteligente e controle em tempo real.",
      },
      { property: "og:title", content: "Acesso | NXS GESTÃO" },
      {
        property: "og:description",
        content: "Login para acessar o NXS GESTÃO de indicadores de supervisão de postos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function ThemedBackgroundVideo() {
  return (
    <video
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
      src={loginBgAsset.url}
      aria-hidden="true"
    />
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const [modo, setModo] = useState<"login" | "cadastro">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [role, setRole] = useState<CadastroRole>("diretor");
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) void navigate({ to: "/", replace: true });
      })
      .catch((err) => {
        console.error("[Auth] Failed to check session:", err);
      });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const resultado = await entrarComUsuario({
        data: { usuario: email.trim(), senha: password },
      });
      if (!resultado.ok) {
        setError(
          resultado.motivo === "rate_limit"
            ? "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente."
            : "Usuário ou senha inválidos.",
        );
        return;
      }
      const { error: err } = await supabase.auth.setSession({
        access_token: resultado.access_token,
        refresh_token: resultado.refresh_token,
      });
      if (err) {
        setError("Usuário ou senha inválidos.");
        return;
      }
      void navigate({ to: "/", replace: true });
    } catch (err) {
      console.error("[Auth] Login failed:", err);
      setError("Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function onCadastrar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSucesso(null);

    try {
      await cadastrarConta({
        data: { nome, email, senha: password, role, departamento },
      });
      setSucesso(
        "Cadastro enviado! Sua solicitação foi encaminhada ao superadmin. Você poderá entrar assim que o acesso for aprovado.",
      );
      setModo("login");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a conta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative grid min-h-screen bg-background lg:grid-cols-[minmax(20rem,0.85fr)_minmax(28rem,1.15fr)]">
        <ClientOnly
          fallback={
            <div className="pointer-events-none absolute inset-0 z-0 bg-background" aria-hidden="true" />
          }
        >
          <ThemedBackgroundVideo />
        </ClientOnly>
        <div className="absolute inset-0 z-[1] bg-black/50 dark:bg-black/70" aria-hidden="true" />
        <ClientOnly fallback={<div className="fixed right-4 top-4 z-50 size-9" />}>
          <ThemeToggle className="fixed right-4 top-4 z-50 shadow-xs" />
        </ClientOnly>
        <div className="relative z-10 hidden flex-col justify-between p-10 lg:flex">
          <div className="flex items-center gap-3"><img src={logoBranca.url} alt="NXS Plus Gestão" className="h-8 w-auto" draggable={false} /><div><p className="font-display text-sm font-semibold text-white">NXS GESTÃO</p><p className="text-xs text-white/70">Central integrada com a sua Empresa</p></div></div>
          <div className="max-w-sm"><p className="text-xs font-semibold text-[#7db4e8]">AMBIENTE CORPORATIVO</p><h1 className="mt-8 font-display text-3xl font-semibold leading-tight text-white">Controle com segurança e precisão.</h1><p className="mt-8 text-sm leading-6 text-white/80">Acesse relatórios, protocolos, indicadores e fluxos autorizados para o seu perfil.</p></div>
          <p className="mt-16 text-xs text-white/60 lg:mt-0">Acesso protegido e monitorado.</p>
        </div>

        {/* ── Right panel: login form ── */}
        <div className="relative z-10 flex items-center justify-center px-5 py-16 sm:px-8">
          <div className="w-full max-w-sm">
            <div className="mb-4 flex items-center justify-center">
              <img
                src={logoBranca.url}
                alt="NXS Plus Gestão"
                className="h-14 w-auto object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
                draggable={false}
              />
            </div>
            <div className="rounded-lg border border-border bg-card p-6 shadow-panel sm:p-8">
              <div className="mb-5 grid grid-cols-2 gap-1 rounded-md border border-border bg-muted/40 p-1">
                {(["login", "cadastro"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setModo(m);
                      setError(null);
                      setSucesso(null);
                    }}
                    className={`rounded-sm px-3 py-2 text-xs font-semibold transition-colors ${
                      modo === m
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m === "login" ? "Entrar" : "Criar conta"}
                  </button>
                ))}
              </div>

              <div className="mb-6 text-center">
                <h2 className="font-display text-xl font-bold text-foreground">
                  {modo === "login" ? "Acesse sua conta" : "Cadastrar usuário"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {modo === "login"
                    ? "Insira suas credenciais para continuar"
                    : "Preencha os dados para criar seu acesso"}
                </p>
              </div>

              <form onSubmit={modo === "login" ? onSubmit : onCadastrar} className="space-y-5">
                {modo === "cadastro" && (
                  <div className="space-y-2">
                    <Label htmlFor="auth-nome" className="text-sm font-medium text-foreground">
                      Nome completo
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="auth-nome"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        required
                        placeholder="Seu nome completo"
                        className="h-11 border-border/60 bg-background/50 pl-10 text-sm transition-all focus-visible:border-primary/50 focus-visible:ring-primary/30"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="auth-email" className="text-sm font-medium text-foreground">
                    {modo === "login" ? "Usuário ou e-mail" : "E-mail"}
                  </Label>
                  <div className="relative">
                    {modo === "login" ? (
                      <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    ) : (
                      <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    )}
                    <Input
                      id="auth-email"
                      type={modo === "login" ? "text" : "email"}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder={modo === "login" ? "Seu usuário ou e-mail" : "seu@email.com"}
                      autoComplete="username"
                      className="h-11 border-border/60 bg-background/50 pl-10 text-sm transition-all focus-visible:border-primary/50 focus-visible:ring-primary/30"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="auth-password" className="text-sm font-medium text-foreground">
                    Senha
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="auth-password"
                      type={mostrarSenha ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="h-11 border-border/60 bg-background/50 pl-10 pr-10 text-sm transition-all focus-visible:border-primary/50 focus-visible:ring-primary/30"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarSenha((v) => !v)}
                      aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                      aria-pressed={mostrarSenha}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
                    >
                      {mostrarSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {modo === "cadastro" && (
                    <p className="text-xs text-muted-foreground">
                      Mínimo 8 caracteres, com maiúscula, minúscula, número e símbolo.
                    </p>
                  )}
                </div>

                {modo === "cadastro" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="auth-role" className="text-sm font-medium text-foreground">
                        Função
                      </Label>
                      <select
                        id="auth-role"
                        value={role}
                        onChange={(e) => setRole(e.target.value as CadastroRole)}
                        className="h-11 w-full rounded-md border border-border/60 bg-background/50 px-3 text-sm text-foreground outline-none transition-all focus-visible:border-primary/50"
                      >
                        <option value="diretor">Diretor</option>
                        <option value="coordenador">Coordenador</option>
                        <option value="mesa_operacional">Mesa Operacional</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="auth-departamento"
                        className="text-sm font-medium text-foreground"
                      >
                        Departamento
                      </Label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="auth-departamento"
                          value={departamento}
                          onChange={(e) => setDepartamento(e.target.value)}
                          required
                          placeholder="Ex.: NXS GESTÃO"
                          className="h-11 border-border/60 bg-background/50 pl-10 text-sm transition-all focus-visible:border-primary/50 focus-visible:ring-primary/30"
                        />
                      </div>
                    </div>
                  </>
                )}

                {sucesso && (
                  <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
                    <p className="text-sm text-primary">{sucesso}</p>
                  </div>
                )}

                {error && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={busy}
                  className="h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold transition-all shadow-lg"
                >
                  {modo === "login" ? (
                    <LogIn className="size-4 mr-2" />
                  ) : (
                    <UserPlus className="size-4 mr-2" />
                  )}
                  {busy
                    ? modo === "login"
                      ? "Entrando..."
                      : "Criando conta..."
                    : modo === "login"
                      ? "Entrar"
                      : "Criar conta"}
                </Button>
              </form>

              {/* Secure badge */}
              <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Shield className="size-3.5 text-primary/60" />
                <span>Sistema seguro com criptografia</span>
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-muted-foreground/60">
              NXS GESTÃO PARA SUA EMPRESA
            </p>
          </div>
        </div>
      </main>
  );
}
