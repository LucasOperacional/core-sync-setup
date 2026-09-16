import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AREAS_GERENTES } from "@/lib/areas-gerentes";
import { normalizarNome } from "@/lib/gerentes-area-a";

export type RegistroExecucao = {
  id: string;
  responsavel: string;
  referencia: string;
  duracaoSegundos: number | null;
  criadoEm: string;
};

export type BlocoIndicador = {
  chave: "supervisao-campo" | "avaliacao-gerentes";
  titulo: string;
  total: number;
  comTempo: number;
  mediaSegundos: number | null;
  menorSegundos: number | null;
  maiorSegundos: number | null;
  registros: RegistroExecucao[];
};

export type IndicadorGerente = {
  nome: string;
  visitas: number;
  fichas: number;
  comTempo: number;
  mediaSegundos: number | null;
  menorSegundos: number | null;
  maiorSegundos: number | null;
  indice: number;
  ultimoRegistro: string | null;
  /** Relatórios de supervisão de campo do gerente. */
  listaVisitas: RegistroExecucao[];
  /** Fichas de avaliação ligadas ao gerente. */
  listaFichas: RegistroExecucao[];
  /** Índice das fichas de avaliação (0 a 100) a partir das notas lançadas. */
  indiceFichas: number | null;
};

export type IndicadoresExecucao = {
  ok: boolean;
  erro?: string;
  blocos: BlocoIndicador[];
  /** Índice de trabalho de 0 a 100, combinando volume entregue e agilidade. */
  indiceTrabalho: number;
  gerentes: IndicadorGerente[];
};

/** Tempo de referência (em segundos) considerado ideal para cada tipo de registro. */
const TEMPO_IDEAL = {
  "supervisao-campo": 15 * 60,
  "avaliacao-gerentes": 6 * 60,
} as const;

/** Volume mensal esperado de entregas por tipo de registro. */
const VOLUME_ESPERADO = {
  "supervisao-campo": 20,
  "avaliacao-gerentes": 9,
} as const;

function estatisticas(valores: number[]) {
  if (valores.length === 0) {
    return { media: null, menor: null, maior: null } as const;
  }
  const soma = valores.reduce((a, b) => a + b, 0);
  return {
    media: Math.round(soma / valores.length),
    menor: Math.min(...valores),
    maior: Math.max(...valores),
  } as const;
}

/** Nota de 0 a 100 comparando o tempo médio gasto com o tempo ideal. */
function notaAgilidade(media: number | null, ideal: number) {
  if (media === null || media <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((ideal / media) * 100)));
}

/** Nota de 0 a 100 comparando o volume entregue com o volume esperado. */
function notaVolume(total: number, esperado: number) {
  return Math.max(0, Math.min(100, Math.round((total / esperado) * 100)));
}

export const carregarIndicadoresExecucao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IndicadoresExecucao> => {
    const [visitas, fichas] = await Promise.all([
      context.supabase
        .from("roteiros_visita_campo")
        .select("id, supervisor, enviado_por_nome, posto, duracao_segundos, created_at")
        .order("created_at", { ascending: false })
        .limit(300),
      context.supabase
        .from("avaliacoes_gerentes_area")
        .select(
          "id, gerente_nome, avaliador_nome, mes_referencia, duracao_segundos, created_at, nota_lideranca, nota_operacao, nota_comunicacao, nota_prazos, nota_cliente",
        )
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    const erro = visitas.error?.message ?? fichas.error?.message;
    if (erro) return { ok: false, erro, blocos: [], indiceTrabalho: 0, gerentes: [] };

    const registrosVisitas: RegistroExecucao[] = (visitas.data ?? []).map((v) => ({
      id: v.id as string,
      responsavel:
        ((v.supervisor as string | null) || (v.enviado_por_nome as string | null)) ??
        "Não informado",
      referencia: (v.posto as string | null) ?? "Posto não informado",
      duracaoSegundos: (v.duracao_segundos as number | null) ?? null,
      criadoEm: v.created_at as string,
    }));

    const registrosFichas: RegistroExecucao[] = (fichas.data ?? []).map((f) => ({
      id: f.id as string,
      responsavel: (f.avaliador_nome as string | null) ?? "Não informado",
      referencia: `${f.gerente_nome as string} · ${f.mes_referencia as string}`,
      duracaoSegundos: (f.duracao_segundos as number | null) ?? null,
      criadoEm: f.created_at as string,
    }));

    const montar = (
      chave: BlocoIndicador["chave"],
      titulo: string,
      registros: RegistroExecucao[],
    ): BlocoIndicador => {
      const tempos = registros
        .map((r) => r.duracaoSegundos)
        .filter((d): d is number => typeof d === "number" && d > 0);
      const e = estatisticas(tempos);
      return {
        chave,
        titulo,
        total: registros.length,
        comTempo: tempos.length,
        mediaSegundos: e.media,
        menorSegundos: e.menor,
        maiorSegundos: e.maior,
        registros: registros.slice(0, 30),
      };
    };

    const blocos = [
      montar("supervisao-campo", "Relatório de Supervisão de Campo", registrosVisitas),
      montar("avaliacao-gerentes", "Ficha de Avaliação dos Gerentes de Área", registrosFichas),
    ];

    const notas = blocos.map((b) => {
      const agilidade = notaAgilidade(b.mediaSegundos, TEMPO_IDEAL[b.chave]);
      const volume = notaVolume(b.total, VOLUME_ESPERADO[b.chave]);
      return b.comTempo > 0 ? agilidade * 0.5 + volume * 0.5 : volume;
    });

    const indiceTrabalho = Math.round(notas.reduce((a, b) => a + b, 0) / (notas.length || 1));

    // Indicador individual de cada gerente de área.
    const gerentes: IndicadorGerente[] = AREAS_GERENTES.map((nome) => {
      const alvo = normalizarNome(nome);
      const visitasDele = (visitas.data ?? []).filter(
        (v) =>
          normalizarNome((v.supervisor as string | null) ?? "") === alvo ||
          normalizarNome((v.enviado_por_nome as string | null) ?? "") === alvo,
      );
      const fichasDele = (fichas.data ?? []).filter(
        (f) =>
          normalizarNome((f.gerente_nome as string | null) ?? "") === alvo ||
          normalizarNome((f.avaliador_nome as string | null) ?? "") === alvo,
      );

      const tempos = [
        ...visitasDele.map((v) => v.duracao_segundos as number | null),
        ...fichasDele.map((f) => f.duracao_segundos as number | null),
      ].filter((d): d is number => typeof d === "number" && d > 0);
      const e = estatisticas(tempos);

      const datas = [
        ...visitasDele.map((v) => v.created_at as string),
        ...fichasDele.map((f) => f.created_at as string),
      ].sort();

      const volume =
        (notaVolume(visitasDele.length, VOLUME_ESPERADO["supervisao-campo"]) +
          notaVolume(fichasDele.length, 1)) /
        2;
      const agilidade = notaAgilidade(e.media, TEMPO_IDEAL["supervisao-campo"]);
      const indice = Math.round(tempos.length > 0 ? volume * 0.5 + agilidade * 0.5 : volume);

      // Índice das fichas: média das notas (1 a 5) convertida para 0 a 100.
      const notasFichas = fichasDele.flatMap((f) =>
        [
          f.nota_lideranca,
          f.nota_operacao,
          f.nota_comunicacao,
          f.nota_prazos,
          f.nota_cliente,
        ].filter((n): n is number => typeof n === "number"),
      );
      const indiceFichas =
        notasFichas.length > 0
          ? Math.round((notasFichas.reduce((a, b) => a + b, 0) / notasFichas.length / 5) * 100)
          : null;

      const idsVisitas = new Set(visitasDele.map((v) => v.id as string));
      const idsFichas = new Set(fichasDele.map((f) => f.id as string));

      return {
        nome,
        visitas: visitasDele.length,
        fichas: fichasDele.length,
        comTempo: tempos.length,
        mediaSegundos: e.media,
        menorSegundos: e.menor,
        maiorSegundos: e.maior,
        indice,
        ultimoRegistro: datas.length > 0 ? (datas[datas.length - 1] ?? null) : null,
        listaVisitas: registrosVisitas.filter((r) => idsVisitas.has(r.id)),
        listaFichas: registrosFichas.filter((r) => idsFichas.has(r.id)),
        indiceFichas,
      };
    });

    return { ok: true, blocos, indiceTrabalho, gerentes };
  });
