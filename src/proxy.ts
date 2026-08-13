import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * Everything behind the gate by default. Add paths here to open them up —
 * the deny-by-default shape means forgetting to list a new route keeps it
 * protected rather than exposing it.
 */
const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (session) return NextResponse.next();

  // API callers get a status they can act on; humans get redirected to the form.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Inloggning krävs." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Brand assets stay open: the login page itself renders the wordmark, and a
  // gated icon route makes the tab favicon fail before anyone has a session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/).*)"]
};
