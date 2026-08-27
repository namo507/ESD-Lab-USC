import { REDCAP_PROXY_URL } from "@/constants/redcapConfig";

export async function callREDCap<T = unknown>(payload: Record<string, string>): Promise<T> {
  const res = await fetch(REDCAP_PROXY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`REDCap proxy ${res.status}`);
  const data = (await res.json()) as { error?: unknown };
  if (typeof data?.error === "string") throw new Error(`REDCap: ${data.error}`);
  return data as T;
}
