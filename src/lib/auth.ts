import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const secure = process.env.NODE_ENV === "production";

export const authOptions: NextAuthOptions = {
  cookies: {
    sessionToken: { name: `${secure ? "__Secure-" : ""}victory.session-token`, options: { httpOnly: true, sameSite: "lax", path: "/", secure } },
    callbackUrl: { name: `${secure ? "__Secure-" : ""}victory.callback-url`, options: { httpOnly: true, sameSite: "lax", path: "/", secure } },
    csrfToken: { name: `${secure ? "__Host-" : ""}victory.csrf-token`, options: { httpOnly: true, sameSite: "lax", path: "/", secure } },
    pkceCodeVerifier: { name: `${secure ? "__Secure-" : ""}victory.pkce.code_verifier`, options: { httpOnly: true, sameSite: "lax", path: "/", secure } },
    state: { name: `${secure ? "__Secure-" : ""}victory.state`, options: { httpOnly: true, sameSite: "lax", path: "/", secure } },
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
