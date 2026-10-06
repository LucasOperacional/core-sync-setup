import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LinhaAcompanhamento } from "@/lib/rastreamento.functions";

/** Mapa do trajeto de um usuário: linha do percurso, início, fim e paradas numeradas. */
export default function MapaTrajetoGps({ linha }: { linha: LinhaAcompanhamento }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    const t = linha.trajeto;
    if (t.length > 1) L.polyline(t, { color: "#2563eb", weight: 4, opacity: 0.85 }).addTo(map);
    const bolinha = (cor: string, texto: string) =>
      L.divIcon({
        className: "",
        html: `<div style="background:${cor};color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${texto}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
    const hora = (iso: string) =>
      new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    if (t.length) {
      L.marker(t[0]!, { icon: bolinha("#22c55e", "I") })
        .bindPopup(`<b>Início</b><br/>${hora(linha.primeiroEm)}`)
        .addTo(map);
      L.marker(t[t.length - 1]!, { icon: bolinha("#ef4444", "F") })
        .bindPopup(`<b>Fim</b><br/>${hora(linha.ultimoEm)}`)
        .addTo(map);
    }
    linha.paradas.forEach((p, i) => {
      L.marker([p.latitude, p.longitude], { icon: bolinha("#f59e0b", String(i + 1)) })
        .bindPopup(
          `<b>${i + 1}. ${p.posto ?? "Local sem posto"}</b><br/>${hora(p.inicio)} → ${hora(p.fim)}<br/>Permaneceu ${p.minutos} min`,
        )
        .addTo(map);
    });
    const todos = [...t, ...linha.paradas.map((p) => [p.latitude, p.longitude] as [number, number])];
    if (todos.length) map.fitBounds(L.latLngBounds(todos), { padding: [30, 30], maxZoom: 16 });
    else map.setView([-16.68, -49.25], 11);
    return () => {
      map.remove();
    };
  }, [linha]);
  return <div ref={ref} className="h-[380px] w-full rounded-lg border border-border" />;
}
