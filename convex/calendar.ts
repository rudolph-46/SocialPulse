import { internal } from "@cvx/_generated/api";
import type { Doc, Id } from "@cvx/_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "@cvx/_generated/server";
import {
  CALENDAR_STATUSES,
  CHANNEL_STATUSES,
  IMAGE_SOURCES,
  NETWORKS,
  POST_CATEGORIES,
  POST_STATUSES,
  type FacebookPage,
  type Network,
  type PostCategory,
} from "@cvx/schema";
import { auth } from "@cvx/auth";
import { v } from "convex/values";

const CATEGORY_RATIOS: Record<PostCategory, number> = {
  [POST_CATEGORIES.VALUE]: 0.3,
  [POST_CATEGORIES.BEHIND_SCENES]: 0.2,
  [POST_CATEGORIES.PROMO]: 0.2,
  [POST_CATEGORIES.ENGAGEMENT]: 0.15,
  [POST_CATEGORIES.TREND]: 0.15,
};

const DEFAULT_WEEKLY_SLOTS = [
  { weekday: 1, hour: 10, minute: 0 },
  { weekday: 2, hour: 10, minute: 0 },
  { weekday: 3, hour: 15, minute: 0 },
  { weekday: 4, hour: 10, minute: 0 },
  { weekday: 5, hour: 11, minute: 0 },
  { weekday: 6, hour: 11, minute: 0 },
  { weekday: 6, hour: 16, minute: 0 },
  { weekday: 0, hour: 10, minute: 0 },
  { weekday: 0, hour: 16, minute: 0 },
  { weekday: 1, hour: 16, minute: 0 },
  { weekday: 2, hour: 16, minute: 0 },
  { weekday: 3, hour: 10, minute: 0 },
  { weekday: 4, hour: 16, minute: 0 },
  { weekday: 5, hour: 16, minute: 0 },
] as const;

const weekdayMap: Record<string, number> = {
  dimanche: 0,
  sunday: 0,
  lundi: 1,
  monday: 1,
  mardi: 2,
  tuesday: 2,
  mercredi: 3,
  wednesday: 3,
  jeudi: 4,
  thursday: 4,
  vendredi: 5,
  friday: 5,
  samedi: 6,
  saturday: 6,
};

type WeeklySlot = {
  weekday: number;
  hour: number;
  minute: number;
};

type GeneratedPostDraft = {
  platform: Network;
  textFacebook?: string;
  textInstagram?: string;
  textLinkedin?: string;
  hashtags?: string[];
  imageUrl?: string;
  imageAiPrompt?: string;
  imageSource: "real" | "ai" | "pending";
  category: PostCategory;
  scheduledAt: number;
  creditsConsumed: number;
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parsePreferredSlots(recommendedSchedule?: string[]): WeeklySlot[] {
  return (recommendedSchedule ?? [])
    .map((entry) => entry.toLowerCase())
    .map((entry) => {
      const weekday = Object.entries(weekdayMap).find(([name]) =>
        entry.includes(name),
      )?.[1];
      const timeMatch = entry.match(/(\d{1,2})h(?:(\d{2}))?|(\d{1,2}):(\d{2})/);
      const hour = timeMatch
        ? parseInt(timeMatch[1] ?? timeMatch[3] ?? "10", 10)
        : 10;
      const minute = timeMatch
        ? parseInt(timeMatch[2] ?? timeMatch[4] ?? "0", 10)
        : 0;
      if (weekday === undefined) {
        return null;
      }
      return { weekday, hour, minute };
    })
    .filter((slot): slot is WeeklySlot => slot !== null);
}

function buildWeeklySlots(cadence: number, recommendedSchedule?: string[]) {
  const preferred = parsePreferredSlots(recommendedSchedule);
  const slots: WeeklySlot[] = [];
  for (const slot of preferred) {
    if (!slots.some((candidate) => JSON.stringify(candidate) === JSON.stringify(slot))) {
      slots.push(slot);
    }
  }
  for (const fallback of DEFAULT_WEEKLY_SLOTS) {
    if (slots.length >= cadence) break;
    if (
      !slots.some(
        (candidate) =>
          candidate.weekday === fallback.weekday &&
          candidate.hour === fallback.hour &&
          candidate.minute === fallback.minute,
      )
    ) {
      slots.push({ ...fallback });
    }
  }
  return slots.slice(0, cadence).sort((a, b) => {
    if (a.weekday !== b.weekday) return a.weekday - b.weekday;
    if (a.hour !== b.hour) return a.hour - b.hour;
    return a.minute - b.minute;
  });
}

function createCategoryCounts(total: number) {
  const counts = Object.fromEntries(
    Object.keys(CATEGORY_RATIOS).map((category) => [category, 0]),
  ) as Record<PostCategory, number>;
  const raw = (Object.keys(CATEGORY_RATIOS) as PostCategory[]).map((category) => ({
    category,
    exact: total * CATEGORY_RATIOS[category],
  }));
  let assigned = 0;
  for (const item of raw) {
    counts[item.category] = Math.floor(item.exact);
    assigned += counts[item.category];
  }
  raw
    .sort((a, b) => (b.exact % 1) - (a.exact % 1))
    .slice(0, total - assigned)
    .forEach((item) => {
      counts[item.category] += 1;
    });
  return counts;
}

function buildCategorySequence(total: number) {
  const counts = createCategoryCounts(total);
  const ordered: PostCategory[] = [];
  while (ordered.length < total) {
    const last = ordered[ordered.length - 1];
    const next = (Object.keys(counts) as PostCategory[])
      .filter((category) => counts[category] > 0)
      .sort((a, b) => {
        const aPenalty =
          a === POST_CATEGORIES.PROMO && last === POST_CATEGORIES.PROMO ? -100 : 0;
        const bPenalty =
          b === POST_CATEGORIES.PROMO && last === POST_CATEGORIES.PROMO ? -100 : 0;
        return counts[b] + bPenalty - (counts[a] + aPenalty);
      })[0];
    if (!next) break;
    if (last === POST_CATEGORIES.PROMO && next === POST_CATEGORIES.PROMO) {
      const alternate = (Object.keys(counts) as PostCategory[]).find(
        (category) => category !== POST_CATEGORIES.PROMO && counts[category] > 0,
      );
      if (alternate) {
        ordered.push(alternate);
        counts[alternate] -= 1;
        continue;
      }
    }
    ordered.push(next);
    counts[next] -= 1;
  }
  return ordered;
}

function nextDateForSlot(baseDate: Date, weekOffset: number, slot: WeeklySlot) {
  const start = startOfDay(addDays(baseDate, weekOffset * 7));
  const currentWeekday = start.getDay();
  const delta = (slot.weekday - currentWeekday + 7) % 7;
  const next = addDays(start, delta);
  next.setHours(slot.hour, slot.minute, 0, 0);
  return next.getTime();
}

function buildHashtags(category: PostCategory, businessCategory: string, themes: string[]) {
  const normalized = [businessCategory, ...themes]
    .map((item) =>
      item
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, "")
        .trim(),
    )
    .filter(Boolean)
    .slice(0, 4);
  const categoryTag =
    category === POST_CATEGORIES.BEHIND_SCENES
      ? "coulisses"
      : category === POST_CATEGORIES.ENGAGEMENT
        ? "communaute"
        : category === POST_CATEGORIES.PROMO
          ? "offre"
          : category === POST_CATEGORIES.TREND
            ? "tendance"
            : "conseils";
  return Array.from(new Set([categoryTag, ...normalized])).map((tag) => `#${tag}`);
}

function buildPlatformText(input: {
  platform: Network;
  category: PostCategory;
  businessCategory: string;
  editorialSummary: string;
  differentiator?: string;
  samplePost?: string;
  hashtags: string[];
  index: number;
}) {
  const opener =
    input.category === POST_CATEGORIES.VALUE
      ? "Conseil du jour"
      : input.category === POST_CATEGORIES.BEHIND_SCENES
        ? "Dans les coulisses"
        : input.category === POST_CATEGORIES.PROMO
          ? "Offre a ne pas manquer"
          : input.category === POST_CATEGORIES.ENGAGEMENT
            ? "On veut votre avis"
            : "Tendance du moment";
  const base = `${opener}: ${input.samplePost ?? `mettez en avant votre expertise en ${input.businessCategory.toLowerCase()}`}. ${
    input.differentiator ? `Point fort: ${input.differentiator}. ` : ""
  }${input.editorialSummary}.`;

  if (input.platform === NETWORKS.INSTAGRAM) {
    return `${opener} ✨ ${input.samplePost ?? base} ${
      input.differentiator ? `\n\nPourquoi nous choisir: ${input.differentiator}.` : ""
    }\n\n${input.hashtags.slice(0, 5).join(" ")}`;
  }
  if (input.platform === NETWORKS.LINKEDIN) {
    return `${opener} — ${base} Nous cherchons a creer une presence reguliere et utile pour notre audience professionnelle.`;
  }
  return `${base} ${input.hashtags.slice(0, 3).join(" ")}`;
}

function estimateCredits(totalPosts: number, realImageCount: number) {
  const realPosts = Math.min(totalPosts, realImageCount);
  return realPosts + (totalPosts - realPosts) * 2;
}

function prepareGeneratedPosts(input: {
  cadence: number;
  durationWeeks: number;
  platforms: Network[];
  businessCategory: string;
  editorialSummary: string;
  editorialThemes: string[];
  recommendedSchedule: string[];
  samplePosts: string[];
  differentiator?: string;
  realImageUrls: string[];
  realImageBudget: number;
}) {
  const weeklySlots = buildWeeklySlots(input.cadence, input.recommendedSchedule);
  const slotDates: number[] = [];
  const baseDate = addDays(new Date(), 1);
  for (let week = 0; week < input.durationWeeks; week += 1) {
    for (const slot of weeklySlots) {
      slotDates.push(nextDateForSlot(baseDate, week, slot));
    }
  }
  slotDates.sort((a, b) => a - b);

  const totalPosts = slotDates.length * input.platforms.length;
  const categories = buildCategorySequence(totalPosts);
  let realImageAssignments = 0;
  let categoryIndex = 0;

  return slotDates.flatMap((scheduledAt, slotIndex) =>
    input.platforms.map((platform) => {
      const category = categories[categoryIndex] ?? POST_CATEGORIES.VALUE;
      categoryIndex += 1;
      const hashtags = buildHashtags(
        category,
        input.businessCategory,
        input.editorialThemes,
      );
      const samplePost = input.samplePosts[slotIndex % Math.max(input.samplePosts.length, 1)];
      const canUseRealImage =
        realImageAssignments < input.realImageBudget && input.realImageUrls.length > 0;
      const realImageUrl =
        input.realImageUrls[realImageAssignments % Math.max(input.realImageUrls.length, 1)];
      if (canUseRealImage) {
        realImageAssignments += 1;
      }
      const text = buildPlatformText({
        platform,
        category,
        businessCategory: input.businessCategory,
        editorialSummary: input.editorialSummary,
        differentiator: input.differentiator,
        samplePost,
        hashtags,
        index: slotIndex,
      });

      return {
        platform,
        textFacebook: platform === NETWORKS.FACEBOOK ? text : undefined,
        textInstagram: platform === NETWORKS.INSTAGRAM ? text : undefined,
        textLinkedin: platform === NETWORKS.LINKEDIN ? text : undefined,
        hashtags,
        imageUrl: canUseRealImage ? realImageUrl : undefined,
        imageAiPrompt: canUseRealImage
          ? undefined
          : `Create a ${category.replace(/_/g, " ")} visual for ${input.businessCategory.toLowerCase()} in a style described as ${input.editorialSummary.toLowerCase()}.`,
        imageSource: canUseRealImage ? IMAGE_SOURCES.REAL : IMAGE_SOURCES.AI,
        category,
        scheduledAt,
        creditsConsumed: canUseRealImage ? 1 : 2,
      } satisfies GeneratedPostDraft;
    }),
  );
}

export const getCurrentCalendar = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return null;
    }
    const calendar = await ctx.db
      .query("editorial_calendars")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    if (!calendar) {
      return null;
    }
    const channel = await ctx.db.get(calendar.channelId);
    return {
      ...calendar,
      channel,
    };
  },
});

export const getCurrentCalendarPosts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return [];
    }
    const calendar = await ctx.db
      .query("editorial_calendars")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    if (!calendar) {
      return [];
    }
    return await ctx.db
      .query("posts")
      .withIndex("by_calendar", (q) => q.eq("calendarId", calendar._id))
      .order("asc")
      .collect();
  },
});

export const generateCalendarForCurrentUser = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    calendarId: Id<"editorial_calendars">;
    channelId: Id<"channels">;
    totalPosts: number;
    totalCreditsEstimated: number;
  }> => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User not found");
    }
    const user: Doc<"users"> = await ctx.runQuery(
      internal.calendar.getCalendarUserState,
      {
      userId,
    },
    );
    const selectedPage: FacebookPage | undefined = user.facebookPages?.find(
      (page: FacebookPage) => page.id === user.selectedFacebookPageId,
    );
    if (!selectedPage) {
      throw new Error("No connected Facebook page selected");
    }
    if (
      !user.businessCategory ||
      !user.editorialSummary ||
      !user.selectedCadence ||
      !user.selectedDurationWeeks ||
      !user.selectedPlatforms?.length
    ) {
      throw new Error("Editorial profile or cadence is incomplete");
    }

    const realImageUrls = [selectedPage.picture, user.image].filter(
      (value): value is string => Boolean(value),
    );
    const realImageBudget =
      (user.uploadedPhotoCount ?? 0) + realImageUrls.length;
    const generatedPosts = prepareGeneratedPosts({
      cadence: user.selectedCadence,
      durationWeeks: user.selectedDurationWeeks,
      platforms: user.selectedPlatforms,
      businessCategory: user.businessCategory,
      editorialSummary: user.editorialSummary,
      editorialThemes: user.editorialThemes ?? [],
      recommendedSchedule: user.recommendedSchedule ?? [],
      samplePosts: user.samplePosts ?? [],
      differentiator: user.differentiator,
      realImageUrls,
      realImageBudget,
    });

    const totalCreditsEstimated = estimateCredits(
      generatedPosts.length,
      realImageBudget,
    );

    return await ctx.runMutation(internal.calendar.persistGeneratedCalendar, {
      userId,
      selectedPage,
      cadence: user.selectedCadence,
      platforms: user.selectedPlatforms,
      durationWeeks: user.selectedDurationWeeks,
      totalPosts: generatedPosts.length,
      totalCreditsEstimated,
      generatedPosts,
    });
  },
});

export const getCalendarUserState = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }
    return user;
  },
});

export const persistGeneratedCalendar = internalMutation({
  args: {
    userId: v.id("users"),
    selectedPage: v.object({
      id: v.string(),
      name: v.string(),
      picture: v.optional(v.string()),
      account_id: v.optional(v.string()),
    }),
    cadence: v.number(),
    platforms: v.array(v.union(v.literal("facebook"), v.literal("instagram"), v.literal("linkedin"))),
    durationWeeks: v.number(),
    totalPosts: v.number(),
    totalCreditsEstimated: v.number(),
    generatedPosts: v.array(
      v.object({
        platform: v.union(v.literal("facebook"), v.literal("instagram"), v.literal("linkedin")),
        textFacebook: v.optional(v.string()),
        textInstagram: v.optional(v.string()),
        textLinkedin: v.optional(v.string()),
        hashtags: v.optional(v.array(v.string())),
        imageUrl: v.optional(v.string()),
        imageAiPrompt: v.optional(v.string()),
        imageSource: v.union(v.literal("real"), v.literal("ai"), v.literal("pending")),
        category: v.union(
          v.literal("value"),
          v.literal("behind_scenes"),
          v.literal("promo"),
          v.literal("engagement"),
          v.literal("trend"),
        ),
        scheduledAt: v.number(),
        creditsConsumed: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existingChannel = await ctx.db
      .query("channels")
      .withIndex("by_platform_external", (q) =>
        q.eq("platform", NETWORKS.FACEBOOK).eq("externalId", args.selectedPage.id),
      )
      .unique();

    const channelId =
      existingChannel?._id ??
      (await ctx.db.insert("channels", {
        userId: args.userId,
        platform: NETWORKS.FACEBOOK,
        name: args.selectedPage.name,
        externalId: args.selectedPage.id,
        imageUrl: args.selectedPage.picture,
        status: CHANNEL_STATUSES.CONNECTED,
        connectedAt: now,
        updatedAt: now,
      }));

    if (existingChannel) {
      await ctx.db.patch(existingChannel._id, {
        name: args.selectedPage.name,
        imageUrl: args.selectedPage.picture,
        status: CHANNEL_STATUSES.CONNECTED,
        updatedAt: now,
      });
    }

    const previousCalendars = await ctx.db
      .query("editorial_calendars")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .collect();
    for (const calendar of previousCalendars) {
      if (calendar.status !== CALENDAR_STATUSES.ARCHIVED) {
        await ctx.db.patch(calendar._id, { status: CALENDAR_STATUSES.ARCHIVED });
      }
    }

    const sortedDates = args.generatedPosts
      .map((post) => post.scheduledAt)
      .sort((a, b) => a - b);
    const calendarId = await ctx.db.insert("editorial_calendars", {
      channelId,
      userId: args.userId,
      title: `Calendrier ${args.selectedPage.name}`,
      status: CALENDAR_STATUSES.ACTIVE,
      startDate: sortedDates[0] ?? now,
      endDate: sortedDates[sortedDates.length - 1] ?? now,
      cadence: args.cadence,
      platforms: args.platforms,
      categoriesRatio: CATEGORY_RATIOS,
      totalPosts: args.totalPosts,
      totalCreditsEstimated: args.totalCreditsEstimated,
      createdAt: now,
    });

    for (const post of args.generatedPosts) {
      await ctx.db.insert("posts", {
        channelId,
        calendarId,
        platform: post.platform,
        textFacebook: post.textFacebook,
        textInstagram: post.textInstagram,
        textLinkedin: post.textLinkedin,
        hashtags: post.hashtags,
        imageUrl: post.imageUrl,
        imageAiPrompt: post.imageAiPrompt,
        imageSource: post.imageSource,
        category: post.category,
        scheduledAt: post.scheduledAt,
        status: POST_STATUSES.DRAFT,
        creditsConsumed: post.creditsConsumed,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      calendarId,
      channelId,
      totalPosts: args.totalPosts,
      totalCreditsEstimated: args.totalCreditsEstimated,
    };
  },
});
