"use strict";

// pushNotification — writes to MongoDB via server
async function pushNotification(recipient, type, actor, postId) {
    if (!recipient || recipient === actor) { return; }

    try {
        await fetch("/M01067508/notifications", {
            method:      "POST",
            headers:     { "Content-Type": "application/json" },
            credentials: "include",
            body:        JSON.stringify({
                recipient,
                type,
                actor,
                postId: postId || null
            })
        });
        updateNotificationDot();
    } catch (err) {
        console.error("pushNotification error:", err.message);
    }
}

// Unread dot — fetches from server
async function updateNotificationDot() {
    const me = appState_currentUsername();
    if (!me) { return; }

    try {
        const response = await fetch("/M01067508/notifications", {
            credentials: "include"
        });

        if (!response.ok) { return; }

        const notifications = await response.json();
        const hasUnread     = notifications.some(function(n) {
            return n.read === false;
        });

        const headerDot = document.getElementById("headerNotifDot");
        if (headerDot) {
            if (hasUnread) {
                headerDot.style.display = "block";
            } else {
                headerDot.style.display = "none";
            }
        }
    } catch (err) {
        console.error("updateNotificationDot error:", err.message);
    }
}

// Mark all read — calls server
async function markAllNotificationsRead() {
    try {
        await fetch("/M01067508/notifications/read", {
            method:      "PUT",
            credentials: "include"
        });
    } catch (err) {
        console.error("markAllNotificationsRead error:", err.message);
    }
}

// Follow request row helper
function makeFollowRowClickable(row, username) {
    const avatar = row.querySelector(".followRequestAvatar");
    const name = row.querySelector(".followRequestName");

    if (avatar) {
        avatar.classList.add("followRequestAvatarClickable");
        avatar.addEventListener("click", function() {
            if (username !== appState_currentUsername()) {
                openUserProfile(username);
            } else {
                goToMyProfile();
            }
        });
    }

    if (name) {
        name.classList.add("followRequestNameClickable");
        name.addEventListener("click", function() {
            if (username !== appState_currentUsername()) {
                openUserProfile(username);
            } else {
                goToMyProfile();
            }
        });
    }
}

// Follow requests card in Settings - fetches from server
async function renderFollowRequests() {
    const me = appState_currentUsername();
    const card = document.getElementById("followRequestsCard");
    const list = document.getElementById("followRequestsList");

    if (!me || !card || !list) { return; }

    try {
        const response = await fetch("/M01067508/users/" + me, {
            credentials: "include"
        });

        if (!response.ok) {
            card.style.display = "none";
            return;
        }

        const currentUser = await response.json();

        if (currentUser.privacy !== "private") {
            card.style.display = "none";
            return;
        }

        card.style.display = "block";

        // Fetch pending requests from server
        const reqResp  = await fetch("/M01067508/follow/requests", {
            credentials: "include"
        });
        const requests = reqResp.ok ? await reqResp.json() : [];

        list.innerHTML = "";

        if (requests.length === 0) {
            list.innerHTML =
                '<div class="emptyState"><p class="emptyIcon">👥</p>' +
                "<p>No pending follow requests.</p></div>";
            return;
        }

        requests.forEach(function(req) {
            const row       = document.createElement("div");
            row.className   = "followRequestRow";

            row.innerHTML =
                '<div class="followRequestAvatar">' +
                req.from.charAt(0).toUpperCase() + "</div>" +
                '<span class="followRequestName">' + req.from + "</span>";

            makeFollowRowClickable(row, req.from);

            const acceptBtn       = document.createElement("button");
            acceptBtn.className   = "btnAccept";
            acceptBtn.textContent = "Accept";
            acceptBtn.addEventListener("click", function() {
                acceptFollowRequest(req.from);
            });

            const declineBtn       = document.createElement("button");
            declineBtn.className   = "btnDecline";
            declineBtn.textContent = "Decline";
            declineBtn.addEventListener("click", function() {
                declineFollowRequest(req.from);
            });

            row.appendChild(acceptBtn);
            row.appendChild(declineBtn);
            list.appendChild(row);
        });

    } catch (err) {
        card.style.display = "none";
        console.error("renderFollowRequests error:", err.message);
    }
}

// Main notifications render - fetches from server
async function renderNotifications() {
    const me   = appState_currentUsername();
    const list = document.getElementById("notificationsList");
    if (!me || !list) { return; }

    list.innerHTML = "";

    try {
        // Fetch pending follow requests for banner
        let pendingRequests = [];
        const userResp = await fetch("/M01067508/users/" + me, { credentials: "include" });
        if (userResp.ok) {
            const currentUser = await userResp.json();
            if (currentUser.privacy === "private") {
                const reqResp = await fetch("/M01067508/follow/requests", { credentials: "include" });
                if (reqResp.ok) { pendingRequests = await reqResp.json(); }
            }
        }

        if (pendingRequests.length > 0) {
            list.appendChild(buildFollowRequestsBanner(pendingRequests));
        }

        // Fetch notifications from MongoDB via server
        const response = await fetch("/M01067508/notifications", {
            credentials: "include"
        });

        if (!response.ok) { return; }

        let myNotifications = await response.json();

        // Filter out notifications whose only actor(s) are blocked users.
        let blockedUsers;
        if (typeof blockedUsersCache !== "undefined") {
            blockedUsers = blockedUsersCache; // Variable exists, use it
        } else {
            blockedUsers = []; // Variable doesn't exist, use empty array instead
        }
        myNotifications = myNotifications.filter(function(n) {
            const visibleActors = n.actors.filter(function(a) {
                return blockedUsers.indexOf(a) === -1;
            });
            return visibleActors.length > 0;
        });

        if (myNotifications.length === 0 && pendingRequests.length === 0) {
            list.innerHTML =
                '<div class="emptyState"><p class="emptyIcon">🔔</p>' +
                "<p>No notifications yet.</p></div>";
            return;
        }

        if (myNotifications.length > 0) {
            const monthLabel       = document.createElement("div");
            monthLabel.className   = "notifMonthLabel";
            monthLabel.textContent = "This month";
            list.appendChild(monthLabel);
        }

        myNotifications.forEach(function(notif) {
            list.appendChild(buildNotificationRow(notif));
        });

        // Mark all as read after 1.5s so user sees the highlights first
        setTimeout(function() {
            markAllNotificationsRead();
            updateNotificationDot();
        }, 1500);

    } catch (err) {
        console.error("renderNotifications error:", err.message);
    }
}

// Follow requests banner
function buildFollowRequestsBanner(pendingRequests) {
    const firstActor = pendingRequests[0].from;
    const others = pendingRequests.length - 1;

    const banner = document.createElement("div");
    banner.className = "notifRequestsBanner";

    let subText = firstActor;
    if (others === 1) {
        subText = firstActor + " + 1 other";
    } else if (others > 1) {
        subText = firstActor + " + " + others + " others";
    }

    const iconEl = document.createElement("div");
    iconEl.className  = "notifRequestsIcon";
    iconEl.textContent = "👥";

    const textWrap = document.createElement("div");
    textWrap.className = "notifRequestsTextWrap";

    const titleEl = document.createElement("div");
    titleEl.className = "notifRequestsTitle";
    titleEl.textContent = "Follow requests";

    const subEl = document.createElement("div");
    subEl.className = "notifRequestsSub";
    subEl.textContent = subText;

    textWrap.appendChild(titleEl);
    textWrap.appendChild(subEl);

    const arrow = document.createElement("span");
    arrow.className = "notifRequestsArrow";
    arrow.textContent = "›";

    banner.appendChild(iconEl);
    banner.appendChild(textWrap);
    banner.appendChild(arrow);

    banner.addEventListener("click", function() {
        const existingPanel = document.getElementById("inlineFollowReqPanel");
        if (existingPanel) {
            existingPanel.remove();
            return;
        }

        const panel = document.createElement("div");
        panel.id = "inlineFollowReqPanel";
        panel.className = "inlineFollowReqPanel";

        pendingRequests.forEach(function(req) {
            const row  = document.createElement("div");
            row.className = "followRequestRow";

            row.innerHTML =
                '<div class="followRequestAvatar">' +
                req.from.charAt(0).toUpperCase() + "</div>" +
                '<span class="followRequestName">' + req.from + "</span>";

            makeFollowRowClickable(row, req.from);

            const acceptBtn  = document.createElement("button");
            acceptBtn.className = "btnAccept";
            acceptBtn.textContent = "Accept";
            acceptBtn.addEventListener("click", function() {
                acceptFollowRequest(req.from);
                renderNotifications();
            });

            const declineBtn = document.createElement("button");
            declineBtn.className  = "btnDecline";
            declineBtn.textContent = "Decline";
            declineBtn.addEventListener("click", function() {
                declineFollowRequest(req.from);
                renderNotifications();
            });

            row.appendChild(acceptBtn);
            row.appendChild(declineBtn);
            panel.appendChild(row);
        });

        banner.insertAdjacentElement("afterend", panel);
    });

    return banner;
}

// Notification row
function buildNotificationRow(notif) {
    const row = document.createElement("div");
    row.className = "notifRow";

    if (!notif.read) { row.classList.add("unreadNotif"); }

    const firstActor = notif.actors[0];
    const extraCount = notif.actors.length - 1;
    const timeLabel  = formatNotifTime(notif.timestamp);

    const avatarStack  = document.createElement("div");
    avatarStack.className = "notifAvatarStack";

    const mainAvatar = document.createElement("div");
    mainAvatar.className = "notifAvatar notifAvatarClickable";

    if (typeof renderAvatarInto === "function") {
        renderAvatarInto(mainAvatar, firstActor);
    } else {
        mainAvatar.textContent = firstActor.charAt(0).toUpperCase();
    }

    mainAvatar.addEventListener("click", function() {
        if (firstActor !== appState_currentUsername()) {
            openUserProfile(firstActor);
        } else {
            goToMyProfile();
        }
    });

    avatarStack.appendChild(mainAvatar);

    if (extraCount > 0) {
        const badge  = document.createElement("div");
        badge.className  = "notifAvatarSecondary";
        badge.textContent = "+" + extraCount;
        avatarStack.appendChild(badge);
    }

    const textWrap = document.createElement("div");
    textWrap.className = "notifTextWrap";
    textWrap.innerHTML =
        buildNotificationMessage(notif.type, firstActor, extraCount) +
        ' <span class="notifTimeLabel">' + timeLabel + "</span>";

    const actorSpan = textWrap.querySelector(".notifActorLink");
    if (actorSpan) {
        actorSpan.addEventListener("click", function() {
            const username = actorSpan.getAttribute("data-username");
            if (username && username !== appState_currentUsername()) {
                openUserProfile(username);
            } else if (username) {
                goToMyProfile();
            }
        });
    }

    const actionArea = buildNotificationActionArea(notif, firstActor);

    row.appendChild(avatarStack);
    row.appendChild(textWrap);
    row.appendChild(actionArea);

    return row;
}

// Notification message text
function buildNotificationMessage(type, firstActor, extraCount) {
    const actorHtml =
        '<span class="notifActorLink" data-username="' + firstActor + '">' +
        "<strong>" + firstActor + "</strong></span>";

    if (type === "follow") { return actorHtml + " started following you."; }
    if (type === "follow_request") { return actorHtml + " requested to follow you."; }
    if (type === "follow_accept")  { return actorHtml + " accepted your follow request."; }

    let verb = "liked";
    if (type === "comment") { verb = "commented on"; }
    else if (type === "rating")  { verb = "rated"; }

    if (extraCount === 0) { return actorHtml + " " + verb + " your post."; }
    if (extraCount === 1) { return actorHtml + " and <strong>1 other</strong> " + verb + " your post."; }
    return actorHtml + " and <strong>" + extraCount + " others</strong> " + verb + " your post.";
}

// Action area
function buildNotificationActionArea(notif, firstActor) {
    const actionArea = document.createElement("div");
    actionArea.className = "notifActionArea";

    // Follow — "Follow back" pill, status fetched from server
    if (notif.type === "follow") {
        const pill= document.createElement("button");
        pill.className = "notifFollowBackPill";
        pill.textContent = "Follow back";

        fetch("/M01067508/follow/status/" + firstActor, { credentials: "include" })
            .then(function(r) { return r.json(); })
            .then(function(status) {
                if (status.following) {
                    pill.textContent = "Following";
                    pill.disabled    = true;
                    pill.classList.add("notifPillDisabled");
                } else if (status.requested) {
                    pill.textContent = "Requested";
                    pill.disabled    = true;
                    pill.classList.add("notifPillDisabled");
                }
            })
            .catch(function() {});

        pill.addEventListener("click", async function() {
            if (pill.disabled) { return; }
            const status = await requestFollow(firstActor);

            // Follow failed - leave the pill clickable so they can try again
            if (!status) {
                return;
            }

            if (status === "requested") {
                pill.textContent = "Requested"; // private account
            } else {
                pill.textContent = "Following";  // public account
            }
            pill.disabled    = true;
            pill.classList.add("notifPillDisabled");
        });

        actionArea.appendChild(pill);
        return actionArea;
    }

    // Follow request - Accept / Decline, check status from server
    if (notif.type === "follow_request") {
        const me = appState_currentUsername();

        const acceptBtn       = document.createElement("button");
        acceptBtn.className   = "btnAccept";
        acceptBtn.textContent = "Accept";

        const declineBtn       = document.createElement("button");
        declineBtn.className   = "btnDecline";
        declineBtn.textContent = "Decline";

        // Check if already accepted via server
        fetch("/M01067508/follow/status/" + firstActor, { credentials: "include" })
            .then(function(r) { return r.json(); })
            .then(function(status) {
                if (status.followedBy) {
                    // Already accepted — show Remove
                    acceptBtn.style.display  = "none";
                    declineBtn.textContent   = "Remove";
                    declineBtn.addEventListener("click", async function() {
                        try {
                            const response = await fetch("/M01067508/follow/followers/" + firstActor, {
                                method:      "DELETE",
                                credentials: "include"
                            });

                            if (!response.ok) {
                                const data = await response.json();
                                showToast(data.error || "Could not remove follower.", "error");
                                return;
                            }

                            showToast(firstActor + " removed as follower.", "success");
                            renderNotifications();
                            renderProfile();

                        } catch (err) {
                            showToast("Could not remove follower.", "error");
                            console.error("remove follower error:", err.message);
                        }
                    });
                } else {
                    acceptBtn.addEventListener("click", function() {
                        acceptFollowRequest(firstActor);
                    });
                    declineBtn.addEventListener("click", function() {
                        declineFollowRequest(firstActor);
                        renderNotifications();
                    });
                }
            })
            .catch(function() {
                acceptBtn.addEventListener("click", function() {
                    acceptFollowRequest(firstActor);
                });
                declineBtn.addEventListener("click", function() {
                    declineFollowRequest(firstActor);
                    renderNotifications();
                });
            });

        actionArea.appendChild(acceptBtn);
        actionArea.appendChild(declineBtn);
        return actionArea;
    }

    // Like / comment / rating — post thumbnail fetched from server
    if (notif.type === "like" || notif.type === "comment" || notif.type === "rating") {
        const thumb       = document.createElement("div");
        thumb.className   = "notifThumb";
        thumb.textContent = "📄";

        if (notif.postId) {
            fetch("/M01067508/contents/" + notif.postId, { credentials: "include" })
                .then(function(r) { return r.json(); })
                .then(function(post) {
                    if (post && post.imageIds && post.imageIds.length > 0) {
                        const img   = document.createElement("img");
                        img.src     = "/M01067508/images/" + post.imageIds[0];
                        img.alt     = "Post image";
                        thumb.innerHTML = "";
                        thumb.appendChild(img);
                    }
                })
                .catch(function() {});
        }

        thumb.addEventListener("click", function() {
            showSection("feed");
        });

        actionArea.appendChild(thumb);
        return actionArea;
    }

    return actionArea;
}

// Format time
function formatNotifTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

// Startup
document.addEventListener("DOMContentLoaded", function() {
    updateNotificationDot();
});