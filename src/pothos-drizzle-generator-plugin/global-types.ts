import { SchemaTypes } from "@pothos/core";
import type { PothosDrizzleGeneratorPlugin } from "./PothosDrizzleGeneratorPlugin";

declare global {
  export namespace PothosSchemaTypes {
    export interface Plugins<
      Types extends SchemaTypes,
      T extends object = object
    > {
      pothosDrizzleGenerator: PothosDrizzleGeneratorPlugin<Types, T>;
    }

    export interface SchemaBuilderOptions<Types extends SchemaTypes> {
      pothosDrizzleGenerator?: {};
    }
  }
}
