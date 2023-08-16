import fs from "fs/promises";
import path from "path";
import prettier from "prettier";

export async function makePrettyString(content: string): Promise<string> {
  const options = (await prettier.resolveConfig(process.cwd())) ?? {};
  const formatted = await prettier.format(content, {
    ...options,
    parser: "typescript",
  });
  return formatted;
}

export async function writeFile(file: string, content: any) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, "utf8");
}

export async function appendFile(file: string, content: any) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, content, "utf8");
}

export async function prettyFile(file: string) {
  const content = await fs.readFile(file, "utf8");
  const prettyContent = await makePrettyString(content);
  await fs.writeFile(file, prettyContent, "utf8");
}
