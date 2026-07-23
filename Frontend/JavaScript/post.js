"use strict";

// Tracks which post the delete confirmation modal is currently open for
let pendingDeletePostId = null;
let pendingDeleteCardEl = null;

// When the like button on a card is clicked
async function toggleLike(postId, likeBtn) {
    const me = appState_currentUsername();
    if (!me) { return; }

    try {
        const response = await fetch("/M01067508/contents/" + postId + "/likes", {
            method: "POST",
            credentials: "include"
        });

        const data = await response.json();

        if (!response.ok) {
            showToast("Could not update like.", "error");
            return;
        }

        // data.liked = true (just liked) or false (just unliked)
        const icon = likeBtn.querySelector(".likeIcon");
        const count = likeBtn.querySelector(".likeCountLabel");

        if (data.liked) {
            likeBtn.classList.add("likedState");
            icon.textContent = "♥";

            // Notify post author - look up author from the card element
            const articleEl = likeBtn.closest(".postCard");

            let authorEl;
            if (articleEl) {
                authorEl = articleEl.querySelector(".postAuthorName");
            } else {
                authorEl = null;
            }

            let author;
            if (authorEl) {
                author = authorEl.textContent;
            } else {
                author = null;
            }

            if (author && author !== me && typeof pushNotification === "function") {
                pushNotification(author, "like", me, postId);
            }
        } else {
            likeBtn.classList.remove("likedState");
            icon.textContent = "♡";
        }

        count.textContent = data.likeCount;

    } catch (err) {
        console.error("toggleLike error:", err.message);
    }
}

function toggleCommentsPanel(postId, articleEl) {
    const panel = articleEl.querySelector(".commentsPanel");
    const isOpen = panel.classList.contains("commentsPanelOpen");

    if (isOpen) {
        panel.classList.remove("commentsPanelOpen");
    } else {
        renderComments(postId, articleEl);
        panel.classList.add("commentsPanelOpen");
    }
}

// Comment list for a post
// Render comments - fetches from server
async function renderComments(postId, articleEl) {
    const list = articleEl.querySelector(".commentsList");
    list.innerHTML = "";

    try {
        const response = await fetch("/M01067508/contents/" + postId + "/comments", {
            credentials: "include"
        });

        const comments = await response.json();

        if (comments.length === 0) {
            list.innerHTML = '<p class="commentsEmpty">No comments yet. Be the first!</p>';
            return;
        }

        const VISIBLE = 5;
        const showing = comments.slice(-VISIBLE);
        const hidden  = comments.length - showing.length;

        if (hidden > 0) {
            const loadBtn = document.createElement("button");
            loadBtn.className = "btnLoadEarlier";
            let earlierLabel;
            if (hidden > 1) {
                earlierLabel = "s";
            } else {
                earlierLabel = "";
            }
            loadBtn.textContent = "Load " + hidden + " earlier comment" + earlierLabel;
            loadBtn.addEventListener("click", function() {
                renderAllComments(comments, articleEl);
            });
            list.appendChild(loadBtn);
        }

        showing.forEach(function(c) {
            list.appendChild(buildCommentRow(c));
        });

        list.scrollTop = list.scrollHeight;

    } catch (err) {
        console.error("renderComments error:", err.message);
    }
}

// Render all comments - receives already-fetched array
function renderAllComments(comments, articleEl) {
    const list = articleEl.querySelector(".commentsList");
    list.innerHTML = "";
    comments.forEach(function(c) { list.appendChild(buildCommentRow(c)); });
    list.scrollTop = 0;
}

// Builds one comment row element - extracted as a helper
// so both renderComments and renderAllComments can use it
function buildCommentRow(c) {
    const row = document.createElement("div");
    row.className = "commentRow";
    row.innerHTML =
        '<span class="commentAuthor">' + c.author + '</span>' +
        '<span class="commentText">' + c.text  + '</span>';
    return row;
}

// Submitting a comment
async function handleAddComment(event, postId, articleEl) {
    event.preventDefault();
    const me = appState_currentUsername();
    if (!me) { return; }

    const input = articleEl.querySelector(".commentInput");
    const text = input.value.trim();
    if (!text)  { return; }

    try {
        const response = await fetch("/M01067508/contents/" + postId + "/comments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            const data = await response.json();
            showToast(data.error || "Could not add comment.", "error");
            return;
        }

        input.value = "";

        // Fetch updated comments from server and re-render
        await renderComments(postId, articleEl);

        // Update count on toggle button
        const commentBtn = articleEl.querySelector(".btnToggleComments");
        const countResp = await fetch("/M01067508/contents/" + postId + "/comments", {
            credentials: "include"
        });
        const comments = await countResp.json();
        commentBtn.querySelector(".commentCountLabel").textContent = comments.length;

        // Notify post author
        const authorEl = articleEl.querySelector(".postAuthorName");

        let author;
        if (authorEl) {
            author = authorEl.textContent;
        } else {
            author = null;
        }

        if (author && author !== me && typeof pushNotification === "function") {
            pushNotification(author, "comment", me, postId);
        }

    } catch (err) {
        console.error("handleAddComment error:", err.message);
    }
}

// Submit rating
async function submitRating(postId, stars, articleEl) {
    const me = appState_currentUsername();
    if (!me) { return; }

    try {
        const response = await fetch("/M01067508/contents/" + postId + "/ratings", {
            method:      "POST",
            headers:     { "Content-Type": "application/json" },
            credentials: "include",
            body:        JSON.stringify({ stars })
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Could not save rating.", "error");
            return;
        }

        // Re-render stars with new value directly
        renderStars(postId, articleEl, stars);

        const authorEl = articleEl.querySelector(".postAuthorName");
        const author   = authorEl ? authorEl.textContent : null;
        if (author && author !== me && typeof pushNotification === "function") {
            pushNotification(author, "rating", me, postId);
        }

    } catch (err) {
        console.error("submitRating error:", err.message);
    }
}

// Repaints just the star buttons inside one card
function renderStars(postId, articleEl, myStars) {
    const initialStars = myStars || 0;
    const starBtns     = articleEl.querySelectorAll(".starBtn");

    starBtns.forEach(function(btn) {
        const val = parseInt(btn.getAttribute("data-star"));
        if (val <= initialStars) {
            btn.textContent = "★";
            btn.classList.add("starFilled");
        } else {
            btn.textContent = "☆";
            btn.classList.remove("starFilled");
        }
    });

    const avgEl = articleEl.querySelector(".ratingAvg");
    if (initialStars > 0) {
        avgEl.textContent = "★ " + initialStars + " (your rating)";
    } else {
        avgEl.textContent = "Not yet rated";
    }
}

// Called when save button on a card is clicked
async function toggleSave(postId, saveBtn) {
    const me = appState_currentUsername();
    if (!me) { return; }

    try {
        const response = await fetch("/M01067508/contents/" + postId + "/saved", {
            method:      "POST",
            credentials: "include"
        });

        const data = await response.json();

        if (!response.ok) {
            showToast("Could not save post.", "error");
            return;
        }

        if (data.saved) {
            saveBtn.classList.add("savedState");
            saveBtn.title = "Saved";
            saveBtn.querySelector(".saveIcon").innerHTML =
                '<img src="./Frontend/Assets/bookmark.png" class="saveIconImg" alt="Saved">';
            showToast("Post saved.", "success");
        } else {
            saveBtn.classList.remove("savedState");
            saveBtn.title = "Save";
            saveBtn.querySelector(".saveIcon").innerHTML =
                '<img src="./Frontend/Assets/not_bookmark.png" class="saveIconImg" alt="Save">';
            showToast("Post removed from saved.", "success");
        }

    } catch (err) {
        showToast("Could not save post.", "error");
        console.error("toggleSave error:", err.message);
    }
}

// Share
// State for the share modal
let shareTargetPost = null;
let shareSelectedUsers = new Set(); // Set prevents duplicates automatically

// Share post with other users
async function sharePost(post) {
    shareTargetPost    = post;
    shareSelectedUsers = new Set();

    const me = appState_currentUsername();

    // Fetch following list from server
    let myFollowing = [];
    try {
        const response = await fetch("/M01067508/follow/following/" + me, {
            credentials: "include"
        });
        if (response.ok) {
            myFollowing = await response.json();
        }
    } catch (err) {
        myFollowing = [];
    }

    renderShareUserList(myFollowing);

    const modal = document.getElementById("sharePostModal");
    if (modal) {
        modal.style.display = "flex";
    }

    document.getElementById("shareSearchInput").value = "";

    // Send button starts disabled — needs at least one selection
    const sendBtn = document.getElementById("shareSendBtn");
    sendBtn.classList.add("btnShareSendDisabled");
    sendBtn.classList.remove("btnShareSendActive");
}

// Multi-select with toggle, send button shows count
function renderShareUserList(usernames) {
    const list = document.getElementById("shareUserList");
    if (!list) {
        return;
    }
    list.innerHTML = "";

    if (usernames.length === 0) {
        list.innerHTML = '<p class="shareEmptyMsg">No followers to share with yet.</p>';
        return;
    }

    for (let i = 0; i < usernames.length; i++) {
        const username = usernames[i];

        const row = document.createElement("div");
        row.className = "chatListItem shareListItem";

        // Restore selected state if already chosen
        if (shareSelectedUsers.has(username)) {
            row.classList.add("shareListItemSelected");
        }

        // User profile picture with their name
        const avatar = document.createElement("div");
        avatar.className = "chatListAvatar shareListAvatar";
        if (typeof renderAvatarInto === "function") {
            renderAvatarInto(avatar, username);
        } else {
            avatar.textContent = username.charAt(0).toUpperCase();
        }

        const nameEl = document.createElement("div");
        nameEl.className = "chatListName";
        nameEl.textContent = username;

        // Checkmark shown when selected
        const check = document.createElement("span");
        check.className = "shareCheckmark";
        check.textContent = "✓";

        if (shareSelectedUsers.has(username)) {
            check.style.display = "flex";
        } else {
            check.style.display = "none";
        }

        row.appendChild(avatar);
        row.appendChild(nameEl);
        row.appendChild(check);

        row.addEventListener("click", (function(username, row, check) {
            return function() {
                if (shareSelectedUsers.has(username)) {
                    // Already selected — deselect
                    shareSelectedUsers.delete(username);
                    row.classList.remove("shareListItemSelected");
                    check.style.display = "none";
                } else {
                    // Not selected — select
                    shareSelectedUsers.add(username);
                    row.classList.add("shareListItemSelected");
                    check.style.display = "flex";
                }

                // Update send button text and state
                const sendBtn = document.getElementById("shareSendBtn");
                if (shareSelectedUsers.size > 0) {
                    sendBtn.classList.remove("btnShareSendDisabled");
                    sendBtn.classList.add("btnShareSendActive");

                    if (shareSelectedUsers.size === 1) {
                        sendBtn.textContent = "Send (1)";
                    } else {
                        sendBtn.textContent = "Send (" + shareSelectedUsers.size + ")";
                    }
                } else {
                    sendBtn.classList.add("btnShareSendDisabled");
                    sendBtn.classList.remove("btnShareSendActive");
                    sendBtn.textContent = "Send";
                }
            };
        })(username, row, check));

        list.appendChild(row);
    }
}

// Search followers filter for sharing posts
async function filterShareList() {
    const query = document.getElementById("shareSearchInput").value.trim().toLowerCase();
    const me    = appState_currentUsername();

    let myFollowing = [];
    try {
        const response = await fetch("/M01067508/follow/following/" + me, {
            credentials: "include"
        });
        if (response.ok) {
            myFollowing = await response.json();
        }
    } catch (err) {
        myFollowing = [];
    }

    const filtered = myFollowing.filter(function(u) {
        return u.toLowerCase().indexOf(query) !== -1;
    });

    renderShareUserList(filtered);
}

// Loops over every selected user
function confirmShare() {
    if (!shareTargetPost || shareSelectedUsers.size === 0) {
        return;
    }

    const post = shareTargetPost;

    let text =
        "📤 Shared post\n" +
        "PostID: " + post._id + "\n" +
        "Subject: " + post.subject + "\n";

    if (post.questionRef) {
        text = text + "Ref: " + post.questionRef;
    }

    // Send to every selected user
    const selectedArray = [...shareSelectedUsers];
    for (let i = 0; i < selectedArray.length; i++) {
        const username = selectedArray[i];
        if (typeof sendDirectMessage === "function") {
            sendDirectMessage(username, text);
        }
    }

    const count = shareSelectedUsers.size;
    let toastMsg;

    if (count === 1) {
        toastMsg = "Post shared with " + selectedArray[0] + ".";
    } else {
        toastMsg = "Post shared with " + count + " people.";
    }

    showToast(toastMsg, "success");
    closeShareModal();
}

function closeShareModal() {
    const modal = document.getElementById("sharePostModal");
    if (modal) {
        modal.style.display = "none";
    }
    shareTargetPost = null;
    shareSelectedUsers = new Set();
}

// Small shared helper - turns an ISO timestamp into something readable
function formatTimestamp(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString([], { day: "numeric", month: "short" }) +
        " · " +
        date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Post likes modal
async function openPostLikesModal(postId) {
    const list = document.getElementById("postLikesList");
    if (!list) { return; }
    list.innerHTML = "";

    try {
        const response = await fetch("/M01067508/contents/" + postId + "/likes/users", {
            credentials: "include"
        });

        const usernames = await response.json();

        if (!usernames || usernames.length === 0) {
            list.innerHTML = '<p class="followTabEmpty">No likes yet.</p>';
            document.getElementById("postLikesModal").style.display = "flex";
            return;
        }

        usernames.forEach(function(username) {
            const row = document.createElement("div");
            row.className = "followTabRow";
            row.style.cursor = "pointer";

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

            row.addEventListener("click", (function(uname) {
                return function() {
                    closePostLikesModal();
                    const me = appState_currentUsername();
                    if (uname === me) {
                        goToMyProfile();
                    } else {
                        openUserProfile(uname);
                    }
                };
            })(username));

            list.appendChild(row);
        });

        document.getElementById("postLikesModal").style.display = "flex";

    } catch (err) {
        console.error("openPostLikesModal error:", err.message);
    }
}

function closePostLikesModal() {
    document.getElementById("postLikesModal").style.display = "none";
    const list = document.getElementById("postLikesList");
    if (list) {
        list.innerHTML = "";
    }
}

// Download posts from feed
function downloadDataUrl(dataUrl, filename) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function downloadPost(post) {
    // Build a safe filename base from subject + question ref,
    // stripping characters that aren't valid in filenames
    let refOrType;
    if (post.questionRef) {
        refOrType = post.questionRef;
    } else {
        refOrType = post.type;
    }

    // Matches any character that is not a letter or a word to _
    const safeBase = (post.subject + "_" + refOrType)
        .replace(/[^a-z0-9]/gi, "_")
        .toLowerCase(); // all lowercase

    // Download a text file with the post content
    let referenceLine;
    if (post.questionRef) {
        referenceLine = post.questionRef;
    } else {
        referenceLine = "—";
    }

    // Text file content
    const textContent =
        "Subject: " + post.subject + "\n" +
        "Reference: " + referenceLine + "\n" +
        "Author: " + post.author + "\n" +
        "Type: " + post.type + "\n" +
        "Posted: " + formatTimestamp(post.timestamp) + "\n\n" +
        post.content;

    const textBlob = new Blob([textContent], { type: "text/plain" });
    const textUrl  = URL.createObjectURL(textBlob);
    downloadDataUrl(textUrl, safeBase + ".txt");
    URL.revokeObjectURL(textUrl);

    // Download every image, if any exist
    const imageList = post.imageIds || [];

    if (imageList.length > 0) {
        imageList.forEach(function(filename, index) {
            setTimeout(async function() {

                // Fetch the image from the server as a blob
                const response  = await fetch("/M01067508/images/" + filename, {
                    credentials: "include"
                });
                const blob      = await response.blob();
                const objectUrl = URL.createObjectURL(blob);

                // Extract extension from filename — e.g. alice_123.png → png
                const ext      = filename.split(".").pop() || "png";

                let downloadName;
                if (imageList.length > 1) {
                    downloadName = safeBase + "_image" + (index + 1) + "." + ext;
                } else {
                    downloadName = safeBase + "." + ext;
                }

                downloadDataUrl(objectUrl, downloadName);
                URL.revokeObjectURL(objectUrl);

            }, index * 300);
        });

        let imageWord;
        if (imageList.length === 1) {
            imageWord = " image";
        } else {
            imageWord = " images";
        }

        showToast(
            "Downloading " + imageList.length + imageWord + " and post text…",
            "success"
        );
    } else {
        showToast("Post downloaded.", "success");
    }
}

// Filenames are of the form username_timestamp.ext
function isPdfFilename(filename) {
    return filename.toLowerCase().endsWith(".pdf");
}

// Builds an <img> tile for one
function buildAttachmentElement(filename, altLabel) {
    if (isPdfFilename(filename)) {
        const pdfLink       = document.createElement("a");
        pdfLink.className   = "postPdfAttachment";
        pdfLink.href        = "/M01067508/images/" + filename;
        pdfLink.target      = "_blank";
        pdfLink.rel         = "noopener";

        const pdfIcon       = document.createElement("span");
        pdfIcon.className   = "postPdfAttachmentIcon";
        pdfIcon.textContent = "📄";

        const pdfLabel       = document.createElement("span");
        pdfLabel.className   = "postPdfAttachmentLabel";
        pdfLabel.textContent = "Open PDF";

        pdfLink.appendChild(pdfIcon);
        pdfLink.appendChild(pdfLabel);
        return pdfLink;
    }

    const img     = document.createElement("img");
    img.className = "postImage";
    img.src       = "/M01067508/images/" + filename;
    img.alt       = altLabel;
    return img;
}

// Post card
function buildPostCard(post) {
    const template = document.getElementById("postCardTemplate");
    const card = template.content.cloneNode(true);

    // A complete post
    const articleEl = card.querySelector(".postCard");
    const postId = post._id.toString();
    articleEl.setAttribute("data-postid", postId);
    const initialMyRating = post.myRating || 0;

    // Header
    const avatarEl = card.querySelector(".postAvatar");

    if (typeof renderAvatarInto === "function") {
        renderAvatarInto(avatarEl, post.author);
    }

    // Make avatar and author name navigate to that user's profile when clicked
    avatarEl.classList.add("postAvatarClickable");
    avatarEl.addEventListener("click", function() {
        if (post.author !== appState_currentUsername()) {
            openUserProfile(post.author);
        } else {
            goToMyProfile();
        }
    });

    const authorNameEl = card.querySelector(".postAuthorName");
    authorNameEl.textContent = post.author;
    authorNameEl.classList.add("postAuthorNameClickable");
    authorNameEl.addEventListener("click", function() {
        if (post.author !== appState_currentUsername()) {
            openUserProfile(post.author);
        } else {
            goToMyProfile();
        }
    });

    // Show a delete button only on posts the current user authored
    const me = appState_currentUsername();
    if (post.author === me) {
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "postDeleteBtn";
        deleteBtn.title = "Delete post";
        deleteBtn.textContent = "🗑";

        deleteBtn.addEventListener("click", function() {
            const cardEl = deleteBtn.closest(".postCard");
            openDeletePostModal(postId, cardEl);
        });

        // Insert delete button at the far right of the post header
        const postHeader = card.querySelector(".postCardHeader");
        if (postHeader) {
            postHeader.appendChild(deleteBtn);
        }
    }
    card.querySelector(".postTimestamp").textContent = formatTimestamp(post.timestamp);
    card.querySelector(".postTypeBadge").textContent = capitalizeFirst(post.type);

    // Meta
    card.querySelector(".subjectBadge").textContent    = post.subject;
    card.querySelector(".postQuestionRef").textContent = post.questionRef;

    // Body
    card.querySelector(".postBody").textContent = post.content;

    // Image
    const imageList = post.imageIds || [];
    const imageWrap = card.querySelector(".postImageWrap");

    if (!imageWrap) {
        console.warn("buildPostCard: .postImageWrap not found in postCardTemplate - check index.html");
    } else if (imageList.length > 0) {
        imageWrap.classList.remove("postImageWrapHidden");
        imageWrap.style.display = "block";
        imageWrap.innerHTML = "";

        if (imageList.length === 1) {
            // Single attachment - image or PDF
            const attachment = buildAttachmentElement(imageList[0], "Post image");
            imageWrap.appendChild(attachment);

        } else {
            // Multiple attachments - build a carousel
            const carousel  = document.createElement("div");
            carousel.className = "postCarousel";

            const track = document.createElement("div");
            track.className = "postCarouselTrack";

            imageList.forEach(function(filename, idx) {
                const slide = document.createElement("div");
                slide.className = "postCarouselSlide";

                const attachment = buildAttachmentElement(filename, "Image " + (idx + 1));

                slide.appendChild(attachment);
                track.appendChild(slide);
            });

            const counter = document.createElement("div");
            counter.className  = "postCarouselCounter";
            counter.textContent = "1 / " + imageList.length;

            const prevBtn  = document.createElement("button");
            prevBtn.className = "postCarouselBtn postCarouselPrev";
            prevBtn.textContent = "‹";

            const nextBtn = document.createElement("button");
            nextBtn.className = "postCarouselBtn postCarouselNext";
            nextBtn.textContent = "›";

            let currentIndex = 0;

            function goToSlide(index) {
                currentIndex          = index;
                track.style.transform = "translateX(-" + (currentIndex * 100) + "%)";
                counter.textContent   = (currentIndex + 1) + " / " + imageList.length;

                if (currentIndex === 0) {
                    prevBtn.style.display = "none";
                } else {
                    prevBtn.style.display = "flex";
                }

                if (currentIndex === imageList.length - 1) {
                    nextBtn.style.display = "none";
                } else {
                    nextBtn.style.display = "flex";
                }
            }

            prevBtn.addEventListener("click", function() {
                if (currentIndex > 0) {
                    goToSlide(currentIndex - 1);
                }
            });

            nextBtn.addEventListener("click", function() {
                if (currentIndex < imageList.length - 1) {
                    goToSlide(currentIndex + 1);
                }
            });

            carousel.appendChild(prevBtn);
            carousel.appendChild(track);
            carousel.appendChild(nextBtn);
            carousel.appendChild(counter);

            imageWrap.appendChild(carousel);
            goToSlide(0);
        }
    } else {
        // No attachments - make sure the wrap stays hidden and empty
        imageWrap.classList.add("postImageWrapHidden");
        imageWrap.style.display = "none";
        imageWrap.innerHTML = "";
    }

    // Star rating row
    const starsWrap = card.querySelector(".postStarsRow");
    for (let s = 1; s <= 5; s++) {
        const btn = document.createElement("button");
        btn.className = "starBtn";
        btn.setAttribute("data-star", s);
        btn.textContent = "☆";
        btn.addEventListener("click", (function(stars) {
            return function() { submitRating(postId, stars, articleEl); };
        })(s));
        starsWrap.appendChild(btn);
    }
    const avgEl = document.createElement("span");
    avgEl.className = "ratingAvg";
    starsWrap.appendChild(avgEl);
    renderStars(postId, articleEl, initialMyRating);

    // Like
    const likeBtn = card.querySelector(".btnLikeToggle");
    const likeCountLabel = likeBtn.querySelector(".likeCountLabel");

    likeCountLabel.textContent = post.likeCount || 0;

    if (post.iLiked) {
        likeBtn.querySelector(".likeIcon").textContent = "♥";
        likeBtn.classList.add("likedState");
    } else {
        likeBtn.querySelector(".likeIcon").textContent = "♡";
    }

    likeCountLabel.style.cursor = "pointer";
    likeCountLabel.addEventListener("click", function(event) {
        event.stopPropagation();
        openPostLikesModal(postId);
    });

    // Button click (on icon area) toggles the like
    likeBtn.addEventListener("click", function() {
        toggleLike(postId, likeBtn);
    });

    // Comment toggle
    const commentBtn = card.querySelector(".btnToggleComments");
    commentBtn.querySelector(".commentCountLabel").textContent = post.commentCount || 0;
    commentBtn.addEventListener("click", function() {
        toggleCommentsPanel(postId, articleEl);
    });

    // Save
    const saveBtn = card.querySelector(".btnSaveToggle");
    if (me && post.iSaved) {
        saveBtn.classList.add("savedState");
        saveBtn.querySelector(".saveIcon").innerHTML =
            '<img src="./Frontend/Assets/bookmark.png" class="saveIconImg" alt="Saved">';
        saveBtn.title = "Saved";
    } else {
        saveBtn.querySelector(".saveIcon").innerHTML =
            '<img src="./Frontend/Assets/not_bookmark.png" class="saveIconImg" alt="Save">';
        saveBtn.title = "Save";
    }

    saveBtn.addEventListener("click", function() {
        toggleSave(postId, saveBtn);
    });

    // Share
    const shareBtn = card.querySelector(".btnShare");
    shareBtn.addEventListener("click", function() {
        sharePost(post);
    });

    // Comment submit
    const commentForm = card.querySelector(".commentInputRow");
    commentForm.addEventListener("submit", function(event) {
        handleAddComment(event, postId, articleEl);
    });

    // Download
    const downloadBtn = card.querySelector(".btnDownload");
    if (downloadBtn) {
        downloadBtn.addEventListener("click", function() {
            downloadPost(post);
        });
    }

    return card;
}

// ===== Delete post confirmation modal ======
function openDeletePostModal(postId, cardEl) {
    pendingDeletePostId = postId;
    pendingDeleteCardEl = cardEl;
    document.getElementById("deletePostModal").style.display = "flex";
}

function closeDeletePostModal() {
    document.getElementById("deletePostModal").style.display = "none";
}

// Own post deletion by a user
async function confirmDeletePost() {
    closeDeletePostModal();

    if (!pendingDeletePostId) {
        return;
    }

    const postId = pendingDeletePostId;
    const cardEl = pendingDeleteCardEl;

    pendingDeletePostId = null;
    pendingDeleteCardEl = null;

    try {
        const response = await fetch("/M01067508/contents/" + postId, {
            method: "DELETE",
            credentials: "include"
        });

        if (!response.ok) {
            const data = await response.json();
            showToast(data.error || "Could not delete post.", "error");
            return;
        }

        showToast("Post deleted.", "success");

        if (cardEl) {
            cardEl.remove();
        }

    } catch (err) {
        showToast("Could not delete post.", "error");
        console.error("confirmDeletePost error:", err.message);
    }
}


// Rendering the Liked Posts section
async function renderLikedPosts() {
    const me = appState_currentUsername();
    const listEl = document.getElementById("likedPostsList");

    if (!me || !listEl) { return; }

    listEl.innerHTML = "";

    try {
        const response = await fetch("/M01067508/contents/liked", {
            credentials: "include"
        });

        const likedPosts = await response.json();

        if (likedPosts.length === 0) {
            listEl.innerHTML =
                '<div class="emptyState"><p class="emptyIcon">♡</p>' +
                "<p>You haven't liked any posts yet.</p></div>";
            return;
        }

        // Count label
        const countEl = document.createElement("p");
        countEl.className = "likedPostsCount";

        if (likedPosts.length === 1) {
            countEl.textContent = "1 liked post";
        } else {
            countEl.textContent = likedPosts.length + " liked posts";
        }

        listEl.appendChild(countEl);

        // Grid of 3 thumbnails
        const grid = document.createElement("div");
        grid.className = "postsGrid";

        likedPosts.forEach(function(post) {
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

            // Fetch enriched version before opening, so the single-post view
            // shows real like / comment / rating counts
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
                        label: "Back to liked posts",
                        action: function() { showSection("liked"); }
                    });
                } catch (e) {
                    // Network problem - still open the post, just without counts
                    openSinglePostView(post, {
                        label: "Back to liked posts",
                        action: function() { showSection("liked"); }
                    });
                }
            });

            grid.appendChild(item);
        });

        listEl.appendChild(grid);

    } catch (err) {
        console.error("renderLikedPosts error:", err.message);
    }
}

// Rendering saved post section
async function renderSavedPosts() {
    const me = appState_currentUsername();
    const listEl = document.getElementById("savedPostsList");

    if (!me || !listEl) { return; }

    listEl.innerHTML = "";

    try {
        const response = await fetch("/M01067508/contents/saved", {
            credentials: "include"
        });

        const savedPosts = await response.json();

        if (savedPosts.length === 0) {
            listEl.innerHTML =
                '<div class="emptyState">' +
                '<img src="./Frontend/Assets/bookmark.png" class="emptyStateImg" alt="No saved posts">' +
                "<p>You haven't saved any posts yet.</p>" +
                "</div>";
            return;
        }

        const countEl = document.createElement("p");
        countEl.className = "savedPostsCount";

        if (savedPosts.length === 1) {
            countEl.textContent = "1 saved post";
        } else {
            countEl.textContent = savedPosts.length + " saved posts";
        }

        listEl.appendChild(countEl);

        const grid = document.createElement("div");
        grid.className = "postsGrid";

        savedPosts.forEach(function(post) {
            const item  = document.createElement("div");
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

            // Fetch enriched version before opening, so the single-post view
            // shows real like / comment / rating counts
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
                        label: "Back to saved posts",
                        action: function() { showSection("saved"); }
                    });
                } catch (e) {
                    // Network problem - still open the post, just without counts
                    openSinglePostView(post, {
                        label: "Back to saved posts",
                        action: function() { showSection("saved"); }
                    });
                }
            });

            grid.appendChild(item);
        });

        listEl.appendChild(grid);

    } catch (err) {
        console.error("renderSavedPosts error:", err.message);
    }
}