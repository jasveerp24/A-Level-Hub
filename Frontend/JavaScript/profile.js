"use strict";

let viewedProfileUsername = null;
// Render profile - fetches own user data from server
async function renderProfile() {
    const me = appState_currentUsername();
    if (!me) { 
        return; 
    }

    // If viewing someone else's profile, hand off to renderOtherUserProfile (below)
    if (typeof viewedProfileUsername !== "undefined" &&
        viewedProfileUsername &&
        viewedProfileUsername !== me) {
        if (typeof renderOtherUserProfile === "function") {
            renderOtherUserProfile(viewedProfileUsername);
        }
        return;
    }

    if (typeof viewedProfileUsername !== "undefined") {
        viewedProfileUsername = null;
    }

    const actionRow = document.getElementById("profileActionRow");
    if (actionRow) { 
        actionRow.innerHTML = ""; 
    }

    try {
        // Fetch own profile data from server
        const response = await fetch("/M01067508/users/" + me, {
            credentials: "include"
        });

        if (!response.ok) { 
            return; 
        }

        const currentUser = await response.json();

        // Posts still from localStorage during migration
        const postsResp = await fetch("/M01067508/contents/user/" + me, {
            credentials: "include"
        });

        let myPosts;
        if (postsResp.ok) {
            myPosts = await postsResp.json();
        } else {
            myPosts = [];
        }

        renderProfileCard(currentUser, myPosts);
        renderProfilePostsGrid(myPosts);

    } catch (err) {
        console.error("renderProfile error:", err.message);
    }
}

// Fills in avatar initial, name, stats row and bio
async function renderProfileCard(currentUser, myPosts) {
    const avatarEl = document.getElementById("profileAvatarLarge");
    const nameEl = document.getElementById("profileName");
    const followersEl = document.getElementById("statFollowers");
    const followingEl = document.getElementById("statFollowing");
    const bioEl = document.getElementById("profileBio");

    // Restore avatar change button when back on own profile
    const avatarChangeBtn = document.getElementById("avatarChangeBtn");
    if (avatarChangeBtn) {
        avatarChangeBtn.style.display = "flex";
    }

    // Shows the real uploaded picture if one exists, else initial letter
    if (typeof renderAvatarInto === "function") {
        renderAvatarInto(avatarEl, currentUser.username);
    } else {
        avatarEl.textContent = currentUser.username.charAt(0).toUpperCase();
    }

    nameEl.textContent = currentUser.firstName + " " + currentUser.lastName;

    // Fetch follower/following counts from server
    try {
        const statusResp = await fetch("/M01067508/follow/status/" + currentUser.username, {
            credentials: "include"
        });
        if (statusResp.ok) {
            const counts = await statusResp.json();
            followersEl.textContent = counts.followerCount  || 0;
            followingEl.textContent = counts.followingCount || 0;
        } else {
            followersEl.textContent = 0;
            followingEl.textContent = 0;
        }
    } catch (e) {
        followersEl.textContent = 0;
        followingEl.textContent = 0;
    }

    if (currentUser.bio) {
        bioEl.textContent = currentUser.bio;
    } else {
        bioEl.textContent = "No bio added yet.";
    }

    if (typeof renderMyAvatarInto === "function") {
        const headerAvatarEl = document.getElementById("headerAvatar");
        const composerAvatarEl = document.getElementById("composerAvatar");
        if (headerAvatarEl) { 
            renderMyAvatarInto(headerAvatarEl); 
        }
        if (composerAvatarEl) { 
            renderMyAvatarInto(composerAvatarEl); 
        }
    }
}

// Fills in the "My Posts" 3-column grid
function renderProfilePostsGrid(myPosts) {
    const grid = document.getElementById("myPostsGrid");
    grid.innerHTML = "";

    if (myPosts.length === 0) {
        grid.innerHTML =
            '<div class="emptyState"><p class="emptyIcon">📝</p>' +
            "<p>You haven't posted anything yet.</p></div>";
        return;
    }

    myPosts.forEach(function(post) {
        const item = document.createElement("div");
        item.className = "postsGridItem";

        const imageList = post.imageIds || [];

        if (imageList.length > 0) {
            const img = document.createElement("img");
            img.src = "/M01067508/images/" + imageList[0];
            img.alt = post.subject;
            item.appendChild(img);
        } else {
            const textBlock = document.createElement("div");
            textBlock.className = "postsGridItemText";
            textBlock.textContent = post.content;
            item.appendChild(textBlock);
        }

        // Fetch enriched version before opening
        item.addEventListener("click", async function() {
            try {
                const resp = await fetch("/M01067508/contents/" + post._id.toString() + "/enriched", {
                    credentials: "include"
                });

                let enrichedPost;
                if (resp.ok) {
                    enrichedPost = await resp.json();
                } else {
                    enrichedPost = post;
                }

                openSinglePostView(enrichedPost, {
                    label: "Back to my profile",
                    action: function() { goToMyProfile(); }
                });
            } catch (e) {
                openSinglePostView(post, {
                    label: "Back to my profile",
                    action: function() { goToMyProfile(); }
                });
            }
        });

        grid.appendChild(item);
    });
}

let avatarUploadReady = false;

const avatarCache = {};

// Profile picture uploading
function setupAvatarUpload() {
    if (avatarUploadReady) {
        return;
    }
    avatarUploadReady = true;

    const changeBtn = document.getElementById("avatarChangeBtn");
    const fileInput = document.getElementById("avatarFileInput");

    if (!changeBtn || !fileInput) {
        return;
    }

    // When + is clicked, check if a picture already exists
    changeBtn.addEventListener("click", function() {
        const me = appState_currentUsername();
        const stored = avatarCache[me];

        if (stored) {
            // Already has a picture - show the choice modal
            document.getElementById("avatarOptionsModal").style.display = "flex";
        } else {
            // No picture yet - open file picker directly
            fileInput.click();
        }
    });

    // Fires once the user actually picks a file from the OS dialog
    fileInput.addEventListener("change", async function(event) {
        const file = event.target.files[0];
        fileInput.value = "";

        if (!file) {
            return;
        }

        const me = appState_currentUsername();
        if (!me) {
            return;
        }

        try {
            // Step 1 - upload the raw file to the images route
            const formData = new FormData();
            formData.append("images", file);

            const uploadResponse = await fetch("/M01067508/images", {
                method: "POST",
                credentials: "include",
                body: formData
            });

            const uploadData = await uploadResponse.json();

            if (!uploadResponse.ok) {
                showToast(uploadData.error || "Could not upload picture.", "error");
                return;
            }

            const filename = uploadData.filenames[0];

            // Step 2 - save that filename onto the user's profile document
            const saveResponse = await fetch("/M01067508/users/me", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ avatar: filename })
            });

            if (!saveResponse.ok) {
                showToast("Could not save profile picture.", "error");
                return;
            }

            // Keep the in-memory avatar cache in sync so every avatar
            // rendered elsewhere on the page updates immediately,
            // without needing a full page reload
            avatarCache[me] = filename;
            renderProfile();
            showToast("Profile picture updated.", "success");

        } catch (err) {
            showToast("Could not upload picture.", "error");
            console.error("avatar upload error:", err.message);
        }
    });
}

// "Change" option inside the avatar options modal
function changeAvatarPicture() {
    document.getElementById("avatarOptionsModal").style.display = "none";
    document.getElementById("avatarFileInput").click();
}

// "Remove" option inside the avatar options modal
async function removeAvatarPicture() {
    const me = appState_currentUsername();
    if (!me) {
        return;
    }

    try {
        const response = await fetch("/M01067508/users/me", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ avatar: "" })
        });

        if (!response.ok) {
            showToast("Could not remove profile picture.", "error");
            return;
        }

        // Clear the cached avatar too
        avatarCache[me] = "";
        document.getElementById("avatarOptionsModal").style.display = "none";
        renderProfile();
        showToast("Profile picture removed.", "success");

    } catch (err) {
        showToast("Could not remove picture.", "error");
        console.error("removeAvatarPicture error:", err.message);
    }
}

// Closes the avatar options modal
function closeAvatarOptionsModal() {
    document.getElementById("avatarOptionsModal").style.display = "none";
}

// Call once at DOM ready
document.addEventListener("DOMContentLoaded", function() {
    setupAvatarUpload();
});

// Fills any avatar element with the user's image or their initial.
// Called from profile.js, search.js, notifications.js, chat.js.
function renderAvatarInto(element, username) {

    // Always clear first - prevents stale image from previous user showing
    element.innerHTML = "";
    element.textContent = "";

    const cachedFilename = avatarCache[username];

    if (cachedFilename) {
        const img = document.createElement("img");
        img.src = "/M01067508/images/" + cachedFilename;
        img.alt = username;
        img.className = "avatarImg";
        element.appendChild(img);
        return;
    }

    // Fallback while we don't yet know - show the initial
    element.textContent = username.charAt(0).toUpperCase();

    if (cachedFilename === undefined) {
        fetch("/M01067508/users/" + username, { credentials: "include" })
            .then(function(response) {
                if (response.ok) {
                    return response.json();
                }
                return null;
            })
            .then(function(user) {
                if (user && user.avatar) {
                    avatarCache[username] = user.avatar;
                } else {
                    avatarCache[username] = "";
                }

                if (avatarCache[username]) {
                    element.innerHTML = "";
                    const img = document.createElement("img");
                    img.src = "/M01067508/images/" + avatarCache[username];
                    img.alt = username;
                    img.className = "avatarImg";
                    element.appendChild(img);
                }
            })
            .catch(function() {
                avatarCache[username] = "";
            });
    }
}

// Fills the header and composer avatars with the current user's image.
function renderMyAvatarInto(element) {
    const me = appState_currentUsername();
    if (me) {
        renderAvatarInto(element, me);
    }
}

let currentFollowTab = "followers";

// ====== Followers/Followings modal ======
function openFollowersModal(tab) {
    document.getElementById("followersModal").style.display = "flex";
    switchFollowTab(tab || "followers");
}

function closeFollowersModal() {
    document.getElementById("followersModal").style.display = "none";
}

async function switchFollowTab(tab) {
    currentFollowTab = tab;

    const tabFollowers = document.getElementById("tabFollowers");
    const tabFollowing = document.getElementById("tabFollowing");

    if (tab === "followers") {
        tabFollowers.classList.add("activeTab");
        tabFollowing.classList.remove("activeTab");
    } else {
        tabFollowing.classList.add("activeTab");
        tabFollowers.classList.remove("activeTab");
    }

    await renderFollowTabList(tab);
}

// ====== Followers / Followings tab
async function renderFollowTabList(tab) {
    const me   = appState_currentUsername();
    const list = document.getElementById("followTabList");
    list.innerHTML = "";

    let profileOwner;
    if (typeof viewedProfileUsername !== "undefined" &&
        viewedProfileUsername && viewedProfileUsername !== me) {
        profileOwner = viewedProfileUsername;
    } else {
        profileOwner = me;
    }

    try {
        // Fetch followers or following from server
        let endpoint;
        if (tab === "followers") {
            endpoint = "/M01067508/follow/followers/" + profileOwner;
        } else {
            endpoint = "/M01067508/follow/following/" + profileOwner;
        }

        const response  = await fetch(endpoint, { credentials: "include" });
        let usernames;
        if (response.ok) {
            usernames = await response.json();
        } else {
            usernames = [];
        }

        // Filter block users from follow list
        const blockedUsers = (typeof blockedUsersCache !== "undefined") ? blockedUsersCache : [];

        const filteredUsernames = usernames.filter(function(u) {
            return blockedUsers.indexOf(u) === -1;
        });

        if (filteredUsernames.length === 0) {
            const emptyMsg = document.createElement("p");
            emptyMsg.className = "followTabEmpty";
            if (tab === "followers") {
                emptyMsg.textContent = "No followers yet.";
            } else {
                emptyMsg.textContent = "Not following anyone yet.";
            }
            list.appendChild(emptyMsg);
            return;
        }

        // Display profile pic and username in follow tab
        filteredUsernames.forEach(function(username) {
            const row = document.createElement("div");
            row.className = "followTabRow";

            const avatar = document.createElement("div");
            avatar.className = "followTabAvatar";

            if (typeof renderAvatarInto === "function") {
                renderAvatarInto(avatar, username);
            } else {
                avatar.textContent = username.charAt(0).toUpperCase();
            }

            const info = document.createElement("div");
            info.className = "followTabInfo";

            const nameEl = document.createElement("span");
            nameEl.className = "followTabName";
            nameEl.textContent = username;

            const usernameEl = document.createElement("span");
            usernameEl.className = "followTabUsername";
            usernameEl.textContent = "@" + username;

            info.appendChild(nameEl);
            info.appendChild(usernameEl);
            row.appendChild(avatar);
            row.appendChild(info);

            row.addEventListener("click", function() {
                closeFollowersModal();
                if (typeof openUserProfile === "function") {
                    openUserProfile(username);
                }
            });

            list.appendChild(row);
        });

    } catch (err) {
        console.error("renderFollowTabList error:", err.message);
    }
}

// Viewing another user's profile
function openUserProfile(username) {
    viewedProfileUsername = username;
    showSection("profile");
}

// Builds the Follow / Requested / Following button and the 
// optional Message button shown when viewing someone else's profile.
function buildProfileActionRow(targetUser, followStatus) {
    const wrap = document.createElement("div");
    wrap.className = "profileActionRow";

    // If blocked - show Unblock only
    if (typeof isBlocked === "function" && isBlocked(targetUser.username)) {
        const unblockBtn = document.createElement("button");
        unblockBtn.className = "btnUnblockProfile";
        unblockBtn.textContent = "Unblock";
        unblockBtn.addEventListener("click", function() {
            showUnblockModal(targetUser.username);
        });
        wrap.appendChild(unblockBtn);
        return wrap;
    }

    const followBtn = document.createElement("button");

    // Following button states
    if (followStatus && followStatus.following) {
        followBtn.className = "btnFollowingState";
        followBtn.textContent = "Following";
        followBtn.addEventListener("click", async function() {
            await unfollowUser(targetUser.username);
            renderOtherUserProfile(targetUser.username);
        });
    } else if (followStatus && followStatus.requested) {
        followBtn.className = "btnRequestedState";
        followBtn.textContent = "Requested";
        followBtn.addEventListener("click", async function() {
            await cancelFollowRequest(targetUser.username);
            renderOtherUserProfile(targetUser.username);
        });
    } else {
        followBtn.className = "btnFollow";
        followBtn.textContent = "Follow";
        followBtn.addEventListener("click", async function() {
            await requestFollow(targetUser.username);
            renderOtherUserProfile(targetUser.username);
        });
    }

    wrap.appendChild(followBtn);

    // Message button - only shown if user can view their content
    if (canViewUserContent(targetUser.username, targetUser.privacy)) {
        const msgBtn = document.createElement("button");
        msgBtn.className = "btnMessage";
        msgBtn.textContent = "Message";
        msgBtn.addEventListener("click", async function() {
            const conv = await getOrCreateConversation(targetUser.username);
            showSection("chat", function() {
                if (typeof renderChatList === "function") {
                    renderChatList(); 
                }

                if (typeof updateChatUnreadDot === "function") { 
                    updateChatUnreadDot(); 
                }

                openConversation(conv.key);
            });
        });
        wrap.appendChild(msgBtn);
    }

    // Block button
    const blockBtn = document.createElement("button");
    blockBtn.className = "btnBlockProfile";
    blockBtn.textContent = "Block";
    blockBtn.addEventListener("click", function() {
        showBlockModal(targetUser.username, function() {
            blockUser(targetUser.username);
            renderOtherUserProfile(targetUser.username);
        });
    });
    wrap.appendChild(blockBtn);

    return wrap;
}

// Show someone else's profile — fetches user + follow status from server
async function renderOtherUserProfile(username) {
    const avatarChangeBtn = document.getElementById("avatarChangeBtn");

    // Hide change profile button when displaying other user's profile
    if (avatarChangeBtn) {
        avatarChangeBtn.style.display = "none";
    }

    try {
        // Fetch this user's data from MongoDB via server
        const response = await fetch("/M01067508/users/" + username, {
            credentials: "include"
        });

        if (!response.ok) {
            showToast("User not found.", "error");
            viewedProfileUsername = null;
            showSection("feed");
            return;
        }

        const targetUser = await response.json();

        // Fetch follow status from server - determines which button to show
        let followStatus = { following: false, requested: false, followerCount: 0, followingCount: 0 };
        try {
            const statusResp = await fetch("/M01067508/follow/status/" + username, {
                credentials: "include"
            });
            if (statusResp.ok) {
                followStatus = await statusResp.json();
            }
        } catch (e) {
            // Fall back to defaults if fetch fails
        }

        const avatarEl = document.getElementById("profileAvatarLarge");
        const nameEl = document.getElementById("profileName");
        const followersEl = document.getElementById("statFollowers");
        const followingEl = document.getElementById("statFollowing");
        const bioEl = document.getElementById("profileBio");

        if (typeof renderAvatarInto === "function") {
            renderAvatarInto(avatarEl, targetUser.username);
        } else {
            avatarEl.textContent = targetUser.username.charAt(0).toUpperCase();
        }

        nameEl.textContent = targetUser.firstName + " " + targetUser.lastName;
        bioEl.textContent = targetUser.bio || "No bio added yet.";

        // Use server-provided counts from followStatus
        followersEl.textContent = followStatus.followerCount  || 0;
        followingEl.textContent = followStatus.followingCount || 0;

        // Build action row using server-provided follow status
        const existingRow = document.getElementById("profileActionRow");
        if (existingRow) {
            existingRow.innerHTML = "";
            existingRow.appendChild(buildProfileActionRow(targetUser, followStatus));
        }

        // Post grid
        const grid = document.getElementById("myPostsGrid");
        grid.innerHTML = "";

        if (typeof isBlocked === "function" && isBlocked(targetUser.username)) {
            grid.innerHTML =
                '<div class="emptyState"><p class="emptyIcon">🚫</p>' +
                "<p>You have blocked this user.</p></div>";
            return;
        }

        if (!canViewUserContent(targetUser.username, targetUser.privacy)) {
            grid.innerHTML =
                '<div class="emptyState"><p class="emptyIcon">🔒</p>' +
                "<p>This account is private. Follow " +
                targetUser.username + " to see their posts.</p></div>";
            return;
        }

        // Fetch their posts from server
        const postsResp  = await fetch("/M01067508/contents/user/" + username, {
            credentials: "include"
        });

        let theirPosts;
        if (postsResp.ok) {
            theirPosts = await postsResp.json();
        } else {
            theirPosts = [];
        }

        if (theirPosts.length === 0) {
            grid.innerHTML =
                '<div class="emptyState"><p class="emptyIcon">📝</p>' +
                "<p>" + targetUser.username + " hasn't posted anything yet.</p></div>";
            return;
        }

        theirPosts.forEach(function(post) {
            const item = document.createElement("div");
            item.className = "postsGridItem";

            const imageList = post.imageIds || [];

            if (imageList.length > 0) {
                const img = document.createElement("img");
                img.src = "/M01067508/images/" + imageList[0];
                img.alt = post.subject;
                item.appendChild(img);
            } else {
                const textBlock = document.createElement("div");
                textBlock.className = "postsGridItemText";
                textBlock.textContent = post.content;
                item.appendChild(textBlock);
            }

            item.addEventListener("click", (function(capturedPost, capturedUsername) {
                return async function() {
                    try {
                        const resp = await fetch("/M01067508/contents/" + capturedPost._id.toString() + "/enriched", {
                            credentials: "include"
                        });

                        let enrichedPost;
                        if (resp.ok) {
                            enrichedPost = await resp.json();
                        } else {
                            enrichedPost = capturedPost;
                        }

                        openSinglePostView(enrichedPost, {
                            label: "Back to profile",
                            action: function() { openUserProfile(capturedUsername); }
                        });
                    } catch (e) {
                        openSinglePostView(capturedPost, {
                            label: "Back to profile",
                            action: function() { openUserProfile(capturedUsername); }
                        });
                    }
                };
            })(post, username));

            grid.appendChild(item);
        });

    } catch (err) {
        console.error("renderOtherUserProfile error:", err.message);
        showToast("Could not load profile.", "error");
    }
}