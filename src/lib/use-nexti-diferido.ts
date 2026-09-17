import { useEffect, useState } from "react";

/**
 * Regra global para telas que consultam a API da NEXTI:
 * a página abre primeiro (renderiza o conteúdo já salvo) e só depois,
 * quando o navegador estiver ocioso, as consultas à NEXTI são disparadas.
 *
 * Use o valor retornado no `enabled` do useQuery ou para adiar efeitos
 * que chamam a NEXTI ao montar o componente.
 */
export function useNextiDiferido(atrasoMs = 400): boolean {
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let timeoutId: number | undefined;
    let idleId: number | undefined;

    if (typeof w.requestIdleCallback === "function") {
      idleId = w.requestIdleCallback(() => setPronto(true), { timeout: atrasoMs + 1500 });
    } else {
      timeoutId = window.setTimeout(() => setPronto(true), atrasoMs);
    }

    return () => {
      if (idleId !== undefined) w.cancelIdleCallback?.(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [atrasoMs]);

  return pronto;
}
