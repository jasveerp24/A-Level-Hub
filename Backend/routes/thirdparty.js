"use strict";

// Third-party route
import { Router } from "express";

const router = Router();

// GET /widget/quote - Quote of the Day from API Ninjas
router.get("/quote", async (req, res) => {
    const apiKey = process.env.NINJA_API_KEY;

    // If api key is not correct
    if (!apiKey) {
        return res.status(503).json({ error: "Quote service not configured." });
    }

    try {
        // Fetch from the website
        const response = await fetch("https://api.api-ninjas.com/v2/quoteoftheday", {
            headers: {
                "X-Api-Key": apiKey
            }
        });

        if (!response.ok) {
            throw new Error("API Ninjas returned " + response.status);
        }

        // waiting for the response
        const data = await response.json();
        const quote = data[0]; // The first line is the quote

        res.json({
            text: quote.quote,
            author: quote.author
        });

    } catch (err) {
        console.error("GET /widget/quote error:", err.message);
        res.status(502).json({ error: "Could not fetch quote." });
    }
});

// GET /widget/onthisday - historical events for today's date (Byabbe).
// No API key required.
router.get("/onthisday", async (req, res) => {
    try {
        // Today's date drives the request, so the content changes every day
        // on its own - nothing is stored or hardcoded here.
        const now = new Date();
        const month = now.getMonth() + 1; // getMonth() is 0-based
        const day = now.getDate();

        const response = await fetch(
            "https://byabbe.se/on-this-day/" + month + "/" + day + "/events.json"
        );

        if (!response.ok) {
            throw new Error("On This Day API returned " + response.status);
        }

        const data = await response.json();

        if (!data.events || data.events.length === 0) {
            return res.status(502).json({ error: "No events found for today." });
        }

        // Take the first event so everyone sees the same one all day.
        const firstEvent = data.events[0];

        res.json({
            date: data.date,
            year: firstEvent.year,
            event: firstEvent.description
        });

    } catch (err) {
        console.error("GET /widget/onthisday error:", err.message);
        res.status(502).json({ error: "Could not fetch today's event." });
    }
});

 // Google Gemini API - displays questions only for the subjects / topic is open
// Questions are similar to cambridge level questions A level/ O level

// Match exactly the subjects offered at registration/posting
const ALLOWED_SUBJECTS = [
    "Mathematics", "Additional Mathematics", "Physics", "Chemistry",
    "Biology", "Computer Science", "Economics", "Accounts",
    "General Paper", "French", "English Literature", "French Literature"
];


// Behavioral rules that never change between requests. Sent via Gemini's systemInstruction field
// Some are AI-generated
const QUESTION_SYSTEM_INSTRUCTION = 
`You write short, original practice questions in the style of Cambridge IGCSE / A-Level exam papers.

You are given a SUBJECT (from a fixed list) and, optionally, a free-text TOPIC request typed by a student.

Decide, using your knowledge of the Cambridge IGCSE / A-Level syllabus for that subject:
- If no specific topic is given, choose any suitable topic that is on that subject's syllabus.
- If the requested topic IS part of that subject's syllabus, write a question on it.
- If the requested topic is NOT part of that subject's syllabus, do not invent a question — mark it off-syllabus.

When you do write a question, follow these rules exactly:
- Exactly ONE question. Maximum 2 lines. No multi-part questions (no (a), (b), (c)).
- No diagrams, graphs, tables or images may be referenced or required.
- Do NOT include the answer, a marking scheme, or any worked solution.
- Never claim it is from a real past paper — it is always an original question written in that style.
- Use Cambridge command words (e.g. "Calculate", "State", "Explain", "Find", "Describe").

Respond with ONLY raw JSON, no markdown fences, in exactly one of these shapes:
{"onSyllabus": true, "topic": "<the concise topic you used>", "question": "<the question>"}
{"onSyllabus": false, "topic": "<the requested topic>", "question": ""}`;


// Builds the per-request task turn.
function buildQuestionPrompt(subject, topicText, extraWarning) {
    let prompt;
    if (topicText) {
        prompt =
            `Subject: "${subject}" (Cambridge IGCSE / A-Level).\n` +
            `The student asked for a question on: "${topicText}".\n` +
            `Work out which topic they mean within this subject, then follow your rules.`;
    } else {
        prompt =
            `Subject: "${subject}" (Cambridge IGCSE / A-Level).\n` +
            `No specific topic was given - choose any suitable topic from this subject's syllabus.`;
    }

    if (extraWarning) {
        prompt = prompt + " Your previous answer broke one of the rules - follow them exactly this time.";
    }
    return prompt;
}

// A quick server-side check that the model actually followed the rules.
function isQuestionValid(text) {
    if (!text || typeof text !== "string") {
        return false;
    }
    if (text.length > 220) {
        return false; // too long - probably multi-part or includes extra explanation
    }
    const lower = text.toLowerCase();
    const bannedPhrases = ["mark scheme", "marking scheme", "answer:", "solution:", "award 1 mark", "[1]", "[2]", "[3]"];
    for (let i = 0; i < bannedPhrases.length; i++) {
        if (lower.indexOf(bannedPhrases[i]) !== -1) {
            return false; // looks like it leaked a marking scheme or mark allocation
        }
    }
    return true;
}

// Makes one call to Gemini and extracts the question text from its response
async function callGeminiForQuestion(apiKey, subject, specificTopic, extraWarning) {
    const prompt = buildQuestionPrompt(subject, specificTopic, extraWarning);

    const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey
            },

            body: JSON.stringify({
                // Persistent rules - sent once per call
                systemInstruction: {
                    parts: [{ text: QUESTION_SYSTEM_INSTRUCTION }]
                },
                contents: [{
                    parts: [{ text: prompt }]
                }],
                // Adds randomness to the model's own generation so that
                // even asking about the same topic twice in a row gives
                // a different worded question, not an identical one.
                generationConfig: {
                    temperature: 1.0
                }
            })
        }
    );

    if (!response.ok) {
        // Google sends a JSON body explaining exactly what went wrong - keep it
        const detail = await response.text();
        throw new Error("Gemini API returned " + response.status + " - " + detail);
    }

    const data = await response.json();

    // Gemini can reply with no candidates at all (e.g. a safety filter blocked it).
    // Check before reaching into the array so the real reason is logged.
    if (!data.candidates || data.candidates.length === 0) {
        throw new Error("Gemini returned no candidates - " + JSON.stringify(data));
    }

    const candidate = data.candidates[0];
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        throw new Error("Gemini returned no text - finishReason: " + candidate.finishReason);
    }

    // the question is the first text
    const rawText = candidate.content.parts[0].text;

    // The model sometimes wraps JSON in ```json fences even when told not to. Strip those before parsing.
    const cleaned = rawText.replace(/```json|```/g, "").trim();

    // If the model answered in prose instead of JSON, say so clearly.
    try {
        return JSON.parse(cleaned); // { onSyllabus, topic, question }
    } catch (parseErr) {
        throw new Error("Gemini did not return valid JSON - " + cleaned.substring(0, 150));
    }
}

// Gemini answers 503 when its own servers are overloaded
async function callGeminiWithRetry(apiKey, subject, specificTopic, extraWarning) {
    const maxAttempts = 3;
    let delay = 1000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await callGeminiForQuestion(apiKey, subject, specificTopic, extraWarning);
        } catch (err) {
            const isOverloaded = err.message.indexOf("503") !== -1;

            if (!isOverloaded || attempt === maxAttempts) {
                throw err;
            }

            console.log("Gemini overloaded - retry " + attempt + " in " + delay + "ms");
            await new Promise(function(resolve) {
                setTimeout(resolve, delay);
            });
            delay = delay * 2;
        }
    }
}

// Wording for the off-syllabus message, kept in one place.
function offSyllabusMessage(requested, subject) {
    const shown = requested || "That topic";
    return '"' + shown + '" isn\'t part of the ' + subject +
        " Cambridge IGCSE / A-Level syllabus. Try another topic.";
}

// Get the question
router.get("/question", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }

    const db = req.app.locals.db;
    const me = req.session.username;
    const subject = req.query.subject || "";
    const requestedTopic = (req.query.topic || "").trim();

    // Step 1: validate the subject before spending any API call.
    if (ALLOWED_SUBJECTS.indexOf(subject) === -1) {
        return res.status(400).json({
            error: "Unknown subject. Must be one of: " + ALLOWED_SUBJECTS.join(", ")
        });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(503).json({ error: "Question service not configured." });
    }

    try {
        // Step 2 - Attempt 1
        let result = await callGeminiWithRetry(apiKey, subject, requestedTopic, false);

        // Off-syllabus topic - tell the user (no retry; this is a valid "no").
        if (result && result.onSyllabus === false) {
            return res.status(400).json({ error: offSyllabusMessage(requestedTopic || result.topic, subject) });
        }

        // On-syllabus but the question broke a formatting rule -> retry once.
        if (!result || !isQuestionValid(result.question)) {
            result = await callGeminiWithRetry(apiKey, subject, requestedTopic, true);
        }

        // Retry came back off-syllabus (rare) -> tell the user.
        if (result && result.onSyllabus === false) {
            return res.status(400).json({ error: offSyllabusMessage(requestedTopic || result.topic, subject) });
        }

        // Still invalid after the retry -> give up gracefully.
        if (!result || !isQuestionValid(result.question)) {
            return res.status(502).json({ error: "Could not generate a valid question. Try again." });
        }

        const resolvedTopic = result.topic || requestedTopic || null;

        // Save as this user's last-viewed question
        await db.collection("lastQuestions").updateOne(
            { username: me },
            { $set: { subject, topic: resolvedTopic, question: result.question, updatedAt: new Date() } },
            { upsert: true }
        );

        res.json({ subject, topic: resolvedTopic, question: result.question });

    } catch (err) {
        console.error("GET /widget/question error:", err.message);

        // Still overloaded after every retry - say so honestly rather than
        // showing a generic failure. 503 tells the client "try again later".
        if (err.message.indexOf("503") !== -1) {
            return res.status(503).json({
                error: "The question service is busy right now. Please try again in a moment."
            });
        }

        res.status(502).json({ error: "Could not fetch question." });
    }
});

// GET /widget/question/last - fetch the logged-in user's most recently generated question, if any.
router.get("/question/last", async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: "Not logged in." });
    }

    const db = req.app.locals.db;

    try {
        const saved = await db.collection("lastQuestions").findOne({
            username: req.session.username
        });

        if (!saved) {
            return res.json({ found: false });
        }

        res.json({
            found: true,
            subject: saved.subject,
            topic: saved.topic || null,
            question: saved.question
        });

    } catch (err) {
        console.error("GET /widget/question/last error:", err.message);
        res.status(500).json({ error: "Could not fetch last question." });
    }
});
export default router;