import { NextResponse, type NextRequest } from "next/server";
import { getApiProfile, isFullStaffProfile } from "@/lib/api-auth";
import { getStripe } from "@/lib/stripe";

// Mints a short-lived Stripe Terminal connection token for the Tap to Pay app.
// Staff-only; accepts the cookie session or a Supabase bearer token.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getApiProfile(req);
  if (!session || !isFullStaffProfile(session.profile)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stripe = getStripe();
    const token = await stripe.terminal.connectionTokens.create();
    return NextResponse.json({ secret: token.secret });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
