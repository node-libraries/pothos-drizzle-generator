import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
  users: {
    posts: r.many.posts({
      from: r.users.id,
      to: r.posts.authorId,
    }),
  },
  posts: {
    author: r.one.users({
      from: r.posts.authorId,
      to: r.users.id,
    }),
    categories: r.many.categories({
      from: r.posts.id.through(r.postsToCategories.postId),
      to: r.categories.id.through(r.postsToCategories.categoryId),
    }),
  },
  categories: {
    posts: r.many.posts(),
  },
  postsToCategories: {
    post: r.one.posts({
      from: r.postsToCategories.postId,
      to: r.posts.id,
    }),
    category: r.one.categories({
      from: r.postsToCategories.categoryId,
      to: r.categories.id,
    }),
  },
}));
