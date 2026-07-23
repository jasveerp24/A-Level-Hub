"use strict";

// Login route: GET /login (status) + POST/DELETE
import { Router } from "express";
import bcrypt from "bcrypt";

const router = Router();

// GET /login: check if user is currently logged in (session check)
router.get("/", async (req, res) => {
    if (!req.session.username) {
        return res.json({ loggedIn: false });
    }

    const db = req.app.locals.db;

    try {
        const user = await db.collection("users").findOne({ username: req.session.username });

        let avatar;
        let darkMode;
        if (user) {
            avatar = user.avatar || "";
            darkMode = user.darkMode || false;
        } else {
            avatar = "";
            darkMode = false;
        }

        res.json({
            loggedIn: true,
            username: req.session.username,
            avatar: avatar,
            darkMode: darkMode
        });

    } catch (err) {
        console.error("GET /login error:", err.message);
        res.json({ loggedIn: true, username: req.session.username, avatar: "", darkMode: false });
    }
}); // Front-end decided to show login screen/go to feed

// POST /login: authenticate and start session
// runs when POST /M01067508/login is received
router.post("/", async (req, res) => {
    const db = req.app.locals.db; // Get the mongoDB database
    const { username, password } = req.body;

    // Empty submission
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required." });
    }

    try {
        // Check if  username exists first
        const userExists = await db.collection("users").findOne({ username }); // Search in database
        if (!userExists) {
            return res.status(404).json({ error: "No account found. Please register first." });
        }

        // Check typed password against the stored hashed password
        // bcrypt.compare() returns true if they match
        const passwordMatch = await bcrypt.compare(password, userExists.password);
        if (!passwordMatch) {
            return res.status(401).json({ error: "Invalid username or password." });
        }

        // Store username in session
        req.session.username = username;

        // Sends back a JSON response to front-end
        res.json({
            success: true,
            username: userExists.username,
            firstName: userExists.firstName,
            lastName: userExists.lastName,
            avatar: userExists.avatar || "",
            darkMode: userExists.darkMode || false
        });

    } catch (err) {
        console.error("POST /login error:", err.message);
        res.status(500).json({ error: "Login failed." });
    }
});

// DELETE /login: log out, destroy session
router.delete("/", (req, res) => {
    if (!req.session.username) {
        return res.status(400).json({ error: "Not logged in." });
    }

    // Remove the session from the server's memory completely
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: "Could not log out." });
        }
        res.json({ success: true, message: "Logged out successfully." });
    });
});

export default router;