import { createServerFn } from "@tanstack/react-start";

export type Noticia = {
  titulo: string;
  fonte: string;
  link: string;
  publicadaEm: string;
};

const FEED_URL = "https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419";

function textoEntre(xml: string, tag: string) {
  const correspondencia = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return correspondencia?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g, "").trim() ?? "";
}

function decodificarEntidades(valor: string) {
  const entidades: Record<string, string> = {
    "&amp;": "&",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&lt;": "<",
    "&gt;": ">",
  };

  return valor
    .replace(/&(amp|quot|#39|apos|lt|gt);/g, (entidade) => entidades[entidade] ?? entidade)
    .replace(/&#(\d+);/g, (_, codigo: string) => String.fromCodePoint(Number(codigo)));
}

function extrairNoticias(xml: string): Noticia[] {
  return Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi))
    .slice(0, 8)
    .map((item) => {
      const conteudo = item[1] ?? "";
      const tituloCompleto = decodificarEntidades(textoEntre(conteudo, "title"));
      const fonte = decodificarEntidades(textoEntre(conteudo, "source"));
      const sufixoFonte = fonte ? ` - ${fonte}` : "";
      const titulo = sufixoFonte && tituloCompleto.endsWith(sufixoFonte)
        ? tituloCompleto.slice(0, -sufixoFonte.length)
        : tituloCompleto;

      return {
        titulo,
        fonte: fonte || "Google Notícias",
        link: textoEntre(conteudo, "link"),
        publicadaEm: textoEntre(conteudo, "pubDate"),
      };
    })
    .filter((noticia) => noticia.titulo && noticia.link.startsWith("https://"));
}

export const listarNoticias = createServerFn({ method: "GET" }).handler(async () => {
  const resposta = await fetch(FEED_URL, {
    headers: { Accept: "application/rss+xml, application/xml;q=0.9" },
    signal: AbortSignal.timeout(8_000),
  });

  if (!resposta.ok) throw new Error("Não foi possível consultar as notícias agora.");

  const noticias = extrairNoticias(await resposta.text());
  if (noticias.length === 0) throw new Error("Nenhuma notícia disponível neste momento.");

  return { noticias, atualizadoEm: new Date().toISOString() };
});