import { Capacitor, registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";

export function ehAppNativo(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

let watcherId: string | null = null;

/** GPS do app Android: roda em segundo plano com notificação fixa. */
export async function iniciarGpsNativo(
  aoReceber: (pos: GeolocationPosition) => void,
  aoFalhar: (msg: string) => void,
): Promise<void> {
  if (watcherId) return;
  const BG = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");
  watcherId = await BG.addWatcher(
    {
      backgroundTitle: "Rastreamento ativo",
      backgroundMessage: "NXS Plus está enviando sua localização.",
      requestPermissions: true,
      stale: false,
      distanceFilter: 10,
    },
    (loc, err) => {
      if (err) {
        if (err.code === "NOT_AUTHORIZED") {
          watcherId = null;
          aoFalhar(
            "Permita a localização \"o tempo todo\" nas configurações do celular para o rastreio funcionar.",
          );
          if (window.confirm("Abrir configurações para liberar a localização?")) {
            void BG.openSettings();
          }
        }
        return;
      }
      if (!loc) return;
      aoReceber({
        coords: {
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: loc.accuracy,
          altitude: loc.altitude,
          altitudeAccuracy: loc.altitudeAccuracy ?? null,
          heading: loc.bearing,
          speed: loc.speed,
          toJSON() {
            return this;
          },
        },
        timestamp: loc.time ?? Date.now(),
        toJSON() {
          return this;
        },
      } as GeolocationPosition);
    },
  );
}
