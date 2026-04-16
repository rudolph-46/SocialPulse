import { action, internalMutation, query } from "@cvx/_generated/server";
import { api } from "@cvx/_generated/api";
import { auth } from "@cvx/auth";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { SITE_URL, STRIPE_SECRET_KEY } from "@cvx/env";
import { ERRORS } from "~/errors";
import Stripe from "stripe";

const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
  typescript: true,
});

export const CREDIT_PACKS = [
  {
    id: "discovery",
    name: "Découverte",
    credits: 20,
    priceEUR: 1500,
    priceFCFA: 10000,
    description: "3 posts/sem, 1 réseau",
  },
  {
    id: "essential",
    name: "Essentiel",
    credits: 50,
    priceEUR: 3800,
    priceFCFA: 25000,
    description: "5 posts/sem, 2 réseaux",
  },
  {
    id: "performance",
    name: "Performance",
    credits: 120,
    priceEUR: 7600,
    priceFCFA: 50000,
    popular: true,
    description: "7 posts/sem, 3 réseaux + IA images",
  },
  {
    id: "premium",
    name: "Premium",
    credits: 300,
    priceEUR: 15200,
    priceFCFA: 100000,
    description: "14 posts/sem, tous réseaux + IA illimitée",
  },
] as const;

export const getCreditPacks = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    return CREDIT_PACKS;
  },
});

export const getCreditBalance = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    return { balance: user?.creditsBalance ?? 0 };
  },
});

export const createCreditsCheckout = action({
  args: {
    packId: v.string(),
  },
  handler: async (ctx, args): Promise<string | undefined> => {
    const user = await ctx.runQuery(api.app.getCurrentUser);
    if (!user || !user.customerId) {
      throw new Error(ERRORS.STRIPE_SOMETHING_WENT_WRONG);
    }

    const pack = CREDIT_PACKS.find((p) => p.id === args.packId);
    if (!pack) {
      throw new Error(ERRORS.CREDITS_PACK_NOT_FOUND);
    }

    const checkout = await stripe.checkout.sessions.create({
      customer: user.customerId,
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: pack.priceEUR,
            product_data: {
              name: `SocialPulse — ${pack.name}`,
              description: `${pack.credits} crédits de publication`,
            },
          },
          quantity: 1,
        },
      ],
      payment_method_types: ["card"],
      metadata: {
        type: "credit_pack",
        userId: user._id,
        packId: pack.id,
        credits: String(pack.credits),
      },
      success_url: `${SITE_URL}/dashboard/credits?checkout=success`,
      cancel_url: `${SITE_URL}/dashboard/credits`,
    });

    return checkout.url || undefined;
  },
});

export const PREAUTH_creditUser = internalMutation({
  args: {
    userId: v.id("users"),
    credits: v.number(),
    packId: v.string(),
    paymentReference: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error(ERRORS.SOMETHING_WENT_WRONG);

    const newBalance = (user.creditsBalance ?? 0) + args.credits;
    await ctx.db.patch(args.userId, { creditsBalance: newBalance });

    const pack = CREDIT_PACKS.find((p) => p.id === args.packId);
    await ctx.db.insert("credit_transactions", {
      userId: args.userId,
      type: "purchase",
      amount: args.credits,
      balanceAfter: newBalance,
      description: `Pack ${pack?.name ?? args.packId} (${args.credits} crédits)`,
      paymentMethod: "stripe",
      paymentReference: args.paymentReference,
      status: "completed",
      createdAt: Date.now(),
    });
  },
});

export const debitCredits = internalMutation({
  args: {
    userId: v.id("users"),
    credits: v.number(),
    description: v.string(),
    relatedPostId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error(ERRORS.SOMETHING_WENT_WRONG);

    const currentBalance = user.creditsBalance ?? 0;
    if (currentBalance < args.credits) {
      throw new Error(ERRORS.CREDITS_INSUFFICIENT);
    }

    const newBalance = currentBalance - args.credits;
    await ctx.db.patch(args.userId, { creditsBalance: newBalance });

    await ctx.db.insert("credit_transactions", {
      userId: args.userId,
      type: "consumption",
      amount: -args.credits,
      balanceAfter: newBalance,
      description: args.description,
      relatedPostId: args.relatedPostId,
      status: "completed",
      createdAt: Date.now(),
    });

    return { newBalance };
  },
});

export const getTransactionHistory = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    return ctx.db
      .query("credit_transactions")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
