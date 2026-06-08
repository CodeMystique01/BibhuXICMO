import { NextResponse } from "next/server";
import { checkDbConnection } from "@/backend/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await checkDbConnection();
  const body = {
    ok: db.ok,
    service: "xicmo",
    db: db.ok ? "connected" : "error",
    ts: new Date().toISOString(),
    ...(db.ok ? {} : { dbError: db.error.slice(0, 240) }),
  };
  return NextResponse.json(body, { status: db.ok ? 200 : 503 });
}
