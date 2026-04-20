"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    if (res?.error) {
      setError("Invalid email or password");
      return;
    }
    window.location.href = "/";
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold text-white">Sign in</h1>
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
          placeholder="Password"
          className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button
          type="submit"
          className="rounded-lg bg-emerald-600 py-2 text-white hover:bg-emerald-500"
        >
          Sign in
        </button>
      </form>
      <a
        href="/register"
        className="text-center text-sm text-emerald-400 hover:underline"
      >
        Create account
      </a>
    </div>
  );
}
