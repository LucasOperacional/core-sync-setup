import { useCallback, useEffect, useState } from "react";

export type Tema = "claro" | "escuro";

const CHAVE = "tema-app";

function aplicar(tema: Tema) {
  const raiz = document.documentElement;
  raiz.classList.toggle("dark", tema === "escuro");
  raiz.style.colorScheme = tema === "escuro" ? "dark" : "light";
}

/**
 * Tema claro/escuro do projeto. O valor escolhido fica salvo no aparelho.
 * O padrão é o tema escuro, mantendo a aparência atual do sistema.
 */
export function useTema() {
  const [tema, setTema] = useState<Tema>("escuro");

  useEffect(() => {
    let inicial: Tema = "escuro";
    try {
      const salvo = localStorage.getItem(CHAVE);
      if (salvo === "claro" || salvo === "escuro") inicial = salvo;
    } catch {
      /* armazenamento indisponível */
    }
    setTema(inicial);
    aplicar(inicial);
  }, []);

  const alternarTema = useCallback(() => {
    setTema((atual) => {
      const proximo: Tema = atual === "escuro" ? "claro" : "escuro";
      aplicar(proximo);
      try {
        localStorage.setItem(CHAVE, proximo);
      } catch {
        /* armazenamento indisponível */
      }
      return proximo;
    });
  }, []);

  return { tema, alternarTema };
}
