import { mutation, query } from "@cvx/_generated/server";
import { auth } from "@cvx/auth";
import { v } from "convex/values";
import {
  CALENDAR_STATUSES,
  POST_STATUSES,
} from "@cvx/schema";
import type { Doc, Id } from "@cvx/_generated/dataModel";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const listCalendars = query({
  args: { channelId: v.optional(v.id("channels")) },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    let calendars: Doc<"editorial_calendars">[];
    if (args.channelId) {
      calendars = await ctx.db
        .query("editorial_calendars")
        .withIndex("by_channel", (q) => q.eq("channelId", args.channelId!))
        .collect();
    } else {
      calendars = await ctx.db
        .query("editorial_calendars")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    }

    // Sort: active first, then draft, then archived (desc by createdAt within each group)
    const statusOrder = { active: 0, draft: 1, archived: 2 } as const;
    calendars.sort((a, b) => {
      const orderDiff =
        (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
      if (orderDiff !== 0) return orderDiff;
      return b.createdAt - a.createdAt;
    });

    const result = [];
    for (const cal of calendars) {
      const posts = await ctx.db
        .query("posts")
        .withIndex("by_calendar", (q) => q.eq("calendarId", cal._id))
        .collect();
      const published = posts.filter(
        (p) => p.status === POST_STATUSES.PUBLISHED,
      ).length;
      const channel = await ctx.db.get(cal.channelId);
      result.push({
        ...cal,
        channelName: channel?.name ?? "",
        postsPublished: published,
        postsTotal: posts.length,
      });
    }
    return result;
  },
});

export const getCalendarWithPosts = query({
  args: { calendarId: v.id("editorial_calendars") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    const calendar = await ctx.db.get(args.calendarId);
    if (!calendar || calendar.userId !== userId) return null;
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_calendar", (q) => q.eq("calendarId", args.calendarId))
      .order("asc")
      .collect();
    const channel = await ctx.db.get(calendar.channelId);
    return { ...calendar, channel, posts };
  },
});

export const compareCalendars = query({
  args: {
    calendarIdA: v.id("editorial_calendars"),
    calendarIdB: v.id("editorial_calendars"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    async function stats(calId: Id<"editorial_calendars">) {
      const cal = await ctx.db.get(calId);
      if (!cal || cal.userId !== userId) return null;
      const posts = await ctx.db
        .query("posts")
        .withIndex("by_calendar", (q) => q.eq("calendarId", calId))
        .collect();
      const published = posts.filter(
        (p) => p.status === POST_STATUSES.PUBLISHED,
      );
      const totalEngagement = published.reduce((sum, p) => {
        if (!p.analytics || typeof p.analytics !== "object") return sum;
        const a = p.analytics as Record<string, unknown>;
        const likes = typeof a.likes === "number" ? a.likes : 0;
        const comments = typeof a.comments === "number" ? a.comments : 0;
        const shares = typeof a.shares === "number" ? a.shares : 0;
        return sum + likes + comments + shares;
      }, 0);
      const categories = posts.reduce<Record<string, number>>((acc, p) => {
        acc[p.category] = (acc[p.category] ?? 0) + 1;
        return acc;
      }, {});

      return {
        id: cal._id,
        title: cal.title,
        status: cal.status,
        cadence: cal.cadence,
        totalPosts: posts.length,
        publishedPosts: published.length,
        avgEngagement:
          published.length > 0
            ? Math.round(totalEngagement / published.length)
            : 0,
        totalEngagement,
        categories,
        startDate: cal.startDate,
        endDate: cal.endDate,
      };
    }

    const [a, b] = await Promise.all([
      stats(args.calendarIdA),
      stats(args.calendarIdB),
    ]);
    return { a, b };
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const activateCalendar = mutation({
  args: { calendarId: v.id("editorial_calendars") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("User not found");

    const calendar = await ctx.db.get(args.calendarId);
    if (!calendar || calendar.userId !== userId)
      throw new Error("Calendar not found");
    if (calendar.status === CALENDAR_STATUSES.ACTIVE) return args.calendarId;

    // Archive current active calendar for the same channel
    const activeCalendars = await ctx.db
      .query("editorial_calendars")
      .withIndex("by_channel", (q) => q.eq("channelId", calendar.channelId))
      .collect();

    for (const active of activeCalendars) {
      if (
        active._id !== args.calendarId &&
        active.status === CALENDAR_STATUSES.ACTIVE
      ) {
        await ctx.db.patch(active._id, {
          status: CALENDAR_STATUSES.ARCHIVED,
          archivedAt: Date.now(),
        });
      }
    }

    await ctx.db.patch(args.calendarId, {
      status: CALENDAR_STATUSES.ACTIVE,
      activatedAt: Date.now(),
    });
    return args.calendarId;
  },
});

export const archiveCalendar = mutation({
  args: { calendarId: v.id("editorial_calendars") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("User not found");

    const calendar = await ctx.db.get(args.calendarId);
    if (!calendar || calendar.userId !== userId)
      throw new Error("Calendar not found");

    await ctx.db.patch(args.calendarId, {
      status: CALENDAR_STATUSES.ARCHIVED,
      archivedAt: Date.now(),
    });
    return args.calendarId;
  },
});

export const duplicateCalendar = mutation({
  args: { calendarId: v.id("editorial_calendars") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("User not found");

    const source = await ctx.db.get(args.calendarId);
    if (!source || source.userId !== userId)
      throw new Error("Calendar not found");

    const sourcePosts = await ctx.db
      .query("posts")
      .withIndex("by_calendar", (q) => q.eq("calendarId", args.calendarId))
      .order("asc")
      .collect();

    // Calculate date offset: shift to start tomorrow
    const now = Date.now();
    const tomorrow = now + 86400000;
    const dateOffset = tomorrow - source.startDate;

    const newCalendarId = await ctx.db.insert("editorial_calendars", {
      channelId: source.channelId,
      userId,
      title: `Copie de ${source.title}`,
      status: CALENDAR_STATUSES.DRAFT,
      startDate: source.startDate + dateOffset,
      endDate: source.endDate + dateOffset,
      cadence: source.cadence,
      platforms: source.platforms,
      categoriesRatio: source.categoriesRatio,
      totalPosts: sourcePosts.length,
      totalCreditsEstimated: source.totalCreditsEstimated,
      createdAt: now,
    });

    for (const post of sourcePosts) {
      await ctx.db.insert("posts", {
        channelId: post.channelId,
        calendarId: newCalendarId,
        platform: post.platform,
        textFacebook: post.textFacebook,
        textInstagram: post.textInstagram,
        textLinkedin: post.textLinkedin,
        hashtags: post.hashtags,
        imageUrl: post.imageUrl,
        imageAiPrompt: post.imageAiPrompt,
        imageSource: post.imageSource,
        category: post.category,
        scheduledAt: post.scheduledAt + dateOffset,
        status: POST_STATUSES.DRAFT,
        creditsConsumed: 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    return newCalendarId;
  },
});

export const deleteCalendar = mutation({
  args: { calendarId: v.id("editorial_calendars") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("User not found");

    const calendar = await ctx.db.get(args.calendarId);
    if (!calendar || calendar.userId !== userId)
      throw new Error("Calendar not found");
    if (calendar.status === CALENDAR_STATUSES.ACTIVE)
      throw new Error("Cannot delete an active calendar. Archive it first.");

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_calendar", (q) => q.eq("calendarId", args.calendarId))
      .collect();

    for (const post of posts) {
      await ctx.db.delete(post._id);
    }
    await ctx.db.delete(args.calendarId);
  },
});

export const updateCalendarTitle = mutation({
  args: {
    calendarId: v.id("editorial_calendars"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("User not found");
    const calendar = await ctx.db.get(args.calendarId);
    if (!calendar || calendar.userId !== userId)
      throw new Error("Calendar not found");
    await ctx.db.patch(args.calendarId, { title: args.title });
  },
});
