"use strict";

import { Router } from "express";
const router = Router();

// POST /notifications - create a notification (called from frontend pushNotification)
router.post("/", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }

    const db = req.app.locals.db;
    const actor = req.session.username; // always the logged-in user — never trust an actor field from the body
    const { recipient, type, postId } = req.body;

    if (!recipient || !type) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    if (recipient === actor) {
        // Don't notify yourself
        return res.json({ success: true });
    }

    try {
        // Block gate - if either side has blocked the other, never create the notification.
        const blockRelation = await db.collection("blocked").findOne({
            $or: [
                { username: recipient, blockedUsers: actor },
                { username: actor, blockedUsers: recipient }
            ]
        });
        if (blockRelation) {
            return res.json({ success: true });
        }

        // Remove existing unread duplicates for follow types
        if (type === "follow" || type === "follow_request" || type === "follow_accept") {
            await db.collection("notifications").deleteMany({
                recipient,
                type,
                actors:    { $elemMatch: { $eq: actor } },
                read: false
            });
        }

        // Group engagement notifications per post
        if (type === "like" || type === "comment" || type === "rating") {
            const existing = await db.collection("notifications").findOne({
                recipient,
                type,
                postId: postId || null,
                read: false
            });

            if (existing) {
                if (existing.actors.indexOf(actor) === -1) {
                    await db.collection("notifications").updateOne(
                        { _id: existing._id },
                        {
                            $push: { actors: actor },
                            $set:  { timestamp: new Date() }
                        }
                    );
                }
                return res.json({ success: true });
            }
        }

        await db.collection("notifications").insertOne({
            recipient,
            type,
            actors: [actor],
            postId: postId || null,
            timestamp: new Date(),
            read: false
        });

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: "Could not create notification." });
    }
});

// GET /notifications - get all for current user
router.get("/", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;
    const me = req.session.username;

    try {
        const notifications = await db.collection("notifications")
            .find({ recipient: me })
            .sort({ timestamp: -1 })
            .toArray();
        res.json(notifications);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch notifications." });
    }
});

// PUT /notifications/read - mark all as read
router.put("/read", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;

    try {
        await db.collection("notifications").updateMany(
            { recipient: req.session.username, read: false },
            { $set: { read: true } }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Could not mark notifications as read." });
    }
});

export default router;