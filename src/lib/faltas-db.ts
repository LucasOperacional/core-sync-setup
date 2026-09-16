import { supabase } from "@/integrations/supabase/client";

const BUCKET_PDF = "faltas-pdfs";
const BUCKET_PLANILHAS = "faltas-planilhas";

export interface FaltaArquivoSalvo {
  id: string;
  nome: string;
  caminho: string;
  tamanho: number;
  tipo: string;
  created_at: string;
}

/**
 * Determine the correct MIME type for a file based on its extension.
 */
function getContentType(fileName: string): string {
  const name = fileName.toLowerCase();
  if (name.endsWith(".xlsx"))
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (name.endsWith(".xls")) return "application/vnd.ms-excel";
  if (name.endsWith(".csv")) return "text/csv";
  if (name.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

/**
 * Determine which bucket to use based on file extension.
 */
function getBucketForFile(fileName: string): string {
  const name = fileName.toLowerCase();
  if (name.endsWith(".pdf")) return BUCKET_PDF;
  return BUCKET_PLANILHAS;
}

/**
 * Determine the tipo (type category) for a file.
 */
function getTipoForFile(fileName: string): string {
  const name = fileName.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".csv")) return "csv";
  if (name.endsWith(".xlsx")) return "xlsx";
  if (name.endsWith(".xls")) return "xls";
  return "outro";
}

/**
 * Ensure a storage bucket exists. If not, attempt to create it.
 */
async function ensureBucketExists(bucket: string, allowedMimeTypes: string[]): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b) => b.id === bucket);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: 52428800, // 50MB
      allowedMimeTypes,
    });
    if (error && !error.message?.includes("already exists")) {
      console.error(`[faltas-db] Não foi possível criar o bucket ${bucket}:`, error.message);
    }
  }
}

async function ensurePdfBucket(): Promise<void> {
  await ensureBucketExists(BUCKET_PDF, ["application/pdf", "application/octet-stream"]);
}

async function ensurePlanilhasBucket(): Promise<void> {
  await ensureBucketExists(BUCKET_PLANILHAS, [
    "text/csv",
    "text/plain",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
  ]);
}

/**
 * Check if error is related to bucket/policy issues.
 */
function isBucketOrPolicyError(errorMessage: string): boolean {
  const msg = errorMessage.toLowerCase();
  return (
    msg.includes("bucket") ||
    msg.includes("not found") ||
    msg.includes("does not exist") ||
    msg.includes("no such") ||
    msg.includes("policy") ||
    msg.includes("row-level security") ||
    msg.includes("violates") ||
    msg.includes("mime") ||
    msg.includes("content type") ||
    msg.includes("not allowed")
  );
}

/**
 * Upload a single file to the specified bucket, with fallback strategies.
 */
async function uploadFileWithRetry(
  file: File,
  caminho: string,
  contentType: string,
  bucket: string,
): Promise<{ error: { message: string } | null }> {
  const uploadOpts = {
    cacheControl: "3600",
    upsert: true,
    contentType,
  };

  const { error } = await supabase.storage.from(bucket).upload(caminho, file, uploadOpts);

  if (error) {
    const msg = error.message?.toLowerCase() ?? "";

    // If it's a bucket/policy/mime error, try to recreate bucket and retry
    if (isBucketOrPolicyError(error.message ?? "")) {
      console.warn(`[faltas-db] Erro no bucket ${bucket}: ${error.message}. Tentando recriar...`);
      if (bucket === BUCKET_PDF) await ensurePdfBucket();
      else await ensurePlanilhasBucket();

      // Retry with original content type
      const retry1 = await supabase.storage.from(bucket).upload(caminho, file, uploadOpts);
      if (!retry1.error) {
        return { error: null };
      }

      // If still failing, try with application/octet-stream as fallback
      if (contentType !== "application/octet-stream") {
        console.warn(`[faltas-db] Tentando com application/octet-stream para ${file.name}...`);
        const retry2 = await supabase.storage
          .from(bucket)
          .upload(caminho, file, { ...uploadOpts, contentType: "application/octet-stream" });
        if (!retry2.error) {
          return { error: null };
        }
        return { error: { message: retry2.error.message } };
      }

      return { error: { message: retry1.error.message } };
    }

    // For duplicate errors, try with upsert or slightly different name
    if (msg.includes("duplicate") || msg.includes("already exists")) {
      // Already using upsert: true, so this shouldn't happen, but just in case
      const retryUpsert = await supabase.storage
        .from(bucket)
        .upload(caminho, file, { ...uploadOpts, upsert: true });
      return { error: retryUpsert.error ? { message: retryUpsert.error.message } : null };
    }

    return { error: { message: error.message } };
  }

  return { error: null };
}

/**
 * Upload PDF files to Supabase Storage (bucket faltas-pdfs) and register in faltas_arquivos table.
 * Returns the count of successfully saved files.
 */
export async function uploadFaltasPdfs(files: File[]): Promise<number> {
  await ensurePdfBucket();

  let saved = 0;

  for (const file of files) {
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const caminho = `faltas/${timestamp}_${safeName}`;
    const contentType = getContentType(file.name);

    const { error: uploadError } = await uploadFileWithRetry(
      file,
      caminho,
      contentType,
      BUCKET_PDF,
    );

    if (uploadError) {
      console.error(`[faltas-db] Erro ao enviar ${file.name}:`, uploadError.message);
      continue;
    }

    const { error: dbError } = await supabase.from("faltas_arquivos" as any).insert({
      nome: file.name,
      caminho,
      tamanho: file.size,
      tipo: "pdf",
    });

    if (dbError) {
      console.error(`[faltas-db] Erro ao registrar ${file.name}:`, dbError.message);
      await supabase.storage.from(BUCKET_PDF).remove([caminho]);
      continue;
    }

    saved++;
  }

  return saved;
}

/**
 * Upload any files (PDF, CSV, XLSX, XLS) to the appropriate Supabase Storage bucket
 * and register in faltas_arquivos table.
 * PDFs go to "faltas-pdfs", spreadsheets/CSV go to "faltas-planilhas".
 * Returns the count of successfully saved files.
 */
export async function uploadFaltasArquivos(files: File[]): Promise<number> {
  // Ensure both buckets exist
  await ensurePdfBucket();
  await ensurePlanilhasBucket();

  let saved = 0;

  for (const file of files) {
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const bucket = getBucketForFile(file.name);
    const prefix = bucket === BUCKET_PDF ? "faltas" : "planilhas";
    const caminho = `${prefix}/${timestamp}_${safeName}`;
    const contentType = getContentType(file.name);
    const tipo = getTipoForFile(file.name);

    const { error: uploadError } = await uploadFileWithRetry(file, caminho, contentType, bucket);

    if (uploadError) {
      console.error(
        `[faltas-db] Erro ao enviar ${file.name} (bucket: ${bucket}, type: ${contentType}):`,
        uploadError.message,
      );
      continue;
    }

    const { error: dbError } = await supabase.from("faltas_arquivos" as any).insert({
      nome: file.name,
      caminho,
      tamanho: file.size,
      tipo,
    });

    if (dbError) {
      console.error(`[faltas-db] Erro ao registrar ${file.name}:`, dbError.message);
      await supabase.storage.from(bucket).remove([caminho]);
      continue;
    }

    saved++;
  }

  return saved;
}

/**
 * List all saved faltas files from the database.
 */
export async function listFaltasArquivos(): Promise<FaltaArquivoSalvo[]> {
  const { data, error } = await supabase
    .from("faltas_arquivos" as any)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[faltas-db] Erro ao listar arquivos:", error.message);
    return [];
  }

  return (data ?? []) as unknown as FaltaArquivoSalvo[];
}

/**
 * Get a public/signed URL for a faltas file.
 * Determines the correct bucket based on the tipo field or file path.
 */
export async function getFaltasArquivoUrl(caminho: string, tipo?: string): Promise<string | null> {
  const bucket = tipo === "pdf" || caminho.startsWith("faltas/") ? BUCKET_PDF : BUCKET_PLANILHAS;

  const { data } = await supabase.storage.from(bucket).createSignedUrl(caminho, 3600);

  return data?.signedUrl ?? null;
}

/**
 * Delete a faltas file from storage and database.
 * Determines the correct bucket based on the tipo field or file path.
 */
export async function deleteFaltasArquivo(
  id: string,
  caminho: string,
  tipo?: string,
): Promise<void> {
  const bucket = tipo === "pdf" || caminho.startsWith("faltas/") ? BUCKET_PDF : BUCKET_PLANILHAS;
  await supabase.storage.from(bucket).remove([caminho]);
  await supabase
    .from("faltas_arquivos" as any)
    .delete()
    .eq("id", id);
}
