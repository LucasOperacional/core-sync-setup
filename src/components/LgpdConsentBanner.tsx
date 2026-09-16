import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { getLgpdPanorama, registrarConsentimento } from "@/lib/lgpd.functions";
import { Button } from "@/components/ui/button";

/**
 * Banner de consentimento LGPD (Lei nº 13.709/2018, art. 8º).
 * Aparece enquanto o titular não registrar o aceite da versão atual da política.
 */
export function LgpdConsentBanner() {
  const carregar = useServerFn(getLgpdPanorama);
  const registrar = useServerFn(registrarConsentimento);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["lgpd-panorama"],
    queryFn: () => carregar(),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (aceito: boolean) =>
      registrar({
        data: { aceito, versao: data?.config.politicaVersao ?? "1.0" },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lgpd-panorama"] }),
  });

  if (!data?.config.bannerConsentimentoAtivo) return null;
  const consentimento = data.consentimentoAtual;
  const jaAceitouVersaoAtual =
    consentimento?.aceito && consentimento.versao === data.config.politicaVersao;
  if (jaAceitouVersaoAtual) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-[60] border-t border-border bg-card/95 p-4 backdrop-blur sm:bottom-0">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center">
        <ShieldCheck className="size-6 shrink-0 text-primary" />
        <p className="flex-1 text-sm text-muted-foreground">
          Tratamos dados pessoais conforme a <strong>LGPD (Lei nº 13.709/2018)</strong>, apenas para
          as finalidades operacionais descritas na{" "}
          <Link to="/politica-privacidade" className="font-medium text-primary underline">
            Política de Privacidade
          </Link>{" "}
          (versão {data.config.politicaVersao}). Você pode exercer seus direitos a qualquer momento.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(false)}
          >
            Recusar
          </Button>
          <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate(true)}>
            Aceitar e continuar
          </Button>
        </div>
      </div>
    </div>
  );
}
