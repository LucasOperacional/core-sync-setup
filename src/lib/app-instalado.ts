/**
 * Detecta se o sistema está sendo usado pelo aplicativo instalado no aparelho
 * (tela inicial / tela cheia). Regra: com o aplicativo instalado, o GPS fica
 * travado e ligado, sem opção de desligar.
 */

const CHAVE = "app_instalado";

function emStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    window.matchMedia?.("(display-mode: fullscreen)").matches === true ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Marca no aparelho que o aplicativo foi instalado (trava permanente do GPS). */
export function marcarAppInstalado(): void {
  try {
    window.localStorage.setItem(CHAVE, "1");
  } catch {
    /* aparelho sem armazenamento local */
  }
}

/** Verdadeiro quando o aplicativo está instalado neste aparelho. */
export function appInstalado(): boolean {
  if (typeof window === "undefined") return false;
  if (emStandalone()) {
    marcarAppInstalado();
    return true;
  }
  try {
    return window.localStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}

/**
 * Observa a instalação do aplicativo e avisa quando o GPS deve ficar travado.
 * Retorna a função de limpeza dos ouvintes.
 */
export function observarAppInstalado(aoMudar: (instalado: boolean) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const avaliar = () => aoMudar(appInstalado());
  const aoInstalar = () => {
    marcarAppInstalado();
    aoMudar(true);
  };
  avaliar();
  window.addEventListener("appinstalled", aoInstalar);
  const consulta = window.matchMedia?.("(display-mode: standalone)");
  consulta?.addEventListener?.("change", avaliar);
  return () => {
    window.removeEventListener("appinstalled", aoInstalar);
    consulta?.removeEventListener?.("change", avaliar);
  };
}
