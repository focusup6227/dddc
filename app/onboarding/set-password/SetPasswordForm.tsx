"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export function SetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      // Fetch profile to decide where to land.
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .single<{ role: string }>();
      const isStaff =
        profile?.role === "staff" || profile?.role === "junior_staff";
      toast.success("Password set. Welcome aboard!");
      router.push(isStaff ? "/staff" : "/dashboard");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-3xl border border-stone-200/80 bg-white p-6 shadow-lift sm:p-8"
    >
      <div>
        <label htmlFor="password" className="label">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
          disabled={pending}
        />
        <p className="mt-1.5 text-xs text-ink-500">At least 8 characters.</p>
      </div>
      <div>
        <label htmlFor="confirm" className="label">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="input"
          disabled={pending}
        />
      </div>
      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="btn-primary w-full"
      >
        {pending ? "Setting password…" : "Set password & continue"}
      </button>
    </form>
  );
}
