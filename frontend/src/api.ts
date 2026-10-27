import type { Handle, Session, Mode } from "./types";
export async function request<T>(
  path: string,
  body?: unknown,
  key?: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "X-Session-Key": key } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error(
      "The lab server is unreachable. Check that FaultLab is running, then retry.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg: string }) => d.msg).join(" ")
          : `The request could not be completed (${response.status}).`,
    );
  }
  return data as T;
}
export const startCase = (mode: Mode) =>
  request<{ key: string; session: Session }>("/api/sessions", { mode });
export const getCase = (h: Handle) =>
  request<Session>(`/api/sessions/${h.id}`, undefined, h.key);
export const action = (h: Handle, name: string, body: unknown = {}) =>
  request<Session>(`/api/sessions/${h.id}/${name}`, body, h.key);
export function readHandles(): Handle[] {
  try {
    const raw = JSON.parse(
      localStorage.getItem("faultlab.sessions.v1") || "[]",
    );
    return Array.isArray(raw)
      ? raw.filter(
          (h) =>
            typeof h?.id === "string" &&
            typeof h?.key === "string" &&
            ["practice", "assessment"].includes(h?.mode),
        )
      : [];
  } catch {
    return [];
  }
}
export function saveHandles(handles: Handle[]) {
  localStorage.setItem("faultlab.sessions.v1", JSON.stringify(handles));
}
