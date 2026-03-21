import { NextRequest, NextResponse } from 'next/server';

export const proxy = (request: NextRequest) => {
  const token = request.cookies.get('auth-token')?.value;

  if (token !== process.env.AUTH_TOKEN) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
};

export const config = {
  matcher: [
    '/((?!login|api/auth|_next|favicon\\.ico|fonts|.*\\.(?:svg|png|ico|jpg|jpeg|webp|ttf|woff|woff2)).*)',
  ],
};
