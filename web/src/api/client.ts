/**
 * Thin fetch client.
 *
 * - All routes are relative to /api so Vite dev proxy + same-origin prod work.
 * - Validates every response with Zod. Bad payloads throw.
 * - PHI hygiene: never log response bodies, never put participant ids in
 *   query strings (use POST body or path params).
 */
import type { ZodSchema } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    public path: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  schema: ZodSchema<T>,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new ApiError(res.status, path, `${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as unknown;
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    if (import.meta.env.DEV) {
      console.error("schema mismatch", path, parsed.error.flatten());
    }
    throw new ApiError(500, path, "schema validation failed");
  }
  return parsed.data;
}

export const api = {
  get<T>(path: string, schema: ZodSchema<T>): Promise<T> {
    return request(path, schema);
  },
  post<T>(path: string, body: unknown, schema: ZodSchema<T>): Promise<T> {
    return request(path, schema, { method: "POST", body: JSON.stringify(body) });
  },
  patch<T>(path: string, body: unknown, schema: ZodSchema<T>): Promise<T> {
    return request(path, schema, { method: "PATCH", body: JSON.stringify(body) });
  },
};
