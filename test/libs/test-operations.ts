import { setCookie } from "hono/cookie";
import { SignJWT } from "jose";
import type { Context } from "../context";
import type { relations } from "../db/relations";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Context as HonoContext } from "hono";

export const onCreateBuilder = (
  builder: PothosSchemaTypes.SchemaBuilder<
    PothosSchemaTypes.ExtendDefaultTypes<{
      DrizzleRelations: typeof relations;
      Context: HonoContext<Context>;
    }>
  >
) => {
  builder.mutationType({
    fields: (t) => ({
      me: t.drizzleField({
        type: "users",
        nullable: true,
        resolve: (_query, _root, _args, ctx) => {
          const user = ctx.get("user");
          return user || null;
        },
      }),
      signIn: t.drizzleField({
        args: { email: t.arg({ type: "String" }) },
        type: "users",
        nullable: true,
        resolve: async (_query, _root, { email }, ctx) => {
          const db = t.builder.options.drizzle.client as NodePgDatabase<
            Record<string, never>,
            typeof relations
          >;
          const user =
            email &&
            (await db.query.users.findFirst({ where: { email: email } }));
          if (!user) {
            setCookie(ctx, "auth-token", "", {
              httpOnly: true,
              sameSite: "strict",
              path: "/",
              maxAge: 0,
            });
          } else {
            const secret = process.env.SECRET;
            if (!secret) throw new Error("SECRET_KEY is not defined");
            const token = await new SignJWT({ user: user })
              .setProtectedHeader({ alg: "HS256" })
              .sign(new TextEncoder().encode(secret));
            setCookie(ctx, "auth-token", token, {
              httpOnly: true,
              maxAge: 60 * 60 * 24 * 400,
              sameSite: "strict",
              path: "/",
            });
          }
          return user || null;
        },
      }),
      signOut: t.field({
        args: {},
        type: "Boolean",
        nullable: true,
        resolve: async (_root, _args, ctx) => {
          setCookie(ctx, "auth-token", "", {
            httpOnly: true,
            sameSite: "strict",
            path: "/",
            maxAge: 0,
          });
          return true;
        },
      }),
    }),
  });
};
