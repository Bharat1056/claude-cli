import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { deviceAuthorization } from "better-auth/plugins";
import prisma from "./db.js";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  baseURL: process.env.BASE_URL,
  trustedOrigins: [process.env.CORS_ORIGIN],
  basePath: "/api/auth",
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none", // ← allows cross-site cookies
      secure: true, // ← required when sameSite is "none"
      partitioned: true, // ← CHIPS, helps with Safari/Chrome blocking
    },
  },
  plugins: [
    deviceAuthorization({
      expiresIn: "30m",
      interval: "5s",
    }),
  ],
});
