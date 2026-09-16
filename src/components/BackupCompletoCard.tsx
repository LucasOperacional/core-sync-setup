import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import JSZip from "jszip";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  Loader2,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

import {
  exportarConfiguracoesBackup,
  exportarTabelaBackup,
  listarArquivosBackup,
  listarInventarioBackup,
  verificarIntegridadeBackup,
  type ItemVerificacao,
} from "@/lib/backup.functions";

function formatarBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const ICONES: Record<ItemVerificacao["status"], typeof CheckCircle2> = {
  ok: CheckCircle2,
  corrigido: Wrench,
  aviso: AlertTriangle,
};

const CORES: Record<ItemVerificacao["status"], string> = {
  ok: "text-emerald-600",
  corrigido: "text-sky-600",
  aviso: "text-amber-600",
};

export function BackupCompletoCard() {
  const verificar = useServerFn(verificarIntegridadeBackup);
  const inventario = useServerFn(listarInventarioBackup);
  const exportarTabela = useServerFn(exportarTabelaBackup);
  const exportarConfig = useServerFn(exportarConfiguracoesBackup);
  const listarArquivos = useServerFn(listarArquivosBackup);

  const [rodando, setRodando] = useState(false);
  const [etapa, setEtapa] = useState("");
  const [progresso, setProgresso] = useState(0);
  const [itens, setItens] = useState<ItemVerificacao[]>([]);
  const [incluirArquivos, setIncluirArquivos] = useState(true);
  const [ultimoBackup, setUltimoBackup] = useState<string | null>(null);

  const executar = useCallback(async () => {
    setRodando(true);
    setItens([]);
    setProgresso(2);
    setEtapa("Verificando e corrigindo os dados…");

    try {
      const verificacao = await verificar({});
      setItens(verificacao.itens);
      const corrigidos = verificacao.itens.filter((i) => i.status === "corrigido").length;
      if (corrigidos > 0) toast.success(`${corrigidos} problema(s) corrigido(s) antes do backup.`);

      setProgresso(8);
      setEtapa("Levantando o que será salvo…");
      const inv = await inventario({});

      const zip = new JSZip();
      const dados = zip.folder("dados")!;

      const totalTabelas = inv.tabelas.length;
      let indice = 0;
      const resumoTabelas: { nome: string; registros: number }[] = [];

      for (const tabela of inv.tabelas) {
        indice += 1;
        setEtapa(`Salvando dados (${indice}/${totalTabelas}): ${tabela.nome}`);
        const linhas: unknown[] = [];
        let pagina = 0;
        for (;;) {
          const parte = await exportarTabela({ data: { nome: tabela.nome, pagina } });
          linhas.push(...parte.registros);
          if (parte.fim) break;
          pagina += 1;
        }
        dados.file(`${tabela.nome}.json`, JSON.stringify(linhas, null, 2));
        resumoTabelas.push({ nome: tabela.nome, registros: linhas.length });
        setProgresso(8 + Math.round((indice / Math.max(1, totalTabelas)) * (incluirArquivos ? 55 : 80)));
      }

      setEtapa("Salvando configurações, integrações e usuários…");
      const config = await exportarConfig({});
      zip.file("configuracoes-e-usuarios.json", JSON.stringify(config, null, 2));

      let arquivosSalvos = 0;
      let arquivosFalhos: string[] = [];
      if (incluirArquivos) {
        const pasta = zip.folder("arquivos")!;
        const totalBuckets = inv.buckets.length;
        let b = 0;
        for (const bucket of inv.buckets) {
          b += 1;
          const lista = await listarArquivos({ data: { bucket: bucket.nome } });
          let i = 0;
          for (const arquivo of lista) {
            i += 1;
            setEtapa(
              `Salvando arquivos de ${bucket.nome} (${i}/${lista.length}) — pasta ${b}/${totalBuckets}`,
            );
            try {
              const resposta = await fetch(arquivo.url);
              if (!resposta.ok) throw new Error(String(resposta.status));
              pasta.file(`${bucket.nome}/${arquivo.caminho}`, await resposta.blob());
              arquivosSalvos += 1;
            } catch {
              arquivosFalhos.push(`${bucket.nome}/${arquivo.caminho}`);
            }
            setProgresso(
              63 + Math.round(((b - 1 + i / Math.max(1, lista.length)) / Math.max(1, totalBuckets)) * 27),
            );
          }
        }
      }

      const agora = new Date();
      const relatorio = {
        geradoEm: agora.toISOString(),
        verificacao: verificacao.itens,
        conteudo: {
          conjuntosDeDados: resumoTabelas.length,
          registros: resumoTabelas.reduce((s, t) => s + t.registros, 0),
          arquivos: arquivosSalvos,
          arquivosNaoSalvos: arquivosFalhos,
          incluiuArquivos: incluirArquivos,
        },
        tabelas: resumoTabelas,
        observacao:
          "Senhas, chaves e tokens não são gravados em claro por segurança: o backup registra apenas quais integrações estão configuradas.",
      };
      zip.file("relatorio-backup.json", JSON.stringify(relatorio, null, 2));
      zip.file(
        "LEIA-ME.txt",
        [
          `Backup completo gerado em ${agora.toLocaleString("pt-BR")}`,
          "",
          `Conjuntos de dados: ${resumoTabelas.length}`,
          `Registros: ${relatorio.conteudo.registros}`,
          `Arquivos: ${arquivosSalvos}`,
          "",
          "dados/ ................ todos os registros do sistema (um arquivo por conjunto)",
          "arquivos/ ............. PDFs, planilhas e anexos enviados",
          "configuracoes-e-usuarios.json .. ajustes, integrações ativas, contas e permissões",
          "relatorio-backup.json .. verificação feita antes de gravar e resumo do conteúdo",
          "",
          "Por segurança, senhas e chaves de integração não são gravadas em claro.",
        ].join("\n"),
      );

      setEtapa("Compactando o backup…");
      setProgresso(94);
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });

      const nome = `backup-completo-${agora.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.zip`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setProgresso(100);
      setEtapa(`Backup concluído: ${nome} (${formatarBytes(blob.size)})`);
      setUltimoBackup(agora.toLocaleString("pt-BR"));
      if (arquivosFalhos.length > 0) {
        toast.warning(`${arquivosFalhos.length} arquivo(s) não puderam ser baixados.`);
      } else {
        toast.success("Backup completo gerado sem erros.");
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Falha ao gerar o backup.";
      setEtapa(`Backup interrompido: ${mensagem}`);
      toast.error(mensagem);
    } finally {
      setRodando(false);
    }
  }, [verificar, inventario, exportarTabela, exportarConfig, listarArquivos, incluirArquivos]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseBackup className="h-5 w-5 text-primary" />
          Backup completo
        </CardTitle>
        <CardDescription>
          Verifica e corrige os dados e depois baixa um único arquivo com todos os registros,
          arquivos enviados, configurações, contas e permissões.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="incluir-arquivos">Incluir arquivos enviados</Label>
            <p className="text-muted-foreground text-xs">
              PDFs, planilhas e anexos. Deixe desligado para um backup mais rápido e leve.
            </p>
          </div>
          <Switch
            id="incluir-arquivos"
            checked={incluirArquivos}
            onCheckedChange={setIncluirArquivos}
            disabled={rodando}
          />
        </div>

        <Button onClick={executar} disabled={rodando} className="w-full">
          {rodando ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {rodando ? "Gerando backup…" : "Fazer backup completo"}
        </Button>

        {(rodando || progresso > 0) && (
          <div className="space-y-2">
            <Progress value={progresso} />
            <p className="text-muted-foreground text-xs">{etapa}</p>
          </div>
        )}

        {itens.length > 0 && (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Verificação antes do backup</p>
            <ul className="space-y-2">
              {itens.map((item) => {
                const Icone = ICONES[item.status];
                return (
                  <li key={item.titulo} className="flex gap-2 text-xs">
                    <Icone className={`mt-0.5 h-4 w-4 shrink-0 ${CORES[item.status]}`} />
                    <span>
                      <span className="font-medium">{item.titulo}: </span>
                      {item.detalhe}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {ultimoBackup && !rodando && (
          <p className="text-muted-foreground text-xs">Último backup baixado em {ultimoBackup}.</p>
        )}
      </CardContent>
    </Card>
  );
}
