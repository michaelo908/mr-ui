import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const publicRoutes = [
    "/",
    "/founder",
    "/check",
    "/jump-in",
    "/quick-tester",
    "/api/jump-in",
    // A document is read transiently before Jump In asks the visitor to sign in.
    // The route only returns extracted text; it cannot run an analysis or retain a file.
    "/api/documents",
    "/api/acquisition",
    "/api/signals",
    "/api/sources/url",
  ];

  const isPublicRoute = publicRoutes.some((route) =>
    route === "/" ? pathname === "/" : pathname === route || pathname.startsWith(`${route}/`)
  );

  if (isPublicRoute) {
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
