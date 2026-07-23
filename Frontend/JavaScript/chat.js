"use strict";

// Sorting ensures alice→bob and bob→alice produce the same key
function buildConvKey(usernameA, usernameB) {
    const sorted = [usernameA, usernameB].sort();
    return "chat_" + sorted[0] + "_" + sorted[1];
}

// Creates or retrieves a conversation via server
async function getOrCreateConversation(withUsername) {
    const response = await fetch("/M01067508/conversations", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({ with: withUsername })
    });
    return await response.json();
}

function getOtherParticipant(conv) {
    const me = appState_currentUsername();
    return conv.participants.find(function(p) {
        return p !== me;
    });
}

// if totalUnread is 0 → dot hidden
// if totalUnread is 1+ → dot shown
function countUnread(conv) {
    const me = appState_currentUsername();
    let deletedAt = null;
    if (conv.deletedBy && conv.deletedBy[me]) {
        deletedAt = conv.deletedBy[me];
    }

    // Use in-memory blocked users cache instead of localStorage
    const blockedUsers = (typeof blockedUsersCache !== "undefined") ? blockedUsersCache : [];

    return conv.messages.filter(function(m) {
        if (m.from === me) {
            return false;
        }
        if (m.read === true) {
            return false;
        }
        if (deletedAt && m.timestamp <= deletedAt) {
            return false;
        }
        // Don't count messages from blocked users as unread
        if (blockedUsers.indexOf(m.from) !== -1) {
            return false;
        }
        return true;
    }).length;
}

function isConvMuted(conv) {
    const me = appState_currentUsername();
    return conv.mutedBy.indexOf(me) !== -1;
}

// Conversation state
let activeConvKey  = null;
let chatPollTimer  = null;
const CHAT_POLL_MS = 2000;

// Reply state - set when the user clicks the reply button on a bubble.
// Cleared when the message is sent or the X button is clicked.
let replyingTo = null;

// Chat list - left panel
async function renderChatList() {
    const me   = appState_currentUsername();
    const list = document.getElementById("chatConversationList");

    if (!me || !list) {
        return;
    }

    const query = (document.getElementById("chatSearchInput").value || "").trim().toLowerCase();

    try {
        const response = await fetch("/M01067508/conversations", {
            credentials: "include"
        });

        if (!response.ok) {
            list.innerHTML =
                '<div class="emptyState"><p class="emptyIcon">💬</p>' +
                "<p>No conversations yet.</p></div>";
            return;
        }

        const conversations = await response.json();

        const mine = conversations.filter(function(c) {
            if (c.participants.indexOf(me) === -1) {
                return false;
            }
            // Hide conversations blocked by the user
            if (c.hiddenBy && c.hiddenBy[me] === true) {
                return false;
            }
            // Existing soft-delete check
            if (c.deletedBy && c.deletedBy[me]) {
                const deletedAt = c.deletedBy[me];
                const hasNewMsg = c.messages.some(function(m) {
                    return m.timestamp > deletedAt;
                });
                if (!hasNewMsg) {
                    return false;
                }
            }
            return true;
        });

        mine.sort(function(a, b) {
            let lastA = "";
            let lastB = "";

            if (a.messages.length > 0) {
                lastA = a.messages[a.messages.length - 1].timestamp;
            }
            if (b.messages.length > 0) {
                lastB = b.messages[b.messages.length - 1].timestamp;
            }

            // Compare the timestamp as string - put newer timestamp first
            return lastB.localeCompare(lastA);
        });

        const filtered = mine.filter(function(conv) {
            if (!query) {
                return true;
            }
            const other = getOtherParticipant(conv);
            return other.toLowerCase().indexOf(query) !== -1;
        });

        list.innerHTML = "";

        if (filtered.length === 0) {
            list.innerHTML =
                '<div class="emptyState"><p class="emptyIcon">💬</p>' +
                "<p>No conversations yet.</p></div>";
            return;
        }

        filtered.forEach(function(conv) {
            list.appendChild(buildConvListItem(conv));
        });

    } catch (err) {
        console.error("renderChatList error:", err.message);
    }
}

function buildConvListItem(conv) {
    const me    = appState_currentUsername();
    const other  = getOtherParticipant(conv);
    const unread = countUnread(conv);

    let lastMsg = null;
    if (conv.messages.length > 0) {
        lastMsg = conv.messages[conv.messages.length - 1];
    }

    const item = document.createElement("div");
    item.className = "chatListItem";

    if (conv.key === activeConvKey) {
        item.classList.add("activeChatItem");
    }

    const avatar = document.createElement("div");
    avatar.className = "chatListAvatar";

    if (typeof renderAvatarInto === "function") {
        renderAvatarInto(avatar, other);
    } else {
        avatar.textContent = other.charAt(0).toUpperCase();
    }

    const info = document.createElement("div");
    info.className = "chatListInfo";

    const name = document.createElement("div");
    name.className   = "chatListName";
    name.textContent = other;

    const preview = document.createElement("div");
    preview.className = "chatListPreview";

    if (unread > 0) {
        preview.classList.add("unreadPreview");
    }

    if (lastMsg) {
        let prefix = "";
        if (lastMsg.from === me) {
            prefix = "You: ";
        }

        // Show a friendly label for special message types instead of raw text
        let previewText;
        if (lastMsg.text.startsWith("📎 Image: data:image")) {
            previewText = "📎 Image";
        } else if (lastMsg.text.startsWith("📤 Shared post")) {
            previewText = "📤 Shared a post";
        } else if (lastMsg.text.length > 40) {
            previewText = lastMsg.text.slice(0, 40) + "…";
        } else {
            previewText = lastMsg.text;
        }

        preview.textContent = prefix + previewText;
    } else {
        preview.textContent = "No messages yet.";
    }

    info.appendChild(name);
    info.appendChild(preview);

    item.appendChild(avatar);
    item.appendChild(info);

    if (unread > 0) {
        const dot = document.createElement("div");
        dot.className = "chatListUnreadDot";
        item.appendChild(dot);
    }

    item.addEventListener("click", function() {
        openConversation(conv.key);
    });

    return item;
}

// Right panel - Open conversation
async function openConversation(convKey) {
    activeConvKey = convKey;
    replyingTo    = null;

    try {
        const response = await fetch("/M01067508/conversations/" + convKey, {
            credentials: "include"
        });

        if (!response.ok) {
            return;
        }

        const conv  = await response.json();
        const other = getOtherParticipant(conv);

        document.getElementById("chatThreadEmpty").style.display  = "none";
        document.getElementById("chatThreadActive").style.display = "flex";

        // Thread header — declare elements first, then use them
        const threadAvatar = document.getElementById("chatThreadAvatar");
        const threadName   = document.getElementById("chatThreadName");
        const threadUser   = document.getElementById("chatThreadUsername");

        if (typeof renderAvatarInto === "function") {
            renderAvatarInto(threadAvatar, other);
        } else {
            threadAvatar.textContent = other.charAt(0).toUpperCase();
        }

        // Fetch display name from server
        let displayName = other;
        try {
            const userResp = await fetch("/M01067508/users/" + other, {
                credentials: "include"
            });
            if (userResp.ok) {
                const otherUser = await userResp.json();
                displayName     = otherUser.firstName + " " + otherUser.lastName;
            }
        } catch (e) {
            // Fall back to username if fetch fails
        }

        threadName.textContent = displayName;
        threadUser.textContent = "@" + other;

        function goToChatUserProfile() {
            if (other !== appState_currentUsername()) {
                openUserProfile(other);
            } else {
                goToMyProfile();
            }
        }

        threadAvatar.style.cursor = "pointer";
        threadName.style.cursor   = "pointer";
        threadUser.style.cursor   = "pointer";

        threadAvatar.onclick = goToChatUserProfile;
        threadName.onclick   = goToChatUserProfile;
        threadUser.onclick   = goToChatUserProfile;

        // Details panel avatar
        const detailsAvatar = document.getElementById("chatDetailsAvatar");
        if (typeof renderAvatarInto === "function") {
            renderAvatarInto(detailsAvatar, other);
        } else {
            detailsAvatar.textContent = other.charAt(0).toUpperCase();
        }

        document.getElementById("chatDetailsName").textContent     = displayName;
        document.getElementById("chatDetailsUsername").textContent = "@" + other;

        document.getElementById("chatMuteToggle").checked = isConvMuted(conv);

        // Always close the details panel when opening a conversation
        document.getElementById("chatDetailsPanel").classList.remove("chatDetailsPanelOpen");

        clearReplyTarget();
        await markConvRead(convKey);
        await renderMessages(convKey, true);
        await renderChatList();
        await updateChatUnreadDot();

    } catch (err) {
        console.error("openConversation error:", err.message);
    }
}

// Chat messages display + scrollbar
async function renderMessages(convKey, forceScroll) {
    const me        = appState_currentUsername();
    const container = document.getElementById("chatMessages");

    if (!container) {
        return;
    }

    try {
        const response = await fetch("/M01067508/conversations/" + convKey, {
            credentials: "include"
        });

        if (!response.ok) {
            container.innerHTML =
                '<div class="chatNoMessages">Conversation not found.</div>';
            return;
        }

        const conv = await response.json();

        // At the top of renderMessages(), after finding conv:
        if (conv.hiddenBy && conv.hiddenBy[me] === true) {
            container.innerHTML =
                '<div class="chatNoMessages">This conversation is unavailable.</div>';
            return;
        }

        const wasAtBottom =
            (container.scrollTop + container.clientHeight) >= (container.scrollHeight - 50);

        container.innerHTML = "";

        // Soft-delete filter: if this user deleted the conversation at some point,
        // only show messages that arrived after their deletion timestamp.
        // The other participant continues to see all messages normally.
        let visibleMessages = conv.messages;
        if (conv.deletedBy && conv.deletedBy[me]) {
            const deletedAt = conv.deletedBy[me];
            visibleMessages = conv.messages.filter(function(m) {
                return m.timestamp > deletedAt;
            });
        }

        if (visibleMessages.length === 0) {
            container.innerHTML =
                '<div class="chatNoMessages">No messages yet. Say hello!</div>';
            return;
        }

        // Build bubbles — shared post cards need async fetch so use Promise.all
        const bubblePromises = visibleMessages.map(function(msg) {
            return buildMessageBubble(msg, conv, me, convKey);
        });

        const bubbles = await Promise.all(bubblePromises);
        bubbles.forEach(function(bubble) {
            container.appendChild(bubble);
        });

        // Scroll logic:
        // forceScroll=true (openConversation): always go to bottom
        // forceScroll=false (poll): only go to bottom if user was already there
        if (forceScroll || wasAtBottom) {
            container.scrollTop = container.scrollHeight;
        }

    } catch (err) {
        console.error("renderMessages error:", err.message);
    }
}


// Builds one complete bubble element including:
// Reply quote block (if this message is a reply)
// Message content (image / shared post card / plain text)
// Timestamp
// Hover action tray (like + reply buttons)
// Like reaction row (shown below bubble when likes > 0)
async function buildMessageBubble(msg, conv, me, convKey) {
    const wrapper = document.createElement("div");
    wrapper.className = "chatBubbleWrapper";

    if (msg.from === me) {
        wrapper.classList.add("chatBubbleWrapperSent");
    } else {
        wrapper.classList.add("chatBubbleWrapperReceived");
    }

    const bubble = document.createElement("div");
    bubble.className = "chatBubble";

    if (msg.from === me) {
        bubble.classList.add("chatBubbleSent");
    } else {
        bubble.classList.add("chatBubbleReceived");
    }

    // Reply quote block
    // Shown above the message text when this is a reply
    if (msg.replyTo) {
        const quoteBlock = document.createElement("div");
        quoteBlock.className = "chatReplyQuote";

        const quoteAuthor = document.createElement("span");
        quoteAuthor.className   = "chatReplyQuoteAuthor";
        quoteAuthor.textContent = msg.replyTo.from;

        const quoteText = document.createElement("span");
        quoteText.className = "chatReplyQuoteText";

        if (msg.replyTo.text.length > 60) {
            quoteText.textContent = msg.replyTo.text.slice(0, 60) + "…";
        } else {
            quoteText.textContent = msg.replyTo.text;
        }

        quoteBlock.appendChild(quoteAuthor);
        quoteBlock.appendChild(quoteText);
        bubble.appendChild(quoteBlock);
    }

    // Inline image
    if (msg.text.startsWith("📎 Image: data:image")) {
        const imgSrc = msg.text.replace("📎 Image: ", "");

        const imgEl = document.createElement("img");
        imgEl.src       = imgSrc;
        imgEl.className = "chatInlineImage";

        imgEl.addEventListener("click", function() {
            const overlay = document.createElement("div");
            overlay.className = "chatLightboxOverlay";

            const fullImg = document.createElement("img");
            fullImg.src       = imgSrc;
            fullImg.className = "chatLightboxImg";

            overlay.appendChild(fullImg);
            document.body.appendChild(overlay);

            overlay.addEventListener("click", function() {
                document.body.removeChild(overlay);
            });
        });

        const time = document.createElement("div");
        time.className   = "chatBubbleTime";
        time.textContent = formatTimestamp(msg.timestamp);

        bubble.appendChild(imgEl);
        bubble.appendChild(time);

    // Shared post card
    } else if (msg.text.startsWith("📤 Shared post")) {

        bubble.classList.remove("chatBubbleSent", "chatBubbleReceived");
        bubble.classList.add("chatBubbleShared");

        // Parse the PostID embedded by confirmShare()
        let sharedPostId = null;
        const lines = msg.text.split("\n");
        lines.forEach(function(line) {
            if (line.startsWith("PostID: ")) {
                sharedPostId = line.replace("PostID: ", "").trim();
            }
        });

        // Fetch the post from server
        let sharedPost = null;
        if (sharedPostId) {
            try {
                const postResp = await fetch("/M01067508/contents/" + sharedPostId + "/enriched", {
                    credentials: "include"
                });
                if (postResp.ok) {
                    sharedPost = await postResp.json();
                }
            } catch (e) {
                sharedPost = null;
            }
        }

        const card = document.createElement("div");
        card.className = "chatSharedCard";

        if (sharedPost) {
            // Always show text preview — no image thumbnail
            const textThumb = document.createElement("div");
            textThumb.className   = "chatSharedCardTextThumb";
            textThumb.textContent = sharedPost.content;
            card.appendChild(textThumb);

            // Card info section
            const cardInfo = document.createElement("div");
            cardInfo.className = "chatSharedCardInfo";

            const badge = document.createElement("span");
            badge.className   = "subjectBadge chatSharedCardBadge";
            badge.textContent = sharedPost.subject;

            const refEl = document.createElement("span");
            refEl.className   = "chatSharedCardRef";
            refEl.textContent = sharedPost.questionRef || sharedPost.type;

            const authorEl = document.createElement("span");
            authorEl.className   = "chatSharedCardAuthor";
            authorEl.textContent = "by " + sharedPost.author;

            cardInfo.appendChild(badge);
            cardInfo.appendChild(refEl);
            cardInfo.appendChild(authorEl);
            card.appendChild(cardInfo);

            // The entire card is the tap target
            card.addEventListener("click", function() {
                openPostFromChat(sharedPost, convKey);
            });
        } else {
            // Post was deleted after being shared
            card.textContent = "📤 Shared post (no longer available)";
            card.classList.add("chatSharedCardUnavailable");
        }

        bubble.appendChild(card);

        const time = document.createElement("div");
        time.className   = "chatBubbleTime";
        time.textContent = formatTimestamp(msg.timestamp);
        bubble.appendChild(time);

    // Plain text
    } else {
        const text = document.createElement("div");
        text.className   = "chatBubbleText";
        text.textContent = msg.text;

        const time = document.createElement("div");
        time.className   = "chatBubbleTime";
        time.textContent = formatTimestamp(msg.timestamp);

        bubble.appendChild(text);
        bubble.appendChild(time);
    }

    wrapper.appendChild(bubble);

    // Hover action tray (like + reply) - Hidden by default
    const actions = document.createElement("div");
    actions.className = "chatMsgActions";

    if (msg.from === me) {
        actions.classList.add("chatMsgActionsSent");
    } else {
        actions.classList.add("chatMsgActionsReceived");
    }

    const replyBtn = document.createElement("button");
    replyBtn.className   = "chatMsgReplyBtn";
    replyBtn.title       = "Reply";
    replyBtn.textContent = "↩";
    replyBtn.addEventListener("click", function() {
        setReplyTarget(msg);
    });

    const likeBtn = document.createElement("button");
    likeBtn.className = "chatMsgLikeBtn";
    likeBtn.title     = "Like";

    const likes  = msg.likes || [];
    const iLiked = likes.indexOf(me) !== -1;

    if (iLiked) {
        likeBtn.textContent = "♥";
    } else {
        likeBtn.textContent = "♡";
    }

    if (iLiked) {
        likeBtn.classList.add("chatMsgLikeBtnActive");
    }

    likeBtn.addEventListener("click", function() {
        toggleMsgLike(convKey, msg.timestamp);
    });

    // Sent messages: reply on left, like on right
    // Received messages: like on left, reply on right
    if (msg.from === me) {
        actions.appendChild(replyBtn);
        actions.appendChild(likeBtn);
    } else {
        actions.appendChild(likeBtn);
        actions.appendChild(replyBtn);
    }

    wrapper.appendChild(actions);

    // Like reaction row
    // Shown below the bubble when at least one person has liked the message
    if (likes.length > 0) {
        const likeRow = document.createElement("div");
        likeRow.className = "chatMsgLikeRow";

        if (msg.from === me) {
            likeRow.classList.add("chatMsgLikeRowSent");
        } else {
            likeRow.classList.add("chatMsgLikeRowReceived");
        }

        likeRow.textContent = "♥ " + likes.length;
        wrapper.appendChild(likeRow);
    }

    return wrapper;
}

// Toggle message like
async function toggleMsgLike(convKey, msgTimestamp) {
    try {
        await fetch("/M01067508/conversations/" + convKey + "/messages/like", {
            method:      "PUT",
            headers:     { "Content-Type": "application/json" },
            credentials: "include",
            body:        JSON.stringify({ timestamp: msgTimestamp })
        });
        await renderMessages(convKey, false);
    } catch (err) {
        console.error("toggleMsgLike error:", err.message);
    }
}

// Reply target state
function setReplyTarget(msg) {
    replyingTo = msg;

    // Remove any existing reply bar first
    const existing = document.getElementById("chatReplyBar");
    if (existing) {
        existing.remove();
    }

    const bar = document.createElement("div");
    bar.id        = "chatReplyBar";
    bar.className = "chatReplyBar";

    const label = document.createElement("span");
    label.className   = "chatReplyBarLabel";
    label.textContent = "Replying to " + msg.from + ":";

    const preview = document.createElement("span");
    preview.className = "chatReplyBarText";

    if (msg.text.length > 60) {
        preview.textContent = msg.text.slice(0, 60) + "…";
    } else {
        preview.textContent = msg.text;
    }

    const cancelBtn = document.createElement("button");
    cancelBtn.className   = "chatReplyBarCancel";
    cancelBtn.textContent = "✕";
    cancelBtn.addEventListener("click", function() {
        clearReplyTarget();
    });

    bar.appendChild(label);
    bar.appendChild(preview);
    bar.appendChild(cancelBtn);

    // Insert the bar directly above the chat input form
    const inputForm = document.getElementById("chatInputForm");
    if (inputForm) {
        inputForm.parentNode.insertBefore(bar, inputForm);
    }

    // Focus the input so the user can type immediately
    const input = document.getElementById("chatMessageInput");
    if (input) {
        input.focus();
    }
}

function clearReplyTarget() {
    replyingTo = null;

    const bar = document.getElementById("chatReplyBar");
    if (bar) {
        bar.remove();
    }
}

// Open post from chat when clicking on it
function openPostFromChat(post, convKey) {
    showSection("feed", function() {
        const feedList = document.getElementById("feedList");
        feedList.innerHTML = "";

        const banner = document.createElement("div");
        banner.className = "feedFilterBanner chatBackBanner";
        banner.innerHTML =
            'Shared post <button class="feedFilterClearBtn">← Back to chat</button>';

        banner.querySelector(".feedFilterClearBtn").addEventListener("click", function() {
            showSection("chat");
            setTimeout(function() {
                openConversation(convKey);
            }, 350);
        });

        feedList.appendChild(banner);
        feedList.appendChild(buildPostCard(post));
    });
}

// Mark conversation as read
async function markConvRead(convKey) {
    try {
        await fetch("/M01067508/conversations/" + convKey + "/read", {
            method:      "PUT",
            credentials: "include"
        });
    } catch (err) {
        console.error("markConvRead error:", err.message);
    }
}

// Send message
async function sendChatMessage(event) {
    event.preventDefault();

    const me    = appState_currentUsername();
    const input = document.getElementById("chatMessageInput");
    const text  = input.value.trim();

    if (!text || !activeConvKey) {
        return;
    }

    // If you've blocked them, don't bother sending at all. If THEY'VE
    // blocked you, the send still goes through fine — it's just silently
    // filtered out of their view server-side (see conversations.js), so
    // they never know you tried. Only your own blocked list is checkable
    // here; there's no way to know in advance whether they've blocked you.
    try {
        const convResp = await fetch("/M01067508/conversations/" + activeConvKey, {
            credentials: "include"
        });

        if (!convResp.ok) { return; }

        const conv  = await convResp.json();
        const other = getOtherParticipant(conv);

        if (typeof isBlocked === "function" && isBlocked(other)) {
            showToast("You can't message this user.", "error");
            return;
        }

        const body = { text };

        if (replyingTo) {
            body.replyTo = {
                from: replyingTo.from,
                text: replyingTo.text
            };
        }

        const response = await fetch("/M01067508/conversations/" + activeConvKey + "/messages", {
            method:      "POST",
            headers:     { "Content-Type": "application/json" },
            credentials: "include",
            body:        JSON.stringify(body)
        });

        if (!response.ok) {
            const data = await response.json();
            showToast(data.error || "Could not send message.", "error");
            return;
        }

        input.value = "";
        clearReplyTarget();

        await renderMessages(activeConvKey, true);
        await renderChatList();

    } catch (err) {
        console.error("sendChatMessage error:", err.message);
    }
}

// Send message
async function sendDirectMessage(toUsername, text) {
    const me = appState_currentUsername();
    if (!me || !toUsername || !text) {
        return;
    }

    // If you've blocked them, don't bother sending — see comment in
    // sendChatMessage above for how the reverse direction is handled.
    if (typeof isBlocked === "function" && isBlocked(toUsername)) {
        showToast("You can't message this user.", "error");
        return;
    }

    try {
        const conv = await getOrCreateConversation(toUsername);

        const response = await fetch("/M01067508/conversations/" + conv.key + "/messages", {
            method:      "POST",
            headers:     { "Content-Type": "application/json" },
            credentials: "include",
            body:        JSON.stringify({ text })
        });

        if (!response.ok) {
            const data = await response.json();
            showToast(data.error || "Could not send message.", "error");
            return;
        }

        await updateChatUnreadDot();
        await renderChatList();

    } catch (err) {
        showToast("Could not send message.", "error");
        console.error("sendDirectMessage error:", err.message);
    }
}

// Filter, Mute, Block, Delete in chat details
function filterChatList() {
    renderChatList();
}

async function toggleMuteChat() {
    if (!activeConvKey) { return; }

    try {
        const response = await fetch("/M01067508/conversations/" + activeConvKey + "/mute", {
            method:      "PUT",
            credentials: "include"
        });

        const data = await response.json();

        if (data.muted) {
            showToast("Conversation muted.", "success");
        } else {
            showToast("Conversation unmuted.", "success");
        }

    } catch (err) {
        console.error("toggleMuteChat error:", err.message);
    }
}

// Block a user from chat
async function blockChatUser() {
    if (!activeConvKey) {
        return;
    }

    try {
        const convResp = await fetch("/M01067508/conversations/" + activeConvKey, {
            credentials: "include"
        });

        if (!convResp.ok) { return; }

        const conv  = await convResp.json();
        const other = getOtherParticipant(conv);

        if (typeof isBlocked === "function" && isBlocked(other)) {
            showToast(other + " is already blocked.", "");
            return;
        }

        showBlockModal(other, function() {
            blockUser(other);
            closeActiveThread();
            renderChatList();
        });

    } catch (err) {
        console.error("blockChatUser error:", err.message);
    }
}

// Delete chat from the user who deleted it, not from both ends
function deleteChatConversation() {
    if (!activeConvKey) {
        return;
    }
    document.getElementById("deleteChatModal").style.display = "flex";
}

function closeDeleteChatModal() {
    document.getElementById("deleteChatModal").style.display = "none";
}

async function confirmDeleteChat() {
    closeDeleteChatModal();

    if (!activeConvKey) {
        return;
    }

    try {
        await fetch("/M01067508/conversations/" + activeConvKey, {
            method: "DELETE",
            credentials: "include"
        });

        showToast("Conversation deleted.", "success");
        closeActiveThread();
        await renderChatList();

    } catch (err) {
        console.error("confirmDeleteChat error:", err.message);
    }
}

// Open new/existing chat
async function openChatWith(username) {
    const conv = await getOrCreateConversation(username);
    showSection("chat");
    setTimeout(function() {
        openConversation(conv.key);
    }, 350);
}

// Chat details - mute/block...
function toggleChatDetails() {
    const panel = document.getElementById("chatDetailsPanel");
    panel.classList.toggle("chatDetailsPanelOpen");
}

// Close the opened chat
function closeActiveThread() {
    activeConvKey = null;
    clearReplyTarget();
    document.getElementById("chatThreadEmpty").style.display  = "flex";
    document.getElementById("chatThreadActive").style.display = "none";
}

// Displaying unread dot
async function updateChatUnreadDot() {
    const me = appState_currentUsername();
    if (!me) {
        return;
    }

    try {
        const response = await fetch("/M01067508/conversations", {
            credentials: "include"
        });

        if (!response.ok) { return; }

        const conversations = await response.json();
        let totalUnread = 0;

        conversations.forEach(function(conv) {
            if (conv.participants.indexOf(me) === -1) {
                return;
            }
            // Skip hidden conversations (blocked users)
            if (conv.hiddenBy && conv.hiddenBy[me] === true) {
                return;
            }
            if (!isConvMuted(conv)) {
                totalUnread += countUnread(conv);
            }
        });

        const hasUnread  = totalUnread > 0;
        const headerDot  = document.getElementById("headerChatDot");
        const sidebarDot = document.getElementById("sidebarChatDot");

        if (headerDot) {
            if (hasUnread) {
                headerDot.style.display = "block";
            } else {
                headerDot.style.display = "none";
            }
        }

        if (sidebarDot) {
            if (hasUnread) {
                sidebarDot.style.display = "block";
            } else {
                sidebarDot.style.display = "none";
            }
        }

    } catch (err) {
        console.error("updateChatUnreadDot error:", err.message);
    }
}

// Polling
function startChatPolling() {
    if (chatPollTimer) {
        clearInterval(chatPollTimer);
    }

    chatPollTimer = setInterval(async function() {
        await updateChatUnreadDot();
        await renderChatList();

        if (activeConvKey) {
            await renderMessages(activeConvKey, false);
        }
    }, CHAT_POLL_MS);
}

function stopChatPolling() {
    if (chatPollTimer) {
        clearInterval(chatPollTimer);
        chatPollTimer = null;
    }
}

// Chat entry point
async function renderChat() {
    activeConvKey = null;
    clearReplyTarget();

    const emptyEl  = document.getElementById("chatThreadEmpty");
    const activeEl = document.getElementById("chatThreadActive");

    if (emptyEl) {
        emptyEl.style.display  = "flex";
    }

    if (activeEl) {
        activeEl.style.display = "none";
    }

    await renderChatList();
    await updateChatUnreadDot();
}

// Chat entry point
document.addEventListener("DOMContentLoaded", function() {
    // Polling starts after login via login.js
});