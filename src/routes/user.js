import prisma from "../lib/db.js";
import { Router } from "express";

const router = Router();

/**
 * GET /api/user/me
 * Get current user from session token
 * Query params: token (access token from session)
 * Returns: User object { id, name, email, image }
 */
router.get("/me", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const user = await prisma.user.findFirst({
      where: {
        sessions: {
          some: {
            token: token,
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

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/user/me/full
 * Get full current user object from session token (with all fields)
 * Query params: token (access token from session)
 * Returns: Full User object
 */
router.get("/me/full", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const user = await prisma.user.findFirst({
      where: {
        sessions: {
          some: {
            token: token,
          },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
