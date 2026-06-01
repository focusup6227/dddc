import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendStaffPush } from "@/lib/push.server";

// Pushes staff a reminder about chores still outstanding for today (feeding,
// meds, walks, etc.). Run a couple of times a day via Vercel Cron.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const tz = process.env.DAYCARE_TIMEZONE ?? "America/Chicago";
  const today = todayISOInTZ(tz);

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("chores")
    .select("kind")
    .eq("due_date", today)
    .is("completed_at", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as { kind: string }[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, date: today, outstanding: 0 });
  }

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  const label: Record<string, string> = {
    feeding: "feeding",
    medication: "meds",
    walk: "walks",
    sanitize: "sanitize",
    manual: "tasks",
  };
  const summary = Array.from(counts.entries())
    .map(([k, n]) => `${n} ${label[k] ?? k}`)
    .join(", ");

  await sendStaffPush({
    title: "Chores still to do",
    body: `${rows.length} left today — ${summary}`,
    data: { type: "chores", date: today },
  });

  return NextResponse.json({ ok: true, date: today, outstanding: rows.length });
}

function todayISOInTZ(timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // "YYYY-MM-DD"
}
