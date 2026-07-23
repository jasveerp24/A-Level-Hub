"use strict";

// Publishing post template
const POST_TEMPLATES = {
    question: {
        placeholder: "Describe your question clearly…",
        hint: [
            "📌 <strong>Question template</strong>",
            "1. What is the question asking? (paste or summarise it)",
            "2. What have you tried so far?",
            "3. Where exactly are you stuck?"
        ],
        questionLabel: "Question Reference",
        questionPlaceholder: "e.g. Oct 2023 Paper 12, Q4(b)",
        questionRequired: true
    },
    solution: {
        placeholder: "Write your full solution with all workings…",
        hint: [
            "📌 <strong>Solution template</strong>",
            "1. State what is given and what is required",
            "2. Show every step of working clearly",
            "3. State the final answer with units if applicable"
        ],
        questionLabel: "Question Reference",
        questionPlaceholder: "e.g. Oct 2023 Paper 12, Q4(b)",
        questionRequired: true
    },
    // No question reference
    note: {
        placeholder: "Write your study notes here…",
        hint: [
            "📌 <strong>Note template</strong>",
            "1. Topic name and subtopic",
            "2. Key definitions or formulas",
            "3. Important points to remember",
            "4. Common mistakes to avoid"
        ],
        questionLabel: "Topic / Chapter",
        questionPlaceholder: "e.g. Chapter 3 — Quadratic Equations",
        questionRequired: false
    }
};


// ====== Apply template when post type changes ======
function applyPostTemplate(type) {
    const template = POST_TEMPLATES[type];
    if (!template) {
        return;
    }

    // Update textarea placeholder
    const contentArea = document.getElementById("postContent");
    if (contentArea) {
        contentArea.placeholder = template.placeholder;
    }

    // Update the reference field label
    const questionLabel = document.getElementById("postQuestionLabel");
    if (questionLabel) {
        if (template.questionRequired) {
            questionLabel.textContent = template.questionLabel;
        } else {
            // Note type
            questionLabel.textContent = template.questionLabel;
        }
    }

    // Update the reference field placeholder
    const questionInput = document.getElementById("postQuestion");
    if (questionInput) {
        questionInput.placeholder = template.questionPlaceholder;
    }

    // Show the structured hint block
    const hintEl = document.getElementById("postTemplateHint");
    if (hintEl) {
        hintEl.innerHTML = template.hint.join("<br>");
        hintEl.classList.add("visible");
    }
}

// ====== Link buttons ======
function setupPostTypeListeners() {
    const radios = document.querySelectorAll('input[name="postType"]');

    radios.forEach(function(radio) {
        radio.addEventListener("change", function() {
            if (radio.checked) {
                applyPostTemplate(radio.value);
            }
        });
    });

    // Apply the default
    applyPostTemplate("solution");
}


// Image upload and previews
var selectedFiles = [];
var MAX_FILES = 10;


// Callback - fired by the hidden <input type="file"> onchange
function handleMultiFileSelect(event) {
    const newFiles = Array.from(event.target.files);

    // Add each new file unless max has been reached
    newFiles.forEach(function(file) {
        if (selectedFiles.length < MAX_FILES) {
            selectedFiles.push(file);
        }
    });

    // Reset the input value
    event.target.value = "";

    renderPreviews();
}


// Rebuilds the preview strip from the current selectedFiles array.
// Called after adding or removing a file.
function renderPreviews() {
    const strip = document.getElementById("imagePreviewStrip");
    const countLabel = document.getElementById("imageCountLabel");
    if (!strip || !countLabel) {
        return;
    }

    // Clear the existing thumbnails before rebuilding
    strip.innerHTML = "";

    selectedFiles.forEach(function(file, index) {
        const thumb = document.createElement("div");
        thumb.className = "previewThumb";

        const img = document.createElement("img");

        // Creates a temporary local URL for the file so it can be displayed without uploading it.
        // revokeObjectURL frees that memory once the image loads.
        img.src = URL.createObjectURL(file);
        img.alt = file.name;
        img.onload = function() {
            URL.revokeObjectURL(img.src);
        };

        const removeBtn = document.createElement("button");
        removeBtn.className = "previewRemoveBtn";
        removeBtn.textContent = "✕";
        removeBtn.type = "button";
        removeBtn.title = "Remove this image";

        // Remove exactly one specific file
        removeBtn.addEventListener("click", (function(i) {
            return function() {
                // splice removes exactly one element at position i
                selectedFiles.splice(i, 1);
                renderPreviews();
            };
        })(index));

        thumb.appendChild(img);
        thumb.appendChild(removeBtn);
        strip.appendChild(thumb);
    });

    // Update the count label below the strip
    const count = selectedFiles.length;

    if (count === 0) {
        countLabel.textContent = "";
        countLabel.classList.remove("atLimit");
    } else if (count === MAX_FILES) {
        countLabel.textContent = MAX_FILES + " images selected (limit reached)";
        countLabel.classList.add("atLimit");
    } else {
        if (count > 1) {
            countLabel.textContent = count + " images selected"; // Plural
        } else {
            countLabel.textContent = count + " image selected"; // Singular
        }
        countLabel.classList.remove("atLimit");
    }
}


//Handle post submission
async function handlePostSubmit(event) {
    event.preventDefault();

    const me = appState_currentUsername();
    if (!me) {
        setMsg("postMessage", "You must be logged in to post.", "error");
        return;
    }

    // Read whichever radio button is currently checked
    const typeInput = document.querySelector('input[name="postType"]:checked');

    var postType;
    if (typeInput) {
        postType = typeInput.value;
    } else {
        postType = "solution";
    }

    const subject = document.getElementById("postSubject").value;
    const questionRef = document.getElementById("postQuestion").value.trim();
    const content = document.getElementById("postContent").value.trim();

    // Validate subject
    if (!subject) {
        setMsg("postMessage", "Please select a subject.", "error");
        return;
    }

    // Validate content
    if (!content) {
        setMsg("postMessage", "Please write some content before posting.", "error");
        return;
    }

    // Validate question reference for question and solution types
    const currentTemplate = POST_TEMPLATES[postType];
    if (currentTemplate && currentTemplate.questionRequired && !questionRef) {
        setMsg("postMessage", "Please add a question reference.", "error");
        return;
    }

    showLoading("Publishing your post…");

    try {
        // Step 1 - upload images first if any are selected
        let imageIds = [];

        if (selectedFiles.length > 0) {
            const formData = new FormData();

            for (let i = 0; i < selectedFiles.length; i++) {
                // "images" must match the field name in multer upload.array("images", 10)
                formData.append("images", selectedFiles[i]);
            }

            const imageResponse = await fetch("/M01067508/images", {
                method: "POST",
                credentials: "include",
                body: formData
                // No Content-Type header — browser sets it automatically for FormData
            });

            const imageData = await imageResponse.json();

            if (!imageResponse.ok) {
                hideLoading();
                setMsg("postMessage", imageData.error || "Image upload failed.", "error");
                return;
            }

            // filenames returned by images.js ["alice_1718630000.png"]
            imageIds = imageData.filenames;
        }

        // Step 2 - send post data to server
        const postResponse = await fetch("/M01067508/contents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                type: postType,
                subject: subject,
                questionRef: questionRef,
                content: content,
                imageIds: imageIds
            })
        });

        const postData = await postResponse.json();
        hideLoading();

        if (!postResponse.ok) {
            setMsg("postMessage", postData.error || "Could not publish post.", "error");
            return;
        }

        setMsg("postMessage", "Post published!", "success");
        showToast("Your post has been published.", "success");

        document.getElementById("postForm").reset();
        selectedFiles = [];
        renderPreviews();

        const defaultType = document.getElementById("typeSolution");
        if (defaultType) {
            defaultType.checked = true;
            applyPostTemplate("solution");
        }

        setTimeout(function() {
            setMsg("postMessage", "", "");
            showSection("feed");
        }, 700);

    } catch (err) {
        hideLoading();
        setMsg("postMessage", "Could not connect to server.", "error");
        console.error("handlePostSubmit error:", err.message);
    }
}

// Start up
document.addEventListener("DOMContentLoaded", function() {
    setupPostTypeListeners();
});