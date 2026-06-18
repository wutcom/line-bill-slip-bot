import { AuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID || '',
      clientSecret: process.env.AUTH_GOOGLE_SECRET || ''
    })
  ],
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: 'jwt'
  },
  pages: {
    signIn: '/login',
    error: '/login'
  },
  callbacks: {
    async signIn({ profile, user }) {
      const email = String(profile?.email || user?.email || '').toLowerCase();
      const allowedEmails = getAllowedEmails();

      if (!email) {
        return false;
      }

      if (allowedEmails.length === 0) {
        return true;
      }

      return allowedEmails.includes(email);
    },
    async jwt({ token, profile }) {
      if (profile?.email) {
        token.email = String(profile.email).toLowerCase();
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token?.email) {
        session.user.email = token.email;
      }

      return session;
    }
  }
};

function getAllowedEmails(): string[] {
  return String(process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

