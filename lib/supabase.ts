import { createBrowserClient } from "@supabase/ssr";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export function supabaseFetch(input: RequestInfo | URL, init?: RequestInit) {
  const timeout = AbortSignal.timeout(6500);
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  return fetch(input, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
}

export function browserSupabase() {
  if (typeof window === "undefined" || !supabaseUrl || !supabaseAnonKey) return;
  try {
    return createBrowserClient(supabaseUrl, supabaseAnonKey, { global: { fetch: supabaseFetch } });
  } catch {
    return undefined;
  }
}
