import { NextRequest, NextResponse } from 'next/server';

// Auth is handled by AuthContext + Supabase session on the client side.
// Middleware just passes everything through — no cookie checks needed.
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
