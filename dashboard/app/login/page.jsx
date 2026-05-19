import GoogleSignInButton from '../../components/GoogleSignInButton';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sign in | Expense Dashboard'
};

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const callbackUrl = getSafeCallbackUrl(params?.callbackUrl);
  const error = params?.error;

  return (
    <main className="login-page">
      <section className="login-panel">
        <p className="eyebrow">LINE Bill Slip Bot</p>
        <h1>Expense Dashboard</h1>
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

function getSafeCallbackUrl(value) {
  if (!value || typeof value !== 'string') return '/';
  if (value.startsWith('/')) return value;

  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch {
    return '/';
  }
}

function getErrorMessage(error) {
  if (error === 'AccessDenied') {
    return 'This Google account is not in ALLOWED_EMAILS.';
  }

  return 'Please try again or check the Google OAuth configuration.';
}
