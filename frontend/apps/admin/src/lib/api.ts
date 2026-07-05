import { type ZodTypeAny, type z } from "zod";
import { ApiMetricsResponseSchema, AiUsageResponseSchema } from "@monysa/contracts";
import { clearToken, getToken } from "./auth";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)
  ?? (import.meta.env.DEV ? "http://localhost:5001" : "");

export class AdminApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "AdminApiError";
  }
}

async function request<S extends ZodTypeAny>(
  method: string,
  path: string,
  schema: S,
  body?: unknown,
): Promise<z.infer<S>> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = `${import.meta.env.BASE_URL}login`;
    throw new AdminApiError(401, "Unauthorized");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new AdminApiError(res.status, text);
  }

  const json = await res.json();
  return schema.parse(json);
}

export const adminApi = {
  get: <S extends ZodTypeAny>(path: string, schema: S) => request("GET", path, schema),
  post: <S extends ZodTypeAny>(path: string, body: unknown, schema: S) => request("POST", path, schema, body),
  patch: <S extends ZodTypeAny>(path: string, body: unknown, schema: S) => request("PATCH", path, schema, body),
  delete: <S extends ZodTypeAny>(path: string, schema: S) => request("DELETE", path, schema),
  getApiMetrics: (win = "1h") =>
    request("GET", `/api/admin/logs/metrics?window=${win}`, ApiMetricsResponseSchema),
  getAiUsage: () =>
    request("GET", "/api/admin/ai-usage", AiUsageResponseSchema),
};
