import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendBookingReminder } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when the env var
  // is set. We require it in any non-development environment.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const tz = process.env.DAYCARE_TIMEZONE ?? "America/Los_Angeles";
  const tomorrow = tomorrowISOInTZ(tz);

  const svc = createServiceClient();
  const { data: bookings, error } = await svc
    .from("bookings")
    .select("id, customer_id, dog_id, service_date, status")
    .eq("service_date", tomorrow)
    .in("status", ["reserved", "checked_in"])
    .eq("payment_status", "paid");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ ok: true, date: tomorrow, sent: 0 });
  }

  const customerIds = Array.from(new Set(bookings.map((b) => b.customer_id)));
  const dogIds = Array.from(new Set(bookings.map((b) => b.dog_id)));

  const [{ data: profiles }, { data: dogs }] = await Promise.all([
    svc.from("profiles").select("id, email, full_name").in("id", customerIds),
    svc.from("dogs").select("id, name").in("id", dogIds),
  ]);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const dogById = new Map((dogs ?? []).map((d) => [d.id, d.name]));

  // Group dogs per customer so each customer gets one combined email.
  const dogsByCustomer = new Map<string, string[]>();
  for (const b of bookings) {
    const name = dogById.get(b.dog_id);
    if (!name) continue;
    const arr = dogsByCustomer.get(b.customer_id) ?? [];
    arr.push(name);
    dogsByCustomer.set(b.customer_id, arr);
  }

  let sent = 0;
  for (const [customerId, dogNames] of dogsByCustomer) {
    const profile = profileById.get(customerId);
    if (!profile?.email) continue;
    await sendBookingReminder({
      to: profile.email,
      customerName: profile.full_name ?? profile.email,
      dogNames: Array.from(new Set(dogNames)),
      serviceDate: tomorrow,
    });
    sent++;
  }

  return NextResponse.json({ ok: true, date: tomorrow, sent });
}

function tomorrowISOInTZ(timeZone: string): string {
  // Format "today" in the given timezone, then add a day in UTC and re-format,
  // which gives us tomorrow's local date regardless of where the server runs.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayLocal = fmt.format(new Date()); // "YYYY-MM-DD"
  const [y, m, d] = todayLocal.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));
  const yy = tomorrow.getUTCFullYear();
  const mm = String(tomorrow.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(tomorrow.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
