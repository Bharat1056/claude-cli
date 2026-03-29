import { cancel, confirm, intro, isCancel, outro } from "@clack/prompts";
import { logger } from "better-auth";
import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";

import chalk from "chalk";
import { Command } from "commander";
import fs from "node:fs/promises";
import open from "open";
import os from "os";
import path from "path";
import yoctoSpinner from "yocto-spinner";
import * as z from "zod/v4";
import prisma from "../../../lib/db.js";
import dotenv from "dotenv";
import {
  clearStoredToken,
  getStoredToken,
  isTokenExpired,
  requireAuth,
  storeToken,
} from "../../../lib/token.js";

dotenv.config();

const URL = process.env.BASE_URL;
const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
export const CONFIG_DIR = path.join(os.homedir(), ".better-auth");
export const TOKEN_FILE = path.join(CONFIG_DIR, "token.json");

export async function loginAction(opts) {
  const options = z.object({
    serverUrl: z.string().optional(),
    clientId: z.string().optional(),
  });

  const serverUrl = options.serverUrl || URL;
  const clientId = options.clientId || CLIENT_ID;

  intro(chalk.bold("🔐 Auth CLI Login"));

  // TODO: CHANGE THIS WITH TOKEN MANAGEMENT UTILS
  const existingToken = await getStoredToken();
  const expired = await isTokenExpired();

  if (existingToken && !expired) {
    const shouldReAuth = await confirm({
      message: "You are already logged in. Do you want to log in again?",
      initialValue: false,
    });

    if (isCancel(shouldReAuth) || !shouldReAuth) {
      cancel("Login cancelled.");
      process.exit(0);
    }
  }

  const authClient = createAuthClient({
    baseURL: serverUrl,
    plugins: [deviceAuthorizationClient()],
  });

  const spinner = yoctoSpinner({ text: "Requesting device authorization..." });
  spinner.start();

  try {
    const { data, error } = await authClient.device.code({
      client_id: clientId,
      scope: "openid profile email",
    });
    spinner.stop();

    if (error || !data) {
      logger.error(
        `Failed to request device authorization: ${error?.error_description}`,
      );
      process.exit(1);
    }

    const {
      device_code,
      user_code,
      verification_uri,
      expires_in,
      interval = 5,
      verification_uri_complete,
    } = data;

    console.log(chalk.cyan("Device Authorization Required!"));
    console.log(
      `Please visit ${chalk.underline.blue(verification_uri || verification_uri_complete)}`,
    );
    console.log(`Enter Code: ${chalk.bold.green(user_code)}`);

    const shouldOpen = await confirm({
      message: "Open browser automatically",
      initialValue: true,
    });

    if (!isCancel(shouldOpen) && shouldOpen) {
      const urlToOpen = verification_uri_complete || verification_uri;
      await open(urlToOpen);
    }

    console.log(
      chalk.gray(
        `Waiting for authorization... (expires in ${Math.floor(expires_in / 60)} minutes)...`,
      ),
    );

    const token = await pollForToken(
      authClient,
      device_code,
      clientId,
      interval,
    );

    if (token) {
      const saved = await storeToken(token);
      if (!saved) {
        console.log(
          chalk.yellow("\n ⚠️ Warning: Could not save authentication token."),
        );
        console.log(chalk.yellow("You may need to login again on next use."));
      }

      // TODO: get the user Data

      outro(chalk.green("Login successful!"));
      console.log(chalk.gray(`\n Token saved to: ${TOKEN_FILE}`));
      console.log(
        chalk.gray("You can now use AI commands without loggin in again. \n"),
      );
    }
  } catch (error) {
    spinner.stop();
    console.error(chalk.red("\nLogin failed: "), error?.message);
    process.exit(1);
  }
}

async function pollForToken(
  authClient,
  deviceCode,
  clientId,
  initialIntervalValue,
) {
  let pollingInterval = initialIntervalValue;
  const spinner = yoctoSpinner({ text: "", color: "cyan" });

  let dots = 0;

  return new Promise((resolve, reject) => {
    const poll = async () => {
      dots = (dots + 1) % 4;
      spinner.text = chalk.gray(
        `Polling for authorization${".".repeat(dots)}${" ".repeat(3 - dots)}`,
      );

      if (!spinner.isSpinning) spinner.start();

      try {
        const { data, error } = await authClient.device.token({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: deviceCode,
          client_id: clientId,
          fetchOptions: {
            headers: {
              "user-agent": `My CLI`,
            },
          },
        });

        if (data?.access_token) {
          console.log(
            chalk.bold.yellow(`Your access token: ${data.access_token}`),
          );
          spinner.stop();
          resolve(data);
          return;
        } else if (error) {
          switch (error.error) {
            case "authorization_pending":
              // Continue polling
              break;
            case "slow_down":
              pollingInterval += 5;
              break;
            case "access_denied":
              console.error("Access was denied by the user");
              return;
            case "expired_token":
              console.error("The device code has expired. Please try again.");
              return;
            default:
              spinner.stop();
              logger.error(`Error: ${error.error_description}`);
              process.exit(1);
          }
        }
      } catch (error) {
        spinner.stop();
        logger.error(`Netowork Error: ${error.message}`);
        process.exit(1);
      }

      setTimeout(poll, pollingInterval * 1000);
    };

    setTimeout(poll, pollingInterval * 1000);
  });
}

export async function logoutAction() {
  intro(chalk.bold("👋 Logout"));

  const token = await getStoredToken();
  if (!token) {
    console.log(chalk.yellow("You are not logged in."));
    process.exit(0);
  }

  const shouldLogout = await confirm({
    message: "Are you sure you want to log out?",
    initialValue: false,
  });

  if (isCancel(shouldLogout) || !shouldLogout) {
    cancel("Logout cancelled.");
    process.exit(0);
  }

  const cleared = await clearStoredToken();

  if (cleared) {
    outro(chalk.green("Successfully logged out!"));
  } else {
    console.log(
      chalk.yellow("⚠️ Warning: Could not clear authentication token."),
    );
  }
}

export async function whoamiAction(opts) {
  const token = await requireAuth();
  if (!token.access_token) {
    console.log("No access token found. Please login.");
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: {
      sessions: {
        some: {
          token: token.access_token,
        },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
    },
  });

  console.log(
    chalk.bold.greenBright(
      `\n👤 User: ${user.name} Email: ${user.email} ID: ${user.id}`,
    ),
  );
}

export const login = new Command("login")
  .description("Login to your account")
  .option("--server-url <url>", "URL of the authentication server")
  .option("--client-id <id>", "Client ID for authentication")
  .action(loginAction);

export const logout = new Command("logout")
  .description("Logout of your account")
  .action(logoutAction);

export const whoami = new Command("whoami")
  .description("Display information about the current user")
  .option("--server-url <url>", "URL of the authentication server")
  .action(whoamiAction);
