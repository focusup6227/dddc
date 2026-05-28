import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { userId } = await requireUser();
  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!body.endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }
  const svc = createServiceClient();
  await svc
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", body.endpoint);
  return NextResponse.json({ ok: true });
}
