import { DMMF, GeneratorOptions } from "@prisma/generator-helper";
import { appendFile } from "../library/pretty";

export default async function (options: GeneratorOptions, outFilePath: string) {
  const schemaEnumTypes = options.dmmf.schema.enumTypes.model;
  if (schemaEnumTypes === undefined) {
    return;
  }

  for (const schemaEnumType of schemaEnumTypes) {
    const content = toTypeScript(schemaEnumType);
    await appendFile(outFilePath, content);
  }
}

function toTypeScript(type: DMMF.SchemaEnum): string {
  return `
export const ${type.name} = {
	${type.values.map((v) => `${v}: "${v}"`).join(",\n")}
} as const;

export type ${type.name} = (typeof ${type.name})[keyof typeof ${type.name}]\n

export const enum ${type.name}Number {
	${type.values.join(",\n")}
}

export function get${type.name}Number(value: ${type.name}): ${type.name}Number {
	switch (value) {
		${type.values
      .map(
        (v) => `
		case ${type.name}.${v}:
			return ${type.name}Number.${v};
`,
      )
      .join("")}
	}
}

export function get${type.name}FromNumber(number: ${type.name}Number): ${
    type.name
  } {
	switch (number) {
		${type.values
      .map(
        (v) => `
		case ${type.name}Number.${v}:
			return ${type.name}.${v};
`,
      )
      .join("")}
	}
}
`;
}
