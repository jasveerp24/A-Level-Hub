"use strict";

// ── Images route — POST /images (upload) + GET /images/:filename (serve) ─────
import { Router } from "express";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";

const __filename  = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

// Make sure the uploads folder exists before we try to move files into it.
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const router = Router();

// Only these image types are accepted (replaces multer's fileFilter).
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILES     = 10;

// Fallback extension when an uploaded file's name has none.
const EXT_BY_TYPE = {
    "image/jpeg": ".jpg",
    "image/png":  ".png",
    "image/gif":  ".gif",
    "image/webp": ".webp"
};

// POST /images — upload up to 10 images
router.post("/", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }

    // express-fileupload places uploaded files on req.files, keyed by the form
    // field name. Our field name is "images" (see the front-end FormData).
    if (!req.files || !req.files.images) {
        return res.status(400).json({ error: "No files uploaded." });
    }

    // A single file arrives as one object; several arrive as an array.
    // Normalise to an array so the rest of the code is uniform.
    let files;
    if (Array.isArray(req.files.images)) {
        files = req.files.images;
    } else {
        files = [req.files.images];
    }

    if (files.length > MAX_FILES) {
        return res.status(400).json({ error: "You can upload at most " + MAX_FILES + " images." });
    }

    // Validate every file is an accepted image type Before saving any of them.
    for (let i = 0; i < files.length; i++) {
        if (ALLOWED_TYPES.indexOf(files[i].mimetype) === -1) {
            return res.status(400).json({ error: "Only image files are allowed." });
        }
    }

    try {
        const filenames = [];

        for (let i = 0; i < files.length; i++) {
            const myFile = files[i];

            // Build a unique file name so two files called "cat.jpg" never clash.
            let ext = path.extname(myFile.name);
            if (!ext) {
                ext = EXT_BY_TYPE[myFile.mimetype] || "";
            }
            const uniqueFileName = uuidv4() + ext;

            // mv() moves the uploaded file into the uploads folder on the server.
            await myFile.mv(path.join(UPLOADS_DIR, uniqueFileName));

            filenames.push(uniqueFileName);
        }

        // Return the new filename(s)
        res.status(201).json({ success: true, filenames });

    } catch (err) {
        console.error("POST /images error:", err.message);
        res.status(500).json({ error: "Could not upload images." });
    }
});

// GET /images/:filename - serve an uploaded image file
router.get("/:filename", (req, res) => {
    // basename() strips any path components, so a filename can never escape the uploads folder
    const safeName = path.basename(req.params.filename);
    const filepath = path.join(UPLOADS_DIR, safeName);
    res.sendFile(filepath, (err) => {
        if (err) {
            res.status(404).json({ error: "Image not found." });
        }
    });
});

export default router;