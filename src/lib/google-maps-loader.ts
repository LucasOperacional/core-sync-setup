/// <reference types="google.maps" />
/** Carrega a API do Google Maps (JavaScript) uma única vez, de forma assíncrona. */
let promessa: Promise<typeof google.maps> | null = null;

declare global {
  interface Window {
    __initGoogleMaps?: () => void;
  }
}

export function carregarGoogleMaps(): Promise<typeof google.maps> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps só carrega no navegador"));
  }
  if (promessa) return promessa;

  const chave = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"] as
    | string
    | undefined;
  const canal = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID"] as
    | string
    | undefined;

  if (!chave) {
    return Promise.reject(new Error("Chave do Google Maps não configurada"));
  }

  promessa = new Promise((resolve, reject) => {
    if (typeof google !== "undefined" && google.maps?.Map) {
      resolve(google.maps);
      return;
    }
    window.__initGoogleMaps = () => resolve(google.maps);
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: chave,
      loading: "async",
      callback: "__initGoogleMaps",
      v: "weekly",
    });
    if (canal) params.set("channel", canal);
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => reject(new Error("Falha ao carregar o Google Maps"));
    document.head.appendChild(script);
  });

  return promessa;
}

/** Estilo escuro para o mapa. */
export const ESTILO_ESCURO: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#373737" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
];

/** Estilo claro sem pontos de interesse clicáveis. */
export const ESTILO_CLARO: google.maps.MapTypeStyle[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
];
