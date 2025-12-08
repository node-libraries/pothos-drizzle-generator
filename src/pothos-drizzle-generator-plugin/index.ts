import SchemaBuilder from "@pothos/core";
import { PothosDrizzleGeneratorPlugin } from "./PothosDrizzleGeneratorPlugin.js";
export * from "./global-types.js";

const pluginName = "pothosDrizzleGenerator" as const;
const allowPluginReRegistration = SchemaBuilder.allowPluginReRegistration;
SchemaBuilder.allowPluginReRegistration = true;
SchemaBuilder.registerPlugin(pluginName, PothosDrizzleGeneratorPlugin);
SchemaBuilder.allowPluginReRegistration = allowPluginReRegistration;
export default pluginName;
