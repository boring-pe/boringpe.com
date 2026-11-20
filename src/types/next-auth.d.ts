import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    userId: string;
    epoch: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    epoch?: number;
  }
}
