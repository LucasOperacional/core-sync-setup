/** Paleta fixa para diferenciar cada supervisor no mapa e nas listas. */
export const CORES_RASTREIO = [
  "#0ea5e9",
  "#ef4444",
  "#22c55e",
  "#a855f7",
  "#f97316",
  "#14b8a6",
  "#ec4899",
  "#6366f1",
  "#84cc16",
  "#f59e0b",
  "#06b6d4",
  "#d946ef",
] as const;

/** Sempre a mesma cor para o mesmo usuário (derivada do identificador). */
export function corDoUsuario(userId: string) {
  let soma = 0;
  for (let i = 0; i < userId.length; i += 1) {
    soma = (soma * 31 + userId.charCodeAt(i)) % 100000;
  }
  return CORES_RASTREIO[soma % CORES_RASTREIO.length]!;
}
