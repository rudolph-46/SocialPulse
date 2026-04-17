import {
  internalMutation,
  mutation,
  query,
} from "@cvx/_generated/server";
import { auth } from "@cvx/auth";
import { v } from "convex/values";
import { POST_STATUSES, CALENDAR_STATUSES } from "@cvx/schema";

// ---------------------------------------------------------------------------
// Transition guards — enforce valid state machine
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ["approved", "deleted"],
  approved: ["draft", "scheduled"],
  scheduled: ["published", "failed"],
  failed: ["approved", "draft"],
  published: [], // terminal
};

function isValidTransition(from: string, to: string): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

// ---------------------------------------------------------------------------
// Single post mutations (already exists updatePostStatus — these add guards)
// ---------------------------------------------------------------------------

export const approvePost = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("User not found");
    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    const cal = await ctx.db.get(post.calendarId);
    if (!cal || cal.userId !== userId) throw new Error("Unauthorized");
    if (!isValidTransition(post.status, "approved")) {
      throw new Error(`Cannot approve a post in status "${post.status}"`);
    }
    await ctx.db.patch(args.postId, {
      status: POST_STATUSES.APPROVED,
      updatedAt: Date.now(),
    });
  },
});

export const revertToDraft = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("User not found");
    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    const cal = await ctx.db.get(post.calendarId);
    if (!cal || cal.userId !== userId) throw new Error("Unauthorized");
    if (!isValidTransition(post.status, "draft")) {
      throw new Error(`Cannot revert to draft from status "${post.status}"`);
    }
    await ctx.db.patch(args.postId, {
      status: POST_STATUSES.DRAFT,
      updatedAt: Date.now(),
    });
  },
});

export const retryFailedPost = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("User not found");
    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    const cal = await ctx.db.get(post.calendarId);
    if (!cal || cal.userId !== userId) throw new Error("Unauthorized");
    if (post.status !== POST_STATUSES.FAILED) {
      throw new Error("Only failed posts can be retried");
    }
    await ctx.db.patch(args.postId, {
      status: POST_STATUSES.APPROVED,
      scheduledAt: Date.now() + 5 * 60 * 1000, // reschedule +5min
      updatedAt: Date.now(),
    });
  },
});

export const deletePost = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("User not found");
    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    const cal = await ctx.db.get(post.calendarId);
    if (!cal || cal.userId !== userId) throw new Error("Unauthorized");
    if (post.status === POST_STATUSES.PUBLISHED) {
      throw new Error("Cannot delete a published post");
    }
    if (post.status === POST_STATUSES.SCHEDULED) {
      // De-schedule: revert to draft instead of deleting
      await ctx.db.patch(args.postId, {
        status: POST_STATUSES.DRAFT,
        updatedAt: Date.now(),
      });
      return;
    }
    await ctx.db.delete(args.postId);
    await ctx.db.patch(cal._id, {
      totalPosts: Math.max(0, cal.totalPosts - 1),
    });
  },
});

// ---------------------------------------------------------------------------
// Bulk actions
// ---------------------------------------------------------------------------

export const bulkApprove = mutation({
  args: { calendarId: v.id("editorial_calendars") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("User not found");
    const cal = await ctx.db.get(args.calendarId);
    if (!cal || cal.userId !== userId) throw new Error("Unauthorized");

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_calendar", (q) => q.eq("calendarId", args.calendarId))
      .collect();

    let count = 0;
    const now = Date.now();
    for (const post of posts) {
      if (post.status === POST_STATUSES.DRAFT) {
        await ctx.db.patch(post._id, {
          status: POST_STATUSES.APPROVED,
          updatedAt: now,
        });
        count++;
      }
    }
    return { approved: count };
  },
});

export const bulkDelete = mutation({
  args: { calendarId: v.id("editorial_calendars") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("User not found");
    const cal = await ctx.db.get(args.calendarId);
    if (!cal || cal.userId !== userId) throw new Error("Unauthorized");

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_calendar", (q) => q.eq("calendarId", args.calendarId))
      .collect();

    let count = 0;
    for (const post of posts) {
      if (
        post.status === POST_STATUSES.DRAFT ||
        post.status === POST_STATUSES.APPROVED
      ) {
        await ctx.db.delete(post._id);
        count++;
      }
    }
    if (count > 0) {
      await ctx.db.patch(args.calendarId, {
        totalPosts: Math.max(0, cal.totalPosts - count),
      });
    }
    return { deleted: count };
  },
});

export const bulkReschedule = mutation({
  args: {
    postIds: v.array(v.id("posts")),
    offsetMs: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("User not found");
    const now = Date.now();
    let count = 0;
    for (const postId of args.postIds) {
      const post = await ctx.db.get(postId);
      if (!post) continue;
      const cal = await ctx.db.get(post.calendarId);
      if (!cal || cal.userId !== userId) continue;
      if (
        post.status === POST_STATUSES.PUBLISHED ||
        post.status === POST_STATUSES.SCHEDULED
      )
        continue;
      await ctx.db.patch(postId, {
        scheduledAt: post.scheduledAt + args.offsetMs,
        updatedAt: now,
      });
      count++;
    }
    return { rescheduled: count };
  },
});

// ---------------------------------------------------------------------------
// Auto-approve cron (pilote automatique)
// ---------------------------------------------------------------------------

export const autoApproveDrafts = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Find all active calendars
    const calendars = await ctx.db
      .query("editorial_calendars")
      .collect();

    const activeCalendars = calendars.filter(
      (c) => c.status === CALENDAR_STATUSES.ACTIVE,
    );

    let totalApproved = 0;
    const now = Date.now();

    for (const cal of activeCalendars) {
      const channel = await ctx.db.get(cal.channelId);
      if (!channel?.autoApproveTimeout) continue;

      const timeoutMs = channel.autoApproveTimeout * 3600 * 1000; // hours → ms

      const posts = await ctx.db
        .query("posts")
        .withIndex("by_calendar", (q) => q.eq("calendarId", cal._id))
        .collect();

      for (const post of posts) {
        if (post.status !== POST_STATUSES.DRAFT) continue;
        if (now - post.createdAt < timeoutMs) continue;

        await ctx.db.patch(post._id, {
          status: POST_STATUSES.APPROVED,
          updatedAt: now,
        });
        totalApproved++;
      }
    }

    return { totalApproved };
  },
});

// ---------------------------------------------------------------------------
// Auto-archive expired calendars
// ---------------------------------------------------------------------------

export const autoArchiveExpiredCalendars = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const calendars = await ctx.db
      .query("editorial_calendars")
      .collect();

    let count = 0;
    for (const cal of calendars) {
      if (cal.status !== CALENDAR_STATUSES.ACTIVE) continue;
      if (cal.endDate > now) continue;

      // Check if all posts are published or failed
      const posts = await ctx.db
        .query("posts")
        .withIndex("by_calendar", (q) => q.eq("calendarId", cal._id))
        .collect();

      const allDone = posts.every(
        (p) =>
          p.status === POST_STATUSES.PUBLISHED ||
          p.status === POST_STATUSES.FAILED,
      );

      if (allDone || cal.endDate < now - 7 * 86400000) {
        await ctx.db.patch(cal._id, {
          status: CALENDAR_STATUSES.ARCHIVED,
          archivedAt: now,
        });
        count++;
      }
    }
    return { archived: count };
  },
});

// ---------------------------------------------------------------------------
// Channel auto-approve settings
// ---------------------------------------------------------------------------

export const setAutoApproveTimeout = mutation({
  args: {
    channelId: v.id("channels"),
    timeoutHours: v.optional(v.number()), // null = disabled, 0 = immediate, 12/24/48
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("User not found");
    const channel = await ctx.db.get(args.channelId);
    if (!channel || channel.userId !== userId)
      throw new Error("Channel not found");
    await ctx.db.patch(args.channelId, {
      autoApproveTimeout: args.timeoutHours,
      updatedAt: Date.now(),
    });
  },
});

export const getChannelSettings = query({
  args: { channelId: v.id("channels") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    const channel = await ctx.db.get(args.channelId);
    if (!channel || channel.userId !== userId) return null;
    return {
      id: channel._id,
      name: channel.name,
      platform: channel.platform,
      autoApproveTimeout: channel.autoApproveTimeout ?? null,
    };
  },
});
