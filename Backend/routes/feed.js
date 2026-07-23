"use strict";

// Feed route: GET /feed (posts from followed users only)
import { Router } from "express";

const router = Router();

// GET /feed: returns posts from users the logged-in user follows
router.get("/", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }

    const db = req.app.locals.db;
    const me = req.session.username;
    const page = parseInt(req.query.page) || 1; // Default load
    const limit = parseInt(req.query.limit) || 10; // default 20 posts

    try {
        // Step 1: find everyone the current user follows
        const follows = await db.collection("follows")
            .find({ follower: me })
            .toArray(); // Cpnverts mongoDB cursor into js array

        // Extract the usernames being followed
        const followedUsernames = follows.map(f => f.following);

        if (followedUsernames.length === 0) {
            return res.json([]); // following nobody - empty feed
        }

        // Step 2: fetch their posts, newest first, with pagination
        const feed = await db.collection("posts")
            // find posts of followed users
            .find({ author: { $in: followedUsernames } })
            .sort({ timestamp: -1 }) // descending order
            // tells MongoDB how many documents to jump over before starting.
            .skip((page - 1) * limit)
            .limit(limit) //20 post max
            .toArray();

        // Step 3: attach like counts and comment counts to each post
        const enrichedFeed = await Promise.all(feed.map(async (post) => {
            const postId = post._id.toString();

            // Run all four queries
            const [likeCount, commentCount, myRating, likedDoc, savedDoc] = await Promise.all([
                db.collection("likes").countDocuments({ postId }),
                db.collection("comments").countDocuments({ postId }),
                db.collection("ratings").findOne({ postId, username: me }),
                db.collection("likes").findOne({ postId, username: me }), // for like emoji display
                db.collection("saved").findOne({ postId, username: me })
            ]);

            let myRatingStars;
            if (myRating) {
                myRatingStars = myRating.stars;
            } else {
                myRatingStars = 0;
            }

            let iLiked;
            if (likedDoc) {
                iLiked = true;
            } else {
                iLiked = false;
            }

            return {
                ...post,
                likeCount,
                commentCount,
                myRating: myRatingStars,
                iLiked: iLiked,
                iSaved: !!savedDoc 
            };
        }));

        res.json(enrichedFeed);

    } catch (err) {
        console.error("GET /feed error:", err.message);
        res.status(500).json({ error: "Could not load feed." });
    }
});

export default router;