"use strict";

// Third-party API widgets shown on the home screen:
//   1) Quote of the Day (API Ninjas) 
//   2) On This Day (Byabbe) 
//   3) Question generator  (Google Gemini)  

// Widget 1 - Loads quote of the day from NINJA-API via our server
async function loadQuoteWidget() {
    const body = document.querySelector("#apiCard1 .apiCardBody");
    if (!body) { 
        return; 
    }

    body.textContent = "Loading quote…";

    try {
        const response = await fetch("/M01067508/widget/quote", {
            credentials: "include"
        });

        const data = await response.json();

        if (!response.ok) {
            body.textContent = "Quote unavailable today.";
            return;
        }

        body.innerHTML =
            '<p class="quoteText">"' + data.text + '"</p>' +
            '<p class="quoteAuthor">- ' + data.author + "</p>";

    } catch (err) {
        body.textContent = "Could not load quote.";
        console.error("loadQuoteWidget error:", err.message);
    }
}


// Widget 2: On This Day (Byabbe)
async function loadOnThisDayWidget() {
    const body = document.querySelector("#apiCard2 .apiCardBody");
    if (!body) {
        return;
    }

    body.textContent = "Loading today's event…";

    try {
        const response = await fetch("/M01067508/widget/onthisday", {
            credentials: "include"
        });

        const data = await response.json();

        if (!response.ok) {
            body.textContent = "Event unavailable today.";
            return;
        }

        // Build with textContent so the event text can't inject markup.
        body.innerHTML = "";

        const yearEl = document.createElement("p");
        yearEl.className = "otdYear";
        yearEl.textContent = data.year;
        body.appendChild(yearEl);

        const eventEl = document.createElement("p");
        eventEl.className = "otdEvent";
        eventEl.textContent = data.event;
        body.appendChild(eventEl);

        // Wikipedia content is CC BY-SA, so credit the source.
        const sourceEl = document.createElement("p");
        sourceEl.className = "otdSource";
        sourceEl.textContent = "via Wikipedia";
        body.appendChild(sourceEl);

    } catch (err) {
        body.textContent = "Could not load today's event.";
        console.error("loadOnThisDayWidget error:", err.message);
    }
}

// Widget 3 - Cambridge-style Question Widget
const QUESTION_WIDGET_SUBJECTS = [
    "Mathematics", "Additional Mathematics", "Physics", "Chemistry",
    "Biology", "Computer Science", "Economics", "Accounts",
    "General Paper", "French", "English Literature", "French Literature"
];

// Tracks the subject and topic currently shown
let currentQuestionSubject = null;
let currentQuestionTopic = null;

// Builds the widget's shell, then tries to restore this user's last saved question
function loadQuestionWidget() {
    renderQuestionWidgetShell();
    restoreLastQuestion();
}

// Builds the widget's inner HTML: a small text input + send / reload button,
function renderQuestionWidgetShell() {
    const body = document.querySelector("#apiCard3 .apiCardBody");
    if (!body) { 
        return; 
    }

    body.innerHTML =
        '<div class="questionWidgetInputRow">' +
            '<input type="text" id="questionSubjectInput" class="questionWidgetInput" ' +
                'placeholder="Type a subject and topic…" autocomplete="off">' +
            '<button id="questionSendBtn" class="questionWidgetSendBtn" title="Get question">➤</button>' +
            '<button id="questionReloadBtn" class="questionWidgetReloadBtn" title="New question">↻</button>' +
        '</div>' +
        '<div id="questionWidgetBody" class="questionWidgetBody">' +
            '<p class="questionWidgetHint">Type a subject above to get a practice question.</p>' +
        '</div>';

    const input = document.getElementById("questionSubjectInput");
    const sendBtn = document.getElementById("questionSendBtn");
    const reloadBtn = document.getElementById("questionReloadBtn");

    // Pressing Enter in the input triggers a fetch, same as clicking send
    input.addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            handleSubjectSubmit(input.value.trim());
        }
    });

    sendBtn.addEventListener("click", function() {
        handleSubjectSubmit(input.value.trim());
    });

    reloadBtn.addEventListener("click", function() {
        if (currentQuestionSubject) {
            // Reload = fetch a fresh question for the same subject / topic (if one was set)
            fetchAndShowQuestion(currentQuestionSubject, currentQuestionTopic);
        } else if (input.value.trim()) {
            handleSubjectSubmit(input.value.trim());
        }
    });
}

// On load, check whether this logged-in user already has a saved question
async function restoreLastQuestion() {
    const widgetBody = document.getElementById("questionWidgetBody");
    if (!widgetBody) { 
        return; 
    }

    try {
        const response = await fetch("/M01067508/widget/question/last", {
            credentials: "include"
        });

        if (!response.ok) {
            // Not logged in, or a server error
            return;
        }

        const data = await response.json();

        if (!data.found) {
            return; // nothing saved yet for this user - keep placeholder
        }

        currentQuestionSubject = data.subject;
        currentQuestionTopic = data.topic || null;
        widgetBody.innerHTML =
            '<p class="questionWidgetSubjectLabel">' + data.subject + "</p>" +
            '<p class="questionWidgetText">' + data.question + "</p>";

    } catch (err) {
        console.error("restoreLastQuestion error:", err.message);
    }
}

// Common short forms / alternate spellings mapped to the exact subject name
const SUBJECT_ALIASES = {
    "math": "Mathematics",
    "maths": "Mathematics",
    "mathematics": "Mathematics",
    "add math": "Additional Mathematics",
    "add maths": "Additional Mathematics",
    "additional math": "Additional Mathematics",
    "additional maths": "Additional Mathematics",
    "additional mathematics": "Additional Mathematics",
    "physics": "Physics",
    "chem": "Chemistry",
    "chemistry": "Chemistry",
    "bio": "Biology",
    "biology": "Biology",
    "comp sci": "Computer Science",
    "cs": "Computer Science",
    "computer science": "Computer Science",
    "computing": "Computer Science",
    "econ": "Economics",
    "economics": "Economics",
    "accounts": "Accounts",
    "accounting": "Accounts",
    "gp": "General Paper",
    "general paper": "General Paper",
    "french": "French",
    "eng lit": "English Literature",
    "english lit": "English Literature",
    "english literature": "English Literature",
    "french lit": "French Literature",
    "french literature": "French Literature"
};

// Tries to find a subject inside whatever the user typed
function extractSubjectFromText(typedText) {
    const lower = typedText.toLowerCase();

    // Exact match against the official list
    const exact = QUESTION_WIDGET_SUBJECTS.find(function(s) {
        return s.toLowerCase() === lower;
    });
    if (exact) { return exact; }

    // Otherwise search aliases, longest key first
    const aliasKeys = Object.keys(SUBJECT_ALIASES).sort(function(a, b) {
        return b.length - a.length;
    });

    for (let i = 0; i < aliasKeys.length; i++) {
        const key = aliasKeys[i];
        if (lower.indexOf(key) !== -1) {
            return SUBJECT_ALIASES[key];
        }
    }

    return null; // nothing recognisable found
}

// Extracts a subject from whatever free text the user typed
function handleSubjectSubmit(typedText) {
    const match = extractSubjectFromText(typedText);

    const widgetBody = document.getElementById("questionWidgetBody");

    if (!match) {
        widgetBody.innerHTML =
            '<p class="questionWidgetError">Please include a subject, e.g. "Physics, projectile motion".</p>';
        return;
    }

    // The topic is now OPEN. We pass the user's own words straight through and
    // let the AI work out the topic (and whether it is on the syllabus). We only
    // strip the subject word itself so the topic reads cleanly — no keyword
    // lists, no topic array.
    let topic = stripWholeWord(typedText.toLowerCase(), match.toLowerCase())
        .replace(/[.,!?]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (topic.length === 0) {
        topic = null; // no topic given -> the AI picks any on-syllabus topic
    }

    fetchAndShowQuestion(match, topic);
}

// Removes a whole word/phrase from text (used only to drop the subject word).
function stripWholeWord(text, phrase) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp("\\b" + escaped + "\\b", "g");
    return text.replace(pattern, " ");
}

// Fetches one question for the given subject (and optional topic)
// replaces whatever is currently shown - never appends
async function fetchAndShowQuestion(subject, topic) {
    const widgetBody = document.getElementById("questionWidgetBody");
    if (!widgetBody) { return; }

    currentQuestionSubject = subject;
    currentQuestionTopic = topic || null;
    widgetBody.innerHTML = '<p class="questionWidgetHint">Loading question…</p>';

    try {
        let url = "/M01067508/widget/question?subject=" + encodeURIComponent(subject);
        if (topic) {
            url = url + "&topic=" + encodeURIComponent(topic);
        }

        const response = await fetch(url, { credentials: "include" });

        const data = await response.json();

        if (!response.ok) {
            // Covers both "unknown subject" and "topic"
            widgetBody.innerHTML =
                '<p class="questionWidgetError">' + (data.error || "Could not load a question.") + "</p>";
            return;
        }

        // Track whatever topic the server actually resolved/used
        currentQuestionTopic = data.topic || null;

        let topicLabel;
        if (data.topic) {
            topicLabel = data.subject + " — " + data.topic;
        } else {
            topicLabel = data.subject;
        }

        // Replaces the previous question entirely — one question only
        widgetBody.innerHTML =
            '<p class="questionWidgetSubjectLabel">' + topicLabel + "</p>" +
            '<p class="questionWidgetText">' + data.question + "</p>";

    } catch (err) {
        widgetBody.innerHTML = '<p class="questionWidgetError">Could not connect to server.</p>';
        console.error("fetchAndShowQuestion error:", err.message);
    }
}