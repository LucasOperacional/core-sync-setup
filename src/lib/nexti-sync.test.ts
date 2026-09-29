import { describe, expect, it } from "vitest";
import { gravarLinhas } from "./nexti-sync.functions";

/**
 * Lote de 200 registros era abortado inteiro quando o banco recusava um único
 * item. Estes casos travam o comportamento de reprocessar item a item.
 */
function fakeAdmin(recusar: (linha: Record<string, unknown>) => boolean) {
  const gravadas: Record<string, unknown>[] = [];
  const admin = {
    from: () => ({
      upsert: (linhas: Record<string, unknown>[]) => {
        const ruim = linhas.find(recusar);
        if (ruim) return Promise.resolve({ data: null, error: { message: "violates constraint" } });
        gravadas.push(...linhas);
        return Promise.resolve({ data: null, error: null });
      },
    }),
  };
  return { admin, gravadas };
}

const linhas = (ids: number[]) => ids.map((nexti_id) => ({ nexti_id }));

describe("gravarLinhas", () => {
  it("grava o lote inteiro numa chamada quando tudo é válido", async () => {
    const { admin, gravadas } = fakeAdmin(() => false);
    await expect(gravarLinhas(admin as never, "t", linhas([1, 2, 3]))).resolves.toBe(3);
    expect(gravadas).toHaveLength(3);
  });

  it("preserva os válidos quando um item do lote é recusado", async () => {
    const { admin, gravadas } = fakeAdmin((l) => l["nexti_id"] === 2);
    await expect(gravarLinhas(admin as never, "t", linhas([1, 2, 3]))).resolves.toBe(2);
    expect(gravadas.map((l) => l["nexti_id"])).toEqual([1, 3]);
  });

  it("falha somente quando nenhum item pode ser salvo", async () => {
    const { admin } = fakeAdmin(() => true);
    await expect(gravarLinhas(admin as never, "t", linhas([1, 2]))).rejects.toThrow(
      "violates constraint",
    );
  });
});
