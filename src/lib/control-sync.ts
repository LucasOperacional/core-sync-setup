/**
 * Ponte de sincronização entre o card "Importar PDF de Relatórios" (página de
 * administração) e o Dashboard CONTROL.
 *
 * Além do evento local, usamos BroadcastChannel + localStorage para que o
 * dashboard seja atualizado mesmo quando estiver aberto em outra aba.
 */
export const EVENTO_CONTROL_ATUALIZADO = "control:visitas-atualizadas";
const CANAL = "control-visitas";
const PING_KEY = "control:ultima-importacao";

export function notificarControlAtualizado(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENTO_CONTROL_ATUALIZADO));
  try {
    localStorage.setItem(PING_KEY, String(Date.now()));
  } catch {
    /* storage indisponível */
  }
  try {
    const bc = new BroadcastChannel(CANAL);
    bc.postMessage("atualizado");
    bc.close();
  } catch {
    /* navegador sem BroadcastChannel */
  }
}

/** Registra um callback disparado sempre que uma importação sincroniza o Control. */
export function ouvirControlAtualizado(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVENTO_CONTROL_ATUALIZADO, handler);
  window.addEventListener("focus", handler);
  const onStorage = (e: StorageEvent) => {
    if (e.key === PING_KEY) cb();
  };
  window.addEventListener("storage", onStorage);

  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CANAL);
    bc.onmessage = handler;
  } catch {
    bc = null;
  }

  return () => {
    window.removeEventListener(EVENTO_CONTROL_ATUALIZADO, handler);
    window.removeEventListener("focus", handler);
    window.removeEventListener("storage", onStorage);
    bc?.close();
  };
}
