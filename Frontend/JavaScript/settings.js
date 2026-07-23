"use strict";

//Dark Mode
let darkModeState = false;

function applyDarkModeFromServer(isDark) {
    darkModeState = isDark === true;

    if (darkModeState) {
        // CSS dark mode layout will overwrite the light mode
        document.body.classList.add("darkMode");
    } else {
        document.body.classList.remove("darkMode");
    }

    // Keep the Settings toggle in sync if the section is open
    const toggle = document.getElementById("darkModeToggle");
    if (toggle) {
        toggle.checked = darkModeState; // Calls dark mode when user flips the switch
    }
}

// If switched to dark mode, save to the server
async function toggleDarkMode() {
    const toggle = document.getElementById("darkModeToggle");
    const isDark = toggle.checked;

    darkModeState = isDark;

    if (isDark) {
        document.body.classList.add("darkMode");
    } else {
        document.body.classList.remove("darkMode");
    }

    try {
        const response = await fetch("/M01067508/users/me", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ darkMode: isDark })
        });

        if (!response.ok) {
            showToast("Could not save theme preference.", "error");
        }

    } catch (err) {
        showToast("Could not save theme preference.", "error");
        console.error("toggleDarkMode error:", err.message);
    }
}
// ====== Privacy handler ======
function setupPrivacyListeners() {
    const publicRadio = document.getElementById("privacyPublic");
    const privateRadio = document.getElementById("privacyPrivate");

    // If clicked on, public, change account privacy to public
    publicRadio.addEventListener("change", function() {
        if (publicRadio.checked) {
            updateAccountPrivacy("public");
        }
    });

    privateRadio.addEventListener("change", function() {
        if (privateRadio.checked) {
            updateAccountPrivacy("private");
        }
    });
}

// Set privacy of current user in server
async function updateAccountPrivacy(newPrivacy) {
    try {
        const response = await fetch("/M01067508/users/me", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ privacy: newPrivacy })
        });

        if (!response.ok) {
            const data = await response.json();
            showToast(data.error, "error");
            return;
        }

        showToast("Account is now " + newPrivacy + ".", "success");

        if (typeof renderFollowRequests === "function") { 
            renderFollowRequests(); 
        }

    } catch (err) {
        showToast("Could not update privacy.", "error");
        console.error("updateAccountPrivacy error:", err.message);
    }
}

// Edit profile

// Fill the current user's detail
async function populateEditProfileForm() {
    const me = appState_currentUsername();
    if (!me) { return; }

    try {
        const response = await fetch("/M01067508/users/" + me, {
            credentials: "include"
        });

        if (!response.ok) { return; }

        const user = await response.json();

        document.getElementById("editFirstName").value = user.firstName  || "";
        document.getElementById("editLastName").value  = user.lastName   || "";
        document.getElementById("editBio").value = user.bio        || "";

        // Populate favourite subject if the select element exists in the form
        const favEl = document.getElementById("editFavSubject");
        if (favEl) {
            favEl.value = user.favouriteSubject || "";
        }

    } catch (err) {
        console.error("populateEditProfileForm error:", err.message);
    }
}


// Submission of profile detail changes + validation
async function handleEditProfile(event) {
    event.preventDefault();

    const firstName = document.getElementById("editFirstName").value.trim();
    const lastName = document.getElementById("editLastName").value.trim();
    const bio = document.getElementById("editBio").value.trim();
    const favEl = document.getElementById("editFavSubject");
    let favouriteSubject;
    if (favEl) {
        favouriteSubject = favEl.value;
    } else {
        favouriteSubject = "";
    }

    if (!firstName || !lastName || !bio) {
        setMsg("editProfileMessage", "Please fill in all fields.", "error");
        return;
    }

    showLoading("Saving changes…");

    try {
        const response = await fetch("/M01067508/users/me", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ firstName, lastName, bio, favouriteSubject })
        });

        const data = await response.json();
        hideLoading();

        if (!response.ok) {
            setMsg("editProfileMessage", data.error, "error");
            return;
        }

        setMsg("editProfileMessage", "Profile updated!", "success");
        showToast("Profile updated.", "success");

        populateEditProfileForm();
        if (typeof renderProfile === "function") { renderProfile(); }

    } catch (err) {
        hideLoading();
        setMsg("editProfileMessage", "Could not connect to server.", "error");
        console.error("handleEditProfile error:", err.message);
    }
}

// Change password

// Must put previous password then new
async function handleChangePassword(event) {
    event.preventDefault();

    const currentPassword = document.getElementById("currentPassword").value;
    const newPassword = document.getElementById("newPassword").value;

    if (!currentPassword || !newPassword) {
        setMsg("changePasswordMessage", "Please fill in both fields.", "error");
        return;
    }

    // Front-end strength check - server also validates independently
    let hasUpper = false, hasLower = false, hasNumber = false, hasSpecial = false;

    for (let i = 0; i < newPassword.length; i++) {
        const ch = newPassword[i];

        if (ch >= "A" && ch <= "Z") { 
            hasUpper = true; 
        }

        else if (ch >= "a" && ch <= "z") { 
            hasLower = true; 
        }

        else if (ch >= "0" && ch <= "9") { 
            hasNumber = true; 
        }

        else { hasSpecial = true; }
    }

    const missing = [];
    if (newPassword.length < 8) {
        missing.push("ch:(" + newPassword.length + "/8)"); 
    }

    if (!hasUpper)              { 
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
        setMsg("changePasswordMessage", "New password needs: " + missing.join(", ") + ".", "error");
        return;
    }

    showLoading("Updating password…");

    try {
        const response = await fetch("/M01067508/users/me/password", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ currentPassword, newPassword })
        });

        const data = await response.json();
        hideLoading();

        if (!response.ok) {
            setMsg("changePasswordMessage", data.error, "error");
            return;
        }

        setMsg("changePasswordMessage", "Password updated!", "success");
        showToast("Password updated.", "success");
        document.getElementById("changePasswordForm").reset();

    } catch (err) {
        hideLoading();
        setMsg("changePasswordMessage", "Could not connect to server.", "error");
        console.error("handleChangePassword error:", err.message);
    }
}

// Blocked users

// Reads from server
async function renderBlockedUsers() {
    const list = document.getElementById("blockedUsersList");
    if (!list) { return; }

    try {
        const response = await fetch("/M01067508/blocked", {
            credentials: "include"
        });

        const blockedUsers = response.ok ? await response.json() : [];

        list.innerHTML = "";

        if (blockedUsers.length === 0) {
            list.innerHTML =
                '<div class="emptyState"><p class="emptyIcon">🚫</p>' +
                "<p>You haven't blocked anyone.</p></div>";
            return;
        }

        blockedUsers.forEach(function(username) {
            const row = document.createElement("div");
            row.className= "blockedUserRow";

            const avatar = document.createElement("div");
            avatar.className = "blockedUserAvatar";
            avatar.textContent = username.charAt(0).toUpperCase();
            avatar.style.cursor = "pointer";
            avatar.addEventListener("click", function() {
                openUserProfile(username); 
            });

            const nameEl = document.createElement("span");
            nameEl.className = "blockedUserName";
            nameEl.textContent = username;
            nameEl.style.cursor = "pointer";
            nameEl.addEventListener("click", function() { openUserProfile(username); });

            const unblockBtn = document.createElement("button");
            unblockBtn.className = "btnUnblock";
            unblockBtn.textContent = "Unblock";
            unblockBtn.addEventListener("click", function() { showUnblockModal(username); });

            row.appendChild(avatar);
            row.appendChild(nameEl);
            row.appendChild(unblockBtn);
            list.appendChild(row);
        });

    } catch (err) {
        console.error("renderBlockedUsers error:", err.message);
    }
}
//Delete Account permanently

// Opens the delete account modal
function confirmDeleteAccount() {
    document.getElementById("deleteAccountModal").style.display = "flex";
}

// Closes the modal without doing anything
function closeDeleteAccountModal() {
    document.getElementById("deleteAccountModal").style.display = "none";
}

// Called by the Delete button inside the modal
async function deleteAccount() {
    closeDeleteAccountModal();
    showLoading("Deleting your account…");

    try {
        const response = await fetch("/M01067508/users/me", {
            method: "DELETE",
            credentials: "include"
        });

        hideLoading();

        if (!response.ok) {
            const data = await response.json();
            showToast(data.error, "error");
            return;
        }

        currentUsername = null;

        showToast("Account deleted.", "success");

        setTimeout(function() {
            window.location.href = "index.html";
        }, 800);

    } catch (err) {
        hideLoading();
        showToast("Could not delete account.", "error");
        console.error("deleteAccount error:", err.message);
    }
}


// ====== renderSettings — fetches user from server ======
async function renderSettings() {
    const me = appState_currentUsername();
    if (!me) { 
        return; 
    }

    const darkToggle = document.getElementById("darkModeToggle");
    if (darkToggle) {
        darkToggle.checked = darkModeState;
    }

    try {
        const response = await fetch("/M01067508/users/" + me, {
            credentials: "include"
        });

        if (!response.ok) { 
            return; 
        }

        const user = await response.json();

        const publicRadio = document.getElementById("privacyPublic");
        const privateRadio = document.getElementById("privacyPrivate");

        if (user.privacy === "private") {
            privateRadio.checked = true;
        } else {
            publicRadio.checked = true;
        }

    } catch (err) {
        console.error("renderSettings error:", err.message);
    }

    await populateEditProfileForm();
    await renderBlockedUsers();
    await renderRatingBreakdown();
}

// Post ratings
// Post ratings - fetches from MongoDB via server
async function renderRatingBreakdown() {
    const card = document.getElementById("ratingBreakdownCard");
    if (!card) { return; }

    const me   = appState_currentUsername();
    const list = document.getElementById("ratingBreakdownList");
    list.innerHTML = "";

    try {
        // Step 1 - get all posts by the current user
        const postsResp = await fetch("/M01067508/contents/user/" + me, {
            credentials: "include"
        });

        if (!postsResp.ok) { 
            return; 
        }

        const myPosts = await postsResp.json();

        if (myPosts.length === 0) {
            list.innerHTML =
                '<div class="emptyState"><p class="emptyIcon">⭐</p>' +
                "<p>None of your posts have been rated yet.</p></div>";
            return;
        }

        // Step 2 - for each post, fetch ratings from server
        const buckets = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        let totalRatings = 0;

        await Promise.all(myPosts.map(async function(post) {
            const postId = post._id.toString();

            const ratingsResp = await fetch("/M01067508/contents/" + postId + "/ratings/all", {
                credentials: "include"
            });

            if (!ratingsResp.ok) { 
                return; 
            }

            const ratings = await ratingsResp.json();

            ratings.forEach(function(rating) {
                if (rating.username === me) { return; } // skip self-ratings

                let stars = rating.stars;
                if (stars < 1) { stars = 1; }
                if (stars > 5) { stars = 5; }

                buckets[stars] = buckets[stars] + 1;
                totalRatings = totalRatings + 1;
            });
        }));

        if (totalRatings === 0) {
            list.innerHTML =
                '<div class="emptyState"><p class="emptyIcon">⭐</p>' +
                "<p>None of your posts have been rated yet.</p></div>";
            return;
        }

        // Step 3 - render the bar chart
        const starValues = [5, 4, 3, 2, 1];

        starValues.forEach(function(starValue) {
            const count = buckets[starValue];
            const row = document.createElement("div");
            row.className = "ratingBreakdownRow";

            let starsDisplay = "";
            for (let i = 0; i < starValue; i++) {
                starsDisplay = starsDisplay + "★";
            }

            let ratingWord = "ratings";
            if (count === 1) { ratingWord = "rating"; }

            const barPercent = Math.round((count / totalRatings) * 100);

            row.innerHTML =
                '<span class="ratingBreakdownStars">' + starsDisplay + "</span>" +
                '<div class="ratingBreakdownBarTrack">' +
                    '<div class="ratingBreakdownBarFill" style="width:' + barPercent + '%;"></div>' +
                "</div>" +
                '<span class="ratingBreakdownCount">' + count + " " + ratingWord + "</span>";

            list.appendChild(row);
        });

    } catch (err) {
        console.error("renderRatingBreakdown error:", err.message);
    }
}

// Start up
document.addEventListener("DOMContentLoaded", function() {
    setupPrivacyListeners();
});