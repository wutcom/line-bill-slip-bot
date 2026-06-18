import GoogleSignInButton from '../../components/GoogleSignInButton';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sign in | MindLife'
};

interface LoginPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackUrl = getSafeCallbackUrl(params?.callbackUrl);
  const error = params?.error;

  return (
    <main className="login-page">
      <section className="login-panel">
        <p className="eyebrow">Personal Balance Dashboard</p>
        <h1>MindLife</h1>
        <p className="login-copy">Sign in with an approved Google account to view spending, budget plans, and sync health.</p>

        {error ? (
          <div className="notice login-error">
            <strong>Cannot sign in</strong>
            <p>{getErrorMessage(error)}</p>
          </div>
        ) : null}

        <GoogleSignInButton callbackUrl={callbackUrl} />
      </section>
    </main>
  );
}

function getSafeCallbackUrl(value: unknown): string {
  if (!value || typeof value !== 'string') return '/';
  if (value.startsWith('/')) return value;

  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch {
    return '/';
  }
}

function getErrorMessage(error: unknown): string {
  if (error === 'AccessDenied') {
    return 'This Google account is not in ALLOWED_EMAILS.';
  }

  return 'Please try again or check the Google OAuth configuration.';
}

