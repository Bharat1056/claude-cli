import chalk from "chalk";
import boxen from "boxen";
import {
  text,
  isCancel,
  cancel,
  intro,
  outro,
  multiselect,
} from "@clack/prompts";
import yoctoSpinner from "yocto-spinner";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { AIService } from "../ai/google-service.js";
import { ChatService } from "../../service/chat.service.js";
import { getStoredToken } from "../../lib/token.js";
import { fetchUserFromAPI } from "../../lib/api-client.js";
import {
  avaiableTools,
  enableTools,
  getEnabledToolNames,
  getEnabledTools,
  resetTools,
} from "../../config/tool.config.js";
import {
  displayMessages,
  saveMessage,
  updateConversationTitle,
} from "./chat-with-ai.js";

marked.use(
  markedTerminal({
    code: chalk.cyan,
    blockquote: chalk.gray.italic,
    heading: chalk.green.bold,
    firstHeading: chalk.magenta.underline.bold,
    hr: chalk.reset,
    listitem: chalk.reset,
    list: chalk.reset,
    paragraph: chalk.reset,
    strong: chalk.bold,
    em: chalk.italic,
    codespan: chalk.yellow.bgBlack,
    del: chalk.dim.gray.strikethrough,
    link: chalk.blue.underline,
    href: chalk.blue.underline,
  }),
);

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

async function selectTools() {
  const toolOptions = avaiableTools.map((tool) => ({
    value: tool.id,
    label: tool.name,
    hint: tool.description,
  }));

  const selectedTools = await multiselect({
    message: chalk.cyan(
      "Select tools to enable (Space to select, Enter to confirm): ",
    ),
    options: toolOptions,
    required: false,
  });

  if (isCancel(selectedTools)) {
    cancel(chalk.yellow("Tool selection cancelled."));
    process.exit(0);
  }

  enableTools(selectedTools);

  if (selectedTools.length === 0) {
    console.log(
      chalk.yellow("\n⚠️ No tools selected. AI will work without tools.\n"),
    );
  } else {
    const toolsBox = boxen(
      chalk.green(
        `Enabled tools:\n${selectedTools
          .map((id) => {
            const tool = avaiableTools.find((t) => t.id === id);
            return ` - ${tool.name}`;
          })
          .join("\n")}`,
      ),
      {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderStyle: "round",
        borderColor: "green",
        title: "Active Tools",
        titleAlignment: "center",
      },
    );
    console.log(toolsBox);
  }
  return selectedTools.length > 0;
}

async function getAIResponse(conversationId) {
  const spinner = yoctoSpinner({
    text: "Claude is thinking...",
    color: "cyan",
  }).start();
  const dbMessages = await chatService.getMessages(conversationId);
  const aiMessages = await chatService.formatMessagesForAI(dbMessages);

  const tools = getEnabledTools();

  let fullResponse = "";
  let isFirstChunk = true;
  const toolCallIsDetected = [];

  try {
    const result = await aiService.sendMessage(
      aiMessages,
      (chunk) => {
        if (isFirstChunk) {
          spinner.stop();
          console.log("\n");
          const header = chalk.green.bold("🤖 Claude:");
          console.log(header);
          console.log(chalk.gray("-".repeat(60)));
        }

        fullResponse += chunk;
      },
      tools,
      (toolCall) => {
        toolCallIsDetected.push(toolCall);
      },
    );

    if (toolCallIsDetected.length > 0) {
      console.log("\n");
      const toolCallBox = boxen(
        toolCallIsDetected
          .map(
            (tc) =>
              `${chalk.cyan("Tool:")} ${tc.toolName}\n${chalk.gray("Args:")} ${JSON.stringify(tc.args, null, 2)}`,
          )
          .join("\n\n"),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "cyan",
          title: "Tool Calls",
        },
      );
      console.log(toolCallBox);
    }

    console.log("\n");
    const renderedMarkdown = marked.parse(fullResponse);
    console.log(renderedMarkdown);
    console.log(chalk.gray("-".repeat(60)));
    console.log("\n");
    return result.content;
  } catch (error) {
    spinner.error("Failed to get AI response");
    throw error;
  } finally {
    spinner.stop();
  }
}

async function initCnnversation(userId, conversationId = null, mode = "tool") {
  const spinner = yoctoSpinner({ text: "Loading conversation..." }).start();

  const conversation = await chatService.getOrCreateConversations(
    userId,
    conversationId,
    mode,
  );
  spinner.success("Conversation loaded");

  const enabledToolNames = getEnabledToolNames();
  const toolsDisplay =
    enabledToolNames.length > 0
      ? `\n${chalk.gray("Active Tools:")} ${enabledToolNames.join(", ")}`
      : `\n${chalk.gray("No tools enabled.")}`;

  const conversationInfo = boxen(
    `${chalk.bold("Conversation")}: ${conversation.title}\n${chalk.gray("ID: " + conversation.id)}\n${chalk.gray("Mode: " + conversation.mode)}${toolsDisplay}`,
    {
      padding: 1,
      margin: { top: 1, bottom: 1 },
      borderStyle: "round",
      borderColor: "cyan",
      title: "💭 Tool Calling Session",
      titleAlignment: "center",
    },
  );

  console.log(conversationInfo);

  if (conversation?.messages?.length > 0) {
    console.log(chalk.yellow("📜 Previous messages:\n"));
    displayMessages(conversation.messages);
  }

  return conversation;
}

async function chatLoop(conversation) {
  const enabledToolNames = getEnabledToolNames();
  const helpBox = boxen(
    `${chalk.gray("- Type your message and press Enter")}\n${chalk.gray("- AI has access to: ")} ${enabledToolNames.length > 0 ? enabledToolNames.join(", ") : "No tools"}\n${chalk.gray('- Type "exit" to end conversation')}\n${chalk.gray("- Press Ctrl+C to quit at any time")}`,
    {
      padding: 1,
      margin: { bottom: 1 },
      borderStyle: "round",
      borderColor: "gray",
      dimBorder: true,
    },
  );
  console.log(helpBox);

  while (true) {
    const userInput = await text({
      message: chalk.blue("You: "),
      placeholder: "Type your message here...",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Message cannot be empty";
        }
      },
    });

    if (isCancel(userInput)) {
      const exitBox = boxen(chalk.yellow("Chat session ended. Goodbye! 👋"), {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "yellow",
      });
      console.log(exitBox);
      process.exit(0);
    }

    if (userInput.toLowerCase() === "exit") {
      const exitBox = boxen(chalk.yellow("Chat session ended. Goodbye! 👋"), {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "yellow",
      });
      console.log(exitBox);
      break;
    }

    await saveMessage(conversation.id, "user", userInput);
    const messages = await chatService.getMessages(conversation.id);

    const aiResponse = await getAIResponse(conversation.id);
    await saveMessage(conversation.id, "assistant", aiResponse);

    await updateConversationTitle(conversation.id, userInput, messages.length);
  }
}

export async function startToolChat(conversationId = null) {
  try {
    intro(
      boxen(chalk.bold.cyan("Claude AI - Tool Calling Mode"), {
        padding: 1,
        borderStyle: "double",
        borderColor: "cyan",
      }),
    );

    const user = await getUserFromToken();
    await selectTools();

    const conversation = await initCnnversation(
      user.id,
      conversationId,
      "tool",
    );
    await chatLoop(conversation);
    resetTools();

    outro(chalk.green.bold("Thanks for using tools. Goodbye!"));
  } catch (error) {
    const errorBox = boxen(chalk.red(`❌ Error: ${error?.message}`), {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "red",
    });

    console.log(errorBox);
    resetTools();
    process.exit(1);
  }
}
