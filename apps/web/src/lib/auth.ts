import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getServerSession as nextAuthGetServerSession } from "next-auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          console.error("[NextAuth] Missing credentials");
          return null;
        }

        const url = `${API_URL}/auth/login`;
        console.log("[NextAuth] Attempting login at:", url);

        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          console.log("[NextAuth] API response status:", res.status);

          if (!res.ok) {
            const errorText = await res.text();
            console.error("[NextAuth] API error:", errorText);
            return null;
          }

          const data = await res.json();
          console.log("[NextAuth] API response keys:", Object.keys(data));

          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            parishId: data.user.parishId,
            accessToken: data.accessToken,
          };
        } catch (error) {
          console.error("[NextAuth] Fetch error:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = (user as any).accessToken;
        token.role = (user as any).role;
        token.parishId = (user as any).parishId;
      }
      return token;
    },
    async session({ session, token }) {
      return {
        ...session,
        accessToken: token.accessToken as string,
        user: {
          ...session.user,
          role: token.role as string,
          parishId: token.parishId as string,
        },
      };
    },
  },
  pages: {
    signIn: "/admin/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export function getServerSession() {
  return nextAuthGetServerSession(authOptions);
}
