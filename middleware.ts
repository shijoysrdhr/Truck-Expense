import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "./lib/auth";

export async function middleware(req: NextRequest) {
  if (req.cookies.get("auth")?.value === (await sessionToken())) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) return new NextResponse("unauthorized", { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = { matcher: ["/((?!_next|favicon.ico|login|api/webhook).*)"] };
