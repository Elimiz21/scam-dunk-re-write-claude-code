import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    // Protected routes that require authentication
    "/check/:path*",
    "/account/:path*",
    // API routes that require authentication (except auth routes)
    "/api/check/:path*",
    "/api/billing/:path*",
    "/api/user/:path*",
  ],
};
