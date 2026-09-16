/** Web Push nativo (RFC 8291 aes128gcm + RFC 8292 VAPID) usando apenas WebCrypto.
 * Nenhuma dependência do Firebase/FCM e nenhum pacote nativo do Node.
 * Nunca registre em log as chaves privadas ou os endpoints completos.
 */

function bytesParaB64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlParaBytes(valor: string): Uint8Array {
  const limpo = valor.trim().replace(/-/g, "+").replace(/_/g, "/");
  const pad = limpo + "=".repeat((4 - (limpo.length % 4)) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of partes) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

const texto = new TextEncoder();

/** Ajuste de tipos: WebCrypto pede BufferSource com ArrayBuffer concreto. */
function bs(b: Uint8Array): BufferSource {
  return b as unknown as BufferSource;
}

async function hmac(chave: Uint8Array, dados: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw",
    bs(chave),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, bs(dados)));
}

/** HKDF (extract + expand de um bloco) — suficiente para as saídas de 12/16/32 bytes. */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  tamanho: number,
): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const bloco = await hmac(prk, concat(info, new Uint8Array([1])));
  return bloco.slice(0, tamanho);
}

/** Assina o JWT VAPID (ES256) para a origem do endpoint. */
async function autorizacaoVapid(
  endpoint: string,
  chavePublica: string,
  chavePrivada: string,
  subject: string,
): Promise<string> {
  const pub = b64UrlParaBytes(chavePublica);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error("VAPID_PUBLIC_KEY inválida (esperado ponto P-256 não comprimido).");
  }
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: bytesParaB64Url(pub.slice(1, 33)),
    y: bytesParaB64Url(pub.slice(33, 65)),
    d: bytesParaB64Url(b64UrlParaBytes(chavePrivada)),
    ext: true,
  };
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const cabecalho = bytesParaB64Url(texto.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const corpo = bytesParaB64Url(
    texto.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject,
      }),
    ),
  );
  const assinatura = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      texto.encode(`${cabecalho}.${corpo}`),
    ),
  );
  return `vapid t=${cabecalho}.${corpo}.${bytesParaB64Url(assinatura)},k=${chavePublica}`;
}

/** Criptografa o conteúdo no formato aes128gcm para o aparelho assinante. */
async function criptografar(
  p256dh: string,
  authSecret: string,
  conteudo: string,
): Promise<Uint8Array> {
  const clientePub = b64UrlParaBytes(p256dh);
  const authBytes = b64UrlParaBytes(authSecret);

  const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const servidorPub = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  const clienteChave = await crypto.subtle.importKey(
    "raw",
    bs(clientePub),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const segredo = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: clienteChave }, par.privateKey, 256),
  );

  const ikm = await hkdf(
    authBytes,
    segredo,
    concat(texto.encode("WebPush: info\0"), clientePub, servidorPub),
    32,
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, texto.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, texto.encode("Content-Encoding: nonce\0"), 12);

  const aes = await crypto.subtle.importKey("raw", bs(cek), { name: "AES-GCM" }, false, [
    "encrypt",
  ]);
  const claro = concat(texto.encode(conteudo), new Uint8Array([2]));
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(nonce), tagLength: 128 }, aes, bs(claro)),
  );

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([servidorPub.length]), servidorPub, cifrado);
}

export type ResultadoEnvioAparelho = {
  ok: boolean;
  status: number;
  /** true quando o endpoint expirou (404/410) e deve ser desativado. */
  expirado: boolean;
};

/** Envia um aviso Web Push para um aparelho. Nunca retorna dados do endpoint. */
export async function enviarWebPush(params: {
  endpoint: string;
  p256dh: string;
  auth: string;
  conteudo: string;
  ttlSegundos?: number;
  urgencia?: "normal" | "high";
  vapid: { publicKey: string; privateKey: string; subject: string };
}): Promise<ResultadoEnvioAparelho> {
  const corpo = await criptografar(params.p256dh, params.auth, params.conteudo);
  const authorization = await autorizacaoVapid(
    params.endpoint,
    params.vapid.publicKey,
    params.vapid.privateKey,
    params.vapid.subject,
  );

  let resposta: Response;
  try {
    resposta = await fetch(params.endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(params.ttlSegundos ?? 3600),
        Urgency: params.urgencia ?? "normal",
      },
      body: corpo as unknown as BodyInit,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { ok: false, status: 0, expirado: false };
  }

  const expirado = resposta.status === 404 || resposta.status === 410;
  return { ok: resposta.ok, status: resposta.status, expirado };
}
