"use strict";

// In-memory blocked users cache - loaded from server after login
let blockedUsersCache = [];

async function loadBlockedUsers() {
    try {
        const response = await fetch("/M01067508/blocked", {
            credentials: "include"
        });
        if (response.ok) {
            blockedUsersCache = await response.json();
        }
    } catch (err) {
        blockedUsersCache = [];
    }
}

function isBlocked(username) {
    return blockedUsersCache.indexOf(username) !== -1;
}

// Privacy gate
function canViewUserContent(targetUsername, knownPrivacy, isFollowing) {
    const me = appState_currentUsername();

    if (me === targetUsername) {
        return true;
    }

    if (isBlocked(targetUsername)) {
        return false;
    }

    // Use passed privacy value - defaults to public if not provided
    const privacy = knownPrivacy || "public";

    if (privacy !== "private") {
        return true;
    }

    // Private account - visible only to an approved follower
    if (isFollowing === true) {
        return true;
    }

    return false;
}

// Follow - POST /M01067508/follow/:username
async function requestFollow(targetUsername) {
    const me = appState_currentUsername();
    if (!me || me === targetUsername) {
        return null;
    }

    if (isBlocked(targetUsername)) {
        showToast("You can't follow this user.", "error");
        return null;
    }

    try {
        const response = await fetch("/M01067508/follow/" + targetUsername, {
            method: "POST",
            credentials: "include"
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error, "error");
            return null;
        }

        if (data.status === "requested") {
            showToast("Follow request sent.", "success");
        } else {
            showToast("You are now following " + targetUsername + ".", "success");
        }

        return data.status;

    } catch (err) {
        showToast("Could not follow user.", "error");
        console.error("requestFollow error:", err.message);
        return null;
    }
}

// Unfollow - DELETE /M01067508/follow/:username
async function unfollowUser(targetUsername) {
    try {
        const response = await fetch("/M01067508/follow/" + targetUsername, {
            method: "DELETE",
            credentials: "include"
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error, "error");
            return;
        }

        // Re-render liked/saved sections if active - private account posts disappear
        if (typeof renderLikedPosts === "function" &&
            document.getElementById("sectionLiked") &&
            document.getElementById("sectionLiked").classList.contains("activeSection")) {
            renderLikedPosts();
        }

        if (typeof renderSavedPosts === "function" &&
            document.getElementById("sectionSaved") &&
            document.getElementById("sectionSaved").classList.contains("activeSection")) {
            renderSavedPosts();
        }

        showToast("Unfollowed " + targetUsername + ".", "");

        if (typeof renderProfile === "function") { renderProfile(); }

    } catch (err) {
        showToast("Could not unfollow.", "error");
        console.error("unfollowUser error:", err.message);
    }
}

// Accept request - POST /M01067508/follow/accept/:username
async function acceptFollowRequest(fromUsername) {
    const me = appState_currentUsername();

    try {
        const response = await fetch("/M01067508/follow/accept/" + fromUsername, {
            method: "POST",
            credentials: "include"
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error, "error");
            return;
        }

        showToast(fromUsername + " is now following you.", "success");

        if (typeof renderFollowRequests === "function") { 
            renderFollowRequests(); 
        }

        if (typeof renderNotifications === "function") { 
            renderNotifications(); 
        }

        if (typeof renderProfile === "function") { 
            renderProfile(); 
        }

    } catch (err) {
        showToast("Could not accept request.", "error");
        console.error("acceptFollowRequest error:", err.message);
    }
}

// Decline request - DELETE /M01067508/follow/request/:username
async function declineFollowRequest(fromUsername) {
    const me = appState_currentUsername();

    try {
        const response = await fetch("/M01067508/follow/request/" + fromUsername, {
            method: "DELETE",
            credentials: "include"
        });

        if (!response.ok) {
            const data = await response.json();
            showToast(data.error, "error");
            return;
        }

        showToast("Follow request declined.", "");

        if (typeof renderFollowRequests === "function") { 
            renderFollowRequests(); 
        }

        if (typeof renderNotifications === "function") { 
            renderNotifications(); 
        }

    } catch (err) {
        showToast("Could not decline request.", "error");
        console.error("declineFollowRequest error:", err.message);
    }
}

// Cancel outgoing request - DELETE /M01067508/follow/request/:username
async function cancelFollowRequest(targetUsername) {
    try {
        const response = await fetch("/M01067508/follow/request/" + targetUsername, {
            method: "DELETE",
            credentials: "include"
        });

        if (!response.ok) {
            const data = await response.json();
            showToast(data.error, "error");
            return;
        }

        showToast("Follow request cancelled.", "");

        if (typeof renderProfile === "function") { 
            renderProfile(); 
        }

    } catch (err) {
        showToast("Could not cancel request.", "error");
        console.error("cancelFollowRequest error:", err.message);
    }
}

// Block - POST /M01067508/blocked/:username
async function blockUser(targetUsername) {
    const me = appState_currentUsername();
    if (!me || me === targetUsername) { return; }

    try {
        const response = await fetch("/M01067508/blocked/" + targetUsername, {
            method: "POST",
            credentials: "include"
        });

        if (!response.ok) {
            const data = await response.json();
            showToast(data.error || "Could not block user.", "error");
            return;
        }

        // Hide the conversation on server side
        const convKey = buildConvKey(me, targetUsername);
        await fetch("/M01067508/conversations/" + convKey + "/hide", {
            method: "PUT",
            credentials: "include"
        });

        // Update in-memory blocked cache
        if (blockedUsersCache.indexOf(targetUsername) === -1) {
            blockedUsersCache.push(targetUsername);
        }

        showToast(targetUsername + " has been blocked.", "success");
        refreshAfterBlockChange();

    } catch (err) {
        showToast("Could not block user.", "error");
        console.error("blockUser error:", err.message);
    }
}

//  Unblock - DELETE /M01067508/blocked/:username
async function unblockUser(targetUsername) {
    try {
        const response = await fetch("/M01067508/blocked/" + targetUsername, {
            method: "DELETE",
            credentials: "include"
        });

        if (!response.ok) {
            const data = await response.json();
            showToast(data.error || "Could not unblock user.", "error");
            return;
        }

        // Update in-memory blocked cache
        blockedUsersCache = blockedUsersCache.filter(function(u) {
            return u !== targetUsername;
        });

        showToast(targetUsername + " has been unblocked.", "success");
        refreshAfterBlockChange();

    } catch (err) {
        showToast("Could not unblock user.", "error");
        console.error("unblockUser error:", err.message);
    }
}

// Refresh UI after block/unblock
function refreshAfterBlockChange() {
    if (typeof renderProfile === "function") {
        renderProfile();
    }

    if (typeof renderFeed === "function" &&
        document.getElementById("sectionFeed") &&
        document.getElementById("sectionFeed").classList.contains("activeSection")) {
        renderFeed();
    }

    if (typeof renderLikedPosts === "function" &&
        document.getElementById("sectionLiked") &&
        document.getElementById("sectionLiked").classList.contains("activeSection")) {
        renderLikedPosts();
    }

    if (typeof renderSavedPosts === "function" &&
        document.getElementById("sectionSaved") &&
        document.getElementById("sectionSaved").classList.contains("activeSection")) {
        renderSavedPosts();
    }

    if (typeof renderBlockedUsers === "function") {
        renderBlockedUsers();
    }

    if (typeof renderChatList === "function") {
        renderChatList();
    }

    if (typeof updateChatUnreadDot === "function") {
        updateChatUnreadDot();
    }
    
    // Re-render the currently open thread so previously-hidden messages
    // reappear immediately after unblocking, without needing to close
    // and reopen the conversation.
    if (typeof activeConvKey !== "undefined" && activeConvKey &&
        typeof renderMessages === "function") {
        renderMessages(activeConvKey, false);
    }
}

// ====== Block / Unblock confirmation modals ======

let blockModalCallback = null;

// ====== Block modal ======
function showBlockModal(username, onConfirm) {
    blockModalCallback = onConfirm;

    const body = document.getElementById("blockModalBody");
    if (body) {
        body.textContent = "Block " + username + "? You'll both lose your follow connection and engagement on each other's posts.";
    }

    document.getElementById("blockUserModal").style.display = "flex";
}

function confirmBlock() {
    const callback = blockModalCallback;
    closeBlockModal();
    if (callback) {
        callback();
    }
}

function closeBlockModal() {
    document.getElementById("blockUserModal").style.display = "none";
    blockModalCallback = null;
}

// ====== Unblock modal ======
var unblockModalCallback = null;

function showUnblockModal(username) {
    unblockModalCallback = function() {
        unblockUser(username);
    };

    const body = document.getElementById("unblockModalBody");
    if (body) {
        body.textContent = "Unblock " + username + "? They won't be notified.";
    }

    document.getElementById("unblockUserModal").style.display = "flex";
}

function confirmUnblock() {
    const callback = unblockModalCallback;
    closeUnblockModal();
    if (callback) {
        callback();
    }
}

function closeUnblockModal() {
    document.getElementById("unblockUserModal").style.display = "none";
    unblockModalCallback = null;
}