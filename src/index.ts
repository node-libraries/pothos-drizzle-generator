import SchemaBuilder from "@pothos/core";
import { PothosDrizzleGenerator } from "./PothosDrizzleGenerator.js";
export * from "./global-types.js";
export * from "./libs/operations.js";

const pluginName = "pothosDrizzleGenerator" as const;
const allowPluginReRegistration = SchemaBuilder.allowPluginReRegistration;
SchemaBuilder.allowPluginReRegistration = true;
SchemaBuilder.registerPlugin(pluginName, PothosDrizzleGenerator);
SchemaBuilder.allowPluginReRegistration = allowPluginReRegistration;
export default pluginName;
