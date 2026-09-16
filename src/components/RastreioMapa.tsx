import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PosicaoRastreio } from "@/lib/rastreamento.functions";
import type { PostoMapa } from "@/lib/nexti-postos-mapa.functions";
import { corDoUsuario } from "@/lib/cores-rastreio";

const TEMAS = {
  claro: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap",
  },
  escuro: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "© OpenStreetMap · © CARTO",
  },
} as const;

type TemaMapa = keyof typeof TEMAS;

interface Props {
  posicoes: PosicaoRastreio[];
  focoUserId?: string | null;
  /** Postos de serviço da NEXTI marcados no mapa. */
  postos?: PostoMapa[];
  /** Posto para centralizar o mapa. */
  focoPostoId?: number | null;
  altura?: string;
}

function escapar(texto: string) {
  return texto.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

/** Mapa (Leaflet + OpenStreetMap) com pessoas monitoradas e postos de serviço. */
export default function RastreioMapa({
  posicoes,
  focoUserId,
  postos = [],
  focoPostoId = null,
  altura = "h-[420px]",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const marcadoresRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const postosRef = useRef<Map<number, L.CircleMarker>>(new Map());
  const camadaRef = useRef<L.TileLayer | null>(null);
  const [tema, setTema] = useState<TemaMapa>(() => {
    if (typeof window === "undefined") return "claro";
    const salvo = window.localStorage.getItem("mapa_tema");
    return salvo === "escuro" ? "escuro" : "claro";
  });

  useEffect(() => {
    if (!containerRef.current || mapaRef.current) return;
    const mapa = L.map(containerRef.current, { center: [-23.55, -46.63], zoom: 11 });
    mapaRef.current = mapa;
    const marcadores = marcadoresRef.current;
    const postosMarcadores = postosRef.current;
    return () => {
      mapa.remove();
      mapaRef.current = null;
      camadaRef.current = null;
      marcadores.clear();
      postosMarcadores.clear();
    };
  }, []);

  // Camada de fundo conforme o tema escolhido (claro/escuro).
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    if (camadaRef.current) {
      mapa.removeLayer(camadaRef.current);
      camadaRef.current = null;
    }
    const cfg = TEMAS[tema];
    const camada = L.tileLayer(cfg.url, { maxZoom: 19, attribution: cfg.attribution });
    camada.addTo(mapa);
    camada.bringToBack();
    camadaRef.current = camada;
    try {
      window.localStorage.setItem("mapa_tema", tema);
    } catch {
      /* armazenamento indisponível */
    }
  }, [tema]);

  // Marcadores dos postos de serviço (NEXTI).
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    const vistos = new Set<number>();
    const comGeo = postos.filter(
      (p) => typeof p.latitude === "number" && typeof p.longitude === "number",
    );
    for (const p of comGeo) {
      const lat = p.latitude as number;
      const lng = p.longitude as number;
      vistos.add(p.id);
      const streetView = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
      const rotulo = `<strong>${escapar(p.nome)}</strong>${
        p.cliente ? `<br/>${escapar(p.cliente)}` : ""
      }${p.enderecoCompleto ? `<br/>${escapar(p.enderecoCompleto)}` : ""}${
        p.telefone ? `<br/>Tel.: ${escapar(p.telefone)}` : ""
      }<br/><a href="${streetView}" target="_blank" rel="noopener noreferrer" style="color:#f59e0b;font-weight:600">Abrir Street View</a>`;
      const existente = postosRef.current.get(p.id);
      if (existente) {
        existente.setLatLng([lat, lng]);
        existente.setPopupContent(rotulo);
      } else {
        const marcador = L.circleMarker([lat, lng], {
          radius: 7,
          color: "#f59e0b",
          fillColor: "#f59e0b",
          fillOpacity: 0.8,
          weight: 2,
        })
          .addTo(mapa)
          .bindPopup(rotulo);
        postosRef.current.set(p.id, marcador);
      }
    }
    for (const [id, marcador] of postosRef.current) {
      if (!vistos.has(id)) {
        marcador.remove();
        postosRef.current.delete(id);
      }
    }

    if (focoPostoId) {
      const foco = comGeo.find((p) => p.id === focoPostoId);
      if (foco) {
        mapa.setView([foco.latitude as number, foco.longitude as number], 17);
        postosRef.current.get(foco.id)?.openPopup();
        return;
      }
    }
    if (posicoes.length === 0 && comGeo.length > 0) {
      mapa.fitBounds(
        L.latLngBounds(
          comGeo.map((p) => [p.latitude as number, p.longitude as number] as [number, number]),
        ),
        { padding: [40, 40], maxZoom: 14 },
      );
    }
  }, [postos, focoPostoId, posicoes.length]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;

    const vistos = new Set<string>();
    for (const p of posicoes) {
      vistos.add(p.userId);
      const streetView = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.latitude},${p.longitude}`;
      const rotulo = `<strong style="color:${corDoUsuario(p.userId)}">●</strong> <strong>${p.nome}</strong><br/>${new Date(
        p.capturadoEm,
      ).toLocaleString(
        "pt-BR",
      )}${p.tipoSinal ? `<br/>Sinal: ${p.tipoSinal.toUpperCase()}` : ""}<br/><a href="${streetView}" target="_blank" rel="noopener noreferrer" style="color:#0ea5e9;font-weight:600">Abrir Street View</a>`;
      const cor = corDoUsuario(p.userId);
      const existente = marcadoresRef.current.get(p.userId);
      if (existente) {
        existente.setLatLng([p.latitude, p.longitude]);
        existente.setPopupContent(rotulo);
        existente.setStyle({ color: cor, fillColor: cor });
      } else {
        const marcador = L.circleMarker([p.latitude, p.longitude], {
          radius: 9,
          color: cor,
          fillColor: cor,
          fillOpacity: 0.85,
          weight: 2,
        })
          .addTo(mapa)
          .bindPopup(rotulo);
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
        mapa.fitBounds(
          L.latLngBounds(posicoes.map((p) => [p.latitude, p.longitude] as [number, number])),
          { padding: [40, 40], maxZoom: 15 },
        );
      }
    }
  }, [posicoes, focoUserId]);

  return (
    <div className="relative">
      <div ref={containerRef} className={`${altura} w-full rounded-xl`} />
      <div className="absolute right-3 top-3 z-[500] flex overflow-hidden rounded-lg border border-border bg-card shadow-md">
        {(["claro", "escuro"] as TemaMapa[]).map((opcao) => (
          <button
            key={opcao}
            type="button"
            onClick={() => setTema(opcao)}
            aria-pressed={tema === opcao}
            className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              tema === opcao
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {opcao}
          </button>
        ))}
      </div>
    </div>
  );
}
