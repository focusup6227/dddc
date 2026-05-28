import ReactMarkdown from "react-markdown";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Waiver, WaiverSignature } from "@/lib/supabase/types";
import { formatDate } from "@/lib/format";
import { signWaiver } from "./actions";

export default async function WaiverPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { userId, profile } = await requireCustomer();
  const supabase = await createClient();
  const params = await searchParams;

  const { data: waiver } = await supabase
    .from("waivers")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Waiver>();

  if (!waiver) {
    return (
      <p className="text-ink-700">
        No active waiver is configured. Please ask staff to set one up.
      </p>
    );
  }

  const { data: existing } = await supabase
    .from("waiver_signatures")
    .select("*")
    .eq("user_id", userId)
    .eq("waiver_id", waiver.id)
    .maybeSingle<WaiverSignature>();

  if (existing) {
    return (
      <div className="card max-w-2xl animate-fade-up">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <CheckCircle2 size={22} />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold text-ink-900">
              Waiver signed
            </h1>
            <p className="mt-2 text-ink-700">
              You signed <strong>{waiver.title}</strong> ({waiver.version}) as{" "}
              <strong>{existing.signed_full_name}</strong> on{" "}
              {formatDate(existing.signed_at)}.
            </p>
          </div>
        </div>
        <a href="/dashboard" className="btn-primary mt-5">
          Back to dashboard
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-3xl animate-fade-up">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
          <ShieldCheck size={22} />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">
            {waiver.title}
          </h1>
          <p className="mt-1 text-sm text-ink-500">Version {waiver.version}</p>
        </div>
      </div>

      <article className="card mt-6 prose prose-stone max-w-none prose-headings:font-display prose-headings:font-semibold prose-headings:text-ink-900 prose-strong:text-ink-900">
        <ReactMarkdown>{waiver.body_markdown}</ReactMarkdown>
      </article>

      <form action={signWaiver} className="card mt-6 space-y-5">
        <input type="hidden" name="waiver_id" value={waiver.id} />
        <div>
          <label htmlFor="signed_full_name" className="label">
            Type your full legal name to sign
          </label>
          <input
            id="signed_full_name"
            name="signed_full_name"
            required
            defaultValue={profile.full_name}
            className="input"
            placeholder="First and last name"
          />
        </div>
        <label className="flex items-start gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            name="agree"
            required
            value="yes"
            className="mt-1 h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
          />
          <span>
            I have read and agree to the terms of this liability waiver. I
            understand that typing my name above constitutes an electronic
            signature.
          </span>
        </label>
        {params.error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {params.error}
          </p>
        )}
        <button type="submit" className="btn-primary">
          Sign waiver
        </button>
      </form>
    </div>
  );
}
