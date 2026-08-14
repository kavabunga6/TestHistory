import type { ToolDefinition } from "./mcpTypes.js";
import { toolDefinitionsPart01 } from "./mcpToolDefinitionsPart01.js";
import { toolDefinitionsPart02 } from "./mcpToolDefinitionsPart02.js";

export const tools = [
  ...toolDefinitionsPart01,
  ...toolDefinitionsPart02
] satisfies ToolDefinition[];
