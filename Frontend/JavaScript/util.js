const loadingOverlay = document.getElementById("loadingOverlay");
const loadingMsg = document.getElementById("loadingMsg");
const toastEl = document.getElementById("toastNotif");

// ====== Loading overlay ======
function showLoading(message) {
    loadingMsg.textContent = message || "Loading…";
    loadingOverlay.style.display = "flex";
}

function hideLoading() {
    loadingOverlay.style.display = "none";
}

// ====== Toast notification ======
let toastTimer = null;

function showToast(message, type) {
    toastEl.textContent = message;
    toastEl.className = "toastNotif";

    // Positive messages
    if (type === "success") {
        toastEl.classList.add("toastSuccess");
    // Negative messages
    } else if (type === "error") {
        toastEl.classList.add("toastError");
    }

    // Trigger the slide-up CSS transition by adding .show
    requestAnimationFrame(function() {
        toastEl.classList.add("show");
    });

    // Callback - The browser calls the function later, not immediately
    if (toastTimer) {
        clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(function() {
        toastEl.classList.remove("show");
    }, 3500);
}

// ====== Inline message helper ======
let msgTimers = {}; // tracks one timer per message element

function setMsg(elementId, text, type) {
    const el = document.getElementById(elementId);
    if (!el) {
        return;
    }

    // Clear any existing auto-hide timer for this element
    if (msgTimers[elementId]) {
        clearTimeout(msgTimers[elementId]);
        delete msgTimers[elementId];
    }

    if (!text) {
        el.className = "inlineMsg";
        el.style.display = "none";
        el.textContent = "";
        return;
    }

    el.textContent = text;

    if (type === "success") {
        el.className = "inlineMsg show successMsg";
    } else {
        el.className = "inlineMsg show errorMsg";
    }
    el.style.display = "block";

    // Auto-hide after 3 seconds
    msgTimers[elementId] = setTimeout(function() {
        el.className = "inlineMsg";
        el.style.display = "none";
        el.textContent = "";
        delete msgTimers[elementId];
    }, 3000);
}

// Promise to fake the delay while server is fetching a request
function simulateDelay(ms) {
    return new Promise(function(resolve) {
            setTimeout(resolve, ms);
    });
}

// To capitalize the section names
function capitalizeFirst(word) {
    if (!word) {
        return "";
    }
    return word.charAt(0).toUpperCase() + word.slice(1);
}
