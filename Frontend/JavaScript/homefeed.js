"use strict";

let currentFeedSort = "latest";

// Shows every post from every user, newest first.

// ====== Feed sort mode ======
// "forYou"  - weighted by favourite subject 
// "latest"  - pure newest-first (chronological)

// Called by the sort toggle buttons in index.html
function setFeedSort(mode) {
    currentFeedSort = mode;

    // Swap the active style between the two buttons
    const forYouBtn = document.getElementById("feedSortForYou");
    const latestBtn = document.getElementById("feedSortLatest");

    if (mode === "forYou") {
        if (forYouBtn) { 
            forYouBtn.classList.add("feedSortBtnActive"); 
        }

        if (latestBtn) { 
            latestBtn.classList.remove("feedSortBtnActive"); 
        }

    } else {
        if (latestBtn) { 
            latestBtn.classList.add("feedSortBtnActive"); 
        }
        if (forYouBtn) { 
            forYouBtn.classList.remove("feedSortBtnActive"); 
        }
    }

    renderFeed();
}

// Engagement scores

// Reads the current user's likes and comments, maps each one
// back to the post's subject, and counts how many times the
// user has engaged with each subject.
async function buildEngagementSubjectScores(me) {
    const subjectCounts = {};

    try {
        const likedResp = await fetch("/M01067508/contents/liked", {
            credentials: "include"
        });

        if (likedResp.ok) {
            const likedPosts = await likedResp.json();
            for (let i = 0; i < likedPosts.length; i++) {
                const subject = likedPosts[i].subject;
                if (!subject) {
                    continue;
                }
                if (!subjectCounts[subject]) {
                    subjectCounts[subject] = 0;
                }
                subjectCounts[subject] = subjectCounts[subject] + 1;
            }
        }
    } catch (e) {
        // Fall through with whatever counts we already have
    }

    try {
        const commentedResp = await fetch("/M01067508/contents/commented", {
            credentials: "include"
        });

        if (commentedResp.ok) {
            const commentedPosts = await commentedResp.json();
            for (let i = 0; i < commentedPosts.length; i++) {
                const subject = commentedPosts[i].subject;
                if (!subject) {
                    continue;
                }
                if (!subjectCounts[subject]) {
                    subjectCounts[subject] = 0;
                }
                subjectCounts[subject] = subjectCounts[subject] + 1;
            }
        }
    } catch (e) {
        // Fall through with whatever counts we already have
    }

    return subjectCounts;
}

// Scores and weights:
//   +4  post subject matches the user's top engaged subject
//   +2  post subject matches the user's second engaged subject
//   +3  post subject matches the user's stated favourite subject

// Use the Latest tab if you want chronological order.
function scorePost(post, favSubject, topSubject, secondSubject) {
    let score = 0;

    // Top engaged subject - strongest signal
    if (topSubject && post.subject === topSubject) {
        score = score + 4;
    }

    // Second engaged subject
    if (secondSubject && post.subject === secondSubject) {
        score = score + 2;
    }

    // Stated favourite subject from profile settings/register
    if (favSubject && post.subject === favSubject) {
        score = score + 3;
    }

    return score;
}

// ====== Pagination ======
const FEED_PAGE_SIZE = 10;

let feedPage = 1; // highest page number loaded so far
let feedPosts = []; // every post loaded so far (page 1 + page 2 + ...)
let feedHasMore = true;  // false once the server runs out of posts
let feedLoading = false; // guard so two fast clicks can't fetch the same page
let feedSignals = null;  // cached For You signals, rebuilt on each fresh render

// Gathers the For You signals (the user's favourite subject and their
// most-engaged subjects). Cached so "Load more" doesn't refetch them.
async function buildFeedSignals(me) {
    let favSubject = "";

    try {
        const userResp = await fetch("/M01067508/users/" + me, {
            credentials: "include"
        });
        if (userResp.ok) {
            const userData = await userResp.json();
            favSubject = userData.favouriteSubject || "";
        }
    } catch (e) {
        // Fall through with empty favSubject
    }

    const engagementScores = await buildEngagementSubjectScores(me);
    const subjectEntries = [];
    const subjectKeys = Object.keys(engagementScores);

    for (let i = 0; i < subjectKeys.length; i++) {
        subjectEntries.push({
            subject: subjectKeys[i],
            count: engagementScores[subjectKeys[i]]
        });
    }

    subjectEntries.sort(function(a, b) {
        return b.count - a.count;
    });

    let topSubject;
    if (subjectEntries.length > 0) {
        topSubject = subjectEntries[0].subject;
    } else {
        topSubject = "";
    }

    let secondSubject;
    if (subjectEntries.length > 1) {
        secondSubject = subjectEntries[1].subject;
    } else {
        secondSubject = "";
    }

    return {
        favSubject: favSubject,
        topSubject: topSubject,
        secondSubject: secondSubject
    };
}

// Fetches ONE page of the feed from the server.
async function fetchFeedPage(page) {
    const response = await fetch(
        "/M01067508/feed?page=" + page + "&limit=" + FEED_PAGE_SIZE,
        { credentials: "include" }
    );

    if (!response.ok) {
        throw new Error("Feed request failed");
    }

    return await response.json();
}

// Feed rendering - loads page 1 fresh, replacing whatever was on screen.
async function renderFeed() {
    const feedList = document.getElementById("feedList");
    const me = appState_currentUsername();

    if (!me) {
        return;
    }

    // Reset pagination state for a fresh load
    feedPage = 1;
    feedPosts = [];
    feedHasMore = true;
    feedLoading = false;
    feedSignals = null;

    feedList.innerHTML = "";

    try {
        // For You needs the user's signals before anything can be scored
        if (currentFeedSort === "forYou") {
            feedSignals = await buildFeedSignals(me);
        }

        // Fetch enriched posts from server - already filtered to followed users
        const posts = await fetchFeedPage(1);

        feedPosts = posts;
        feedHasMore = posts.length === FEED_PAGE_SIZE;

        if (feedPosts.length === 0) {
            feedList.innerHTML =
                '<div class="emptyState"><p class="emptyIcon">\uD83D\uDCED</p>' +
                "<p>Follow other students to see their solutions here.</p></div>";
            return;
        }

        paintFeed();

    } catch (err) {
        console.error("renderFeed error:", err.message);
        feedList.innerHTML =
            '<div class="emptyState"><p class="emptyIcon">\uD83D\uDCED</p>' +
            "<p>Could not load feed. Please try again.</p></div>";
    }
}

// Fetches the NEXT page and adds it below the posts already shown.
async function loadMoreFeed() {
    if (feedLoading || !feedHasMore) {
        return;
    }

    feedLoading = true;

    // Show progress on the button itself, without redrawing the whole feed
    const btn = document.querySelector(".feedLoadMoreBtn");
    if (btn) {
        btn.textContent = "Loading\u2026";
        btn.disabled = true;
    }

    try {
        const nextPage = feedPage + 1;
        const posts = await fetchFeedPage(nextPage);

        feedPage = nextPage;
        feedPosts = feedPosts.concat(posts); // append - never replace
        feedHasMore = posts.length === FEED_PAGE_SIZE;

        feedLoading = false;
        paintFeed();

    } catch (err) {
        console.error("loadMoreFeed error:", err.message);
        feedLoading = false;
        showToast("Could not load more posts.", "error");

        if (btn) {
            btn.textContent = "Load more posts";
            btn.disabled = false;
        }
    }
}

// Draws every post loaded so far, applying the current sort mode.
function paintFeed() {
    const feedList = document.getElementById("feedList");
    if (!feedList) {
        return;
    }

    feedList.innerHTML = "";

    if (currentFeedSort === "forYou" && feedSignals) {
        const favSubject = feedSignals.favSubject;
        const topSubject = feedSignals.topSubject;
        const secondSubject = feedSignals.secondSubject;

        // Only keep posts matching one of the user's subject signals
        // Otherwise, see a completely empty "For You" feed.
        const hasAnySignal = !!(favSubject || topSubject || secondSubject);

        let posts = feedPosts.slice();

        if (hasAnySignal) {
            posts = posts.filter(function(post) {
                if (favSubject && post.subject === favSubject) {
                    return true;
                }
                if (topSubject && post.subject === topSubject) {
                    return true;
                }
                if (secondSubject && post.subject === secondSubject) {
                    return true;
                }
                return false;
            });
        }

        posts.sort(function(a, b) {
            return scorePost(b, favSubject, topSubject, secondSubject) -
                scorePost(a, favSubject, topSubject, secondSubject);
        });

        if (posts.length === 0) {
            const empty = document.createElement("div");
            empty.className = "emptyState";
            empty.innerHTML =
                '<p class="emptyIcon">\uD83D\uDCED</p>' +
                "<p>No posts yet in your favourite or most-engaged subjects. Try Latest instead.</p>";
            feedList.appendChild(empty);
            appendLoadMoreButton(feedList);
            return;
        }

        posts.forEach(function(post) {
            const card = buildPostCard(post);

            if (favSubject && post.subject === favSubject) {
                let article;
                if (card.querySelector) {
                    article = card.querySelector(".postCard");
                } else {
                    article = card;
                }

                if (article) {
                    const badge = document.createElement("div");
                    badge.className = "forYouBadge";
                    badge.textContent = "\uD83D\uDCDA For You";
                    article.insertBefore(badge, article.firstChild);
                }
            }

            feedList.appendChild(card);
        });

    } else {
        // Latest - sort chronologically newest first
        const posts = feedPosts.slice().sort(function(a, b) {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });

        posts.forEach(function(post) {
            feedList.appendChild(buildPostCard(post));
        });
    }

    appendLoadMoreButton(feedList);
}

// Adds the "Load more" button below the feed, only if the server has more.
function appendLoadMoreButton(feedList) {
    if (!feedHasMore) {
        return;
    }

    const wrap = document.createElement("div");
    wrap.className = "feedLoadMoreWrap";

    const btn = document.createElement("button");
    btn.className = "feedLoadMoreBtn";
    btn.textContent = "Load more posts";

    btn.addEventListener("click", function() {
        loadMoreFeed();
    });

    wrap.appendChild(btn);
    feedList.appendChild(wrap);
}

// Filters the feed to posts tagged with the given subject — fetches from server
async function filterFeedBySubject(subject) {
    showSection("feed", async function() {
        const feedList = document.getElementById("feedList");
        feedList.innerHTML = "";

        const banner = document.createElement("div");
        banner.className = "feedFilterBanner";
        banner.innerHTML =
            "Showing posts about <strong>" + subject + "</strong> " +
            '<button class="feedFilterClearBtn">Clear filter</button>';

        banner.querySelector(".feedFilterClearBtn").addEventListener("click", function() {
            renderFeed();
        });

        feedList.appendChild(banner);

        try {
            const response = await fetch("/M01067508/contents?q=" + encodeURIComponent(subject), {
                credentials: "include"
            });
            const posts = await response.json();

            if (posts.length === 0) {
                const empty = document.createElement("div");
                empty.className = "emptyState";
                empty.innerHTML =
                    '<p class="emptyIcon">📭</p>' +
                    "<p>No posts about " + subject + " yet.</p>";
                feedList.appendChild(empty);
                return;
            }

            posts.forEach(function(post) {
                feedList.appendChild(buildPostCard(post));
            });

        } catch (err) {
            console.error("filterFeedBySubject error:", err.message);
        }
    });
}

// Viewing one post only when clicking on it (back to previous page button)
function openSinglePostView(post, source) {
    showSection("feed", function() {
        const feedList = document.getElementById("feedList");
        feedList.innerHTML = "";

        const banner = document.createElement("div");
        banner.className = "feedFilterBanner";

        let backLabel;
        let backAction;

        if (source && source.label && source.action) {
            backLabel = source.label;
            backAction = source.action;
        } else {
            backLabel = "Back to feed";
            backAction = function() {
                renderFeed();
            };
        }

        banner.innerHTML =
            'Viewing one post <button class="feedFilterClearBtn">' + backLabel + "</button>";

        banner.querySelector(".feedFilterClearBtn").addEventListener("click", function() {
            backAction();
        });

        feedList.appendChild(banner);
        feedList.appendChild(buildPostCard(post));
    });
}