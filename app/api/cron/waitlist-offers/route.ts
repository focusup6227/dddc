import { NextResponse, type NextRequest } from "next/server";
import { expireStaleOffers, processWaitlist } from "@/lib/waitlist.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Keep the waitlist moving: expire offers whose claim window lapsed unpaid
 * (freeing their held spot and rolling to the next person), then re-sweep both
 * pools as a safety net in case a freed spot was missed at cancel time or
 * capacity changed via settings.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const expired = await expireStaleOffers();
  const sweptDaycare = await processWaitlist("daycare");
  const sweptBoarding = await processWaitlist("boarding");

  return NextResponse.json({
    ok: true,
    expired: expired.expired,
    rolledFromExpiry: expired.rolled,
    sweptDaycare,
    sweptBoarding,
  });
}
