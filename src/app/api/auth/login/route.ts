import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createSessionToken,
  isAuthConfigured,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  verifyCredentials
} from "@/lib/auth/session";
import { getSellers } from "@/lib/pipedrive/service";

const loginSchema = z.object({
  username: z.string().trim().min(1, "Användarnamn krävs"),
  password: z.string().min(1, "Lösenord krävs")
});

export async function POST(request: NextRequest) {
  try {
    if (!isAuthConfigured()) {
      console.error("Login attempted while APP_USERS/APP_SESSION_SECRET are unset or unreadable.");
      return NextResponse.json(
        { ok: false, error: "Inloggning är inte konfigurerad. Kontakta administratören." },
        { status: 503 }
      );
    }

    const parsed = loginSchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Användarnamn och lösenord krävs." }, { status: 400 });
    }

    const user = verifyCredentials(parsed.data);

    if (!user) {
      // Deliberately vague — no hint about which half was wrong.
      return NextResponse.json({ ok: false, error: "Fel användarnamn eller lösenord." }, { status: 401 });
    }

    // The account's option id must still exist on "Affärens säljare": a typo
    // in APP_USERS, or an option removed in Pipedrive, would otherwise scope
    // every prospect to a seller that is not there. Pipedrive being unreachable
    // is not the seller's fault and does not lock them out.
    const sellerCheck = await confirmSellerOption(user.sellerOptionId);

    if (sellerCheck === "missing") {
      return NextResponse.json(
        {
          ok: false,
          error: "Ditt konto pekar på en säljare som inte finns i Pipedrive. Kontakta administratören."
        },
        { status: 403 }
      );
    }

    const token = await createSessionToken({
      subject: user.name,
      username: user.username,
      sellerOptionId: user.sellerOptionId
    });
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

async function confirmSellerOption(optionId: string | number): Promise<"ok" | "missing" | "unverified"> {
  try {
    const sellers = await getSellers();

    // An unmapped or deleted field yields no options; that is a configuration
    // gap to fix, not a reason to reject every login.
    if (sellers.length === 0) return "unverified";

    return sellers.some((seller) => String(seller.id) === String(optionId)) ? "ok" : "missing";
  } catch (error) {
    console.warn("Could not confirm the seller option against Pipedrive at login:", error);
    return "unverified";
  }
}
