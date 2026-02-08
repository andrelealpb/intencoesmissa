import "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken: string;
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      parishId: string;
    };
  }

  interface User {
    id: string;
    email: string;
    name?: string;
    role: string;
    parishId?: string;
    accessToken: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    role?: string;
    parishId?: string;
  }
}
