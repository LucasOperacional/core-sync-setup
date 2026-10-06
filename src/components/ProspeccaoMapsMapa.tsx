import { useEffect, useRef } from "react";
import { ESTILO_CLARO, carregarGoogleMaps } from "@/lib/google-maps-loader";
import type { LeadMaps } from "@/lib/prospeccao-maps.functions";

function escapar(texto: string) {
  return texto.replace(/[&<>"']/g, (c) =>
    ({ "&": "\x26amp;", "<": "\x26lt;", ">": "\x26gt;", '"': "\x26quot;", "'": "\x26#39;" })[c] ?? c,
  );
}

/** Texto preto, sempre legível sobre o fundo branco da janela de informações. */
const ESTILO_CAIXA =
  "color:#000000;font-family:'Manrope',Arial,sans-serif;font-size:13px;line-height:1.5;";
const ESTILO_TITULO = "color:#000000;font-size:14px;font-weight:700;";
const ESTILO_LINK = "color:#000000;text-decoration:underline;";

/** Mapa do Google com os leads encontrados na busca de prospecção. */
export default function ProspeccaoMapsMapa({ leads }: { leads: LeadMaps[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<google.maps.Map | null>(null);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const marcadoresRef = useRef<google.maps.Marker[]>([]);

  useEffect(() => {
    let cancelado = false;
    carregarGoogleMaps()
      .then((maps) => {
        if (cancelado || !containerRef.current || mapaRef.current) return;
        mapaRef.current = new maps.Map(containerRef.current, {
          center: { lat: -16.68, lng: -49.25 },
          zoom: 11,
          clickableIcons: false,
          styles: ESTILO_CLARO,
        });
        infoRef.current = new maps.InfoWindow();
        // Redesenha assim que o mapa estiver pronto, mesmo que os leads já tenham chegado.
        window.dispatchEvent(new Event("leads-maps-pronto"));
      })
      .catch((e) => console.error("Falha ao carregar o Google Maps:", e));
    return () => {
      cancelado = true;
      for (const m of marcadoresRef.current) m.setMap(null);
      marcadoresRef.current = [];
      mapaRef.current = null;
      infoRef.current = null;
    };
  }, []);

  useEffect(() => {
    const redesenhar = () => {
      const mapa = mapaRef.current;
      if (!mapa) return;
      const maps = window.google.maps;
      const info = infoRef.current;
      for (const m of marcadoresRef.current) m.setMap(null);
      marcadoresRef.current = [];
      const validos = leads.filter(
        (l) => l.latitude !== null && l.longitude !== null,
      );
      for (const l of validos) {
        const marcador = new maps.Marker({
          position: { lat: l.latitude as number, lng: l.longitude as number },
          map: mapa,
          title: l.nome,
        });
        const conteudo = [
          `<strong>${escapar(l.nome)}</strong>`,
          l.categoria ? escapar(l.categoria) : "",
          l.endereco ? escapar(l.endereco) : "",
          l.telefone ? `Tel.: ${escapar(l.telefone)}` : "",
          l.nota !== null
            ? `Nota: ${l.nota.toFixed(1)} (${l.avaliacoes ?? 0})`
            : "",
          l.mapsUrl
            ? `<a href="${escapar(l.mapsUrl)}" target="_blank" rel="noreferrer">Ver no Maps</a>`
            : "",
          l.site
            ? `<a href="${escapar(l.site)}" target="_blank" rel="noreferrer">Site</a>`
            : "",
        ]
          .filter(Boolean)
          .join("<br/>");
        marcador.addListener("click", () => {
          if (!info) return;
          info.setContent(conteudo);
          info.open({ map: mapa, anchor: marcador });
        });
        marcadoresRef.current.push(marcador);
      }
      if (validos.length > 0) {
        const limites = new maps.LatLngBounds();
        for (const l of validos) {
          limites.extend({ lat: l.latitude as number, lng: l.longitude as number });
        }
        mapa.fitBounds(limites, 48);
      }
    };

    window.addEventListener("leads-maps-pronto", redesenhar);
    redesenhar();
    return () => window.removeEventListener("leads-maps-pronto", redesenhar);
  }, [leads]);

  return <div ref={containerRef} className="h-[420px] w-full bg-muted" />;
}
