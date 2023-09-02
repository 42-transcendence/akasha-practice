import { readFileSync } from "fs";
import * as yaml from "js-yaml";
import { join } from "path";

export const envFilePath = [".env"];
export const load = [loadFilename(".config.d/config.yaml")];

function loadFilename(filename: string) {
  return (): Record<string, any> =>
    yaml.load(readFileSync(join(__dirname, filename), "utf8")) as any;
}
