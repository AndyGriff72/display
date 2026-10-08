import axios from "axios";

/** The CSRF token Laravel put in the page, sent with every request as Redbrix does. */
function readCsrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? "";
}

export const api = axios.create({
  baseURL: "/api",
  headers: {
    Accept: "application/json",
    "X-CSRF-TOKEN": readCsrfToken(),
  },
});

// A session that has ended, or was never started: off to sign in, as Redbrix does it. Screens
// never see this, since nothing they ask for needs a sign-in.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) window.location.href = "/login";
    return Promise.reject(error);
  }
);

/** The CSRF token, for a plain form posted outside axios (signing out). */
export const csrfToken = readCsrfToken;

/** Redbrix's response envelope. */
export interface ApiResponse<T> {
  status: number;
  data: T;
  message: string;
}

export interface ApiError {
  message: string;
  /** Per-field validation messages, by field name, when the server sent them. */
  fields: Record<string, string>;
}

/** What went wrong with a request, in words to show the person. */
export function apiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined;
    const fields = Object.fromEntries(Object.entries(body?.errors ?? {}).map(([k, v]) => [k, v[0]]));
    if (body?.message) return { message: body.message, fields };
    if (!error.response) return { message: "Could not reach the board's server. Is it running?", fields };
  }
  return { message: "Something went wrong.", fields: {} };
}
