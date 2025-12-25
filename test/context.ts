import type { relations } from "./db/relations.js";
import type { Context as C } from "hono";

export type Context = {
  Variables: {
    user?: typeof relations.users.table.$inferSelect;
  };
};

export type HonoContext = C<Context>;
