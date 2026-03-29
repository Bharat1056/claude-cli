import chalk from "chalk";
import boxen from "boxen";
import yoctoSpinner from "yocto-spinner";
import { text, isCancel, cancel, intro, outro, confirm } from "@clack/prompts";
import { AIService } from "../ai/google-service.js";
import { ChatService } from "../../service/chat.service.js";
import { getStoredToken } from "../../lib/token.js";
import { fetchUserFromAPI } from "../../lib/api-client.js";
import { generateApplication } from "../../config/agent.config.js";
import { saveMessage } from "./chat-with-ai.js";

const aiService = new AIService();
const chatService = new ChatService();

async function getUserFromToken() {
  const token = await getStoredToken();
  if (!token?.access_token) {
    throw new Error("Not Authenticated Please run 'claude login' first.");
  }

  const spinner = yoctoSpinner({ text: "Authenticating..." }).start();
  try {
    const user = await fetchUserFromAPI(token?.access_token, true);
    spinner.success(`Welcome back, ${user.name}!`);
    return user;
  } catch (error) {
    spinner.error("User not found");
    throw new Error("User not found please login again.");
  }
}

async function initConversation(userId, conversationId = null) {
  const spinner = yoctoSpinner({ text: "Loading conversation..." }).start();
  const conversation = await chatService.getOrCreateConversations(
    userId,
    conversationId,
    "agent",
  );
  spinner.success("Conversation loaded");
  const conversationInfo = boxen(
    `${chalk.bold("Conversation ID:")} ${conversation.id}\n` +
      `${chalk.gray("ID:")} ${conversation.id}\n` +
      `${chalk.gray("Mode:")} ${chalk.magenta("Agent (Code Generator)")}\n` +
      `${chalk.cyan("Working Directory:")} ${process.cwd()}`,
    {
      padding: 1,
      margin: { top: 1, bottom: 1 },
      borderStyle: "round",
      borderColor: "magenta",
      title: "🤖 Agent Mode",
      titleAlignment: "center",
    },
  );
  console.log(conversationInfo);
  return conversation;
}

async function agentLoop(conversation) {
  const helpBox = boxen(
    `${chalk.cyan.bold("What can the agent do?")}\n\n` +
      `${chalk.gray("• Generate complete applications from descriptions")}\n` +
      `${chalk.gray("• Create all necessary files and folders")}\n` +
      `${chalk.gray("• Include setup instructions and commands")}\n` +
      `${chalk.gray("• Generate production-ready code")}\n\n` +
      `${chalk.yellow.bold("Examples:")}\n` +
      `${chalk.white('• "Build a todo app with React and Tailwind"')}\n` +
      `${chalk.white('• "Create a REST API with Express and MongoDB"')}\n` +
      `${chalk.white('• "Make a weather app using OpenWeatherMap API"')}\n\n` +
      `${chalk.gray('Type "exit" to end the session')}`,
    {
      padding: 1,
      margin: { bottom: 1 },
      borderStyle: "round",
      borderColor: "cyan",
      title: "💡 Agent Instructions",
    },
  );

  console.log(helpBox);

  while (true) {
    const userInput = await text({
      message: chalk.magenta("You: "),
      placeholder: "Type your message here...",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Message cannot be empty";
        }
        if (value.trim().length < 10) {
          return "Please provide a more detailed description (at least 10 characters)";
        }
      },
    });

    if (isCancel(userInput)) {
      console.log(chalk.yellow("\n Agent session cancelled\n"));
      process.exit(0);
    }

    if (userInput.toLowerCase() === "exit") {
      console.log(chalk.yellow("\n Agent session ended\n"));
      break;
    }

    const userBox = boxen(chalk.white(userInput), {
      padding: 1,
      margin: { top: 1, bottom: 1 },
      borderStyle: "round",
      borderColor: "blue",
      title: "👤 Your Request",
      titleAlignment: "left",
    });
    console.log(userBox);

    await saveMessage(conversation.id, "user", userInput);

    try {
      const result = await generateApplication(
        userInput,
        aiService,
        process.cwd(),
      );

      if (result && result.success) {
        const responseMessage =
          `Generated application: ${result.folderName}\n` +
          `Files created: ${result.files.length}\n` +
          `Location: ${result.appDir}\n\n` +
          `Setup commands:\n${result.commands.join("\n")}`;

        await saveMessage(conversation.id, "assistant", responseMessage);

        // Ask if user wants to generate another app
        const continuePrompt = await confirm({
          message: chalk.cyan(
            "Would you like to generate another application?",
          ),
          initialValue: false,
        });

        if (isCancel(continuePrompt) || !continuePrompt) {
          console.log(chalk.yellow("\n Great! Check your new application!\n"));
          break;
        }
      } else {
        throw new Error("Generation returned no result");
      }
    } catch (error) {
      console.log(chalk.red(`\n❌ Error: ${error.message}\n`));

      await saveMessage(
        conversation.id,
        "assistant",
        `Error: ${error.message}`,
      );

      const retry = await confirm({
        message: chalk.cyan("Would you like to try again?"),
        initialValue: true,
      });

      if (isCancel(retry) || !retry) {
        break;
      }
    }
  }
}

export async function startAgentChat(conversationId = null) {
  try {
    intro(
      boxen(
        chalk.bold.magenta("Claude AI - Agent Mode\n\n") +
          chalk.gray("Autonomous Application Generator"),
        {
          padding: 1,
          borderStyle: "double",
          borderColor: "magenta",
        },
      ),
    );

    const user = await getUserFromToken();
    const shouldContinue = await confirm({
      message: chalk.yellow(
        "The agent will create files and folders in the current directory. Do you want to continue?",
      ),
      initialValue: true,
    });

    if (isCancel(shouldContinue) || !shouldContinue) {
      cancel(chalk.yellow("Agent mode cancelled"));
      process.exit(0);
    }

    const conversation = await initConversation(user.id, conversationId);
    await agentLoop(conversation);

    outro(chalk.green.bold("\n Thanks for using Agent Mode!"));
  } catch (error) {}
}
