"use strict";

// Follow route: POST /follow/:username + DELETE /follow/:username
import { Router } from "express";

const router = Router();

// POST /follow/:username - follow someone (or send a request if private)
router.post("/:username", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }

    const db = req.app.locals.db;
    const me = req.session.username;
    const target = req.params.username;

    // Prevent self-following
    if (me === target) {
        return res.status(400).json({ error: "Cannot follow yourself." });
    }

    try {
        // Check target user exists
        const targetUser = await db.collection("users").findOne({ username: target });
        if (!targetUser) {
            return res.status(404).json({ error: "User not found." });
        }

        // Check not already following
        const alreadyFollowing = await db.collection("follows").findOne({
            follower: me, following: target
        });
        if (alreadyFollowing) {
            return res.status(409).json({ error: "Already following." });
        }

        // Block check — if the target has blocked me, silently do nothing.
        // Returning success (not 403) so the requester gets no hint they've been blocked,
        // matching how messaging works: the blocked person can "send" but it never arrives.
        const targetBlockedMe = await db.collection("blocked").findOne({
            username: target, blockedUsers: me
        });
        if (targetBlockedMe) {
            return res.json({ success: true, status: "requested" });
        }

        // Also prevent a user they've blocked from following them
        const iBlockedTarget = await db.collection("blocked").findOne({
            username: me, blockedUsers: target
        });
        if (iBlockedTarget) {
            return res.json({ success: true, status: "requested" });
        }

        if (targetUser.privacy === "private") {
            // Private account — create a pending request instead
            const alreadyRequested = await db.collection("followRequests").findOne({
                from: me, to: target
            });

            if (alreadyRequested) {
                return res.status(409).json({ error: "Request already sent." });
            }

            // Add follow request
            await db.collection("followRequests").insertOne({
                from: me, to: target, requestedAt: new Date()
            });

            // Notify target that a request is waiting
            await db.collection("notifications").insertOne({
                recipient: target,
                type: "follow_request",
                actors: [me],
                postId: null,
                timestamp: new Date(),
                read: false
            });

            return res.json({ success: true, status: "requested" });
        }

        // Public account - follow directly
        await db.collection("follows").insertOne({
            follower: me, following: target, followedAt: new Date()
        });

        // Notify target
        await db.collection("notifications").insertOne({
            recipient: target,
            type: "follow",
            actors: [me],
            postId: null,
            timestamp: new Date(),
            read: false
        });

        res.json({ success: true, status: "following" });

    } catch (err) {
        console.error("POST /follow error:", err.message);
        res.status(500).json({ error: "Could not follow user." });
    }
});

// DELETE /follow/:username - unfollow someone
router.delete("/:username", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }

    const db = req.app.locals.db;
    const me = req.session.username;
    const target = req.params.username;

    try {
        const result = await db.collection("follows").deleteOne({
            follower: me, following: target
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Not following this user." });
        }

        res.json({ success: true, message: `Unfollowed ${target}.` });

    } catch (err) {
        console.error("DELETE /follow error:", err.message);
        res.status(500).json({ error: "Could not unfollow." });
    }
});

// DELETE /follow/followers/:username - remove someone who follows you.
router.delete("/followers/:username", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }

    const db = req.app.locals.db;
    const me = req.session.username;
    const follower = req.params.username;

    try {
        const result = await db.collection("follows").deleteOne({
            follower: follower, following: me
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "This user doesn't follow you." });
        }

        res.json({ success: true, message: `Removed ${follower} as a follower.` });

    } catch (err) {
        console.error("DELETE /follow/followers error:", err.message);
        res.status(500).json({ error: "Could not remove follower." });
    }
});

// GET /follow/status/:username - check follow relationship
router.get("/status/:username", async (req, res) => {
    if (!req.session.username) {
        return res.json({ following: false, requested: false, followedBy: false });
    }

    const db = req.app.locals.db;
    const me = req.session.username;
    const target = req.params.username;

    try {
        const [following, requested, followedBy] = await Promise.all([
            // Check if the current user follows the person
            db.collection("follows").findOne({ follower: me, following: target }),
            // Check if the current user has a pending request with the person
            db.collection("followRequests").findOne({ from: me, to: target }),
            // Check if the person follows the current user
            db.collection("follows").findOne({ follower: target, following: me })
        ]);

        // Also return follower/following counts for the profile card
        const [followerCount, followingCount] = await Promise.all([
            db.collection("follows").countDocuments({ following: target }),
            db.collection("follows").countDocuments({ follower:  target })
        ]);

        res.json({
            following: !!following, // return true or flase
            requested: !!requested,
            followedBy: !!followedBy,
            followerCount,
            followingCount
        });

    } catch (err) {
        console.error("GET /follow/status error:", err.message);
        res.status(500).json({ error: "Could not check follow status." });
    }
});

// POST /follow/accept/:username - accept a pending follow request
router.post("/accept/:username", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }

    const db = req.app.locals.db;
    const me = req.session.username;
    const requester = req.params.username;

    try {
        // Remove the pending request
        const deleted = await db.collection("followRequests").deleteOne({
            from: requester, to: me
        });

        if (deleted.deletedCount === 0) {
            return res.status(404).json({ error: "No such follow request." });
        }

        await db.collection("notifications").deleteMany({
            recipient: me,
            type: "follow_request",
            actors: { $elemMatch: { $eq: requester } }
        });

        // Create the accepted follow edge
        await db.collection("follows").insertOne({
            follower: requester, following: me, followedAt: new Date()
        });

        // Notify the requester that you accepted
        await db.collection("notifications").insertOne({
            recipient: requester,
            type: "follow_accept",
            actors: [me],
            postId: null,
            timestamp: new Date(),
            read: false
        });

        res.json({ success: true });

    } catch (err) {
        console.error("POST /follow/accept error:", err.message);
        res.status(500).json({ error: "Could not accept request." });
    }
});

// DELETE /follow/request/:username - decline or cancel a follow request
router.delete("/request/:username", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }

    const db = req.app.locals.db;
    const me = req.session.username;
    const other = req.params.username;

    try {
        // Works for both decline (other→user) and cancel (user→other)
        await db.collection("followRequests").deleteOne({
            $or: [
                { from: other, to: me },
                { from: me, to: other }
            ]
        });

        await db.collection("notifications").deleteMany({
            $or: [
                { recipient: me,    type: "follow_request", actors: { $elemMatch: { $eq: other } } },
                { recipient: other, type: "follow_request", actors: { $elemMatch: { $eq: me } } }
            ]
        });

        res.json({ success: true });

    } catch (err) {
        console.error("DELETE /follow/request error:", err.message);
        res.status(500).json({ error: "Could not remove request." });
    }
});

// GET /follow/requests - get pending follow requests TO the current user
router.get("/requests", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;

    try {
        const requests = await db.collection("followRequests")
            .find({ to: req.session.username })
            .toArray();
        res.json(requests);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch requests." });
    }
});

// GET /follow/following/:username - list of users this person follows
router.get("/following/:username", async (req, res) => {
    const db = req.app.locals.db;

    try {
        const follows = await db.collection("follows")
            .find({ follower: req.params.username })
            .toArray();
        const usernames = follows.map(function(f) { return f.following; });
        res.json(usernames);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch following list." });
    }
});

// GET /follow/followers/:username - list of users who follow this person
router.get("/followers/:username", async (req, res) => {
    const db = req.app.locals.db;

    try {
        const follows = await db.collection("follows")
            .find({ following: req.params.username })
            .toArray();
        const usernames = follows.map(function(f) { return f.follower; });
        res.json(usernames);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch followers list." });
    }
});

export default router;