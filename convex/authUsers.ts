import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const role = v.union(
  v.literal("viewer"),
  v.literal("owner"),
  v.literal("commissioner"),
);
const status = v.union(v.literal("active"), v.literal("disabled"));

function requireServerSecret(serverSecret: string) {
  const expected = process.env.CONVEX_SERVER_SECRET;
  if (!expected || serverSecret !== expected) {
    throw new Error("Unauthorized server request");
  }
}

function publicUser(user: {
  _id: string;
  googleSubject: string;
  email: string;
  name?: string;
  image?: string;
  role: "viewer" | "owner" | "commissioner";
  ownerId?: string;
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
}) {
  return { ...user, id: user._id };
}

export const upsertGoogleUser = mutation({
  args: {
    serverSecret: v.string(),
    googleSubject: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const now = new Date().toISOString();
    const normalizedEmail = args.email.trim().toLowerCase();
    const bySubject = await ctx.db
      .query("authUsers")
      .withIndex("by_googleSubject", (q) =>
        q.eq("googleSubject", args.googleSubject),
      )
      .unique();
    const byEmail = await ctx.db
      .query("authUsers")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .unique();
    const existing = bySubject ?? byEmail;

    if (bySubject && byEmail && bySubject._id !== byEmail._id) {
      throw new Error("Google identity conflicts with an existing account");
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        googleSubject: args.googleSubject,
        email: normalizedEmail,
        name: args.name,
        image: args.image,
        updatedAt: now,
        lastLoginAt: now,
      });
      return publicUser((await ctx.db.get(existing._id))!);
    }

    const id = await ctx.db.insert("authUsers", {
      googleSubject: args.googleSubject,
      email: normalizedEmail,
      name: args.name,
      image: args.image,
      role: "viewer",
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    });
    return publicUser((await ctx.db.get(id))!);
  },
});

export const byGoogleSubject = query({
  args: { serverSecret: v.string(), googleSubject: v.string() },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const user = await ctx.db
      .query("authUsers")
      .withIndex("by_googleSubject", (q) =>
        q.eq("googleSubject", args.googleSubject),
      )
      .unique();
    return user ? publicUser(user) : null;
  },
});

export const list = query({
  args: { serverSecret: v.string() },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    return (await ctx.db.query("authUsers").collect()).map(publicUser);
  },
});

export const updateAccess = mutation({
  args: {
    serverSecret: v.string(),
    id: v.id("authUsers"),
    role,
    status,
    ownerId: v.optional(v.id("owners")),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const user = await ctx.db.get(args.id);
    if (!user) throw new Error("User not found");

    if (args.role === "owner") {
      if (!args.ownerId) throw new Error("Owners must be linked to an owner record");
      const owner = (await ctx.db.get(args.ownerId)) as { isActive?: boolean } | null;
      if (!owner?.isActive) throw new Error("Owner link must reference an active owner");
      const linked = await ctx.db
        .query("authUsers")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", args.ownerId))
        .first();
      if (linked && linked._id !== args.id) {
        throw new Error("That owner is already linked to another account");
      }
    }

    await ctx.db.patch(args.id, {
      role: args.role,
      status: args.status,
      ownerId: args.role === "owner" ? args.ownerId : undefined,
      updatedAt: new Date().toISOString(),
    });
    return publicUser((await ctx.db.get(args.id))!);
  },
});
