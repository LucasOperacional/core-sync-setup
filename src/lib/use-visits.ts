import { useEffect, useState } from "react";
import type { Visit } from "@/lib/report-parser";
import { listVisitas } from "@/lib/visitas-db";
import { supabase } from "@/integrations/supabase/client";

export const VISITS_STORAGE_KEY = "nexti-visitas-v1";

export function slugifyGerente(nome: string) {
  return (
    nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "nao-identificado"
  );
}

export function useVisits() {
  const [visits, setVisits] = useState<Visit[]>([]);

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
      const raw = localStorage.getItem(VISITS_STORAGE_KEY);
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

  return { visits, setVisits };
}
