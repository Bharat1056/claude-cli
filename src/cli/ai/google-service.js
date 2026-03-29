import { google } from "@ai-sdk/google";
import { generateObject, streamText, tool } from "ai";
import { config } from "../../config/google.config.js";
import chalk from "chalk";

export class AIService {
  constructor() {
    if (!config.googleApiKey) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY us not set in env");
    }

    this.model = google(config.model, {
      apiKey: config.googleApiKey,
    });
  }

  async sendMessage(message, onChunk, tools = undefined, onToolCall = null) {
    try {
      const streamConfig = {
        model: this.model,
        messages: message,
      };

      if (tools && Object.keys(tools).length > 0) {
        streamConfig.tools = tools;
        streamConfig.maxSteps = 5; // Allow Up to 5 tool call steps

        console.log(
          chalk.gray(`[DEBUG] Tools enabled: ${Object.keys(tools).join(", ")}`),
        );
      }

      const result = streamText(streamConfig);

      let fullResponse = "";
      for await (const chunk of result.textStream) {
        fullResponse += chunk;
        if (onChunk) onChunk(chunk);
      }

      const fullResult = result;

      const toolCalls = [];
      const toolResults = [];

      if (fullResult.steps && Array.isArray(fullResult.steps)) {
        for (const step of fullResult.steps) {
          if (step.toolCalls && step.toolCalls.length > 0) {
            for (const toolCall of step.toolCalls) {
              toolCalls.push(toolCall);
              if (onToolCall) {
                onToolCall(toolCall);
              }
            }
          }

          if (step.toolResults && step.toolResults.length > 0) {
            toolResults.push(...step.toolResults);
          }
        }
      }

      return {
        content: fullResponse,
        finishResponse: fullResult.finishReason,
        usage: fullResult.usage,
        toolCalls,
        toolResults,
        steps: fullResult.steps,
      };
    } catch (error) {
      console.error(chalk.red("AI Service Error: ", error?.message));
      throw error;
    }
  }

  async getMessage(message, tools = undefined) {
    let fullResponse = "";
    const result = await this.sendMessage(message, (chunk) => {
      fullResponse += chunk;
    });

    return result.content;
  }

  async generatedStructure(schema, prompt) {
    try {
      const result = await generateObject({
        model: this.model,
        schema,
        prompt,
      });

      return result.object;
    } catch (error) {
      console.error(
        chalk.red("AI Structured Generation Error: ", error?.message),
      );
      throw error;
    }
  }
}
