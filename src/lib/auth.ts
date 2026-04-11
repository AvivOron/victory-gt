import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  cookies: {
    sessionToken: { name: "__Secure-victory.session-token", options: { httpOnly: true, sameSite: "lax", path: "/", secure: true } },
    callbackUrl: { name: "__Secure-victory.callback-url", options: { httpOnly: true, sameSite: "lax", path: "/", secure: true } },
    csrfToken: { name: "__Host-victory.csrf-token", options: { httpOnly: true, sameSite: "lax", path: "/", secure: true } },
    pkceCodeVerifier: { name: "__Secure-victory.pkce.code_verifier", options: { httpOnly: true, sameSite: "lax", path: "/", secure: true } },
    state: { name: "__Secure-victory.state", options: { httpOnly: true, sameSite: "lax", path: "/", secure: true } },
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/prices",
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider === "google") {
        token.sub = account.providerAccountId;
      }
      if (profile?.email && !token.email) {
        token.email = profile.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email;
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
};
