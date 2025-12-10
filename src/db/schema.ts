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
  id: uuid().defaultRandom().primaryKey(),
  email: text().notNull().unique(),
  name: text().notNull().default("User"),
  roles: roleEnum().array().default(["USER"]),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

// Post テーブル
export const posts = pgTable("Post", {
  id: uuid().defaultRandom().primaryKey(),
  published: boolean().notNull().default(false),
  title: text().notNull().default("New Post"),
  content: text().notNull().default(""),
  authorId: uuid().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  publishedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

// Category テーブル
export const categories = pgTable("Category", {
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

// 中間テーブル (Post-Category 多対多)
export const postsToCategories = pgTable(
  "PostToCategory",
  {
    postId: uuid()
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.categoryId] })]
);

export const tests = pgTable("Test", {
  a: p.integer().notNull(),
  b: p.doublePrecision().notNull(),
  c: p.boolean().array(),
  enumTest: roleEnum(),
});
