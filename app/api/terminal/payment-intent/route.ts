import { NextResponse, type NextRequest } from "next/server";
import { getApiProfile, isFullStaffProfile } from "@/lib/api-auth";
import { createTerminalPaymentForBookings } from "@/lib/terminal.server";

// Creates an in-person (Tap to Pay) PaymentIntent for one customer's unpaid
// bookings, settling coupons/credit exactly like the web kiosk. Staff-only;
// called from the signed-in kiosk WebView, which hands the returned
// clientSecret to the native Terminal SDK to collect the tap.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getApiProfile(req);
  if (!session || !isFullStaffProfile(session.profile)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = (body as { bookingIds?: unknown })?.bookingIds;
  const bookingIds = Array.isArray(raw)
    ? Array.from(new Set(raw.filter((v): v is string => typeof v === "string" && v.length > 0)))
    : [];
  if (bookingIds.length === 0) {
    return NextResponse.json({ error: "bookingIds is required" }, { status: 400 });
  }

  try {
    const result = await createTerminalPaymentForBookings(bookingIds);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create payment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
