import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { registrarLog, moduloDaRota } from "@/lib/registrar-atividade";

/** Nomes amigáveis de algumas páginas para o registro de atividades. */
const TITULOS: Record<string, string> = {
  "": "Página inicial",
  coordenacao: "Coordenação",
  "coordenacao-crt": "Coordenação — CRT",
  "coordenacao-movimentacoes": "Coordenação — Movimentações",
  supervisor: "Supervisão",
  "supervisor-crt": "Supervisão — CRT",
  "supervisor-campo": "Supervisão de Campo",
  "supervisao-campo": "Supervisão em Campo",
  "movimentacao-posto": "Movimentação de Posto",
  atestados: "Atestados",
  faltas: "Faltas",
  usuarios: "Usuários",
  admin: "Administração",
  "logs-atividades": "Logs de atividades",
};

/**
 * Registra automaticamente as páginas visitadas pelo usuário logado.
 * Fica montado no root e nunca renderiza nada na tela.
 */
export function RegistroAtividadeAuto() {
  const rota = useRouterState({ select: (s) => s.location.pathname });
  const ultima = useRef<string | null>(null);

  useEffect(() => {
    if (!rota || ultima.current === rota) return;
    ultima.current = rota;
    const chave = rota.split("/").filter(Boolean)[0] ?? "";
    const titulo = TITULOS[chave] ?? rota;
    void registrarLog(`Acessou ${titulo}`, { modulo: moduloDaRota(rota), rota });
  }, [rota]);

  return null;
}
