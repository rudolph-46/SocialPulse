import { api, internal } from "@cvx/_generated/api";
import {
  action,
  internalMutation,
  mutation,
  query,
} from "@cvx/_generated/server";
import { auth } from "@cvx/auth";
import {
  brandToneValidator,
  contentLanguageValidator,
  currencyValidator,
  facebookPageValidator,
  networkValidator,
  NETWORKS,
  onboardingStepValidator,
  ONBOARDING_STEPS,
  paymentMethodValidator,
  PLANS,
  targetAudienceValidator,
} from "@cvx/schema";
import { SITE_URL, UPLOAD_POST_API_KEY } from "@cvx/env";
import * as uploadPost from "@cvx/lib/uploadPost";
import { asyncMap } from "convex-helpers";
import { v } from "convex/values";
import { User } from "~/types";

export const getCurrentUser = query({
  args: {},
  handler: async (ctx): Promise<User | undefined> => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return;
    }
    const [user, subscription] = await Promise.all([
      ctx.db.get(userId),
      ctx.db
        .query("subscriptions")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .unique(),
    ]);
    if (!user) {
      return;
    }
    const plan = subscription?.planId
      ? await ctx.db.get(subscription.planId)
      : undefined;
    const avatarUrl = user.imageId
      ? await ctx.storage.getUrl(user.imageId)
      : user.image;
    return {
      ...user,
      avatarUrl: avatarUrl || undefined,
      subscription:
        subscription && plan
          ? {
              ...subscription,
              planKey: plan.key,
            }
          : undefined,
    };
  },
});

export const updateUsername = mutation({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return;
    }
    await ctx.db.patch(userId, { username: args.username });
  },
});

export const completeOnboarding = mutation({
  args: {
    username: v.string(),
    currency: currencyValidator,
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return;
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return;
    }
    await ctx.db.patch(userId, { username: args.username });
    if (user.customerId) {
      return;
    }
    await ctx.scheduler.runAfter(
      0,
      internal.stripe.PREAUTH_createStripeCustomer,
      {
        currency: args.currency,
        userId,
      },
    );
  },
});

export const saveOnboardingProgress = mutation({
  args: {
    step: v.optional(onboardingStepValidator),
    connectedPlatforms: v.optional(v.array(networkValidator)),
    businessCategory: v.optional(v.string()),
    targetAudience: v.optional(targetAudienceValidator),
    brandTone: v.optional(brandToneValidator),
    differentiator: v.optional(v.string()),
    contentLanguage: v.optional(contentLanguageValidator),
    editorialSummary: v.optional(v.string()),
    editorialThemes: v.optional(v.array(v.string())),
    recommendedSchedule: v.optional(v.array(v.string())),
    samplePosts: v.optional(v.array(v.string())),
    selectedCadence: v.optional(v.number()),
    selectedPlatforms: v.optional(v.array(networkValidator)),
    selectedDurationWeeks: v.optional(v.number()),
    uploadedPhotoCount: v.optional(v.number()),
    paymentMethod: v.optional(paymentMethodValidator),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User not found");
    }
    const patch: Record<string, unknown> = {};
    if (args.step !== undefined) patch.onboardingStep = args.step;
    if (args.connectedPlatforms !== undefined) {
      patch.connectedPlatforms = args.connectedPlatforms;
    }
    if (args.businessCategory !== undefined) {
      patch.businessCategory = args.businessCategory;
    }
    if (args.targetAudience !== undefined) {
      patch.targetAudience = args.targetAudience;
    }
    if (args.brandTone !== undefined) {
      patch.brandTone = args.brandTone;
    }
    if (args.differentiator !== undefined) {
      patch.differentiator = args.differentiator;
    }
    if (args.contentLanguage !== undefined) {
      patch.contentLanguage = args.contentLanguage;
    }
    if (args.editorialSummary !== undefined) {
      patch.editorialSummary = args.editorialSummary;
    }
    if (args.editorialThemes !== undefined) {
      patch.editorialThemes = args.editorialThemes;
    }
    if (args.recommendedSchedule !== undefined) {
      patch.recommendedSchedule = args.recommendedSchedule;
    }
    if (args.samplePosts !== undefined) {
      patch.samplePosts = args.samplePosts;
    }
    if (args.selectedCadence !== undefined) {
      patch.selectedCadence = args.selectedCadence;
    }
    if (args.selectedPlatforms !== undefined) {
      patch.selectedPlatforms = args.selectedPlatforms;
    }
    if (args.selectedDurationWeeks !== undefined) {
      patch.selectedDurationWeeks = args.selectedDurationWeeks;
    }
    if (args.uploadedPhotoCount !== undefined) {
      patch.uploadedPhotoCount = args.uploadedPhotoCount;
    }
    if (args.paymentMethod !== undefined) {
      patch.paymentMethod = args.paymentMethod;
    }
    await ctx.db.patch(userId, patch);
  },
});

export const finishOnboarding = mutation({
  args: {
    currency: currencyValidator,
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User not found");
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }
    await ctx.db.patch(userId, {
      onboardingStep: "complete",
      onboardingCompletedAt: Date.now(),
    });
    if (!user.customerId) {
      await ctx.scheduler.runAfter(
        0,
        internal.stripe.PREAUTH_createStripeCustomer,
        {
          currency: args.currency,
          userId,
        },
      );
    }
  },
});

export const saveUploadPostUsername = internalMutation({
  args: {
    userId: v.id("users"),
    uploadPostUsername: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      uploadPostUsername: args.uploadPostUsername,
    });
  },
});

export const storeFacebookPages = internalMutation({
  args: {
    userId: v.id("users"),
    uploadPostUsername: v.string(),
    facebookPages: v.array(facebookPageValidator),
  },
  handler: async (ctx, args) => {
    const selectedFacebookPageId =
      args.facebookPages.length === 1 ? args.facebookPages[0].id : undefined;
    await ctx.db.patch(args.userId, {
      uploadPostUsername: args.uploadPostUsername,
      facebookPages: args.facebookPages,
      selectedFacebookPageId,
      connectedPlatforms:
        args.facebookPages.length > 0 ? [NETWORKS.FACEBOOK] : undefined,
      onboardingStep:
        args.facebookPages.length > 0
          ? ONBOARDING_STEPS.BUSINESS_INFO
          : ONBOARDING_STEPS.CONNECT_NETWORK,
    });
  },
});

export const selectFacebookPage = mutation({
  args: {
    facebookPageId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User not found");
    }
    const user = await ctx.db.get(userId);
    if (!user?.facebookPages?.some((page) => page.id === args.facebookPageId)) {
      throw new Error("Facebook page not found");
    }
    await ctx.db.patch(userId, {
      selectedFacebookPageId: args.facebookPageId,
      connectedPlatforms: [NETWORKS.FACEBOOK],
      onboardingStep: ONBOARDING_STEPS.BUSINESS_INFO,
    });
  },
});

export const createFacebookConnection = action({
  args: {},
  handler: async (ctx): Promise<{ accessUrl: string; username: string }> => {
    const user = await ctx.runQuery(api.app.getCurrentUser);
    if (!user) {
      throw new Error("User not found");
    }
    if (!UPLOAD_POST_API_KEY) {
      throw new Error(
        "Upload-Post is not configured. Set UPLOAD_POST_API_KEY in Convex env.",
      );
    }
    if (!SITE_URL) {
      throw new Error("SITE_URL is not configured in Convex env.");
    }
    const username: string = user.uploadPostUsername ?? `sp-${user._id}`;
    try {
      await uploadPost.createProfile(username);
    } catch (error) {
      if (
        !(error instanceof uploadPost.UploadPostError) ||
        error.status !== 409
      ) {
        try {
          await uploadPost.getProfile(username);
        } catch {
          throw error;
        }
      }
    }
    await ctx.runMutation(internal.app.saveUploadPostUsername, {
      userId: user._id,
      uploadPostUsername: username,
    });

    const { access_url } = await uploadPost.generateJwt({
      username,
      redirectUrl: `${SITE_URL}/onboarding?uploadPost=facebook_connected`,
      platforms: ["facebook", "instagram"],
      connectTitle: "Connecter votre page",
      connectDescription:
        "Autorisez SocialPulse a analyser et publier sur votre page",
    });
    return {
      accessUrl: access_url,
      username,
    };
  },
});

export const syncFacebookPages = action({
  args: {},
  handler: async (ctx): Promise<{ pages: uploadPost.FacebookPage[] }> => {
    const user = await ctx.runQuery(api.app.getCurrentUser);
    if (!user) {
      throw new Error("User not found");
    }
    const username = user.uploadPostUsername ?? `sp-${user._id}`;

    let facebookPages: uploadPost.FacebookPage[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        facebookPages = await uploadPost.getFacebookPages(username);
      } catch {
        facebookPages = [];
      }
      if (facebookPages.length > 0) break;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    await ctx.runMutation(internal.app.storeFacebookPages, {
      userId: user._id,
      uploadPostUsername: username,
      facebookPages,
    });
    return {
      pages: facebookPages,
    };
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User not found");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const updateUserImage = mutation({
  args: {
    imageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return;
    }
    ctx.db.patch(userId, { imageId: args.imageId });
  },
});

export const removeUserImage = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return;
    }
    ctx.db.patch(userId, { imageId: undefined, image: undefined });
  },
});

export const getActivePlans = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return;
    }
    const [free, pro] = await asyncMap(
      [PLANS.FREE, PLANS.PRO] as const,
      (key) =>
        ctx.db
          .query("plans")
          .withIndex("key", (q) => q.eq("key", key))
          .unique(),
    );
    if (!free || !pro) {
      throw new Error("Plan not found");
    }
    return { free, pro };
  },
});

export const deleteCurrentUserAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return;
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .unique();
    if (!subscription) {
      console.error("No subscription found");
    } else {
      await ctx.db.delete(subscription._id);
      await ctx.scheduler.runAfter(
        0,
        internal.stripe.cancelCurrentUserSubscriptions,
      );
    }
    await ctx.db.delete(userId);
    const authAccounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    await asyncMap(authAccounts, async (authAccount) => {
      await ctx.db.delete(authAccount._id);
    });
  },
});
