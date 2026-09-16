import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Estado da conexão de uma chave de API configurada no painel de IA.
 */
export type ConexaoEstado = "vazio" | "curta" | "salvando" | "verificando" | "conectado" | "erro";

type Opcoes = {
  /** Valor atual da chave digitada. */
  chave: string;
  /** Tamanho mínimo para valer a pena salvar/testar. */
  minLength?: number;
  /** Persiste a configuração (localStorage). */
  salvar: () => void;
  /** Testa a conexão com o provedor. */
  testar: () => Promise<{ ok: boolean; erro?: string | undefined }>;
  /** Tempo de espera após a digitação parar (ms). */
  atraso?: number;
};

/**
 * Salva a chave automaticamente pouco depois de o usuário parar de digitar e,
 * em seguida, verifica a conexão — sem precisar clicar em "Salvar"/"Testar".
 */
export function useAutoConexaoChave({
  chave,
  minLength = 8,
  salvar,
  testar,
  atraso = 1200,
}: Opcoes) {
  const [estado, setEstado] = useState<ConexaoEstado>("vazio");
  const [erro, setErro] = useState<string | null>(null);
  const [verificadoEm, setVerificadoEm] = useState<number | null>(null);

  const salvarRef = useRef(salvar);
  const testarRef = useRef(testar);
  salvarRef.current = salvar;
  testarRef.current = testar;

  const limpa = chave.trim();
  const ultimaOk = useRef<string | null>(null);
  const emAndamento = useRef(false);

  const executar = useCallback(async (valor: string) => {
    if (emAndamento.current) return;
    emAndamento.current = true;
    try {
      setEstado("salvando");
      setErro(null);
      salvarRef.current();
      setEstado("verificando");
      const res = await testarRef.current();
      if (res.ok) {
        ultimaOk.current = valor;
        setVerificadoEm(Date.now());
        setEstado("conectado");
        setErro(null);
      } else {
        setEstado("erro");
        setErro(res.erro ?? "Não foi possível validar a chave.");
      }
    } catch (err) {
      setEstado("erro");
      setErro(err instanceof Error ? err.message : "Erro desconhecido ao validar a chave.");
    } finally {
      emAndamento.current = false;
    }
  }, []);

  useEffect(() => {
    if (!limpa) {
      ultimaOk.current = null;
      setEstado("vazio");
      setErro(null);
      setVerificadoEm(null);
      return;
    }
    if (limpa.length < minLength) {
      setEstado("curta");
      setErro(null);
      return;
    }
    if (ultimaOk.current === limpa) {
      setEstado("conectado");
      return;
    }
    const t = setTimeout(() => void executar(limpa), atraso);
    return () => clearTimeout(t);
  }, [limpa, minLength, atraso, executar]);

  const revalidar = useCallback(() => {
    if (limpa.length >= minLength) {
      ultimaOk.current = null;
      void executar(limpa);
    }
  }, [limpa, minLength, executar]);

  return { estado, erro, verificadoEm, revalidar } as const;
}
