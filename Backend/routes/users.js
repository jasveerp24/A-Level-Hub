"use strict";

// Users route: POST /users (register) + GET /users?q= (search)
import { Router } from "express";
import bcrypt from "bcrypt";

const router = Router();

// POST /users: register a new user
router.post("/", async (req, res) => {
    const db = req.app.locals.db;

    // Content to receive when registering
    const {
        username, password, firstName, lastName,
        email, age, gender, favouriteSubject
    } = req.body;

    // Basic validation: all required fields must be filled
    if (!username || !password || !firstName || !lastName || !email) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    let hasUpper = false;
    let hasLower = false;
    let hasNumber = false;
    let hasSpecial = false;

    for (let i = 0; i < password.length; i++) {
        const ch = password[i];
        if (ch >= "A" && ch <= "Z") {
            hasUpper = true;
        } else if (ch >= "a" && ch <= "z") {
            hasLower = true;
        } else if (ch >= "0" && ch <= "9") {
            hasNumber = true;
        } else {
            hasSpecial = true;
        }
    }

    if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
        return res.status(400).json({
            error: "Password must contain uppercase, lowercase, number and special character."
        });
    }

    try {
        // Check if username already exists
        const existing = await db.collection("users").findOne({ username });
        if (existing) {
            return res.status(409).json({ error: "Username already taken." });
        }

        // Hash the password, 10 salt rounds (standard - secure and fast)
        const hashedPassword = await bcrypt.hash(password, 10);

        // Build the user document
        const newUser = {
            username,
            password: hashedPassword,
            firstName,
            lastName,
            email,
            age: parseInt(age) || null,
            gender,
            favouriteSubject,
            privacy: "public",
            bio: "",
            avatar: "",
            darkMode: false,
            createdAt: new Date()
        };

        // Add new user
        const result = await db.collection("users").insertOne(newUser);

        res.status(201).json({
            success: true,
            message: "Account created successfully.",
            insertedId: result.insertedId
        });

    } catch (err) {
        console.error("POST /users error:", err.message);
        res.status(500).json({ error: "Could not create account." });
    }
});

// GET /users?q=name: search users by username
router.get("/", async (req, res) => {
    const db = req.app.locals.db;
    const rawQuery = req.query.q || "";
    const query = rawQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const me = req.session.username || null;

    try {
        const filter = {
            username: { $regex: query, $options: "i" }
        }; // search user with regex (case insensitive)

        // Exclude the logged-in user from search results
        if (me) {
            filter.username = { $regex: query, $options: "i", $ne: me };
        }

        const users = await db.collection("users")
            .find(filter)
            .project({ password: 0 }) // never send passwords to client
            .limit(10) // show 10 results
            .toArray();

        res.json(users);

    } catch (err) {
        console.error("GET /users error:", err.message);
        res.status(500).json({ error: "Search failed." });
    }
});

// GET /users/:username - get one user's public profile
router.get("/:username", async (req, res) => {
    const db = req.app.locals.db;

    try {
        const user = await db.collection("users").findOne(
            { username: req.params.username },
            { projection: { password: 0 } }
        );

        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        res.json(user);

    } catch (err) {
        console.error("GET /users/:username error:", err.message);
        res.status(500).json({ error: "Could not fetch user." });
    }
});

// PUT /users/me - update own profile
router.put("/me", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }

    const db = req.app.locals.db;

    // Only include fields that were actually sent
    const updates = {};

    if (req.body.firstName !== undefined) { 
        updates.firstName = req.body.firstName; 
    }

    if (req.body.lastName !== undefined) { 
        updates.lastName = req.body.lastName; 
    }

    if (req.body.bio !== undefined) {
        updates.bio = req.body.bio; 
    }

    if (req.body.favouriteSubject !== undefined) { 
        updates.favouriteSubject = req.body.favouriteSubject; 
    }

    if (req.body.privacy !== undefined) { 
        updates.privacy = req.body.privacy; 
    }

    if (req.body.avatar !== undefined) { 
        updates.avatar = req.body.avatar; 
    }

    if (req.body.darkMode !== undefined) { 
        updates.darkMode = req.body.darkMode; 
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No fields to update." });
    }

    try {
        await db.collection("users").updateOne(
            { username: req.session.username },
            { $set: updates }
        );
        res.json({ success: true, message: "Profile updated." });
    } catch (err) {
        console.error("PUT /users/me error:", err.message);
        res.status(500).json({ error: "Could not update profile." });
    }
});

// PUT /users/me/password: change password
router.put("/me/password", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }

    const db = req.app.locals.db;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: "Invalid password data." });
    }

    try {
        // Verify current password first - uses bcrypt
        const user = await db.collection("users").findOne({
            username: req.session.username
        });

        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        const passwordMatch = await bcrypt.compare(currentPassword, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ error: "Current password is incorrect." });
        }

        const hashedNew = await bcrypt.hash(newPassword, 10);

        await db.collection("users").updateOne(
            { username: req.session.username },
            { $set: { password: hashedNew } }
        );

        res.json({ success: true, message: "Password updated." });

    } catch (err) {
        console.error("PUT /users/me/password error:", err.message);
        res.status(500).json({ error: "Could not update password." });
    }
});

// DELETE /users/me: delete own account and all related data
router.delete("/me", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }

    const db = req.app.locals.db;
    const me = req.session.username;

    try {
        // Remove all data belonging to this user across every collection
        await db.collection("posts").deleteMany({ author: me });
        await db.collection("follows").deleteMany({
            $or: [{ follower: me }, { following: me }]
        });
        await db.collection("likes").deleteMany({ username: me });
        await db.collection("comments").deleteMany({ author: me });
        await db.collection("notifications").deleteMany({ recipient: me });
        await db.collection("followRequests").deleteMany({
            $or: [{ from: me }, { to: me }]
        });
        await db.collection("users").deleteOne({ username: me });

        // Destroy session after account deletion
        req.session.destroy();

        res.json({ success: true, message: "Account deleted." });

    } catch (err) {
        console.error("DELETE /users/me error:", err.message);
        res.status(500).json({ error: "Could not delete account." });
    }
});

export default router;