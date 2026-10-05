import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PosicaoRastreio } from "@/lib/rastreamento.functions";
import type { PostoMapa } from "@/lib/nexti-postos-mapa.functions";
import { corDoUsuario } from "@/lib/cores-rastreio";
import { Button } from "@/components/ui/button";

type TemaMapa = "claro" | "escuro";

interface Props {
  posicoes: PosicaoRastreio[];
  focoUserId?: string | null;
  postos?: PostoMapa[];
  focoPostoId?: number | null;
  altura?: string;
}

function escapar(texto: string) {
  return texto.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function linkLocal(lat: number, lng: number) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}

/** Mapa aberto dos postos da NEXTI e das posições enviadas pelos supervisores. */
export default function RastreioMapa({
  posicoes,
  focoUserId,
  postos = [],
  focoPostoId = null,
  altura = "h-[420px]",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const camadaRef = useRef<L.TileLayer | null>(null);
  const marcadoresRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const postosRef = useRef<Map<number, L.CircleMarker>>(new Map());
  const [tema, setTema] = useState<TemaMapa>("claro");
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem("mapa_tema") === "escuro") setTema("escuro");
    } catch {
      // Armazenamento desativado no navegador.
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const mapa = L.map(containerRef.current, { zoomControl: true }).setView([-16.68, -49.25], 11);
    mapaRef.current = mapa;
    setPronto(true);
    return () => {
      marcadoresRef.current.clear();
      postosRef.current.clear();
      camadaRef.current = null;
      mapa.remove();
      mapaRef.current = null;
    };
  }, []);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    camadaRef.current?.remove();
    camadaRef.current = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
        maxZoom: 19,
      },
    ).addTo(mapa);
    try {
      window.localStorage.setItem("mapa_tema", tema);
    } catch {
      // Armazenamento desativado no navegador.
    }
  }, [tema, pronto]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    const vistos = new Set<number>();
    const comGeo = postos.filter(
      (p) => typeof p.latitude === "number" && typeof p.longitude === "number" &&
        Number.isFinite(p.latitude) && Number.isFinite(p.longitude),
    );
    for (const p of comGeo) {
      const lat = p.latitude as number;
      const lng = p.longitude as number;
      vistos.add(p.id);
      const rotulo = `<strong>${escapar(p.nome)}</strong>${p.cliente ? `<br/>${escapar(p.cliente)}` : ""}${p.enderecoCompleto ? `<br/>${escapar(p.enderecoCompleto)}` : ""}${p.telefone ? `<br/>Tel.: ${escapar(p.telefone)}` : ""}<br/><a href="${linkLocal(lat, lng)}" target="_blank" rel="noopener noreferrer">Abrir no OpenStreetMap</a>`;
      const corPosto = (p as PostoMapa & { corMapa?: string }).corMapa ?? "#f59e0b";
      let marcador = postosRef.current.get(p.id);
      if (marcador) {
        marcador.setLatLng([lat, lng]).setStyle({ fillColor: corPosto }).setPopupContent(rotulo);
      } else {
        marcador = L.circleMarker([lat, lng], {
          radius: 7, color: "#ffffff", weight: 2, fillColor: corPosto, fillOpacity: 0.9,
        }).addTo(mapa).bindPopup(rotulo);
        postosRef.current.set(p.id, marcador);
      }
    }
    for (const [id, marcador] of postosRef.current) {
      if (!vistos.has(id)) {
        marcador.remove();
        postosRef.current.delete(id);
      }
    }
    const foco = comGeo.find((p) => p.id === focoPostoId);
    if (foco && foco.latitude !== null && foco.longitude !== null) {
      mapa.setView([foco.latitude, foco.longitude], 17);
      postosRef.current.get(foco.id)?.openPopup();
    } else if (posicoes.length === 0 && comGeo.length > 0) {
      mapa.fitBounds(L.latLngBounds(comGeo.map((p) => [p.latitude as number, p.longitude as number])), { padding: [40, 40], maxZoom: 14 });
    }
  }, [postos, focoPostoId, posicoes.length, pronto]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    const vistos = new Set<string>();
    for (const p of posicoes) {
      if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) continue;
      vistos.add(p.userId);
      const cor = corDoUsuario(p.userId);
      const rotulo = `<strong>${escapar(p.nome)}</strong><br/>${new Date(p.capturadoEm).toLocaleString("pt-BR")}${p.tipoSinal ? `<br/>Sinal: ${escapar(p.tipoSinal.toUpperCase())}` : ""}<br/><a href="${linkLocal(p.latitude, p.longitude)}" target="_blank" rel="noopener noreferrer">Abrir no OpenStreetMap</a>`;
      let marcador = marcadoresRef.current.get(p.userId);
      if (marcador) {
        marcador.setLatLng([p.latitude, p.longitude]).setStyle({ fillColor: cor }).setPopupContent(rotulo);
      } else {
        marcador = L.circleMarker([p.latitude, p.longitude], {
          radius: 9, color: "#ffffff", weight: 2, fillColor: cor, fillOpacity: 0.9,
        }).addTo(mapa).bindPopup(rotulo);
        marcadoresRef.current.set(p.userId, marcador);
      }
    }
    for (const [id, marcador] of marcadoresRef.current) {
      if (!vistos.has(id)) {
        marcador.remove();
        marcadoresRef.current.delete(id);
      }
    }
    if (posicoes.length > 0) {
      const foco = focoUserId ? posicoes.find((p) => p.userId === focoUserId) : null;
      if (foco) {
        mapa.setView([foco.latitude, foco.longitude], 16);
        marcadoresRef.current.get(foco.userId)?.openPopup();
      } else {
        const validas = posicoes.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
        if (validas.length > 0) mapa.fitBounds(L.latLngBounds(validas.map((p) => [p.latitude, p.longitude])), { padding: [40, 40], maxZoom: 15 });
      }
    }
  }, [posicoes, focoUserId, pronto]);

  return (
    <div className="relative">
      <div ref={containerRef} className={`${altura} ${tema === "escuro" ? "osm-map-dark" : ""} w-full overflow-hidden bg-muted`} />
      <div className="absolute right-3 top-3 z-[500] flex overflow-hidden rounded-md border border-border bg-card shadow-md">
        {(["claro", "escuro"] as TemaMapa[]).map((opcao) => (
          <Button
            key={opcao}
            type="button"
            size="sm"
            variant={tema === opcao ? "default" : "ghost"}
            onClick={() => setTema(opcao)}
            aria-pressed={tema === opcao}
            className="rounded-none text-xs capitalize"
          >
            {opcao}
          </Button>
        ))}
      </div>
    </div>
  );
}
