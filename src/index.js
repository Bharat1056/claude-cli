import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import dotenv from "dotenv";
import { auth } from "./lib/auth.js";

dotenv.config();
const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    exposedHeaders: ["set-cookie"],
  }),
);

app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/device", async (req, res) => {
  const { user_code } = req.query;
  res.redirect(`${process.env.CORS_ORIGIN}/device?user_code=${user_code}`);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
