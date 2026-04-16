import { convexAuth } from "@convex-dev/auth/server";
import Google from "@auth/core/providers/google";
import { ONBOARDING_STEPS } from "./schema";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    Google({
      authorization: {
        params: { scope: "openid email profile" },
      },
    }),
  ],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, profile, provider }) {
      if (provider.id !== "google") {
        return;
      }

      const existingUser = await ctx.db.get(userId);
      if (!existingUser) {
        throw new Error("User not found after Google sign-in");
      }

      const now = Date.now();
      await ctx.db.patch(userId, {
        name:
          typeof profile.name === "string"
            ? profile.name
            : existingUser.name,
        email:
          typeof profile.email === "string"
            ? profile.email
            : existingUser.email,
        image:
          typeof profile.picture === "string"
            ? profile.picture
            : existingUser.image,
        googleId:
          typeof profile.sub === "string"
            ? profile.sub
            : existingUser.googleId,
        locale:
          typeof profile.locale === "string"
            ? profile.locale
            : existingUser.locale,
        creditsBalance: existingUser.creditsBalance ?? 0,
        createdAt: existingUser.createdAt ?? now,
        lastLoginAt: now,
        onboardingStep:
          existingUser.onboardingStep ?? ONBOARDING_STEPS.CONNECT_NETWORK,
      });
    },
  },
});
