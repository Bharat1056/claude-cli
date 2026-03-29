#!/usr/bin/env node

import dotenv from "dotenv";
import chalk from "chalk";
import figlet from "figlet";
import { Command } from "commander";
import { login, logout, whoami } from "./commands/auth/login.js";

dotenv.config();

async function main() {
  // Display banner
  console.log(
    chalk.cyan(
      figlet.textSync("Claude CLI", {
        horizontalLayout: "default",
        font: "Standard",
      }),
    ),
  );

  console.log(chalk.gray("A CLI based AI Tool \n"));

  const program = new Command("claude-cli");

  program
    .version("0.0.1")
    .description("A CLI based AI Tool")
    .addCommand(login)
    .addCommand(logout)
    .addCommand(whoami);

  program.action(() => {
    program.help();
  });

  program.parse();
}

main().catch((error) => {
  console.error(chalk.red("Error running Claude CLI:"), error);
  process.exit(1);
});
