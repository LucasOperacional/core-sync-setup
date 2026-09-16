/**
 * IA Operacional Chat — Persistência de dados de treinamento no Supabase.
 */

import { supabase } from "@/integrations/supabase/client";

export interface TrainingData {
  id: string;
  user_id: string;
  category: "instruction" | "qa_example" | "context";
  title: string;
  content: string;
  question: string | null;
  answer: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export async function listTrainingData(): Promise<TrainingData[]> {
  const { data, error } = await (supabase.from("ia_training_data" as never) as any)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[ia-training] listTrainingData error:", error.message);
    throw new Error("Erro ao carregar dados de treinamento: " + error.message);
  }
  return (data ?? []) as TrainingData[];
}

export async function listActiveTrainingData(): Promise<TrainingData[]> {
  const { data, error } = await (supabase.from("ia_training_data" as never) as any)
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[ia-training] listActiveTrainingData error:", error.message);
    throw new Error("Erro ao carregar dados ativos: " + error.message);
  }
  return (data ?? []) as TrainingData[];
}

export async function createTrainingData(params: {
  category: "instruction" | "qa_example" | "context";
  title: string;
  content: string;
  question?: string;
  answer?: string;
}): Promise<TrainingData> {
  if (!params.title?.trim()) throw new Error("O título é obrigatório.");
  if (!params.content?.trim()) throw new Error("O conteúdo é obrigatório.");

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) {
    throw new Error("Usuário não autenticado. Faça login novamente.");
  }
  const userId = userData.user.id;

  const { data, error } = await (supabase.from("ia_training_data" as never) as any)
    .insert({
      user_id: userId,
      category: params.category,
      title: params.title.trim(),
      content: params.content.trim(),
      question: params.question?.trim() || null,
      answer: params.answer?.trim() || null,
    } as never)
    .select()
    .single();

  if (error) {
    console.error(
      "[ia-training] createTrainingData error:",
      error.message,
      error.details,
      error.hint,
    );
    if (error.message?.includes("row-level security") || error.code === "42501") {
      throw new Error(
        "Permissão negada ao cadastrar. Verifique se as políticas RLS da tabela ia_training_data permitem INSERT para usuários autenticados.",
      );
    }
    throw new Error("Erro ao cadastrar: " + error.message);
  }
  return data as TrainingData;
}

export async function updateTrainingData(
  id: string,
  params: Partial<{
    title: string;
    content: string;
    question: string;
    answer: string;
    active: boolean;
    category: "instruction" | "qa_example" | "context";
  }>,
): Promise<void> {
  if (!id) throw new Error("ID é obrigatório para atualizar.");

  const updates: Record<string, unknown> = { ...params, updated_at: new Date().toISOString() };

  const { error } = await (supabase.from("ia_training_data" as never) as any)
    .update(updates as never)
    .eq("id", id);

  if (error) {
    console.error(
      "[ia-training] updateTrainingData error:",
      error.message,
      error.details,
      error.hint,
    );
    if (error.message?.includes("row-level security") || error.code === "42501") {
      throw new Error(
        "Permissão negada ao atualizar. Você só pode editar registros que criou, ou precisa ser admin.",
      );
    }
    throw new Error("Erro ao atualizar: " + error.message);
  }
}

export async function deleteTrainingData(id: string): Promise<void> {
  if (!id) throw new Error("ID é obrigatório para excluir.");

  const { error } = await (supabase.from("ia_training_data" as never) as any).delete().eq("id", id);

  if (error) {
    console.error(
      "[ia-training] deleteTrainingData error:",
      error.message,
      error.details,
      error.hint,
    );
    if (error.message?.includes("row-level security") || error.code === "42501") {
      throw new Error(
        "Permissão negada ao excluir. Você só pode remover registros que criou, ou precisa ser admin.",
      );
    }
    throw new Error("Erro ao excluir: " + error.message);
  }
}
