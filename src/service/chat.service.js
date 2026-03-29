import prisma from "../lib/db.js";

export class ChatService {
  async createConversation(userId, mode = "chat", title = null) {
    const conversation = await prisma.conversation.create({
      data: {
        title: title || `New ${mode} conversation`,
        mode,
        user: {
          connect: { id: userId },
        },
      },
    });
    return conversation;
  }

  async getOrCreateConversations(userId, conversationId = null, mode = "chat") {
    if (conversationId) {
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          userId,
        },
        include: {
          messages: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });
      if (conversation) return conversation;
    }
    return await this.createConversation(userId, mode);
  }

  async addMessage(conversationId, role, content) {
    const contentStr =
      typeof content === "string" ? content : JSON.stringify(content);
    const message = await prisma.message.create({
      data: {
        role,
        content: contentStr,
        conversation: {
          connect: { id: conversationId },
        },
      },
    });
    return message;
  }

  parseContent(content) {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }

  async getMessages(conversationId) {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
    return messages.map((msg) => ({
      ...msg,
      content: this.parseContent(msg.content),
    }));
  }

  async getConversations(userId) {
    const conversations = await prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    });
    return conversations;
  }

  async deleteConversation(conversationId, userId) {
    return await prisma.conversation.delete({
      where: { id: conversationId, userId },
    });
  }

  async updateTitle(conversationId, title) {
    return await prisma.conversation.update({
      where: { id: conversationId },
      data: { title },
    });
  }

  formatMessagesForAI(messages) {
    return messages.map((msg) => ({
      role: msg.role,
      content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
    }));
  }
}
