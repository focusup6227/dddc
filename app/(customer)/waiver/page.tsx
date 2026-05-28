import ReactMarkdown from "react-markdown";
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
      <p className="text-stone-700">
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
      <div className="card max-w-2xl">
        <h1 className="text-xl font-bold text-stone-900">Waiver signed ✓</h1>
        <p className="mt-2 text-stone-700">
          You signed <strong>{waiver.title}</strong> ({waiver.version}) as{" "}
          <strong>{existing.signed_full_name}</strong> on{" "}
          {formatDate(existing.signed_at)}.
        </p>
        <a href="/dashboard" className="mt-4 inline-block btn-primary">
          Back to dashboard
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-stone-900">{waiver.title}</h1>
      <p className="mt-1 text-sm text-stone-500">Version {waiver.version}</p>

      <article className="card mt-6 prose prose-stone max-w-none prose-headings:font-semibold prose-strong:text-stone-900">
        <ReactMarkdown>{waiver.body_markdown}</ReactMarkdown>
      </article>

      <form action={signWaiver} className="mt-6 space-y-4">
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
        <label className="flex items-start gap-2 text-sm text-stone-700">
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
        {params.error && <p className="text-sm text-red-600">{params.error}</p>}
        <button type="submit" className="btn-primary">
          Sign waiver
        </button>
      </form>
    </div>
  );
}
