// Mesma regra da página "Quantidade de visitas por posto":
// até 2 = verde, 3 a 4 = amarelo, 5 ou mais = vermelho.
export type Semaforo = "verde" | "amarelo" | "vermelho";
export const semaforoDe = (v: number): Semaforo => (v >= 5 ? "vermelho" : v >= 3 ? "amarelo" : "verde");
// Cores usadas nas bolinhas do mapa (Leaflet precisa do valor da cor).
export const COR_MAPA: Record<Semaforo, string> = {
  verde: "#22c55e",
  amarelo: "#eab308",
  vermelho: "#ef4444",
};
