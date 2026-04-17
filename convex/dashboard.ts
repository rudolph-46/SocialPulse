import { query } from "@cvx/_generated/server";
import type { Doc } from "@cvx/_generated/dataModel";
import { auth } from "@cvx/auth";
import { POST_STATUSES } from "@cvx/schema";

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    const channels = await ctx.db
      .query("channels")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const calendar = await ctx.db
      .query("editorial_calendars")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();

    let posts: Doc<"posts">[] = [];
    if (calendar) {
      posts = await ctx.db
        .query("posts")
        .withIndex("by_calendar", (q) => q.eq("calendarId", calendar._id))
        .collect();
    }

    const now = Date.now();
    const startOfWeek = now - ((new Date().getDay() + 6) % 7) * 86400000;
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    ).getTime();

    const thisWeekPosts = posts.filter(
      (p) => p.scheduledAt >= startOfWeek && p.scheduledAt <= now + 7 * 86400000,
    );
    const publishedThisMonth = posts.filter(
      (p) =>
        p.status === POST_STATUSES.PUBLISHED && (p.publishedAt ?? 0) >= startOfMonth,
    );
    const upcomingPosts = posts
      .filter(
        (p) =>
          p.scheduledAt >= now &&
          (p.status === POST_STATUSES.DRAFT || p.status === POST_STATUSES.APPROVED),
      )
      .sort((a, b) => a.scheduledAt - b.scheduledAt)
      .slice(0, 3);

    const photoCount = (
      await ctx.db.query("photos").withIndex("by_user", (q) => q.eq("userId", userId)).collect()
    ).length;

    const cadence = user.selectedCadence ?? 5;
    const balance = user.creditsBalance ?? 0;
    const weeksLeft = cadence > 0 ? Math.floor(balance / cadence) : 0;

    return {
      channels: channels.map((c) => ({
        id: c._id,
        name: c.name,
        platform: c.platform,
        imageUrl: c.imageUrl,
        status: c.status,
      })),
      calendar: calendar
        ? {
            id: calendar._id,
            title: calendar.title,
            totalPosts: calendar.totalPosts,
            cadence: calendar.cadence,
          }
        : null,
      thisWeek: {
        total: thisWeekPosts.length,
        published: thisWeekPosts.filter(
          (p) => p.status === POST_STATUSES.PUBLISHED,
        ).length,
        upcoming: thisWeekPosts.filter((p) => p.scheduledAt > now).length,
      },
      thisMonth: {
        published: publishedThisMonth.length,
      },
      upcomingPosts: upcomingPosts.map((p) => ({
        id: p._id,
        text:
          p.textFacebook?.slice(0, 100) ??
          p.textInstagram?.slice(0, 100) ??
          p.textLinkedin?.slice(0, 100) ??
          "",
        platform: p.platform,
        category: p.category,
        scheduledAt: p.scheduledAt,
        imageUrl: p.imageUrl,
      })),
      credits: {
        balance,
        cadence,
        weeksLeft,
      },
      photoCount,
    };
  },
});
