import { internal } from "@cvx/_generated/api";
import type { Doc, Id } from "@cvx/_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
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
import { ANTHROPIC_API_KEY } from "@cvx/env";
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
  assignedPhotoId?: Id<"photos">;
};

type PlannedPost = {
  slotIndex: number;
  platform: Network;
  category: PostCategory;
  scheduledAt: number;
};

type ClaudePostDraft = {
  slotIndex: number;
  caption: string;
  hashtags: string[];
  imagePrompt: string;
  preferredPhotoTags: string[];
};

type PhotoAsset = Doc<"photos">;

const CATEGORY_TAGS: Record<PostCategory, string[]> = {
  [POST_CATEGORIES.VALUE]: ["general", "conseils", "expertise", "temoignage"],
  [POST_CATEGORIES.BEHIND_SCENES]: ["equipe", "coulisses", "atelier", "general"],
  [POST_CATEGORIES.PROMO]: ["promo", "offre", "produit", "general"],
  [POST_CATEGORIES.ENGAGEMENT]: ["client", "temoignage", "evenement", "general"],
  [POST_CATEGORIES.TREND]: ["evenement", "exterieur", "general", "produit"],
};

const CALENDAR_PROMPT = `Tu es SocialPulse, expert en content marketing social media.

Tu reçois un profil éditorial, une liste de créneaux déjà optimisés et une catégorie imposée pour chaque post.

Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte additionnel.

Retourne un tableau JSON de cette forme exacte :
[
  {
    "slotIndex": 0,
    "caption": "texte final adapté à la plateforme",
    "hashtags": ["#hashtag1", "#hashtag2"],
    "imagePrompt": "prompt image détaillé si aucune photo réelle ne correspond",
    "preferredPhotoTags": ["tag1", "tag2", "tag3"]
  }
]

Règles :
- respecte exactement le slotIndex reçu
- texte Facebook: clair, utile, 60-140 mots
- texte Instagram: plus court, rythmé, avec 1-3 emojis maximum et hashtags naturels
- texte LinkedIn: plus professionnel, orienté expertise
- garde la langue du profil éditorial
- pas de promesse mensongère
- pas de doublons entre posts
- hashtags: 3 à 6 maximum
- preferredPhotoTags doit aider à choisir une photo réelle pertinente`;

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

function tokenize(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function buildPhotoPreferenceTags(input: {
  category: PostCategory;
  businessCategory: string;
  themes: string[];
  preferredPhotoTags?: string[];
}) {
  return Array.from(
    new Set([
      ...CATEGORY_TAGS[input.category],
      ...tokenize(input.businessCategory),
      ...input.themes.flatMap((theme) => tokenize(theme)),
      ...(input.preferredPhotoTags ?? []).flatMap((tag) => tokenize(tag)),
    ]),
  );
}

function scorePhoto(photo: PhotoAsset, desiredTags: string[]) {
  const tags = photo.tags.map((tag) => tokenize(tag)).flat();
  const overlap = desiredTags.filter((tag) => tags.includes(tag)).length;
  return overlap * 10 - photo.usedCount;
}

function selectPhotoForPost(input: {
  photos: PhotoAsset[];
  assignedPhotoIds: Set<Id<"photos">>;
  category: PostCategory;
  businessCategory: string;
  themes: string[];
  preferredPhotoTags?: string[];
}) {
  const desiredTags = buildPhotoPreferenceTags({
    category: input.category,
    businessCategory: input.businessCategory,
    themes: input.themes,
    preferredPhotoTags: input.preferredPhotoTags,
  });

  const available = input.photos
    .filter((photo) => !input.assignedPhotoIds.has(photo._id))
    .map((photo) => ({
      photo,
      score: scorePhoto(photo, desiredTags),
    }))
    .sort((a, b) => b.score - a.score || a.photo.usedCount - b.photo.usedCount);

  if (available[0] && available[0].score > 0) {
    input.assignedPhotoIds.add(available[0].photo._id);
    return available[0].photo;
  }

  return null;
}

async function callClaudeCalendar(promptPayload: string) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      system: CALENDAR_PROMPT,
      messages: [{ role: "user", content: promptPayload }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Claude API error ${response.status}: ${text}`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = payload.content?.find((item) => item.type === "text")?.text;
  if (!text) {
    throw new Error("Claude returned an empty response");
  }
  return text;
}

function parseClaudeCalendarDrafts(raw: string) {
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) {
    throw new Error("Claude calendar response must be an array");
  }
  return parsed.map((item, index) => ({
    slotIndex:
      typeof item.slotIndex === "number" ? item.slotIndex : index,
    caption:
      typeof item.caption === "string" ? item.caption.trim() : "",
    hashtags: Array.isArray(item.hashtags)
      ? item.hashtags.filter(
          (tag: unknown): tag is string => typeof tag === "string",
        )
      : [],
    imagePrompt:
      typeof item.imagePrompt === "string" ? item.imagePrompt.trim() : "",
    preferredPhotoTags: Array.isArray(item.preferredPhotoTags)
      ? item.preferredPhotoTags.filter(
          (tag: unknown): tag is string => typeof tag === "string",
        )
      : [],
  })) as ClaudePostDraft[];
}

async function generateClaudeDraftsWithRetry(promptPayload: string) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const raw = await callClaudeCalendar(promptPayload);
      return parseClaudeCalendarDrafts(raw);
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("Claude parsing failed");
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 500));
      }
    }
  }

  throw new Error(
    `Claude generation failed after 3 attempts: ${lastError?.message ?? "Unknown error"}`,
  );
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

function buildClaudePrompt(input: {
  businessCategory: string;
  editorialSummary: string;
  editorialThemes: string[];
  differentiator?: string;
  platforms: Network[];
  schedule: string[];
  plannedPosts: PlannedPost[];
  availablePhotoTags: string[][];
}) {
  const photoTagPool = Array.from(
    new Set(input.availablePhotoTags.flat().map((tag) => tag.toLowerCase())),
  ).slice(0, 40);

  return JSON.stringify(
    {
      businessCategory: input.businessCategory,
      editorialSummary: input.editorialSummary,
      editorialThemes: input.editorialThemes,
      differentiator: input.differentiator,
      platforms: input.platforms,
      recommendedSchedule: input.schedule,
      availablePhotoTags: photoTagPool,
      plannedPosts: input.plannedPosts.map((post) => ({
        slotIndex: post.slotIndex,
        platform: post.platform,
        category: post.category,
        scheduledAt: new Date(post.scheduledAt).toISOString(),
      })),
    },
    null,
    2,
  );
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
  photos: PhotoAsset[];
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
  let categoryIndex = 0;
  const plannedPosts: PlannedPost[] = [];

  for (let slotIndex = 0; slotIndex < slotDates.length; slotIndex += 1) {
    const scheduledAt = slotDates[slotIndex];
    for (const platform of input.platforms) {
      plannedPosts.push({
        slotIndex: plannedPosts.length,
        platform,
        category: categories[categoryIndex] ?? POST_CATEGORIES.VALUE,
        scheduledAt,
      });
      categoryIndex += 1;
    }
  }

  const claudePrompt = buildClaudePrompt({
    businessCategory: input.businessCategory,
    editorialSummary: input.editorialSummary,
    editorialThemes: input.editorialThemes,
    differentiator: input.differentiator,
    platforms: input.platforms,
    schedule: input.recommendedSchedule,
    plannedPosts,
    availablePhotoTags: input.photos.map((photo) => photo.tags),
  });

  return { slotDates, plannedPosts, claudePrompt };
}

function finalizeGeneratedPosts(input: {
  plannedPosts: PlannedPost[];
  generatedDrafts: ClaudePostDraft[];
  businessCategory: string;
  editorialSummary: string;
  editorialThemes: string[];
  samplePosts: string[];
  differentiator?: string;
  photos: PhotoAsset[];
}) {
  const assignedPhotoIds = new Set<Id<"photos">>();
  const draftsBySlot = new Map(
    input.generatedDrafts.map((draft) => [draft.slotIndex, draft]),
  );

  return input.plannedPosts.map((plannedPost, index) => {
    const draft = draftsBySlot.get(plannedPost.slotIndex);
    const hashtags =
      draft?.hashtags?.length
        ? draft.hashtags
        : buildHashtags(
            plannedPost.category,
            input.businessCategory,
            input.editorialThemes,
          );
    const samplePost =
      input.samplePosts[index % Math.max(input.samplePosts.length, 1)];
    const photo = selectPhotoForPost({
      photos: input.photos,
      assignedPhotoIds,
      category: plannedPost.category,
      businessCategory: input.businessCategory,
      themes: input.editorialThemes,
      preferredPhotoTags: draft?.preferredPhotoTags,
    });
    const text =
      draft?.caption?.trim() ||
      buildPlatformText({
        platform: plannedPost.platform,
        category: plannedPost.category,
        businessCategory: input.businessCategory,
        editorialSummary: input.editorialSummary,
        differentiator: input.differentiator,
        samplePost,
        hashtags,
        index,
      });

    return {
      platform: plannedPost.platform,
      textFacebook:
        plannedPost.platform === NETWORKS.FACEBOOK ? text : undefined,
      textInstagram:
        plannedPost.platform === NETWORKS.INSTAGRAM ? text : undefined,
      textLinkedin:
        plannedPost.platform === NETWORKS.LINKEDIN ? text : undefined,
      hashtags,
      imageUrl: photo?.url,
      imageAiPrompt: photo
        ? undefined
        : draft?.imagePrompt ||
          `Create a ${plannedPost.category.replace(/_/g, " ")} visual for ${input.businessCategory.toLowerCase()} in a style described as ${input.editorialSummary.toLowerCase()}.`,
      imageSource: photo ? IMAGE_SOURCES.REAL : IMAGE_SOURCES.AI,
      category: plannedPost.category,
      scheduledAt: plannedPost.scheduledAt,
      creditsConsumed: photo ? 1 : 2,
      assignedPhotoId: photo?._id,
    } satisfies GeneratedPostDraft;
  });
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

export const reschedulePost = mutation({
  args: {
    postId: v.id("posts"),
    scheduledAt: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User not found");
    }
    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new Error("Post not found");
    }
    const calendar = await ctx.db.get(post.calendarId);
    if (!calendar || calendar.userId !== userId) {
      throw new Error("Unauthorized");
    }
    await ctx.db.patch(args.postId, {
      scheduledAt: args.scheduledAt,
      updatedAt: Date.now(),
    });
    return args.postId;
  },
});

export const updatePostStatus = mutation({
  args: {
    postId: v.id("posts"),
    status: v.union(
      v.literal("draft"),
      v.literal("approved"),
      v.literal("scheduled"),
      v.literal("published"),
      v.literal("failed"),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User not found");
    }
    const post = await ctx.db.get(args.postId);
    if (!post) {
      throw new Error("Post not found");
    }
    const calendar = await ctx.db.get(post.calendarId);
    if (!calendar || calendar.userId !== userId) {
      throw new Error("Unauthorized");
    }
    await ctx.db.patch(args.postId, {
      status: args.status,
      publishedAt:
        args.status === POST_STATUSES.PUBLISHED ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
    return args.postId;
  },
});

export const createDraftPost = mutation({
  args: {
    scheduledAt: v.number(),
    platform: v.optional(
      v.union(
        v.literal("facebook"),
        v.literal("instagram"),
        v.literal("linkedin"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User not found");
    }
    const calendar = await ctx.db
      .query("editorial_calendars")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    if (!calendar) {
      throw new Error("Calendar not found");
    }
    const platform =
      args.platform && calendar.platforms.includes(args.platform)
        ? args.platform
        : ((calendar.platforms[0] as Network | undefined) ?? NETWORKS.FACEBOOK);
    const postId = await ctx.db.insert("posts", {
      channelId: calendar.channelId,
      calendarId: calendar._id,
      platform,
      textFacebook:
        platform === NETWORKS.FACEBOOK
          ? "Nouveau post en preparation."
          : undefined,
      textInstagram:
        platform === NETWORKS.INSTAGRAM
          ? "Nouveau post en preparation."
          : undefined,
      textLinkedin:
        platform === NETWORKS.LINKEDIN
          ? "Nouveau post en preparation."
          : undefined,
      hashtags: [],
      imageSource: IMAGE_SOURCES.PENDING,
      category: POST_CATEGORIES.VALUE,
      scheduledAt: args.scheduledAt,
      status: POST_STATUSES.DRAFT,
      creditsConsumed: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.patch(calendar._id, {
      totalPosts: calendar.totalPosts + 1,
    });
    return postId;
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

    const channel = await ctx.runQuery(internal.calendar.getChannelByExternalId, {
      platform: NETWORKS.FACEBOOK,
      externalId: selectedPage.id,
    });
    const importedPhotos = channel
      ? await ctx.runQuery(internal.calendar.getPhotosByChannel, {
          channelId: channel._id,
        })
      : [];
    const fallbackRealImageUrls = [selectedPage.picture, user.image].filter(
      (value): value is string => Boolean(value),
    );

    const plan = prepareGeneratedPosts({
      cadence: user.selectedCadence,
      durationWeeks: user.selectedDurationWeeks,
      platforms: user.selectedPlatforms,
      businessCategory: user.businessCategory,
      editorialSummary: user.editorialSummary,
      editorialThemes: user.editorialThemes ?? [],
      recommendedSchedule: user.recommendedSchedule ?? [],
      samplePosts: user.samplePosts ?? [],
      differentiator: user.differentiator,
      photos: importedPhotos,
    });

    const generatedDrafts = await generateClaudeDraftsWithRetry(
      plan.claudePrompt,
    );
    const generatedPostsBase = finalizeGeneratedPosts({
      plannedPosts: plan.plannedPosts,
      generatedDrafts,
      businessCategory: user.businessCategory,
      editorialSummary: user.editorialSummary,
      editorialThemes: user.editorialThemes ?? [],
      samplePosts: user.samplePosts ?? [],
      differentiator: user.differentiator,
      photos: importedPhotos,
    });

    let fallbackIndex = 0;
    const generatedPosts = generatedPostsBase.map((post) => {
      if (post.imageSource === IMAGE_SOURCES.REAL || fallbackIndex >= fallbackRealImageUrls.length) {
        return post;
      }
      const imageUrl = fallbackRealImageUrls[fallbackIndex];
      fallbackIndex += 1;
      return {
        ...post,
        imageUrl,
        imageAiPrompt: undefined,
        imageSource: IMAGE_SOURCES.REAL,
        creditsConsumed: 1,
      };
    });

    const realImageCount = generatedPosts.filter(
      (post) => post.imageSource === IMAGE_SOURCES.REAL,
    ).length;

    const totalCreditsEstimated = estimateCredits(
      generatedPosts.length,
      realImageCount,
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

export const getChannelByExternalId = internalQuery({
  args: {
    platform: v.union(v.literal("facebook"), v.literal("instagram"), v.literal("linkedin")),
    externalId: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("channels")
      .withIndex("by_platform_external", (q) =>
        q.eq("platform", args.platform).eq("externalId", args.externalId),
      )
      .unique();
  },
});

export const getPhotosByChannel = internalQuery({
  args: {
    channelId: v.id("channels"),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("photos")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .collect();
  },
});

export const getGenerationAssetsSummary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return null;
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }
    const selectedPage = user.facebookPages?.find(
      (page) => page.id === user.selectedFacebookPageId,
    );
    const channel = selectedPage
      ? await ctx.db
          .query("channels")
          .withIndex("by_platform_external", (q) =>
            q.eq("platform", NETWORKS.FACEBOOK).eq("externalId", selectedPage.id),
          )
          .unique()
      : null;
    const importedPhotos = channel
      ? await ctx.db
          .query("photos")
          .withIndex("by_channel", (q) => q.eq("channelId", channel._id))
          .collect()
      : [];

    return {
      importedPhotosCount: importedPhotos.length,
      availableRealImageCount:
        importedPhotos.length +
        (selectedPage?.picture ? 1 : 0) +
        (user.image ? 1 : 0) +
        (user.uploadedPhotoCount ?? 0),
    };
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
        assignedPhotoId: v.optional(v.id("photos")),
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
      if (post.assignedPhotoId) {
        const photo = await ctx.db.get(post.assignedPhotoId);
        if (photo) {
          await ctx.db.patch(post.assignedPhotoId, {
            usedCount: photo.usedCount + 1,
            lastUsedAt: now,
          });
        }
      }
    }

    return {
      calendarId,
      channelId,
      totalPosts: args.totalPosts,
      totalCreditsEstimated: args.totalCreditsEstimated,
    };
  },
});
