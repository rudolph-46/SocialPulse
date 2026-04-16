import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v, Infer } from "convex/values";

export const CURRENCIES = {
  USD: "usd",
  EUR: "eur",
} as const;
export const currencyValidator = v.union(
  v.literal(CURRENCIES.USD),
  v.literal(CURRENCIES.EUR),
);
export type Currency = Infer<typeof currencyValidator>;

export const INTERVALS = {
  MONTH: "month",
  YEAR: "year",
} as const;
export const intervalValidator = v.union(
  v.literal(INTERVALS.MONTH),
  v.literal(INTERVALS.YEAR),
);
export type Interval = Infer<typeof intervalValidator>;

export const PLANS = {
  FREE: "free",
  PRO: "pro",
} as const;
export const planKeyValidator = v.union(
  v.literal(PLANS.FREE),
  v.literal(PLANS.PRO),
);
export type PlanKey = Infer<typeof planKeyValidator>;

export const ONBOARDING_STEPS = {
  CONNECT_NETWORK: "connect_network",
  BUSINESS_INFO: "business_info",
  EDITORIAL_PROFILE: "editorial_profile",
  CADENCE: "cadence",
  PHOTOS: "photos",
  PAYMENT: "payment",
  GENERATING: "generating",
  COMPLETE: "complete",
} as const;
export const onboardingStepValidator = v.union(
  v.literal(ONBOARDING_STEPS.CONNECT_NETWORK),
  v.literal(ONBOARDING_STEPS.BUSINESS_INFO),
  v.literal(ONBOARDING_STEPS.EDITORIAL_PROFILE),
  v.literal(ONBOARDING_STEPS.CADENCE),
  v.literal(ONBOARDING_STEPS.PHOTOS),
  v.literal(ONBOARDING_STEPS.PAYMENT),
  v.literal(ONBOARDING_STEPS.GENERATING),
  v.literal(ONBOARDING_STEPS.COMPLETE),
);
export type OnboardingStep = Infer<typeof onboardingStepValidator>;

export const NETWORKS = {
  FACEBOOK: "facebook",
  INSTAGRAM: "instagram",
  LINKEDIN: "linkedin",
} as const;
export const networkValidator = v.union(
  v.literal(NETWORKS.FACEBOOK),
  v.literal(NETWORKS.INSTAGRAM),
  v.literal(NETWORKS.LINKEDIN),
);
export type Network = Infer<typeof networkValidator>;

export const TARGET_AUDIENCES = {
  B2C: "b2c",
  B2B: "b2b",
  BOTH: "both",
} as const;
export const targetAudienceValidator = v.union(
  v.literal(TARGET_AUDIENCES.B2C),
  v.literal(TARGET_AUDIENCES.B2B),
  v.literal(TARGET_AUDIENCES.BOTH),
);
export type TargetAudience = Infer<typeof targetAudienceValidator>;

export const BRAND_TONES = {
  PROFESSIONAL: "professional",
  WARM: "warm",
  FUN: "fun",
  INSPIRING: "inspiring",
} as const;
export const brandToneValidator = v.union(
  v.literal(BRAND_TONES.PROFESSIONAL),
  v.literal(BRAND_TONES.WARM),
  v.literal(BRAND_TONES.FUN),
  v.literal(BRAND_TONES.INSPIRING),
);
export type BrandTone = Infer<typeof brandToneValidator>;

export const CONTENT_LANGUAGES = {
  FR: "fr",
  EN: "en",
  BOTH: "both",
} as const;
export const contentLanguageValidator = v.union(
  v.literal(CONTENT_LANGUAGES.FR),
  v.literal(CONTENT_LANGUAGES.EN),
  v.literal(CONTENT_LANGUAGES.BOTH),
);
export type ContentLanguage = Infer<typeof contentLanguageValidator>;

export const PAYMENT_METHODS = {
  MOBILE_MONEY: "mobile_money",
  CARD: "card",
} as const;
export const paymentMethodValidator = v.union(
  v.literal(PAYMENT_METHODS.MOBILE_MONEY),
  v.literal(PAYMENT_METHODS.CARD),
);
export type PaymentMethod = Infer<typeof paymentMethodValidator>;

export const facebookPageValidator = v.object({
  id: v.string(),
  name: v.string(),
  picture: v.optional(v.string()),
  account_id: v.optional(v.string()),
});
export type FacebookPage = Infer<typeof facebookPageValidator>;

export const CREDIT_TRANSACTION_TYPES = {
  PURCHASE: "purchase",
  CONSUMPTION: "consumption",
  REFUND: "refund",
  BONUS: "bonus",
} as const;
export const creditTransactionTypeValidator = v.union(
  v.literal(CREDIT_TRANSACTION_TYPES.PURCHASE),
  v.literal(CREDIT_TRANSACTION_TYPES.CONSUMPTION),
  v.literal(CREDIT_TRANSACTION_TYPES.REFUND),
  v.literal(CREDIT_TRANSACTION_TYPES.BONUS),
);

export const CREDIT_PAYMENT_METHODS = {
  STRIPE: "stripe",
  ORANGE_MONEY: "orange_money",
  MTN_MOMO: "mtn_momo",
} as const;
export const creditPaymentMethodValidator = v.union(
  v.literal(CREDIT_PAYMENT_METHODS.STRIPE),
  v.literal(CREDIT_PAYMENT_METHODS.ORANGE_MONEY),
  v.literal(CREDIT_PAYMENT_METHODS.MTN_MOMO),
);

export const CREDIT_TRANSACTION_STATUSES = {
  COMPLETED: "completed",
  PENDING: "pending",
  FAILED: "failed",
} as const;
export const creditTransactionStatusValidator = v.union(
  v.literal(CREDIT_TRANSACTION_STATUSES.COMPLETED),
  v.literal(CREDIT_TRANSACTION_STATUSES.PENDING),
  v.literal(CREDIT_TRANSACTION_STATUSES.FAILED),
);

const priceValidator = v.object({
  stripeId: v.string(),
  amount: v.number(),
});
const pricesValidator = v.object({
  [CURRENCIES.USD]: priceValidator,
  [CURRENCIES.EUR]: priceValidator,
});

const schema = defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    username: v.optional(v.string()),
    imageId: v.optional(v.id("_storage")),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    googleId: v.optional(v.string()),
    creditsBalance: v.optional(v.number()),
    timezone: v.optional(v.string()),
    locale: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    lastLoginAt: v.optional(v.number()),
    onboardingStep: v.optional(onboardingStepValidator),
    onboardingCompletedAt: v.optional(v.number()),
    connectedPlatforms: v.optional(v.array(networkValidator)),
    uploadPostUsername: v.optional(v.string()),
    facebookPages: v.optional(v.array(facebookPageValidator)),
    selectedFacebookPageId: v.optional(v.string()),
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
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    customerId: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("by_google_id", ["googleId"])
    .index("customerId", ["customerId"]),
  plans: defineTable({
    key: planKeyValidator,
    stripeId: v.string(),
    name: v.string(),
    description: v.string(),
    prices: v.object({
      [INTERVALS.MONTH]: pricesValidator,
      [INTERVALS.YEAR]: pricesValidator,
    }),
  })
    .index("key", ["key"])
    .index("stripeId", ["stripeId"]),
  subscriptions: defineTable({
    userId: v.id("users"),
    planId: v.id("plans"),
    priceStripeId: v.string(),
    stripeId: v.string(),
    currency: currencyValidator,
    interval: intervalValidator,
    status: v.string(),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
  })
    .index("userId", ["userId"])
    .index("stripeId", ["stripeId"]),
  credit_transactions: defineTable({
    userId: v.id("users"),
    type: creditTransactionTypeValidator,
    amount: v.number(),
    balanceAfter: v.number(),
    description: v.string(),
    relatedPostId: v.optional(v.string()),
    paymentMethod: v.optional(creditPaymentMethodValidator),
    paymentReference: v.optional(v.string()),
    status: creditTransactionStatusValidator,
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_date", ["userId", "createdAt"]),
});

export default schema;
