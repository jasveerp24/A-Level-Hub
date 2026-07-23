"use strict";

const ALL_SUBJECTS = [
    "Mathematics", "Additional Mathematics", "Physics", "Chemistry",
    "Biology", "Computer Science", "Economics", "Accounts",
    "General Paper", "French", "English Literature", "French Literature"
];

// Live search dropdown

// Debounce timer - prevents a fetch on every single keystroke
let searchDebounceTimer = null;

function handleSearchInput() {
    const input = document.getElementById("globalSearchInput");
    const query = input.value.trim().toLowerCase();

    const panel = document.getElementById("searchResultsPanel");
    if (!panel) {
        return;
    }

    // Empty query — collapse and clear the panel
    if (!query) {
        panel.style.display = "none";
        panel.innerHTML     = "";
        return;
    }

    // Wait 300ms after the user stops typing before fetching
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(async function() {
        try {
            // Fetch matching users from server - GET /users?q=query
            const response = await fetch("/M01067508/users?q=" + encodeURIComponent(query), {
                credentials: "include"
            });

            const matchingUsers = await response.json();

            // Subject match is still done locally - subjects are fixed constants
            const matchingSubject = ALL_SUBJECTS.find(function(s) {
                return s.toLowerCase().indexOf(query.toLowerCase()) !== -1;
            });

            panel.innerHTML = "";

            if (matchingUsers.length === 0 && !matchingSubject) {
                panel.innerHTML = '<div class="searchPanelEmpty">No matches found.</div>';
                panel.style.display = "block";
                return;
            }

            if (matchingSubject) {
                panel.appendChild(buildSubjectResultRow(matchingSubject));
            }

            if (matchingUsers.length > 0) {
                const label = document.createElement("div");
                label.className = "searchPanelSectionLabel";
                label.textContent = "Students";
                panel.appendChild(label);

                matchingUsers.forEach(function(u) {
                    panel.appendChild(buildUserResultRow(u));
                });
            }

            panel.style.display = "block";

        } catch (err) {
            console.error("Search failed:", err.message);
        }
    }, 300);
}

// Builds one row in the dropdown for a matching subject.
function buildSubjectResultRow(subject) {
    const row = document.createElement("div");
    row.className = "searchPanelRow searchPanelSubjectRow";
    row.innerHTML =
        '<span class="searchPanelSubjectIcon">📚</span>' +
        '<span class="searchPanelSubjectText">Posts about <strong>' +
        subject + "</strong></span>";

    row.addEventListener("click", function() {
        filterFeedBySubject(subject);
        closeSearchPanel();
    });

    return row;
}

// Builds one row in the dropdown for a matching user.
// Clicking opens their profile via openUserProfile().
function buildUserResultRow(user) {
    const row = document.createElement("div");
    row.className = "searchPanelRow";

    const avatarDiv = document.createElement("div");
    avatarDiv.className = "searchPanelAvatar";

    if (typeof renderAvatarInto === "function") {
        renderAvatarInto(avatarDiv, user.username);
    } else {
        avatarDiv.textContent = user.username.charAt(0).toUpperCase();
    }

    const infoDiv = document.createElement("div");
    infoDiv.className = "searchPanelUserInfo";

    const usernameEl = document.createElement("span");
    usernameEl.className = "searchPanelUsername";
    usernameEl.textContent = user.username;

    const fullNameEl = document.createElement("span");
    fullNameEl.className = "searchPanelFullName";
    fullNameEl.textContent = user.firstName + " " + user.lastName;

    infoDiv.appendChild(usernameEl);
    infoDiv.appendChild(fullNameEl);

    row.appendChild(avatarDiv);
    row.appendChild(infoDiv);

    row.addEventListener("click", function() {
        openUserProfile(user.username);
        closeSearchPanel();
    });

    return row;
}

// Hides the dropdown, clears its contents, and empties the search input.
function closeSearchPanel() {
    const panel = document.getElementById("searchResultsPanel");
    if (panel) {
        panel.style.display = "none";
        panel.innerHTML     = "";
    }
    const input = document.getElementById("globalSearchInput");
    if (input) {
        input.value = "";
    }
}

// Click-outside listener
document.addEventListener("click", function(event) {
    const panel = document.getElementById("searchResultsPanel");
    const wrap = document.querySelector(".headerSearchWrap");

    if (!panel || !wrap) {
        return;
    }

    if (!panel.contains(event.target) && !wrap.contains(event.target)) {
        panel.style.display = "none";
    }
});