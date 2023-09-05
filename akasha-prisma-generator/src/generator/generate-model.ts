import { DMMF, GeneratorOptions } from "@prisma/generator-helper";
import { appendFile } from "../library/pretty";

export default async function (options: GeneratorOptions, outFilePath: string) {
  const models = options.dmmf.datamodel.models;
  const types = options.dmmf.datamodel.types;
  void types;
  for (const model of models) {
    const content = toTypeScript(model);
    await appendFile(outFilePath, content);
  }
}

function toTypeScript(model: DMMF.Model): string {
  const fields = model.fields
    .filter((v) => v.kind === "scalar" || v.kind === "enum")
    .map((v) => new Field(v));
  const fieldsFull = model.fields.map((v) => new Field(v));
  return `
export type ${model.name}Entity = {
	${fields.map((v) => v.toTypeScript()).join(";\n")}
}

export type ${model.name}Model = {
	${fieldsFull.map((v) => v.toTypeScript()).join(";\n")}
}
`;
}

class Field {
  static readonly GRAPHQL_SCALAR_TO_JS_TYPE_TABLE: Record<string, string> = {
    String: "string",
    Int: "number",
    Float: "number",
    Boolean: "boolean",
    Long: "number",
    DateTime: "Date",
    ID: "string",
    UUID: "string",
    Json: "JsonValue",
    Bytes: "Uint8Array",
    Decimal: "Decimal",
    BigInt: "bigint",
  };

  static toJSTypeName(type: string, kind: string) {
    switch (kind) {
      case "object":
        return `${type}Model`;
      case "enum":
        return `${type}Number`;
      case "scalar":
        return Field.GRAPHQL_SCALAR_TO_JS_TYPE_TABLE[type] ?? type;
    }
    throw new Error("unsupported");
  }

  constructor(private readonly field: DMMF.Field) {}

  toTypeScript() {
    const {
      field: { name, type, kind, isList, isRequired },
    } = this;
    const fieldTypeName =
      Field.toJSTypeName(type, kind) +
      (isList ? "[]" : isRequired ? "" : " | null");
    return `${name}: ${fieldTypeName}`;
  }
}
