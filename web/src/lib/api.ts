export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const HEADERS = { "x-requested-with": "ConstituencyOS" };

async function handle<T>(res: Response): Promise<T> {
  if (res.ok) {
    const ct = res.headers.get("content-type") ?? "";
    return (ct.includes("application/json") ? res.json() : res.text()) as Promise<T>;
  }
  let msg = `Request failed (${res.status})`;
  let code: string | undefined;
  let details: unknown;
  try {
    const j = await res.json();
    msg = j.error?.message ?? msg;
    code = j.error?.code;
    details = j.error?.details;
  } catch {
    /* non-JSON error */
  }
  if (res.status === 401 && !location.pathname.startsWith("/login") && location.pathname.startsWith("/app")) {
    window.dispatchEvent(new CustomEvent("cos:unauthorized"));
  }
  throw new ApiError(res.status, msg, code, details);
}

export const api = {
  get: <T>(url: string) => fetch(url, { credentials: "include", headers: HEADERS }).then((r) => handle<T>(r)),
  post: <T>(url: string, body?: unknown) =>
    fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { ...HEADERS, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((r) => handle<T>(r)),
  patch: <T>(url: string, body: unknown) =>
    fetch(url, {
      method: "PATCH",
      credentials: "include",
      headers: { ...HEADERS, "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => handle<T>(r)),
  upload: <T>(url: string, form: FormData) =>
    fetch(url, { method: "POST", credentials: "include", headers: HEADERS, body: form }).then((r) => handle<T>(r)),
};

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
