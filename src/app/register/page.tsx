"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Registration failed");
      return;
    }
    await signIn("credentials", { email, password, callbackUrl: "/", redirect: true });
    router.push("/");
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold text-white">Create account</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <input
          type="email"
          required
          placeholder="Email"
          className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Password (8+ chars)"
          className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-emerald-600 py-2 text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? "…" : "Register"}
        </button>
      </form>
      <a href="/" className="text-center text-sm text-zinc-500 hover:text-zinc-300">
        Back home
      </a>
    </div>
  );
}
