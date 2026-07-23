"use strict";

import { Router } from "express";
const router = Router();

// GET /blocked - get blocked users list
router.get("/", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;

    try {
        const doc = await db.collection("blocked").findOne({
            username: req.session.username
        });
        const blocked = doc ? doc.blockedUsers : [];
        res.json(blocked);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch blocked users." });
    }
});

// POST /blocked/:username - block a user
router.post("/:username", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;
    const me = req.session.username;
    const target = req.params.username;

    try {
        await db.collection("blocked").updateOne(
            { username: me },
            { $addToSet: { blockedUsers: target } },
            { upsert: true }
        );

        // Remove follow relationships in both directions
        await db.collection("follows").deleteMany({
            $or: [
                { follower: me, following: target },
                { follower: target, following: me }
            ]
        });

        // Remove pending requests in both directions
        await db.collection("followRequests").deleteMany({
            $or: [
                { from: me, to: target },
                { from: target, to: me }
            ]
        });

        // Get the post
        const myPosts = await db.collection("posts")
            .find({ author: me })
            .project({ _id: 1 })
            .toArray();
        const myPostIds = myPosts.map(function(p) { 
            return p._id.toString(); 
        });

        if (myPostIds.length > 0) {
            // Remove likes from my post
            await db.collection("likes").deleteMany({
                postId: { $in: myPostIds },
                username: target
            });
            // Remove comments from my post
            await db.collection("comments").deleteMany({
                postId: { $in: myPostIds },
                author: target
            });
            
            // Remove saved from my post
            await db.collection("saved").deleteMany({
                postId: { $in: myPostIds },
                username: target
            });
        }

        // Purge any notifications the target already generated for me
        await db.collection("notifications").deleteMany({
            recipient: me,
            actors: { $elemMatch: { $eq: target } }
        });

        // Hide the shared conversation on the blocker's side here, so it
        // leaves their chat list atomically instead of depending on a
        // separate front-end call that might fail.
        const sorted  = [me, target].sort();
        const convKey = "chat_" + sorted[0] + "_" + sorted[1];
        await db.collection("conversations").updateOne(
            { key: convKey },
            { $set: {
                ["hiddenBy." + me]:  true,
                ["blockedAt." + me]: new Date().toISOString()
            }}
        );

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: "Could not block user." });
    }
});

// DELETE /blocked/:username - unblock
router.delete("/:username", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;
    const me = req.session.username;
    const target = req.params.username;

    try {
        // Remove from blocked list
        await db.collection("blocked").updateOne(
            { username: me },
            { $pull: { blockedUsers: target } }
        );

        // Restore the shared conversation, but not messages sent during block period
        // the chat reappears in the chat list
        const sorted  = [me, target].sort();
        const convKey = "chat_" + sorted[0] + "_" + sorted[1];

        await db.collection("conversations").updateOne(
            { key: convKey },
            {
                $unset: {
                    ["hiddenBy." + me]:  "",
                    ["blockedAt." + me]: ""
                }
            }
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Could not unblock user." });
    }
});

export default router;