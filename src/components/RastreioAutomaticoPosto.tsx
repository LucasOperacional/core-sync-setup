import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";

import { verificarRastreioPerto } from "@/lib/rastreio-lembrete.functions";

/** Intervalo entre as conferências automáticas (5 minutos). */
const INTERVALO_MS = 5 * 60_000;

function pegarPosicao(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    const timer = setTimeout(() => resolve(null), 10_000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

/**
 * Confere sozinho, em segundo plano, se a pessoa está perto de um posto da NEXTI
 * e envia o lembrete do Relatório de Supervisão de Campo. Não desenha nada na
 * tela e não pede nenhuma ação do usuário.
 */
export function RastreioAutomaticoPosto() {
  const verificar = useServerFn(verificarRastreioPerto);
  const rodando = useRef(false);

  useEffect(() => {
    let ativo = true;

    const conferir = async () => {
      if (!ativo || rodando.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      rodando.current = true;
      try {
        const posicao = await pegarPosicao();
        if (!ativo) return;
        await verificar({
          data: {
            escopo: "eu",
            enviar: true,
            latitude: posicao?.latitude ?? null,
            longitude: posicao?.longitude ?? null,
          },
        });
      } catch {
        /* silencioso: tenta de novo no próximo ciclo */
      } finally {
        rodando.current = false;
      }
    };

    const primeiro = setTimeout(conferir, 8_000);
    const ciclo = setInterval(conferir, INTERVALO_MS);

    return () => {
      ativo = false;
      clearTimeout(primeiro);
      clearInterval(ciclo);
    };
  }, [verificar]);

  return null;
}
