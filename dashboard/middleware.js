import { NextResponse } from 'next/server';

export function middleware(request) {
  const username = process.env.DASHBOARD_BASIC_AUTH_USERNAME;
  const password = process.env.DASHBOARD_BASIC_AUTH_PASSWORD;

  if (!username || !password) {
    return NextResponse.next();
  }

  const auth = request.headers.get('authorization') || '';
  const [scheme, encoded] = auth.split(' ');

  if (scheme === 'Basic' && encoded) {
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(':');
    const inputUser = decoded.slice(0, separatorIndex);
    const inputPassword = decoded.slice(separatorIndex + 1);

    if (inputUser === username && inputPassword === password) {
      return NextResponse.next();
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Expense Dashboard"'
    }
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
