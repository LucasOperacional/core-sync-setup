import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type PontoRota = { lat: number; lng: number; posto: string; data: string; ordem: number };

interface Props {
  pontos: PontoRota[];
  supervisorNome?: string | null;
  supervisorFotoUrl?: string | null;
}

export default function MapaRotaVisitas({ pontos, supervisorNome, supervisorFotoUrl }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    const latlngs = pontos.map((p) => [p.lat, p.lng] as [number, number]);
    if (latlngs.length > 1) {
      L.polyline(latlngs, { color: "#2563eb", weight: 4, opacity: 0.8, dashArray: "8 6" }).addTo(map);
    }
    const fotoTag = supervisorFotoUrl
      ? `<img src="${supervisorFotoUrl}" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover;margin-bottom:4px"/><br/>`
      : "";
    const nomeTag = supervisorNome ? `<b>${supervisorNome}</b><br/>` : "";
    pontos.forEach((p, i) => {
      const cor = i === 0 ? "#22c55e" : i === pontos.length - 1 ? "#ef4444" : "#2563eb";
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:${cor};color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${p.ordem}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      L.marker([p.lat, p.lng], { icon })
        .bindPopup(`${fotoTag}${nomeTag}<b>${p.ordem}. ${p.posto}</b><br/>${p.data}<br/><a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lng}" target="_blank" rel="noopener noreferrer">Ver no Street View</a>`)
        .addTo(map);
    });
    if (latlngs.length) map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30], maxZoom: 15 });
    else map.setView([-16.68, -49.25], 11);
    return () => {
      map.remove();
    };
  }, [pontos]);
  return <div ref={ref} className="h-[480px] w-full rounded-lg border border-border" />;
}
