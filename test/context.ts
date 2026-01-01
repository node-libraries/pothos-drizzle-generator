import type { relations } from "./db/relations.js";

export type Context = {
  Variables: {
    user?: typeof relations.users.table.$inferSelect;
  };
};
