import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  pgEnum,
  primaryKey,
} from "drizzle-orm/pg-core";
import * as p from "drizzle-orm/pg-core";

// Enum 定義
export const roleEnum = pgEnum("Role", ["ADMIN", "USER"]);

// User テーブル
export const users = pgTable("User", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default("User"),
  roles: roleEnum("roles").array().default(["USER"]),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Post テーブル
export const posts = pgTable("Post", {
  id: uuid("id").defaultRandom().primaryKey(),
  published: boolean("published").notNull().default(false),
  title: text("title").notNull().default("New Post"),
  content: text("content").notNull().default(""),
  authorId: uuid("authorId").references(() => users.id),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  publishedAt: timestamp("publishedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Category テーブル
export const categories = pgTable("Category", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// 中間テーブル (Post-Category 多対多)
export const postsToCategories = pgTable(
  "PostToCategory",
  {
    postId: uuid("postId")
      .notNull()
      .references(() => posts.id),
    categoryId: uuid("categoryId")
      .notNull()
      .references(() => categories.id),
  },
  (t) => [primaryKey({ columns: [t.postId, t.categoryId] })]
);

export const tests = pgTable("Test", {
  a: p.integer().notNull(),
  b: p.doublePrecision().notNull(),
  c: p.boolean().array(),
  enumTest: roleEnum(),
});
