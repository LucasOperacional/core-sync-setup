import { describe, expect, it, vi } from "vitest";
import {
  containsSensitiveData,
  REDACTED,
  sanitizeForLog,
  sanitizeText,
  sanitizeUrl,
  safeFileName,
} from "./redaction";
import { buildSafeLog, safeError, safeRequestSummary } from "./safe-log";
import {
  ALLOWED_PIXEL_EVENTS,
  buildMonitoringOptions,
  isSessionReplayBlocked,
  scrubMonitoringEvent,
  trackAnonymousEvent,
} from "./telemetry";

const AMOSTRAS_SENSIVEIS = [
  "CPF 123.456.789-09 do colaborador",
  "cpf=12345678909",
  "email: joao.silva@empresa.com.br",
  "telefone (11) 98765-4321",
  "CID J06.9 informado no atestado",
  "CRM/SP 123456",
  "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghij",
  "apikey sb_secret_abcdefghijklmnop",
  "Authorization: Bearer abcdefghijklmnopqrs",
  "senha: SuperSecreta123",
];

describe("sanitizador central", () => {
  it("substitui todo dado sensível por [DADO_PROTEGIDO]", () => {
    for (const amostra of AMOSTRAS_SENSIVEIS) {
      const limpo = sanitizeText(amostra);
      expect(limpo).toContain(REDACTED);
      expect(containsSensitiveData(limpo)).toBe(false);
    }
  });

  it("nega campos fora da lista permitida", () => {
    const saida = sanitizeForLog({
      resource: "nexti.api",
      httpStatus: 500,
      nome: "Maria Aparecida da Silva",
      cpf: "123.456.789-09",
      email: "maria@empresa.com",
      atestado: { cid: "J06.9" },
      senha: "abc123",
    }) as Record<string, unknown>;

    expect(saida["resource"]).toBe("nexti.api");
    expect(saida["httpStatus"]).toBe(500);
    for (const campo of ["nome", "cpf", "email", "atestado", "senha"]) {
      expect(saida[campo]).toBe(REDACTED);
    }
    expect(containsSensitiveData(saida)).toBe(false);
  });

  it("não deixa dado pessoal em URLs, parâmetros ou nomes de arquivo", () => {
    const url = sanitizeUrl("https://app.local/atestados/123.456.789-09?email=joao@x.com");
    expect(url).not.toContain("123.456.789-09");
    expect(url).not.toContain("joao@x.com");
    expect(containsSensitiveData(url)).toBe(false);

    const nome = safeFileName("pdf", "atestado");
    expect(nome).toMatch(/^atestado-[0-9a-f]{32}\.pdf$/);
  });

  it("resumo de requisição guarda só método, rota e status", () => {
    const resumo = safeRequestSummary({
      method: "POST",
      url: "https://app.local/api/vagas?cpf=12345678909",
      status: 401,
    });
    expect(resumo).toEqual({ method: "POST", route: "https://app.local/api/vagas", status: 401 });
  });
});

describe("registros (logs)", () => {
  it("nunca grava a requisição completa", () => {
    const log = buildSafeLog("api.call", {
      resource: "atestados.db",
      body: { cpf: "123.456.789-09", nome: "João" },
      headers: { authorization: "Bearer abcdefghijklmnop" },
    });
    expect(containsSensitiveData(log)).toBe(false);
    expect(log["body"]).toBe(REDACTED);
    expect(log["headers"]).toBe(REDACTED);
  });

  it("erros registrados não expõem dado pessoal", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    safeError("falha", new Error("falha ao salvar cpf 123.456.789-09 de joao@x.com"), {
      resource: "vagas.db",
    });
    const registrado = String(spy.mock.calls[0]?.[0] ?? "");
    expect(containsSensitiveData(registrado)).toBe(false);
    spy.mockRestore();
  });
});

describe("monitoramento externo", () => {
  it("limpa payload, cabeçalhos, cookies e breadcrumbs", () => {
    const evento = scrubMonitoringEvent({
      request: {
        url: "https://app.local/rh?cpf=12345678909",
        data: { cpf: "123.456.789-09" },
        headers: { cookie: "sb-access-token=abc" },
        cookies: "sb-access-token=abc",
        query_string: "cpf=12345678909",
      },
      user: { email: "joao@x.com", nome: "João" },
      breadcrumbs: [{ message: "cpf 123.456.789-09" }],
      extra: { atestado: "CID J06.9" },
      message: "erro ao ler atestado de joao@x.com",
    });
    expect(containsSensitiveData(evento)).toBe(false);
    expect(evento.breadcrumbs).toEqual([]);
    expect(evento.user).toEqual({ id: expect.any(String) });
  });

  it("nasce sem PII e sem gravação de sessão", () => {
    const opts = buildMonitoringOptions("/atestados");
    expect(opts.sendDefaultPii).toBe(false);
    expect(opts.replaysSessionSampleRate).toBe(0);
    expect(opts.replaysOnErrorSampleRate).toBe(0);
    expect(opts.maxBreadcrumbs).toBe(0);
    expect(opts.beforeBreadcrumb()).toBeNull();
    expect(opts.replayOptions.maskAllInputs).toBe(true);
  });

  it("bloqueia gravação de sessão nas páginas com dados de pessoas", () => {
    expect(isSessionReplayBlocked("/atestados")).toBe(true);
    expect(isSessionReplayBlocked("/rh")).toBe(true);
    expect(isSessionReplayBlocked("/politica-privacidade")).toBe(false);
  });

  it("pixels recebem apenas eventos anônimos da lista", () => {
    const chamadas: unknown[][] = [];
    (globalThis as any).window = {
      localStorage: { getItem: () => null, setItem: () => {} },
      fbq: (...args: unknown[]) => chamadas.push(args),
    };

    trackAnonymousEvent("submit_application", {
      step: 3,
      nome: "Maria",
      cpf: "123.456.789-09",
    } as never);
    trackAnonymousEvent("enviar_cpf" as never, { cpf: "123.456.789-09" } as never);

    expect(chamadas).toHaveLength(1);
    expect(ALLOWED_PIXEL_EVENTS).toContain(chamadas[0]?.[1]);
    expect(containsSensitiveData(chamadas[0])).toBe(false);
    const props = chamadas[0]?.[2] as Record<string, unknown>;
    expect(props["nome"]).toBeUndefined();
    expect(props["cpf"]).toBeUndefined();
    expect(String(props["anon_id"])).toMatch(/^[0-9a-f]{32}$/);

    delete (globalThis as any).window;
  });
});
