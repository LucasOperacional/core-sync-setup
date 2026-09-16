/**
 * Manus AI — configuração local (navegador) e tipos compartilhados.
 *
 * Documentação: https://open.manus.ai/docs/v2/introduction
 * - Base URL: https://api.manus.ai
 * - Autenticação: header `x-manus-api-key`
 * - Fluxo de tarefa: POST /v2/task.create → GET /v2/task.listMessages (polling)
 */

const STORAGE_KEY = "manus-api-config-v1";

export type ManusAgentProfile = "lite" | "standard" | "max";

export interface ManusConfig {
  apiKey: string;
  agentProfile: ManusAgentProfile;
  locale: string;
  hideInTaskList: boolean;
}

export const MANUS_DEFAULT_CONFIG: ManusConfig = {
  apiKey: "",
  agentProfile: "standard",
  locale: "pt-BR",
  hideInTaskList: true,
};

export const MANUS_PROFILES: Array<{
  value: ManusAgentProfile;
  label: string;
  description: string;
}> = [
  { value: "lite", label: "Lite", description: "Mais rápido e econômico em créditos." },
  { value: "standard", label: "Standard", description: "Equilíbrio entre custo e qualidade." },
  { value: "max", label: "Max", description: "Máxima capacidade para tarefas complexas." },
];

export function loadManusConfig(): ManusConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ManusConfig>;
      return {
        apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
        agentProfile:
          parsed.agentProfile === "lite" || parsed.agentProfile === "max"
            ? parsed.agentProfile
            : "standard",
        locale: typeof parsed.locale === "string" && parsed.locale ? parsed.locale : "pt-BR",
        hideInTaskList: parsed.hideInTaskList !== false,
      };
    }
  } catch {
    /* config inválida — usa padrão */
  }
  return { ...MANUS_DEFAULT_CONFIG };
}

export function saveManusConfig(config: ManusConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* storage indisponível */
  }
}

export function hasManusKey(): boolean {
  return loadManusConfig().apiKey.trim().length > 0;
}
