const API_BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public issues?: unknown,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const controller = new AbortController();
  // 30-second bounded timeout on every API call to prevent infinite loading/spinners
  const timeoutId = setTimeout(() => controller.abort(new Error("Request timed out after 30s")), 30_000);

  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort(options.signal?.reason));
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      credentials: "include",
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: res.statusText }));
      throw new ApiError(body.message ?? "Request failed", res.status, body.issues, body.code);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  } catch (err: any) {
    if (err?.name === "AbortError" || err?.message?.includes("timed out")) {
      throw new ApiError("Request timed out. Please try again.", 408);
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(err?.message ?? "Network error", 0);
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "DELETE", body: body ? JSON.stringify(body) : undefined }),
  postForm: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
  upload: <T>(path: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request<T>(path, { method: "POST", body: formData });
  },
};
