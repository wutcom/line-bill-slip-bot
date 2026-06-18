'use client';

import { signIn } from 'next-auth/react';

export default function GoogleSignInButton({ callbackUrl = '/' }) {
  return (
    <button
      className="google-button"
      type="button"
      onClick={() => signIn('google', { callbackUrl })}
    >
      Continue with Google
    </button>
  );
}
