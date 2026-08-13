"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { SubmitState } from "@/lib/crm/types";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status === "loading") return;

    setState({ status: "loading", message: "Loggar in..." });

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password })
      });
      const result = (await response.json()) as { ok: boolean; error?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "Inloggningen misslyckades");
      }

      // Only allow internal paths — an attacker-supplied ?next= must not
      // become an open redirect.
      const next = searchParams.get("next");
      const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

      router.replace(target);
      router.refresh();
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Inloggningen misslyckades"
      });
    }
  }

  return (
    <div className="login-panel">
      <Image
        className="login-logo"
        src="/brand/wordmark-white.png"
        alt="Digital Kontakt"
        width={1200}
        height={205}
        priority
      />

      <form className="login-card" onSubmit={handleSubmit}>
        <p className="hint">Internt verktyg. Logga in för att fortsätta.</p>

        <div className="field">
          <label htmlFor="login-name">Ditt namn</label>
          <input
            id="login-name"
            name="name"
            autoComplete="username"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="login-password">Lösenord</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>

        {state.status === "error" && (
          <div className="notice error" role="alert">
            {state.message}
          </div>
        )}

        <button className="btn primary" type="submit" disabled={state.status === "loading"}>
          {state.status === "loading" ? "Loggar in..." : "Logga in"}
        </button>

        <p className="login-footnote">Ditt namn används för att märka dina körningar i historiken.</p>
      </form>
    </div>
  );
}
