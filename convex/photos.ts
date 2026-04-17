import { mutation, query } from "@cvx/_generated/server";
import { auth } from "@cvx/auth";
import { v } from "convex/values";

export const listPhotos = query({
  args: { channelId: v.optional(v.id("channels")) },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    if (args.channelId) {
      return ctx.db
        .query("photos")
        .withIndex("by_channel", (q) => q.eq("channelId", args.channelId!))
        .order("desc")
        .collect();
    }
    return ctx.db
      .query("photos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const getPhotoCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return 0;
    const photos = await ctx.db
      .query("photos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return photos.length;
  },
});

export const uploadPhoto = mutation({
  args: {
    storageId: v.id("_storage"),
    filename: v.string(),
    fileSizeBytes: v.number(),
    channelId: v.optional(v.id("channels")),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("User not found");

    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Failed to get storage URL");

    let channelId = args.channelId;
    if (!channelId) {
      const channel = await ctx.db
        .query("channels")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      channelId = channel?._id;
    }
    if (!channelId) throw new Error("No channel found");

    return ctx.db.insert("photos", {
      channelId,
      userId,
      storageId: args.storageId,
      url,
      filename: args.filename,
      fileSizeBytes: args.fileSizeBytes,
      tags: [],
      tagsSource: "auto",
      usedCount: 0,
      createdAt: Date.now(),
    });
  },
});

export const deletePhoto = mutation({
  args: { photoId: v.id("photos") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("User not found");

    const photo = await ctx.db.get(args.photoId);
    if (!photo || photo.userId !== userId) throw new Error("Photo not found");

    await ctx.storage.delete(photo.storageId);
    await ctx.db.delete(args.photoId);
  },
});

export const updateTags = mutation({
  args: {
    photoId: v.id("photos"),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("User not found");

    const photo = await ctx.db.get(args.photoId);
    if (!photo || photo.userId !== userId) throw new Error("Photo not found");

    await ctx.db.patch(args.photoId, {
      tags: args.tags,
      tagsSource: "manual",
    });
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("User not found");
    return ctx.storage.generateUploadUrl();
  },
});
