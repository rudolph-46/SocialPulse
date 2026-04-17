import { action, internalMutation, internalQuery } from "@cvx/_generated/server";
import { internal } from "@cvx/_generated/api";
import { auth } from "@cvx/auth";
import { v } from "convex/values";
import { WAVESPEED_API_KEY } from "@cvx/env";
import { IMAGE_SOURCES, POST_STATUSES } from "@cvx/schema";
import type { Id } from "@cvx/_generated/dataModel";

const WAVESPEED_MODEL = "wavespeed-ai/flux-schnell";
const WAVESPEED_BASE = "https://api.wavespeed.ai/api/v3";

async function wavespeedGenerate(prompt: string): Promise<string> {
  if (!WAVESPEED_API_KEY) throw new Error("WAVESPEED_API_KEY not configured");

  const res = await fetch(`${WAVESPEED_BASE}/${WAVESPEED_MODEL}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WAVESPEED_API_KEY}`,
    },
    body: JSON.stringify({ prompt, size: "1024*1024" }),
  });
  if (!res.ok) throw new Error(`WaveSpeed error ${res.status}`);
  const data = (await res.json()) as {
    data: { id: string; urls: { get: string } };
  };
  const pollUrl = data.data.urls.get;

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${WAVESPEED_API_KEY}` },
    });
    if (!pollRes.ok) continue;
    const pollData = (await pollRes.json()) as {
      data: { status: string; outputs: string[] };
    };
    if (pollData.data.status === "completed" && pollData.data.outputs[0]) {
      return pollData.data.outputs[0];
    }
    if (pollData.data.status === "failed") {
      throw new Error("WaveSpeed generation failed");
    }
  }
  throw new Error("WaveSpeed generation timed out");
}

export const generateImagesForCalendar = action({
  args: { calendarId: v.id("editorial_calendars") },
  handler: async (
    ctx,
    args,
  ): Promise<{ generated: number; total: number }> => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("User not found");

    const posts: Array<{
      _id: Id<"posts">;
      imageAiPrompt?: string;
    }> = await ctx.runQuery(
      internal.imageGeneration.getPendingImagePosts,
      { calendarId: args.calendarId, userId },
    );

    let generated = 0;
    for (const post of posts) {
      if (!post.imageAiPrompt) continue;
      try {
        const enrichedPrompt = `${post.imageAiPrompt}. Professional photography, natural lighting, no text in the image, no watermark, high quality.`;
        const imageUrl = await wavespeedGenerate(enrichedPrompt);

        const blob = await fetch(imageUrl).then((r) => r.blob());
        const storageId = await ctx.storage.store(blob);
        const convexUrl = await ctx.storage.getUrl(storageId);
        if (!convexUrl) continue;

        await ctx.runMutation(internal.imageGeneration.setPostImage, {
          postId: post._id as Id<"posts">,
          imageUrl: convexUrl,
          storageId,
        });
        generated++;
      } catch {
        // skip failed generations, keep imageSource as "pending"
      }
    }
    return { generated, total: posts.length };
  },
});

export const generateSingleImage = action({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("User not found");

    const post = await ctx.runQuery(internal.imageGeneration.getPostForUser, {
      postId: args.postId,
      userId,
    });
    if (!post) throw new Error("Post not found");
    if (!post.imageAiPrompt) throw new Error("No image prompt for this post");

    const enrichedPrompt = `${post.imageAiPrompt}. Professional photography, natural lighting, no text in the image, no watermark, high quality.`;
    const imageUrl = await wavespeedGenerate(enrichedPrompt);

    const blob = await fetch(imageUrl).then((r) => r.blob());
    const storageId = await ctx.storage.store(blob);
    const convexUrl = await ctx.storage.getUrl(storageId);
    if (!convexUrl) throw new Error("Failed to store image");

    await ctx.runMutation(internal.imageGeneration.setPostImage, {
      postId: args.postId,
      imageUrl: convexUrl,
      storageId,
    });

    return { imageUrl: convexUrl };
  },
});

// Internal helpers

export const getPendingImagePosts = internalQuery({
  args: {
    calendarId: v.id("editorial_calendars"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const cal = await ctx.db.get(args.calendarId);
    if (!cal || cal.userId !== args.userId) return [];

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_calendar", (q) => q.eq("calendarId", args.calendarId))
      .collect();

    return posts.filter(
      (p) =>
        p.imageSource === IMAGE_SOURCES.AI &&
        !p.imageUrl &&
        p.imageAiPrompt &&
        p.status !== POST_STATUSES.PUBLISHED,
    );
  },
});

export const getPostForUser = internalQuery({
  args: {
    postId: v.id("posts"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return null;
    const cal = await ctx.db.get(post.calendarId);
    if (!cal || cal.userId !== args.userId) return null;
    return post;
  },
});

export const setPostImage = internalMutation({
  args: {
    postId: v.id("posts"),
    imageUrl: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.postId, {
      imageUrl: args.imageUrl,
      imageSource: IMAGE_SOURCES.AI,
      updatedAt: Date.now(),
    });
  },
});
