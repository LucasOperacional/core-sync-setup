/**
 * Fila local de posições do GPS.
 *
 * Regra: o sinal nunca é perdido. Quando o envio falha (sem internet, rede
 * instável, servidor fora do ar), a posição fica guardada no aparelho e é
 * reenviada na primeira oportunidade, alimentando o rastreio em tempo real.
 */

const CHAVE = "gps_fila_pendente";
const LIMITE = 200;

export interface PosicaoGps {
  latitude: number;
  longitude: number;
  precisaoMetros: number | null;
  velocidade: number | null;
  direcao: number | null;
  tipoSinal: string | null;
  bateria: number | null;
  capturadoEm: string;
}

function ler(): PosicaoGps[] {
  if (typeof window === "undefined") return [];
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    const lista = bruto ? (JSON.parse(bruto) as PosicaoGps[]) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function gravar(lista: PosicaoGps[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(lista.slice(-LIMITE)));
  } catch {
    /* aparelho sem armazenamento local */
  }
}

/** Guarda a posição que não conseguiu ser enviada. */
export function enfileirar(posicao: PosicaoGps): void {
  gravar([...ler(), posicao]);
}

/** Quantidade de posições esperando o envio. */
export function pendentes(): number {
  return ler().length;
}

/**
 * Tenta reenviar tudo o que ficou guardado. Para no primeiro erro e mantém o
 * restante na fila para a próxima tentativa.
 */
export async function drenar(enviar: (posicao: PosicaoGps) => Promise<void>): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return pendentes();
  let lista = ler();
  while (lista.length > 0) {
    const primeira = lista[0]!;
    try {
      await enviar(primeira);
    } catch {
      gravar(lista);
      return lista.length;
    }
    lista = lista.slice(1);
    gravar(lista);
  }
  return 0;
}
