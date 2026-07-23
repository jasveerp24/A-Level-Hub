"use strict";

// Posts (contents) route - POST /contents + GET /contents?q=
import { Router }   from "express";
import { ObjectId } from "mongodb";

const router = Router();

// Public accounts (or your own account) are always visible.
// Private accounts are only visible to the owner or an approved follower.
async function canAccessAuthorPosts(db, me, authorUsername) {
    if (me === authorUsername) {
        return true;
    }

    const author = await db.collection("users").findOne({ username: authorUsername });
    if (!author) {
        return false;
    }

    if (author.privacy !== "private") {
        return true;
    }

    if (!me) {
        return false;
    }

    const followDoc = await db.collection("follows").findOne({
        follower: me, following: authorUsername
    });

    return !!followDoc;
}

// POST /contents: create a new post
router.post("/", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }

    const db = req.app.locals.db;
    const { type, subject, questionRef, content, imageIds } = req.body;

    if (!subject || !content) {
        return res.status(400).json({ error: "Subject and content are required." });
    }

    try {
        const post = {
            author: req.session.username, // always from session
            type: type || "solution",
            subject: subject,
            questionRef: questionRef || "",
            content: content,
            imageIds: imageIds || [], // filenames stored by /images route
            timestamp: new Date()
        };

        const result = await db.collection("posts").insertOne(post);

        res.status(201).json({
            success: true,
            postId: result.insertedId
        });

    } catch (err) {
        console.error("POST /contents error:", err.message);
        res.status(500).json({ error: "Could not create post." });
    }
});

// GET /contents?q=..: search all posts by content/subject/ref
router.get("/", async (req, res) => {
    const db = req.app.locals.db;
    const me = req.session.username || null;
    const rawQuery = req.query.q || "";

    // Escape regex special characters so search terms like "C++" or "("
    // are treated as literal text instead of breaking the regex
    const query = rawQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    try {
        const posts = await db.collection("posts").find({
            $or: [
                // search in MongoDB (case insensitive)
                { content: { $regex: query, $options: "i" } },
                { subject: { $regex: query, $options: "i" } },
                { questionRef: { $regex: query, $options: "i" } }
            ]
        })
        .sort({ timestamp: -1 })
        .limit(50)
        .toArray();

        if (posts.length === 0) {
            return res.json([]);
        }

        // Filter out posts from private accounts the searcher can't see.
        // Batch-check each unique author once rather than once per post.
        const uniqueAuthors = [...new Set(posts.map(function(p) { return p.author; }))];
        const accessMap = {};

        await Promise.all(uniqueAuthors.map(async function(author) {
            accessMap[author] = await canAccessAuthorPosts(db, me, author);
        }));

        const visiblePosts = posts.filter(function(p) { return accessMap[p.author]; });

        res.json(visiblePosts);

    } catch (err) {
        console.error("GET /contents error:", err.message);
        res.status(500).json({ error: "Search failed." });
    }
});

// GET /contents/liked - get posts the current user has liked
router.get("/liked", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;
    const me = req.session.username;

    try {
        const likes = await db.collection("likes")
            .find({ username: me })
            .toArray();

        if (likes.length === 0) {
            return res.json([]);
        }

        const postIds = likes.map(function(l) {
            return new ObjectId(l.postId);
        });

        const posts = await db.collection("posts")
            .find({ _id: { $in: postIds } })
            .sort({ timestamp: -1 })
            .toArray();

        res.json(posts);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch liked posts." });
    }
});

// GET /contents/saved - posts the current user saved
router.get("/saved", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;
    const me = req.session.username;

    try {
        const saved = await db.collection("saved")
            .find({ username: me })
            .toArray();

        const postIds = saved.map(function(s) {
            return new ObjectId(s.postId);
        });

        if (postIds.length === 0) {
            return res.json([]);
        }

        const posts = await db.collection("posts")
            .find({ _id: { $in: postIds } })
            .sort({ timestamp: -1 })
            .toArray();

        res.json(posts);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch saved posts." });
    }
});

router.get("/commented", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;
    const me = req.session.username;

    try {
        const comments = await db.collection("comments")
            .find({ author: me })
            .toArray();

        const seen    = {};
        const postIds = [];

        for (let i = 0; i < comments.length; i++) {
            const postId = comments[i].postId;
            if (!seen[postId]) {
                seen[postId] = true;
                postIds.push(new ObjectId(postId));
            }
        }

        if (postIds.length === 0) {
            return res.json([]);
        }

        const posts = await db.collection("posts")
            .find({ _id: { $in: postIds } })
            .toArray();

        res.json(posts);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch commented posts." });
    }
});

// GET /contents/user/:username - all posts by a specific user
router.get("/user/:username", async (req, res) => {
    const db = req.app.locals.db;
    const me = req.session.username || null;
    const target = req.params.username;

    try {
        const allowed = await canAccessAuthorPosts(db, me, target);
        if (!allowed) {
            return res.status(403).json({ error: "This account is private." });
        }

        const posts = await db.collection("posts")
            .find({ author: target })
            .sort({ timestamp: -1 })
            .toArray();
        res.json(posts);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch posts." });
    }
});


// GET /contents/:postId - get one specific post
router.get("/:postId", async (req, res) => {
    const db = req.app.locals.db;
    const me = req.session.username || null;

    try {
        const post = await db.collection("posts").findOne({
            _id: new ObjectId(req.params.postId)
        });

        if (!post) {
            return res.status(404).json({ error: "Post not found." });
        }

        const allowed = await canAccessAuthorPosts(db, me, post.author);
        if (!allowed) {
            return res.status(403).json({ error: "This account is private." });
        }

        res.json(post);

    } catch (err) {
        console.error("GET /contents/:postId error:", err.message);
        res.status(400).json({ error: "Invalid post ID." });
    }
});

// DELETE /contents/:postId - delete own post
router.delete("/:postId", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }

    const db = req.app.locals.db;

    try {
        // author check inside the filter - only delete for current user
        const result = await db.collection("posts").deleteOne({
            _id: new ObjectId(req.params.postId),
            author: req.session.username
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Post not found or not yours." });
        }

        // Clean up all engagement data for this post
        await db.collection("likes").deleteMany({ postId: req.params.postId });
        await db.collection("comments").deleteMany({ postId: req.params.postId });
        await db.collection("ratings").deleteMany({ postId: req.params.postId });
        await db.collection("saved").deleteMany({ postId: req.params.postId });

        res.json({ success: true, message: "Post deleted." });

    } catch (err) {
        console.error("DELETE /contents/:postId error:", err.message);
        res.status(400).json({ error: "Could not delete post." });
    }
});

// POST /contents/:postId/likes - like a post
router.post("/:postId/likes", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }

    const db = req.app.locals.db;
    const postId = req.params.postId;
    const me = req.session.username;

    try {
        // Check if already liked
        const existing = await db.collection("likes").findOne({ postId, username: me });

        if (existing) {
            // Already liked: unlike it
            await db.collection("likes").deleteOne({ postId, username: me });
            const count = await db.collection("likes").countDocuments({ postId });
            return res.json({ liked: false, likeCount: count });
        }

        // Not yet liked: add the like
        await db.collection("likes").insertOne({
            postId,
            username: me,
            likedAt: new Date()
        });

        const count = await db.collection("likes").countDocuments({ postId });
        res.json({ liked: true, likeCount: count });

    } catch (err) {
        console.error("POST /contents/:postId/likes error:", err.message);
        res.status(500).json({ error: "Could not toggle like." });
    }
});

// GET /contents/:postId/likes/users - who liked this post
router.get("/:postId/likes/users", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;
    const me = req.session.username;

    try {
        // Gate on the parent post's privacy, same as GET /:postId
        const post = await db.collection("posts").findOne({
            _id: new ObjectId(req.params.postId)
        });
        if (!post) {
            return res.status(404).json({ error: "Post not found." });
        }
        const allowed = await canAccessAuthorPosts(db, me, post.author);
        if (!allowed) {
            return res.status(403).json({ error: "This account is private." });
        }


        const likes = await db.collection("likes")
            .find({ postId: req.params.postId })
            .toArray();
        const usernames = likes.map(function(l) { return l.username; });
        res.json(usernames);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch likes." });
    }
});



// POST /contents/:postId/saved - save or unsave toggle
router.post("/:postId/saved", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;
    const me = req.session.username;
    const postId = req.params.postId;

    try {
        const existing = await db.collection("saved").findOne({ postId, username: me });

        if (existing) {
            await db.collection("saved").deleteOne({ postId, username: me });
            return res.json({ saved: false });
        }

        await db.collection("saved").insertOne({
            postId,
            username: me,
            savedAt:  new Date()
        });

        res.json({ saved: true });
    } catch (err) {
        res.status(500).json({ error: "Could not toggle save." });
    }
});

// GET /contents/:postId/saved/status - is this post saved by current user
router.get("/:postId/saved/status", async (req, res) => {
    if (!req.session.username) {
        return res.json({ saved: false });
    }
    const db = req.app.locals.db;

    try {
        const existing = await db.collection("saved").findOne({
            postId: req.params.postId,
            username: req.session.username
        });
        res.json({ saved: !!existing });
    } catch (err) {
        res.status(500).json({ error: "Could not check save status." });
    }
});

// POST /contents/:postId/comments - add a comment
router.post("/:postId/comments", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }

    const db = req.app.locals.db;
    const text = req.body.text;

    if (!text || !text.trim()) {
        return res.status(400).json({ error: "Comment cannot be empty." });
    }

    try {
        const comment = {
            postId: req.params.postId,
            author: req.session.username,
            text: text.trim(),
            timestamp: new Date()
        };

        const result = await db.collection("comments").insertOne(comment);
        res.status(201).json({ success: true, commentId: result.insertedId });

    } catch (err) {
        console.error("POST /contents/:postId/comments error:", err.message);
        res.status(500).json({ error: "Could not add comment." });
    }
});

// GET /contents/:postId/comments - get all comments for a post
router.get("/:postId/comments", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;
    const me = req.session.username;

    try {
        // Gate on the parent post's privacy, same as GET /:postId
        const post = await db.collection("posts").findOne({
            _id: new ObjectId(req.params.postId)
        });
        if (!post) {
            return res.status(404).json({ error: "Post not found." });
        }
        const allowed = await canAccessAuthorPosts(db, me, post.author);
        if (!allowed) {
            return res.status(403).json({ error: "This account is private." });
        }


        const comments = await db.collection("comments")
            .find({ postId: req.params.postId })
            .sort({ timestamp: 1 }) // Ascending order
            .toArray();

        res.json(comments);

    } catch (err) {
        console.error("GET /contents/:postId/comments error:", err.message);
        res.status(500).json({ error: "Could not fetch comments." });
    }
});

// POST /contents/:postId/ratings - rate a post (1-5 stars)
router.post("/:postId/ratings", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }

    const db = req.app.locals.db;
    const stars = parseInt(req.body.stars);
    const me = req.session.username;

    if (!stars || stars < 1 || stars > 5) {
        return res.status(400).json({ error: "Stars must be between 1 and 5." });
    }

    try {
        // Prevent rating own post
        const post = await db.collection("posts").findOne({
            _id: new ObjectId(req.params.postId)
        });

        if (post && post.author === me) {
            return res.status(403).json({ error: "Cannot rate your own post." });
        }

        // Upsert (update if exists), insert if not
        await db.collection("ratings").updateOne(
            { postId: req.params.postId, username: me },
            { $set: { stars, ratedAt: new Date() } },
            { upsert: true }
        );

        res.json({ success: true, stars });

    } catch (err) {
        console.error("POST /contents/:postId/ratings error:", err.message);
        res.status(500).json({ error: "Could not save rating." });
    }
});

// GET /contents/:postId/ratings/all - get all ratings for a post (for the author's breakdown)
router.get("/:postId/ratings/all", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;
    const me = req.session.username;

    try {
        const post = await db.collection("posts").findOne({
            _id: new ObjectId(req.params.postId)
        });
        if (!post) {
            return res.status(404).json({ error: "Post not found." });
        }
        if (post.author !== me) {
            return res.status(403).json({ error: "Not your post." });
        }
        const ratings = await db.collection("ratings")
            .find({ postId: req.params.postId })
            .toArray();
        res.json(ratings);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch ratings." });
    }
});

// GET /contents/:postId/enriched - single post with full engagement counts
router.get("/:postId/enriched", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const db = req.app.locals.db;
    const me = req.session.username;

    try {
        const post = await db.collection("posts").findOne({
            _id: new ObjectId(req.params.postId)
        });

        if (!post) {
            return res.status(404).json({ error: "Post not found." });
        }

        const allowed = await canAccessAuthorPosts(db, me, post.author);
        if (!allowed) {
            return res.status(403).json({ error: "This account is private." });
        }

        const postId = post._id.toString();

        const [likeCount, commentCount, myRating, likedDoc, savedDoc] = await Promise.all([
            db.collection("likes").countDocuments({ postId }),
            db.collection("comments").countDocuments({ postId }),
            db.collection("ratings").findOne({ postId, username: me }),
            db.collection("likes").findOne({ postId, username: me }),
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

        res.json({
            ...post,
            likeCount,
            commentCount,
            myRating: myRatingStars,
            iLiked: iLiked,
            iSaved: !!savedDoc
        });

    } catch (err) {
        res.status(500).json({ error: "Could not fetch post." });
    }
});

export default router;