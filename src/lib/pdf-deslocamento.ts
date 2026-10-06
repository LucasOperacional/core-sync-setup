import type { LinhaAcompanhamento } from "@/lib/rastreamento.functions";

const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const duracao = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}min`);

function carregarTile(z: number, x: number, y: number): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  });
}

/** Desenha o trajeto sobre o mapa do OpenStreetMap e devolve a imagem (PNG). */
async function imagemMapa(l: LinhaAcompanhamento, W = 1000, H = 600): Promise<string | null> {
  const pts = [...l.trajeto, ...l.paradas.map((p) => [p.latitude, p.longitude] as [number, number])];
  if (!pts.length) return null;
  const proj = (lat: number, lon: number, z: number) => {
    const n = 256 * 2 ** z;
    const s = Math.sin((lat * Math.PI) / 180);
    return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
  };
  let z = 17;
  for (; z > 3; z--) {
    const xy = pts.map(([a, b]) => proj(a, b, z));
    const w = Math.max(...xy.map((p) => p[0]!)) - Math.min(...xy.map((p) => p[0]!));
    const h = Math.max(...xy.map((p) => p[1]!)) - Math.min(...xy.map((p) => p[1]!));
    if (w < W - 80 && h < H - 80) break;
  }
  const xy = pts.map(([a, b]) => proj(a, b, z));
  const cx = (Math.max(...xy.map((p) => p[0]!)) + Math.min(...xy.map((p) => p[0]!))) / 2;
  const cy = (Math.max(...xy.map((p) => p[1]!)) + Math.min(...xy.map((p) => p[1]!))) / 2;
  const ox = cx - W / 2;
  const oy = cy - H / 2;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(0, 0, W, H);
  const tarefas: Promise<void>[] = [];
  for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + W) / 256); tx++) {
    for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + H) / 256); ty++) {
      tarefas.push(
        carregarTile(z, tx, ty).then((img) => {
          if (img) ctx.drawImage(img, tx * 256 - ox, ty * 256 - oy);
        }),
      );
    }
  }
  await Promise.all(tarefas);
  const p = (lat: number, lon: number) => {
    const [x, y] = proj(lat, lon, z);
    return [x! - ox, y! - oy] as const;
  };
  if (l.trajeto.length > 1) {
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 4;
    ctx.beginPath();
    l.trajeto.forEach(([a, b], i) => {
      const [x, y] = p(a, b);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
  }
  const bola = (lat: number, lon: number, cor: string, txt: string) => {
    const [x, y] = p(lat, lon);
    ctx.fillStyle = cor;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(txt, x, y);
  };
  l.paradas.forEach((pa, i) => bola(pa.latitude, pa.longitude, "#f59e0b", String(i + 1)));
  if (l.trajeto.length) {
    bola(l.trajeto[0]![0], l.trajeto[0]![1], "#22c55e", "I");
    const u = l.trajeto[l.trajeto.length - 1]!;
    bola(u[0], u[1], "#ef4444", "F");
  }
  ctx.fillStyle = "rgba(255,255,255,.8)";
  ctx.fillRect(W - 150, H - 18, 150, 18);
  ctx.fillStyle = "#111";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("© OpenStreetMap", W - 6, H - 8);
  try {
    return cv.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** Gera o PDF de deslocamento (um usuário ou todos) e baixa o arquivo. */
export async function gerarPdfDeslocamento(linhas: LinhaAcompanhamento[], de: string, ate: string) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const fmtData = (d: string) => d.split("-").reverse().join("/");

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i]!;
    if (i) doc.addPage();
    doc.setFontSize(15);
    doc.text("Relatório de deslocamento", 14, 16);
    doc.setFontSize(10);
    doc.text(`Usuário: ${l.nome}`, 14, 23);
    doc.text(`Período: ${fmtData(de)} a ${fmtData(ate)}`, 14, 28);
    doc.text(
      `Início: ${hora(l.primeiroEm)}   Fim: ${hora(l.ultimoEm)}   Distância: ${l.distanciaKm} km   Paradas: ${l.paradas.length}`,
      14,
      33,
    );
    const tempoPosto = l.paradas.filter((p) => p.posto).reduce((s, p) => s + p.minutos, 0);
    doc.text(`Tempo total em postos: ${duracao(tempoPosto)}`, 14, 38);

    const img = await imagemMapa(l);
    let y = 42;
    if (img) {
      doc.addImage(img, "PNG", 14, y, 182, 109);
      y += 111;
      doc.setFontSize(8);
      doc.text("I = início · F = fim · números = paradas · linha azul = trajeto", 14, y + 2);
      y += 5;
    }

    autoTable(doc, {
      startY: y,
      head: [["#", "Local / Posto", "Chegou", "Saiu", "Permaneceu"]],
      body: l.paradas.length
        ? l.paradas.map((p, k) => [
            String(k + 1),
            p.posto ?? `Sem posto (${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)})`,
            hora(p.inicio),
            hora(p.fim),
            duracao(p.minutos),
          ])
        : [["—", "Sem permanências longas — apenas deslocamento", "", "", ""]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
    });
  }
  const nome = linhas.length === 1 ? linhas[0]!.nome.replace(/\s+/g, "-") : "todos";
  doc.save(`deslocamento-${nome}-${de}-a-${ate}.pdf`);
}
