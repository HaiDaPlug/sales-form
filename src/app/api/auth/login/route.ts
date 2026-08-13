import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createSessionToken,
  getSessionSubject,
  isAuthConfigured,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  verifyCredentials
} from "@/lib/auth/session";

const loginSchema = z.object({
  name: z.string().trim().min(1, "Namn krävs"),
  password: z.string().min(1, "Lösenord krävs")
});

export async function POST(request: NextRequest) {
  try {
    if (!isAuthConfigured()) {
      console.error("Login attempted while APP_ACCESS_PASSWORD/APP_SESSION_SECRET are unset.");
      return NextResponse.json(
        { ok: false, error: "Inloggning är inte konfigurerad. Kontakta administratören." },
        { status: 503 }
      );
    }

    const parsed = loginSchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Namn och lösenord krävs." }, { status: 400 });
    }

    if (!verifyCredentials(parsed.data)) {
      // Deliberately vague — no hint about which half was wrong.
      return NextResponse.json({ ok: false, error: "Fel namn eller lösenord." }, { status: 401 });
    }

    const token = await createSessionToken(getSessionSubject(parsed.data));
    const response = NextResponse.json({ ok: true });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS
    });

    return response;
  } catch (error) {
    console.error("Login failed:", error);
    return NextResponse.json({ ok: false, error: "Ett internt fel uppstod." }, { status: 500 });
  }
}
