#!/usr/bin/env node

import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper";
import { logger, parseEnvValue } from "@prisma/internals";

import { prettyFile, writeFile } from "./library/pretty";

import onGenerateEnum from "./generator/generate-enum";
import onGenerateModel from "./generator/generate-model";

generatorHandler({
  onManifest() {
    logger.info("                                                ");
    logger.info("░█████╗░██╗░░██╗░█████╗░░██████╗██╗░░██╗░█████╗░");
    logger.info("██╔══██╗██║░██╔╝██╔══██╗██╔════╝██║░░██║██╔══██╗");
    logger.info("███████║█████═╝░███████║╚█████╗░███████║███████║");
    logger.info("██╔══██║██╔═██╗░██╔══██║░╚═══██╗██╔══██║██╔══██║");
    logger.info("██║░░██║██║░╚██╗██║░░██║██████╔╝██║░░██║██║░░██║");
    logger.info("╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░╚═╝╚═════╝░╚═╝░░╚═╝╚═╝░░╚═╝");
    logger.info("                                                ");
    logger.info("▄▀█ █▄▀ ▄▀█ █▀ █░█ ▄▀█ ▄▄ █▀█ █▀█ █ █▀ █▀▄▀█ ▄▀█");
    logger.info("█▀█ █░█ █▀█ ▄█ █▀█ █▀█ ░░ █▀▀ █▀▄ █ ▄█ █░▀░█ █▀█");
    logger.info("                                                ");
    logger.info("      █▀▀ █▀▀ █▄░█ █▀▀ █▀█ ▄▀█ ▀█▀ █▀█ █▀█      ");
    logger.info("      █▄█ ██▄ █░▀█ ██▄ █▀▄ █▀█ ░█░ █▄█ █▀▄      ");

    return {
      defaultOutput: "../generated",
      prettyName: "akasha-prisma-generator",
      version: "1.0.0",
    };
  },
  async onGenerate(options: GeneratorOptions) {
    if (options.generator.output === null) {
      throw new Error();
    }

    const outFilePath = parseEnvValue(options.generator.output);

    await writeFile(
      outFilePath,
      `
/**
 *                                                  
 *  ░█████╗░██╗░░██╗░█████╗░░██████╗██╗░░██╗░█████╗░
 *  ██╔══██╗██║░██╔╝██╔══██╗██╔════╝██║░░██║██╔══██╗
 *  ███████║█████═╝░███████║╚█████╗░███████║███████║
 *  ██╔══██║██╔═██╗░██╔══██║░╚═══██╗██╔══██║██╔══██║
 *  ██║░░██║██║░╚██╗██║░░██║██████╔╝██║░░██║██║░░██║
 *  ╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░╚═╝╚═════╝░╚═╝░░╚═╝╚═╝░░╚═╝
 *                                                  
 * > This file is auto-generated. Don't modify it. <
 *                                                  
 *  ▄▀█ █▄▀ ▄▀█ █▀ █░█ ▄▀█ ▄▄ █▀█ █▀█ █ █▀ █▀▄▀█ ▄▀█
 *  █▀█ █░█ █▀█ ▄█ █▀█ █▀█ ░░ █▀▀ █▀▄ █ ▄█ █░▀░█ █▀█
 *                                                  
 *        █▀▀ █▀▀ █▄░█ █▀▀ █▀█ ▄▀█ ▀█▀ █▀█ █▀█      
 *        █▄█ ██▄ █░▀█ ██▄ █▀▄ █▀█ ░█░ █▄█ █▀▄      
 */

export type JsonObject = {[Key in string]?: JsonValue}
export interface JsonArray extends Array<JsonValue> {}
export type JsonValue = string | number | boolean | JsonObject | JsonArray | null
`,
    );

    await onGenerateEnum(options, outFilePath);
    await onGenerateModel(options, outFilePath);

    await prettyFile(outFilePath);
  },
});
