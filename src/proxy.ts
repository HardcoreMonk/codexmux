import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE } from '@/lib/auth';
import { verifyTokenValue } from '@/lib/agent-token';

export const proxy = async (request: NextRequest) => {
  const agentToken = request.headers.get('x-agent-token');
  if (agentToken && verifyTokenValue(agentToken)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
};

export const config = {
  matcher: [
    '/((?!login|api/auth|api/agent-rpc/|api/status/hook|_next|favicon\\.ico|fonts|.*\\.(?:svg|png|ico|jpg|jpeg|webp|webmanifest|ttf|woff|woff2)).*)',
  ],
};
