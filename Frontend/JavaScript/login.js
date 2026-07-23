"use strict";

// ====== Get DOM elements ======
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const tabLoginBtn = document.getElementById("tabLoginBtn");
const tabRegisterBtn = document.getElementById("tabRegisterBtn");
const loginUsernameEl = document.getElementById("loginUsername");
const loginPasswordEl = document.getElementById("loginPassword");
const regFirstNameEl = document.getElementById("regFirstName");
const regLastNameEl = document.getElementById("regLastName");
const regUsernameEl = document.getElementById("regUsername");
const regEmailEl = document.getElementById("regEmail");
const regAgeEl = document.getElementById("regAge");
const regGenderEl = document.getElementById("regGender");
const regPasswordEl = document.getElementById("regPassword");
const regFavSubjectEl = document.getElementById("regFavSubject");

// ====== Tab switching ======
function showLoginTab() {
    loginForm.classList.add("activeForm");
    registerForm.classList.remove("activeForm");
    tabLoginBtn.classList.add("activeTab");
    tabRegisterBtn.classList.remove("activeTab");
    setMsg("loginMessage", "", "");
}

function showRegisterTab() {
    registerForm.classList.add("activeForm");
    loginForm.classList.remove("activeForm");
    tabRegisterBtn.classList.add("activeTab");
    tabLoginBtn.classList.remove("activeTab");
    setMsg("registerMessage", "", "");
}

// Get logged in username
let currentUsername = null;

function appState_currentUsername() {
    return currentUsername;
}

// ====== Live validation ======

// Email - check format while typing
regEmailEl.addEventListener("input", function() {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Regex format check
    if (regEmailEl.value && !emailPattern.test(regEmailEl.value)) {
        // arguments: HTML target, message, colour
        setMsg("registerMessage", "Email format: example@domain.com", "error");
    } else {
        setMsg("registerMessage", "", "");
    }
});

// Username - check length while typing
regUsernameEl.addEventListener("input", function() {
    const val = regUsernameEl.value.trim();
    if (val.length > 0 && val.length < 5) {
        setMsg("registerMessage", "Username must be at least 5 characters", "error");
    } else {
        setMsg("registerMessage", "", "");
    }
});

// Age - prevent unrealistic values while typing
regAgeEl.addEventListener("input", function() {
    const age = parseInt(regAgeEl.value);
    if (regAgeEl.value && (age < 13 || age > 100)) {
        setMsg("registerMessage", "Please enter a valid age (13-100)", "error");
    } else {
        setMsg("registerMessage", "", "");
    }
});

// Password - check strength while typing
regPasswordEl.addEventListener("input", function() {
    const val = regPasswordEl.value;

    let hasUpper = false;
    let hasLower = false;
    let hasNumber = false;
    let hasSpecial = false;

    // Loop through every character in the password
    for (let i = 0; i < val.length; i++) {
        const ch = val[i]; // Current character

        if (ch >= "A" && ch <= "Z") {
            hasUpper = true; // Capital letter found
        } else if (ch >= "a" && ch <= "z") {
            hasLower = true; // Lowercase letter found
        } else if (ch >= "0" && ch <= "9") {
            hasNumber = true; // Number found
        } else {
            hasSpecial = true; // Not a letter or number = special character
        }
    }

    // Build the missing list
    const missing = [];
    if (val.length < 8) {
        missing.push("ch:(" + val.length + "/8)");
    }
    if (!hasUpper) {
        missing.push("uppercase letter");
    }
    if (!hasLower) {
        missing.push("lowercase letter");
    }
    if (!hasNumber) {
        missing.push("number");
    }
    if (!hasSpecial) {
        missing.push("special character");
    }

    if (val.length === 0) {
        // Field is empty - hide message
        setMsg("registerMessage", "", "");
    } else if (missing.length > 0) {
        // Something is missing
        setMsg("registerMessage", "Missing: " + missing.join(", "), "error");
    } else {
        // All requirements met
        setMsg("registerMessage", "Strong password ✓", "success");
    }
});

// ====== Register form submit ======
async function handleRegister(event) {
    event.preventDefault(); // Prevent page refresh

    // Get values
    const firstName = regFirstNameEl.value.trim();
    const lastName = regLastNameEl.value.trim();
    const username = regUsernameEl.value.trim();
    const email = regEmailEl.value.trim();
    const age = regAgeEl.value.trim();
    const gender = regGenderEl.value;
    const password = regPasswordEl.value.trim();
    let favouriteSubject;
    if (regFavSubjectEl) {
        favouriteSubject = regFavSubjectEl.value;
    } else {
        favouriteSubject = "";
    }

    // Check for empty fields
    if (!firstName || !lastName || !username || !email || !age || !gender || !password) {
        setMsg("registerMessage", "Please fill in all fields", "error");
        return;
    }

    if (password.length < 8) {
        setMsg("registerMessage", "Password must be at least 8 characters", "error");
        return;
    }

    // Full strength validation - same checks as the live listener
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

    const missing = [];
    if (!hasUpper) {
        missing.push("uppercase letter");
    }
    if (!hasLower) {
        missing.push("lowercase letter");
    }
    if (!hasNumber) {
        missing.push("number");
    }
    if (!hasSpecial) {
        missing.push("special character");
    }

    if (missing.length > 0) {
        setMsg("registerMessage", "Password needs: " + missing.join(", ") + ".", "error");
        return;
    }

    if (parseInt(age) < 13 || parseInt(age) > 100) {
        setMsg("registerMessage", "Please enter a valid age (13-100)", "error");
        return;
    }

    // Long operation starts
    showLoading("Creating your account…");

    // simulateDelay returns a Promise
    try {
        const response = await fetch("/M01067508/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                firstName, lastName, username, email,
                age, gender, password, favouriteSubject
            })
        });

        const data = await response.json();
        hideLoading();

        if (!response.ok) {
            setMsg("registerMessage", data.error, "error");
            return;
        }

        setMsg("registerMessage", "Registration successful!", "success");
        registerForm.reset();

        setTimeout(function() {
            showLoginTab();
            setMsg("registerMessage", "", "");
        }, 1000);

    } catch (err) {
        hideLoading();
        setMsg("registerMessage", "Could not connect to server.", "error");
    }
}

// ====== Login form submit ======
async function handleLogin(event) {
    event.preventDefault(); // Prevents page from reloading

    const username = loginUsernameEl.value.trim();
    const password = loginPasswordEl.value.trim();

    if (!username || !password) {
        setMsg("loginMessage", "Please enter your username and password", "error");
        return;
    }

    showLoading("Logging in…");

    // Promise
    try {
        const response = await fetch("/M01067508/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" }, // Body is JSON
            credentials: "include", // Send the session cookie with the request
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        hideLoading();

        if (!response.ok) {
            setMsg("loginMessage", data.error, "error");
            return;
        }

        // Credentials correct — save session
        currentUsername = username;

        if (typeof avatarCache !== "undefined") {
            avatarCache[username] = data.avatar || "";
        }

        if (typeof applyDarkModeFromServer === "function") {
            applyDarkModeFromServer(data.darkMode);
        }

        setMsg("loginMessage", "Login successful!", "success");

        // setTimeout Callback - navigate to app after 800ms
        setTimeout(function() {
            document.getElementById("authScreen").style.display = "none";
            document.getElementById("homeShell").style.display = "block";

            // Always start on feed after login
            showSection("feed");

            // Reset viewed profile so you see your own profile
            if (typeof viewedProfileUsername !== "undefined") {
                viewedProfileUsername = null;
            }

            if (typeof loadBlockedUsers === "function") {
                loadBlockedUsers();
            }

            if (typeof updateNotificationDot === "function") {
                updateNotificationDot();
            }

            if (typeof updateChatUnreadDot === "function") {
                updateChatUnreadDot();
            }

            if (typeof setFeedSort === "function") { 
                setFeedSort("latest"); 
            }

            if (typeof loadQuoteWidget === "function") { 
                loadQuoteWidget(); 
            }

            if (typeof loadOnThisDayWidget === "function") { 
                loadOnThisDayWidget(); 
            }
            
            if (typeof loadQuestionWidget === "function") { 
                loadQuestionWidget(); 
            }
            
            // Update header avatar immediately so it shows the newly logged-in user's picture
            if (typeof renderMyAvatarInto === "function") {
                const headerAvatarEl = document.getElementById("headerAvatar");
                
                if (headerAvatarEl) {
                    renderMyAvatarInto(headerAvatarEl);
                }
                const composerAvatarEl = document.getElementById("composerAvatar");
                if (composerAvatarEl) {
                    renderMyAvatarInto(composerAvatarEl);
                }
            }

            if (typeof startChatPolling === "function") { startChatPolling(); }
        }, 800);

    } catch(err) {
        hideLoading();
        setMsg("loginMessage", "Could not connect to server.", "error");
    }
}

// ====== Session check on page load ======
async function checkSession() {
    try {
        const response = await fetch("/M01067508/login", {
            credentials: "include"
        });

        const data = await response.json();

        if (!data.loggedIn) {
            return;
        }

        // Save session in memory
        currentUsername = data.username;

        if (typeof avatarCache !== "undefined") {
            avatarCache[data.username] = data.avatar || "";
        }

        if (typeof applyDarkModeFromServer === "function") {
            applyDarkModeFromServer(data.darkMode);
        }

        showLoading("Starting up…");

        setTimeout(function() {
            hideLoading();
            document.getElementById("authScreen").style.display = "none";
            document.getElementById("homeShell").style.display = "block";
            showSection("feed")

            if (typeof startChatPolling === "function") { 
                startChatPolling(); 
            }

            if (typeof loadBlockedUsers === "function") {
                loadBlockedUsers();
            }

            if (typeof updateNotificationDot === "function") {
                updateNotificationDot();
            }

            if (typeof updateChatUnreadDot === "function") {
                updateChatUnreadDot();
            }

            if (typeof setFeedSort === "function") { 
                setFeedSort("latest"); 
            }

            if (typeof loadQuoteWidget === "function") { 
                loadQuoteWidget(); 
            }

            if (typeof loadOnThisDayWidget === "function") { 
                loadOnThisDayWidget(); 
            }           

            if (typeof loadQuestionWidget === "function") { 
                loadQuestionWidget(); 
            }

        }, 400);

    } catch(err) {
        // Server not running - stay on auth screen silently
        console.error("Session check failed:", err.message);
    };
}

// Log out - return to authentication screen
async function confirmLogout() {
    closeLogoutModal();
    showLoading("Logging out…");

    try {
        await fetch("/M01067508/login", {
            method: "DELETE",
            credentials: "include"
        });

    } catch (err) {
        console.error("Logout request failed:", err.message);
    }

    currentUsername = null;

    // Reset viewed profile state
    if (typeof viewedProfileUsername !== "undefined") {
        viewedProfileUsername = null;
    }

    // Reset active chat
    if (typeof activeConvKey !== "undefined") {
        activeConvKey = null;
    }

    // Reset to light mode in login
    darkModeState = false;
    document.body.classList.remove("darkMode");

    // Clear auth forms
    document.getElementById("loginForm").reset();
    document.getElementById("registerForm").reset();

    hideLoading();
    document.getElementById("homeShell").style.display = "none";
    document.getElementById("authScreen").style.display = "flex";
    showLoginTab();
}

document.addEventListener("DOMContentLoaded", function() {
    showLoginTab();  // Start on login tab by default
    checkSession();  // Check for existing session
});