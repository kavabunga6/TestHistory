import { schemaBasePart01 } from "./mcpSchemaBasePart01.js";
import { schemaBasePart02 } from "./mcpSchemaBasePart02.js";
import { schemaBasePart03 } from "./mcpSchemaBasePart03.js";
import { schemaBasePart04 } from "./mcpSchemaBasePart04.js";
import { schemaBasePart05 } from "./mcpSchemaBasePart05.js";
import { schemaBasePart06 } from "./mcpSchemaBasePart06.js";
import { schemaBasePart07 } from "./mcpSchemaBasePart07.js";
import { schemaBasePart08 } from "./mcpSchemaBasePart08.js";
import { schemaBasePart09 } from "./mcpSchemaBasePart09.js";
import { schemaBasePart10 } from "./mcpSchemaBasePart10.js";
import { schemaBasePart11 } from "./mcpSchemaBasePart11.js";
import { schemaBasePart12 } from "./mcpSchemaBasePart12.js";
import { createSchemaExtensions } from "./mcpSchemaExtensions.js";

export function createSchemas() {
  const baseSchemas = {
    ...schemaBasePart01,
    ...schemaBasePart02,
    ...schemaBasePart03,
    ...schemaBasePart04,
    ...schemaBasePart05,
    ...schemaBasePart06,
    ...schemaBasePart07,
    ...schemaBasePart08,
    ...schemaBasePart09,
    ...schemaBasePart10,
    ...schemaBasePart11,
    ...schemaBasePart12
  } as Record<string, any>;

  return {
    ...baseSchemas,
    ...createSchemaExtensions(baseSchemas)
  };
}

export const schemas = createSchemas();

export type SchemaName = keyof typeof schemas;
