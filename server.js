"use strict";

// Imports
import "dotenv/config"; // For the .env file holding the API key
import express from "express";
import cors from "cors";
import session from "express-session";
import fileUpload from "express-fileupload";
import path from "path"; // provides path.dirname()
import { fileURLToPath } from "url"; // provides fileURLToPath()
import { MongoClient, ServerApiVersion } from "mongodb";

// Route files
import usersRouter from "./Backend/routes/users.js";
import loginRouter from "./Backend/routes/auth.js";
import postsRouter from "./Backend/routes/publications.js";
import followRouter from "./Backend/routes/connections.js";
import feedRouter from "./Backend/routes/feed.js";
import imagesRouter from "./Backend/routes/images.js";
import thirdpartyRouter from "./Backend/routes/thirdparty.js";
import conversationsRouter from "./Backend/routes/conversations.js";
import notificationsRouter from "./Backend/routes/notif.js";
import blockedRouter from "./Backend/routes/blocked.js";

const __filename = fileURLToPath(import.meta.url); // gives us this file's location as a URL
const __dirname = path.dirname(__filename); // strips the filename off the end of the path

// Constant
const app = express();
const DB_NAME = "EasyTutor";
const connectionURI = "mongodb://127.0.0.1:27017?retryWrites=true&w=majority";

const allowedOrigin = "http://localhost:8080";

// The origin
app.use(cors({
    origin: allowedOrigin,
    credentials: true
}));

// Connect to MongoDB
const client = new MongoClient(connectionURI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: false, // false so $regex and text queries work
        deprecationErrors: true,
    }
});

app.use(fileUpload({
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
    abortOnLimit: true
}));

try {
    await client.connect();
    const database = client.db(DB_NAME);
    app.locals.db = database;  // shared with all route files via req.app.locals.db
    console.log(`MongoDB connected → ${DB_NAME}`);
} catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
}

app.use(express.json()); // Parses the incoming JSON (same as body-parser)

app.use(
    session({
        secret: "easyTutorSecret",
        cookie: { maxAge: 1000 * 60 * 60 * 24 },
        resave: false, // Do not save the session if nothing changed
        saveUninitialized: false, // save after something is stored in it
    })
);

// Redirect root to student ID path
app.get("/", (req, res) => {
    res.redirect("/M01067508");
});

// Serve front-end
// Makes the existing HTML/CSS/JS files available at port 8080
app.use("/Frontend", express.static(path.join(__dirname, "Frontend")));

// Serve index.html at /M01067508
app.get("/M01067508", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// API routes
app.use("/M01067508/users", usersRouter);
app.use("/M01067508/login", loginRouter);
app.use("/M01067508/contents", postsRouter);
app.use("/M01067508/follow", followRouter);
app.use("/M01067508/feed", feedRouter);
app.use("/M01067508/images", imagesRouter);
app.use("/M01067508/widget", thirdpartyRouter);
app.use("/M01067508/conversations", conversationsRouter);
app.use("/M01067508/notifications", notificationsRouter);
app.use("/M01067508/blocked", blockedRouter);

// Global error handler
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err.message);
    res.status(500).json({ error: "Something went wrong on the server." });
});

// Start server / URL
app.listen(8080, () => {
    console.log("A-level Hub server running on http://localhost:8080/M01067508");
});

// errors
// 2xx success (OK)
// 4xx client error (bad request, unauthorised, not found)
// 5xx server error (bug/mongoDB crash)