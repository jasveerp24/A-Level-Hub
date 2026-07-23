"use strict";

import { Router } from "express";
const router = Router();

// Filters messages the viewer should not see:
// 1. Messages from anyone currently in the viewer's blocked list.
// 2. Messages tagged blockedDuring:true
function filterBlockedMessages(messages, blockedList, viewer) {
    if (!messages || messages.length === 0) {
        return messages || [];
    }

    return messages.filter(function(m) {
        if (!m || !m.from) {
            return true;
        }

        // Currently blocked
        if (blockedList && blockedList.indexOf(m.from) !== -1) {
            return false;
        }

        // Sent during a block period - permanently hidden
        if (m.blockedDuring === true && m.from !== viewer) {
            return false;
        }

        return true;
    });
}

// GET /conversations - get all conversations for current user
router.get("/", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;
    const me = req.session.username;

    try {
        const [conversations, blockedDoc] = await Promise.all([
            db.collection("conversations").find({ participants: me }).sort({ updatedAt: -1 }).toArray(),
            db.collection("blocked").findOne({ username: me })
        ]);

        const blockedList = blockedDoc ? blockedDoc.blockedUsers : [];

        const filtered = conversations.map(function(conv) {
            try {
                return {
                    ...conv,
                    messages: filterBlockedMessages(conv.messages, blockedList, me)
                };
            } catch (e) {
                return conv;
            }
        });

        res.json(filtered);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch conversations." });
    }
});

// POST /conversations - create or get existing conversation
router.post("/", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;
    const me = req.session.username;
    const other = req.body.with;

    if (!other) {
        return res.status(400).json({ error: "Missing 'with' field." });
    }

    const participants = [me, other].sort();
    const key = "chat_" + participants[0] + "_" + participants[1];

    try {
        let conv = await db.collection("conversations").findOne({ key });

        if (!conv) {
            const result = await db.collection("conversations").insertOne({
                key,
                participants,
                mutedBy: [],
                messages: [],
                createdAt: new Date(),
                updatedAt: new Date()
            });
            conv = await db.collection("conversations").findOne({
                _id: result.insertedId
            });
        }

        res.json(conv);
    } catch (err) {
        res.status(500).json({ error: "Could not get conversation." });
    }
});

// GET /conversations/:key - get one specific conversation
router.get("/:key", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;
    const me = req.session.username;

    try {
        const [conv, blockedDoc] = await Promise.all([
            db.collection("conversations").findOne({ key: req.params.key }),
            db.collection("blocked").findOne({ username: me })
        ]);

        if (!conv) {
            return res.status(404).json({ error: "Conversation not found." });
        }

        if (conv.participants.indexOf(me) === -1) {
            return res.status(403).json({ error: "Not your conversation." });
        }

        const blockedList = blockedDoc ? blockedDoc.blockedUsers : [];

        let filteredConv;
        try {
            filteredConv = {
                ...conv,
                messages: filterBlockedMessages(conv.messages, blockedList, me)
            };
        } catch (e) {
            filteredConv = conv;
        }

        res.json(filteredConv);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch conversation." });
    }
});

// POST /conversations/:key/messages - send a message
router.post("/:key/messages", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;
    const me = req.session.username;
    const text = req.body.text;

    if (!text || !text.trim()) {
        return res.status(400).json({ error: "Message cannot be empty." });
    }

    try {
        const conv = await db.collection("conversations").findOne({ key: req.params.key });

        if (!conv) {
            return res.status(404).json({ error: "Conversation not found." });
        }

        if (conv.participants.indexOf(me) === -1) {
            return res.status(403).json({ error: "Not your conversation." });
        }

        const other = conv.participants.find(function(p) { return p !== me; });

        // Check if the recipient has blocked the sender at this moment.
        // If so, tag the message so it can be permanently filtered out
        // on the recipient's read
        let blockedDuring = false;
        if (other) {
            const recipientBlockedSender = await db.collection("blocked").findOne({
                username: other, blockedUsers: me
            });
            if (recipientBlockedSender) {
                blockedDuring = true;
            }
        }

        const newMsg = {
            from: me,
            text: text.trim(),
            timestamp: new Date().toISOString(),
            read: false,
            likes: [],
            blockedDuring: blockedDuring
        };

        if (req.body.replyTo) {
            newMsg.replyTo = req.body.replyTo;
        }

        await db.collection("conversations").updateOne(
            { key: req.params.key },
            {
                $push: { messages: newMsg },
                $set: { updatedAt: new Date() }
            }
        );
        res.status(201).json({ success: true, message: newMsg });
    } catch (err) {
        res.status(500).json({ error: "Could not send message." });
    }
});

// PUT /conversations/:key/messages/like - toggle like on a message
router.put("/:key/messages/like", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;
    const me = req.session.username;
    const timestamp = req.body.timestamp;

    try {
        const conv = await db.collection("conversations").findOne({ key: req.params.key });
        if (!conv) {
            return res.status(404).json({ error: "Conversation not found." });
        }

        const msg = conv.messages.find(function(m) { return m.timestamp === timestamp; });
        if (!msg) {
            return res.status(404).json({ error: "Message not found." });
        }

        if (conv.participants.indexOf(me) === -1) {
            return res.status(403).json({ error: "Not your conversation." });
        }

        if (!msg.likes) { msg.likes = []; }

        const idx = msg.likes.indexOf(me);
        if (idx !== -1) {
            msg.likes.splice(idx, 1);
        } else {
            msg.likes.push(me);
        }

        await db.collection("conversations").updateOne(
            { key: req.params.key },
            { $set: { messages: conv.messages } }
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Could not toggle like." });
    }
});

// PUT /conversations/:key/read - mark all messages as read
router.put("/:key/read", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;
    const me = req.session.username;

    try {
        await db.collection("conversations").updateOne(
            { key: req.params.key, participants: me },
            { $set: { "messages.$[msg].read": true } },
            { arrayFilters: [{ "msg.from": { $ne: me } }] }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Could not mark as read." });
    }
});

// PUT /conversations/:key/mute - toggle mute
router.put("/:key/mute", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db      = req.app.locals.db;
    const me      = req.session.username;
    const convKey = req.params.key;

    try {
        const conv = await db.collection("conversations").findOne({ key: convKey });
        if (!conv) {
            return res.status(404).json({ error: "Conversation not found." });
        }

        if (conv.participants.indexOf(me) === -1) {
            return res.status(403).json({ error: "Not your conversation." });
        }

        const isMuted = conv.mutedBy.indexOf(me) !== -1;

        if (isMuted) {
            await db.collection("conversations").updateOne(
                { key: convKey },
                { $pull: { mutedBy: me } }
            );
            return res.json({ muted: false });
        }

        await db.collection("conversations").updateOne(
            { key: convKey },
            { $push: { mutedBy: me } }
        );
        res.json({ muted: true });
    } catch (err) {
        res.status(500).json({ error: "Could not toggle mute." });
    }
});

// PUT /conversations/:key/hide - hide conversation for current user (block)
router.put("/:key/hide", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;
    const me = req.session.username;

    try {
        await db.collection("conversations").updateOne(
            { key: req.params.key, participants: me },
            { $set: {
                ["hiddenBy." + me]:  true,
                ["blockedAt." + me]: new Date().toISOString()
            }}
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Could not hide conversation." });
    }
});

// DELETE /conversations/:key — soft delete for current user
router.delete("/:key", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;
    const me = req.session.username;

    try {
        await db.collection("conversations").updateOne(
            { key: req.params.key, participants: me },
            { $set: { ["deletedBy." + me]: new Date().toISOString() } }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Could not delete conversation." });
    }
});

export default router;