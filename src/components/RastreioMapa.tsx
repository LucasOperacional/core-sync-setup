import { useEffect, useRef, useState } from "react";
import type { PosicaoRastreio } from "@/lib/rastreamento.functions";
import type { PostoMapa } from "@/lib/nexti-postos-mapa.functions";
import { corDoUsuario } from "@/lib/cores-rastreio";
import { carregarGoogleMaps, ESTILO_CLARO, ESTILO_ESCURO } from "@/lib/google-maps-loader";

type TemaMapa = "claro" | "escuro";

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

function icone(cor: string, tamanho: number): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: tamanho,
    fillColor: cor,
    fillOpacity: 0.85,
    strokeColor: "#ffffff",
    strokeWeight: 2,
  };
}

/** Mapa (Google Maps) com pessoas monitoradas e postos de serviço. */
export default function RastreioMapa({
  posicoes,
  focoUserId,
  postos = [],
  focoPostoId = null,
  altura = "h-[420px]",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<google.maps.Map | null>(null);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const marcadoresRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const postosRef = useRef<Map<number, google.maps.Marker>>(new Map());
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tema, setTema] = useState<TemaMapa>(() => {
    if (typeof window === "undefined") return "claro";
    const salvo = window.localStorage.getItem("mapa_tema");
    return salvo === "escuro" ? "escuro" : "claro";
  });

  useEffect(() => {
    let cancelado = false;
    const marcadores = marcadoresRef.current;
    const postosMarcadores = postosRef.current;
    carregarGoogleMaps()
      .then((maps) => {
        if (cancelado || !containerRef.current || mapaRef.current) return;
        mapaRef.current = new maps.Map(containerRef.current, {
          center: { lat: -23.55, lng: -46.63 },
          zoom: 11,
          clickableIcons: false,
          mapTypeControl: false,
          streetViewControl: true,
          fullscreenControl: true,
        });
        infoRef.current = new maps.InfoWindow();
        setPronto(true);
      })
      .catch((e: Error) => {
        if (!cancelado) setErro(e.message);
      });
    return () => {
      cancelado = true;
      for (const m of marcadores.values()) m.setMap(null);
      for (const m of postosMarcadores.values()) m.setMap(null);
      marcadores.clear();
      postosMarcadores.clear();
      mapaRef.current = null;
      infoRef.current = null;
    };
  }, []);

  // Tema claro/escuro do mapa.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    mapa.setOptions({ styles: tema === "escuro" ? ESTILO_ESCURO : ESTILO_CLARO });
    try {
      window.localStorage.setItem("mapa_tema", tema);
    } catch {
      /* armazenamento indisponível */
    }
  }, [tema, pronto]);

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
      }<br/><a href="${streetView}" target="_blank" rel="noopener noreferrer" style="color:#b45309;font-weight:600">Abrir Street View</a>`;
      const existente = postosRef.current.get(p.id);
      if (existente) {
        existente.setPosition({ lat, lng });
        existente.set("rotulo", rotulo);
      } else {
        const marcador = new google.maps.Marker({
          position: { lat, lng },
          map: mapa,
          icon: icone("#f59e0b", 7),
          title: p.nome,
        });
        marcador.set("rotulo", rotulo);
        marcador.addListener("click", () => {
          infoRef.current?.setContent(String(marcador.get("rotulo") ?? ""));
          infoRef.current?.open({ map: mapa, anchor: marcador });
        });
        postosRef.current.set(p.id, marcador);
      }
    }
    for (const [id, marcador] of postosRef.current) {
      if (!vistos.has(id)) {
        marcador.setMap(null);
        postosRef.current.delete(id);
      }
    }

    if (focoPostoId) {
      const foco = comGeo.find((p) => p.id === focoPostoId);
      if (foco) {
        mapa.setCenter({ lat: foco.latitude as number, lng: foco.longitude as number });
        mapa.setZoom(17);
        const marcador = postosRef.current.get(foco.id);
        if (marcador) {
          infoRef.current?.setContent(String(marcador.get("rotulo") ?? ""));
          infoRef.current?.open({ map: mapa, anchor: marcador });
        }
        return;
      }
    }
    if (posicoes.length === 0 && comGeo.length > 0) {
      const limites = new google.maps.LatLngBounds();
      for (const p of comGeo) {
        limites.extend({ lat: p.latitude as number, lng: p.longitude as number });
      }
      mapa.fitBounds(limites, 40);
      const zoom = mapa.getZoom();
      if (typeof zoom === "number" && zoom > 14) mapa.setZoom(14);
    }
  }, [postos, focoPostoId, posicoes.length, pronto]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;

    const vistos = new Set<string>();
    for (const p of posicoes) {
      vistos.add(p.userId);
      const streetView = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.latitude},${p.longitude}`;
      const cor = corDoUsuario(p.userId);
      const rotulo = `<strong style="color:${cor}">●</strong> <strong>${escapar(p.nome)}</strong><br/>${new Date(
        p.capturadoEm,
      ).toLocaleString(
        "pt-BR",
      )}${p.tipoSinal ? `<br/>Sinal: ${escapar(p.tipoSinal.toUpperCase())}` : ""}<br/><a href="${streetView}" target="_blank" rel="noopener noreferrer" style="color:#0ea5e9;font-weight:600">Abrir Street View</a>`;
      const existente = marcadoresRef.current.get(p.userId);
      if (existente) {
        existente.setPosition({ lat: p.latitude, lng: p.longitude });
        existente.setIcon(icone(cor, 9));
        existente.set("rotulo", rotulo);
      } else {
        const marcador = new google.maps.Marker({
          position: { lat: p.latitude, lng: p.longitude },
          map: mapa,
          icon: icone(cor, 9),
          title: p.nome,
        });
        marcador.set("rotulo", rotulo);
        marcador.addListener("click", () => {
          infoRef.current?.setContent(String(marcador.get("rotulo") ?? ""));
          infoRef.current?.open({ map: mapa, anchor: marcador });
        });
        marcadoresRef.current.set(p.userId, marcador);
      }
    }

    for (const [id, marcador] of marcadoresRef.current) {
      if (!vistos.has(id)) {
        marcador.setMap(null);
        marcadoresRef.current.delete(id);
      }
    }

    if (posicoes.length > 0) {
      const foco = focoUserId ? posicoes.find((p) => p.userId === focoUserId) : null;
      if (foco) {
        mapa.setCenter({ lat: foco.latitude, lng: foco.longitude });
        mapa.setZoom(16);
        const marcador = marcadoresRef.current.get(foco.userId);
        if (marcador) {
          infoRef.current?.setContent(String(marcador.get("rotulo") ?? ""));
          infoRef.current?.open({ map: mapa, anchor: marcador });
        }
      } else {
        const limites = new google.maps.LatLngBounds();
        for (const p of posicoes) limites.extend({ lat: p.latitude, lng: p.longitude });
        mapa.fitBounds(limites, 40);
        const zoom = mapa.getZoom();
        if (typeof zoom === "number" && zoom > 15) mapa.setZoom(15);
      }
    }
  }, [posicoes, focoUserId, pronto]);

  return (
    <div className="relative">
      <div ref={containerRef} className={`${altura} w-full overflow-hidden rounded-xl bg-muted`} />
      {erro ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-muted/80 p-4 text-center text-sm text-muted-foreground">
          {erro}
        </div>
      ) : null}
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
