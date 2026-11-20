import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { supabaseAnonKey, supabaseFetch, supabaseUrl } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const destination = new URL("/settings?email=error", request.url);
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  const code = request.nextUrl.searchParams.get("code");
  if (!supabaseUrl || !supabaseAnonKey || !code) return response;

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      global: { fetch: supabaseFetch },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookies, headers) {
          for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
          for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
        },
      },
    });
    const flowId = request.nextUrl.searchParams.get("sb_flow_id");
    const { data, error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (!error && data.user && !data.user.is_anonymous && data.user.email_confirmed_at) {
      destination.searchParams.set("email", "confirmed");
      response.headers.set("Location", destination.toString());
    }
  } catch {
    // 邮件链接失败时回到设置页，浏览器中的面试进度仍可继续使用。
  }
  return response;
}
