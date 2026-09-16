/**
 * Parecer de autenticidade documental do atestado.
 */
import { AlertTriangle, FileSearch, Info, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  ROTULO_RESULTADO,
  type ParecerAutenticidade,
  type ResultadoParecer,
} from "@/lib/atestado-parecer";

const CORES: Record<ResultadoParecer, string> = {
  validado: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  aparentemente_consistente: "border-sky-500/40 bg-sky-500/10 text-sky-700",
  inconsistente: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  alto_risco_nao_validado: "border-red-500/40 bg-red-500/10 text-red-700",
  inconclusivo: "border-muted bg-muted/40 text-muted-foreground",
};

const CORES_GRAVIDADE: Record<string, string> = {
  alta: "border-red-500/40 bg-red-500/10 text-red-700",
  media: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  baixa: "border-input bg-background text-foreground",
};

const ROTULO_DADO: Record<string, string> = {
  paciente: "Paciente",
  cpf_mascarado: "CPF (mascarado)",
  data_atendimento: "Data do atendimento",
  data_emissao: "Data de emissão",
  afastamento_dias: "Dias de afastamento",
  inicio_afastamento: "Início do afastamento",
  fim_afastamento: "Fim do afastamento",
  medico: "Médico",
  crm: "CRM",
  uf_crm: "UF do CRM",
  instituicao: "Instituição",
  municipio: "Município",
  cid: "CID",
  codigo_documento: "Código do documento",
};

function simNaoNulo(v: boolean | null): string {
  return v === true ? "Sim" : v === false ? "Não" : "Não avaliado";
}

export function ParecerAutenticidadeCard({
  parecer,
}: {
  parecer?: ParecerAutenticidade | undefined;
}) {
  if (!parecer) return null;

  const ok = parecer.resultado === "validado";

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <FileSearch className="size-4 text-primary" />
        Parecer de autenticidade documental
      </h2>

      {!parecer.disponivel ? (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            {parecer.mensagem || "Parecer de autenticidade indisponível."}
          </p>
          {parecer.regrasDeterministicas.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-red-700">
              {parecer.regrasDeterministicas.map((d, i) => (
                <li key={`${d.campo}-${i}`}>
                  {d.campo}: documento “{d.valorDocumento}” · fonte “{d.valorFonte}”
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold ${CORES[parecer.resultado]}`}
            >
              {ok ? <ShieldCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
              {ROTULO_RESULTADO[parecer.resultado]}
            </span>
            <span className="text-xs text-muted-foreground">
              Confiança na classificação: {parecer.nivelConfianca}%
            </span>
            {parecer.rebaixadoPorRegra ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-700">
                <AlertTriangle className="size-3.5" />
                Classificação ajustada pelas regras do sistema
              </span>
            ) : null}
            {parecer.exigeConfirmacaoHumana ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1 text-xs text-muted-foreground">
                <Info className="size-3.5" />
                Exige confirmação humana ou institucional
              </span>
            ) : null}
          </div>

          {parecer.resumo ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {parecer.resumo}
            </p>
          ) : null}

          {Object.keys(parecer.dadosDocumento).length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(parecer.dadosDocumento).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-input bg-background p-2">
                  <p className="text-xs uppercase text-muted-foreground">{ROTULO_DADO[k] ?? k}</p>
                  <p className="text-sm text-foreground">{v}</p>
                </div>
              ))}
            </div>
          ) : null}

          {parecer.divergencias.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Divergências</p>
              {parecer.divergencias.map((d, i) => (
                <div
                  key={`${d.campo}-${i}`}
                  className={`rounded-lg border p-2 text-xs ${CORES_GRAVIDADE[d.gravidade] ?? CORES_GRAVIDADE["baixa"]}`}
                >
                  <p className="font-semibold">
                    {d.campo} · gravidade {d.gravidade}
                  </p>
                  <p>Documento: {d.valorDocumento || "—"}</p>
                  <p>Fonte de validação: {d.valorFonte || "—"}</p>
                  {d.explicacao ? <p className="mt-1">{d.explicacao}</p> : null}
                </div>
              ))}
            </div>
          ) : null}

          {parecer.achadosTecnicos.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Achados técnicos
              </p>
              {parecer.achadosTecnicos.map((t, i) => (
                <p key={`${t.achado}-${i}`} className="text-sm text-foreground">
                  <span className="text-xs uppercase text-muted-foreground">
                    {t.tipo} · impacto {t.impacto}:{" "}
                  </span>
                  {t.achado}
                </p>
              ))}
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            {[
              [
                "Assinatura digital verificada",
                simNaoNulo(parecer.assinaturaIntegridade.assinaturaDigitalVerificada),
              ],
              [
                "Assinatura visual presente",
                simNaoNulo(parecer.assinaturaIntegridade.assinaturaVisualPresente),
              ],
              ["Qualidade da imagem", parecer.analiseVisual.qualidadeVisual],
              ["Sinais de edição", parecer.analiseVisual.sinaisDeEdicao.replace(/_/g, " ")],
              ["QR Code detectado", simNaoNulo(parecer.analiseVisual.qrCodeDetectado)],
              ["Carimbo detectado", simNaoNulo(parecer.analiseVisual.carimboDetectado)],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="rounded-lg border border-input bg-background p-2">
                <p className="text-xs uppercase text-muted-foreground">{rotulo}</p>
                <p className="text-sm text-foreground">{valor}</p>
              </div>
            ))}
          </div>

          {parecer.analiseVisual.areasSuspeitas.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Áreas com aspecto a conferir
              </p>
              {parecer.analiseVisual.areasSuspeitas.map((s, i) => (
                <p key={`${s.regiao}-${i}`} className="text-sm text-foreground">
                  <span className="text-xs uppercase text-muted-foreground">
                    {s.regiao} · impacto {s.impacto}:{" "}
                  </span>
                  {s.descricao}
                </p>
              ))}
            </div>
          ) : null}

          {parecer.fontesVerificadas.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Fontes verificadas
              </p>
              {parecer.fontesVerificadas.map((f, i) => (
                <p key={`${f.identificacao}-${i}`} className="text-sm text-foreground">
                  <span className="text-xs uppercase text-muted-foreground">
                    {f.tipo} · {f.oficialidade}
                    {f.dataConsulta ? ` · ${f.dataConsulta}` : ""}:{" "}
                  </span>
                  {f.identificacao ? `${f.identificacao} — ` : ""}
                  {f.resultado}
                </p>
              ))}
            </div>
          ) : null}

          {parecer.recomendacoes.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Recomendações</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                {parecer.recomendacoes.map((r, i) => (
                  <li key={`${r}-${i}`}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {parecer.mensagemOperacional ? (
            <p className="rounded-lg border border-input bg-background p-2 text-sm text-foreground">
              {parecer.mensagemOperacional}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
