import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { telegramChannels } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { encryptToken, decryptToken } from "../lib/encrypt";
import {
  CreateTelegramChannelBody,
  UpdateTelegramChannelBody,
  UpdateTelegramChannelParams,
  DeleteTelegramChannelParams,
  SendTelegramMessageBody,
} from "@workspace/api-zod";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.userId = userId;
  next();
}

// GET /api/telegram/channels
router.get("/channels", requireAuth, async (req: any, res) => {
  try {
    const rows = await db
      .select({
        id: telegramChannels.id,
        name: telegramChannels.name,
        chatId: telegramChannels.chatId,
        createdAt: telegramChannels.createdAt,
      })
      .from(telegramChannels)
      .where(eq(telegramChannels.userId, req.userId));

    return res.json(
      rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list telegram channels");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/telegram/channels
router.post("/channels", requireAuth, async (req: any, res) => {
  const parsed = CreateTelegramChannelBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  try {
    const [row] = await db
      .insert(telegramChannels)
      .values({
        userId: req.userId,
        name: parsed.data.name,
        chatId: parsed.data.chatId,
        botToken: encryptToken(parsed.data.botToken),
      })
      .returning({
        id: telegramChannels.id,
        name: telegramChannels.name,
        chatId: telegramChannels.chatId,
        createdAt: telegramChannels.createdAt,
      });

    return res.status(201).json({
      ...row,
      createdAt: row.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create telegram channel");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/telegram/channels/:id
router.put("/channels/:id", requireAuth, async (req: any, res) => {
  const params = UpdateTelegramChannelParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const parsed = UpdateTelegramChannelBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  try {
    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.chatId !== undefined) updates.chatId = parsed.data.chatId;
    if (parsed.data.botToken !== undefined && parsed.data.botToken.length > 0) {
      updates.botToken = encryptToken(parsed.data.botToken);
    }

    const [row] = await db
      .update(telegramChannels)
      .set(updates)
      .where(
        and(
          eq(telegramChannels.id, params.data.id),
          eq(telegramChannels.userId, req.userId)
        )
      )
      .returning({
        id: telegramChannels.id,
        name: telegramChannels.name,
        chatId: telegramChannels.chatId,
        createdAt: telegramChannels.createdAt,
      });

    if (!row) {
      return res.status(404).json({ error: "Channel not found" });
    }

    return res.json({
      ...row,
      createdAt: row.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update telegram channel");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/telegram/channels/:id
router.delete("/channels/:id", requireAuth, async (req: any, res) => {
  const params = DeleteTelegramChannelParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    return res.status(400).json({ error: "Invalid id" });
  }

  try {
    const result = await db
      .delete(telegramChannels)
      .where(
        and(
          eq(telegramChannels.id, params.data.id),
          eq(telegramChannels.userId, req.userId)
        )
      )
      .returning({ id: telegramChannels.id });

    if (result.length === 0) {
      return res.status(404).json({ error: "Channel not found" });
    }

    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete telegram channel");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/telegram/send
router.post("/send", requireAuth, async (req: any, res) => {
  const parsed = SendTelegramMessageBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  try {
    const [channel] = await db
      .select()
      .from(telegramChannels)
      .where(
        and(
          eq(telegramChannels.id, parsed.data.channelId),
          eq(telegramChannels.userId, req.userId)
        )
      )
      .limit(1);

    if (!channel) {
      return res.status(404).json({ error: "Channel not found" });
    }

    // Decrypt token — never returned to clients, never logged
    const botToken = decryptToken(channel.botToken);
    // Send message server-side — bot token never leaves the server
    const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const tgRes = await fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: channel.chatId,
        text: parsed.data.text,
      }),
    });

    if (!tgRes.ok) {
      const body = await tgRes.text();
      req.log.warn({ status: tgRes.status, body }, "Telegram API error");
      return res.status(502).json({ error: "Telegram API error", detail: tgRes.status });
    }

    const tgJson = (await tgRes.json()) as { ok: boolean; result?: { message_id: number } };
    return res.json({
      ok: tgJson.ok,
      messageId: tgJson.result?.message_id ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to send telegram message");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
