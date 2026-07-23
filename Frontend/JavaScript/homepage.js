"use strict";

// Maps the short name used in onclick="showSection('feed')"
// to the actual section element's id in the HTML.
const SECTION_IDS = {
    feed: "sectionFeed",
    post: "sectionPost",
    chat: "sectionChat",
    profile: "sectionProfile",
    settings: "sectionSettings",
    notifications: "sectionNotifications",
    liked: "sectionLiked",
    saved: "sectionSaved"
};

// Hides every .section, shows the requested one, marks the
// matching nav buttons as active, then calls the render
// function for that section.
function showSection(name, afterRender) {
    const sectionId = SECTION_IDS[name];

    if (!sectionId) {
        console.error("showSection() called with unknown section name: " + name);
        return;
    }

    // Show loading overlay while switching sections
    showLoading("Loading…");

    simulateDelay(300).then(function() {
        // Hide all sections
        const allSections = document.querySelectorAll(".section");
        allSections.forEach(function(section) {
            section.classList.remove("activeSection");
        });

        // Show the requested section
        document.getElementById(sectionId).classList.add("activeSection");

        // Sync the active state on both nav bars
        setActiveNavButtons(name); 

        // Let callers like openPostFromChat() inject their own content safely
        if (typeof afterRender === "function") {
            afterRender();
            hideLoading();
            return;
        }

        // Default render functions per section
        if (name === "feed") {
            renderFeed();
            // Update header and composer avatars every time feed is shown
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
        } else if (name === "profile") {
            renderProfile();
        } else if (name === "settings") {
            renderSettings();
        } else if (name === "notifications") {
            renderNotifications();
        } else if (name === "chat") {
            renderChat();
        } else if (name === "liked") {
            renderLikedPosts();
        } else if (name === "saved") {
            renderSavedPosts();
        }

        hideLoading();
    });
}

// Called by the header avatar pill and the sidebar "Your Profile"
// button. Clears viewedProfileUsername so renderProfile() shows
// the logged-in user's profile
function goToMyProfile() {
    if (typeof viewedProfileUsername !== "undefined") {
        viewedProfileUsername = null;
    }
    showSection("profile");
}

// Sync active nav buttons
function setActiveNavButtons(name) {
    // Clear all header nav active states
    const headerButtons = document.querySelectorAll(".headerNavBtn");
    headerButtons.forEach(function(btn) {
        btn.classList.remove("activeHeaderNav");
    });

    // Activate the matching header button if it exists
    const headerBtn = document.getElementById("headerNav" + capitalizeFirst(name));
    if (headerBtn) {
        headerBtn.classList.add("activeHeaderNav");
    }

    // Clear all sidebar nav active states
    const sidebarButtons = document.querySelectorAll(".sidebarBtn");
    sidebarButtons.forEach(function(btn) {
        btn.classList.remove("activeLeftNav");
    });

    // Activate the matching sidebar button if it exists
    const sidebarBtn = document.getElementById("leftNav" + capitalizeFirst(name));
    if (sidebarBtn) {
        sidebarBtn.classList.add("activeLeftNav");
    }
}


// Logout modals
function showLogoutModal() {
    document.getElementById("logoutModal").style.display = "flex";
}

function closeLogoutModal() {
    document.getElementById("logoutModal").style.display = "none";
}

// About/terms/privacy modals - content is AI-generated
const infoModalContent = {
    about: {
        title: "About A-level Hub",
        body:  "A-level Hub is a student-built platform where A-level Cambridge students share solutions, ask questions, and post study notes. Built by students, for students."
    },
    privacy: {
        title: "Privacy",
        body:  "Your account details and posts are stored in a database on the A-Level Hub server. Passwords are hashed and never stored in plain text, and no data is shared with third parties."
    },
    terms: {
        title: "Terms of Use",
        body:  "By using A-level Hub, you agree to share content respectfully and avoid posting copyrighted exam material in full. This is a student project intended for educational and demonstration purposes."
    }
};

// Opens the modal and fills it with the content for the given topic
function openInfoModal(topic) {
    const data = infoModalContent[topic];
    if (!data) {
        return;
    }

    document.getElementById("infoModalTitle").textContent = data.title;
    document.getElementById("infoModalBody").textContent  = data.body;
    document.getElementById("infoModal").style.display    = "flex";
}

function closeInfoModal() {
    document.getElementById("infoModal").style.display = "none";
}

// Start up
document.addEventListener("DOMContentLoaded", function() {
    // showSection is called by checkSession after session is confirmed
});