(function () {
  var mount = document.getElementById("felcin-app");
  var page = document.body && document.body.dataset ? document.body.dataset.page : "";
  if (!mount || !page) return;

  var FIREBASE_CONFIG = typeof firebaseConfig !== "undefined" ? firebaseConfig : {
    apiKey: "AIzaSyCKmWO04sVRhxZv3EuK_j_53yup9K_LEeE",
    authDomain: "felcin.firebaseapp.com",
    projectId: "felcin",
    storageBucket: "felcin.firebasestorage.app",
    messagingSenderId: "989891719192",
    appId: "1:989891719192:web:1266786c201c87f4c8536d"
  };

  var PUBLIC_PAGES = { login: true, guidelines: true, download: true };
  var PROFILE_CACHE = {};
  var state = {
    db: null,
    user: null,
    stories: [],
    storyIndex: 0,
    storyTimer: null,
    followingIds: null
  };

  function ensureFirebaseCompat() {
    if (typeof firebase === "undefined") throw new Error("Firebase SDK failed to load.");
    if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    if (typeof initAppCheck === "function") initAppCheck();
    return firebase;
  }

  function getDb() {
    if (!state.db) {
      ensureFirebaseCompat();
      state.db = firebase.firestore();
    }
    return state.db;
  }

  function text(value) {
    if (typeof escapeHtml === "function") return escapeHtml(value);
    var div = document.createElement("div");
    div.textContent = String(value || "");
    return div.innerHTML;
  }

  function firstLine(value) {
    return String(value || "").split(/\r?\n/)[0];
  }

  function toDate(value) {
    if (!value) return null;
    if (value.toDate) return value.toDate();
    if (value.seconds) return new Date(value.seconds * 1000);
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function timeAgo(value) {
    var date = toDate(value);
    if (!date) return "Just now";
    var diff = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
    if (diff < 60) return "Just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
    return date.toLocaleDateString();
  }

  function mediaTypeFor(item) {
    if (!item) return "image";
    if (typeof resolveMediaType === "function") return resolveMediaType(item.mediaType || item.contentKind, item.mimeType || item.mime, item.mediaUrl || item.url);
    var mime = String(item.mimeType || item.mime || "").toLowerCase();
    if (String(item.mediaType || "").toLowerCase() === "video") return "video";
    if (mime.indexOf("video/") === 0) return "video";
    if (/\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(String(item.mediaUrl || ""))) return "video";
    return "image";
  }

  function pageMeta(title, description) {
    document.title = title;
    var meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description;
  }

  function navItem(href, label, key) {
    return '<a class="fc-nav-link' + (page === key ? ' is-active' : '') + '" href="' + href + '">' + label + '</a>';
  }

  function headerHtml(title, subtitle, actions) {
    var session = state.user
      ? '<div class="fc-session"><span class="fc-session-name">' + text(state.user.email || state.user.uid) + '</span><button class="fc-button fc-button-ghost" id="fc-signout" type="button">Sign out</button></div>'
      : '<div class="fc-session"><a class="fc-button fc-button-primary" href="/login">Sign in</a></div>';
    return '' +
      '<div class="fc-shell">' +
      '  <header class="fc-topbar">' +
      '    <div>' +
      '      <a class="fc-brand" href="/">Felcin</a>' +
      '      <p class="fc-subbrand">Parchment social for creators, stories, and community.</p>' +
      '    </div>' +
      '    ' + session +
      '  </header>' +
      '  <nav class="fc-nav">' +
      navItem("/", "Feed", "index") +
      navItem("/explore", "Explore", "explore") +
      navItem("/creator", "Create", "creator") +
      navItem("/stories", "Stories", "stories") +
      navItem("/live", "Live", "live") +
      navItem("/notifications", "Notifications", "notifications") +
      navItem("/private-chats", "Chats", "private-chats") +
      navItem("/dashboard", "Dashboard", "dashboard") +
      navItem("/guidelines", "Guidelines", "guidelines") +
      '  </nav>' +
      '  <main class="fc-main">' +
      '    <section class="fc-hero">' +
      '      <div>' +
      '        <p class="fc-kicker">Felcin</p>' +
      '        <h1>' + text(title) + '</h1>' +
      '        <p class="fc-hero-copy">' + text(subtitle) + '</p>' +
      '      </div>' +
      '      <div class="fc-hero-actions">' + (actions || "") + '</div>' +
      '    </section>';
  }

  function renderPage(title, subtitle, content, actions) {
    mount.innerHTML = headerHtml(title, subtitle, actions) + content + "</main></div>";
    var signout = document.getElementById("fc-signout");
    if (signout) {
      signout.addEventListener("click", function () {
        firebase.auth().signOut().then(function () {
          window.location.href = "/login";
        });
      });
    }
  }

  function renderError(title, subtitle, message) {
    renderPage(title, subtitle, '<section class="fc-card"><div class="fc-empty">' + text(message) + '</div></section>');
  }

  function getQueryParam(key) {
    return new URLSearchParams(window.location.search).get(key) || "";
  }

  async function requireUser() {
    ensureFirebaseCompat();
    return new Promise(function (resolve, reject) {
      firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {}).finally(function () {
        firebase.auth().onAuthStateChanged(function (user) {
          if (!user) {
            window.location.href = "/login";
            reject(new Error("Authentication required"));
            return;
          }
          if (typeof canAccessApp === "function" && !canAccessApp(user)) {
            firebase.auth().signOut().catch(function () {});
            if (typeof showVerificationNoticeAndRedirect === "function") showVerificationNoticeAndRedirect();
            reject(new Error("Verification required"));
            return;
          }
          state.user = user;
          resolve(user);
        }, reject);
      });
    });
  }

  async function getProfile(uid) {
    if (!uid) return { uid: "", displayName: "Unknown", photoURL: "" };
    if (PROFILE_CACHE[uid]) return PROFILE_CACHE[uid];
    var db = getDb();
    var result = { uid: uid, displayName: "user-" + uid.slice(0, 6), photoURL: "", bio: "" };
    try {
      var baseSnap = await db.collection("users").doc(uid).get();
      var pubSnap = await db.collection("users").doc(uid).collection("public").doc("profile").get();
      var base = baseSnap.exists ? baseSnap.data() : {};
      var pub = pubSnap.exists ? pubSnap.data() : {};
      result.displayName = pub.displayName || base.displayName || base.email || result.displayName;
      result.photoURL = pub.photoURL || base.photoURL || "";
      result.bio = pub.bio || base.bio || "";
    } catch (error) {
      console.warn("Profile load failed", uid, error);
    }
    PROFILE_CACHE[uid] = result;
    return result;
  }

  async function getFollowingIds(uid) {
    if (state.followingIds) return state.followingIds;
    var db = getDb();
    try {
      var snap = await db.collection("follows").where("followerId", "==", uid).get();
      state.followingIds = snap.docs.map(function (doc) { return doc.data().followingId; });
    } catch (error) {
      console.warn("Following lookup failed", error);
      state.followingIds = [];
    }
    return state.followingIds;
  }

  function profilePill(profile) {
    var initials = text((profile.displayName || "F").trim().charAt(0).toUpperCase() || "F");
    var media = profile.photoURL
      ? '<img class="fc-avatar" src="' + text(profile.photoURL) + '" alt="' + text(profile.displayName) + '" />'
      : '<span class="fc-avatar fc-avatar-fallback">' + initials + '</span>';
    return media;
  }

  function postCard(post, profile, compact) {
    var mediaUrl = post.mediaUrl || "";
    var mediaType = mediaTypeFor(post);
    var media = "";
    if (mediaUrl) {
      media = mediaType === "video"
        ? '<video class="fc-media" src="' + text(mediaUrl) + '" controls playsinline preload="metadata"></video>'
        : '<img class="fc-media" src="' + text(mediaUrl) + '" alt="Post media" loading="lazy" />';
    }
    return '' +
      '<article class="fc-card fc-post' + (compact ? ' fc-post-compact' : '') + '">' +
      '  <div class="fc-post-head">' +
      '    <a class="fc-post-author" href="/profile?uid=' + text(post.authorId || "") + '">' +
      '      ' + profilePill(profile) +
      '      <span><strong>' + text(profile.displayName || post.authorName || "Creator") + '</strong><small>' + text(timeAgo(post.createdAt)) + '</small></span>' +
      '    </a>' +
      '    <span class="fc-chip">' + text((post.contentType || "post").toUpperCase()) + '</span>' +
      '  </div>' +
      media +
      '  <p class="fc-post-copy">' + text(post.text || post.caption || "No caption yet.") + '</p>' +
      '  <div class="fc-post-meta">' +
      '    <span>' + text(String(post.likes || 0)) + ' likes</span>' +
      '    <span>' + text(String(post.comments || 0)) + ' comments</span>' +
      '    <span>' + text(post.visibility || "public") + '</span>' +
      '  </div>' +
      '  <div class="fc-post-actions">' +
      '    <a class="fc-button fc-button-ghost" href="/comments?postId=' + text(post.id || "") + '">Open discussion</a>' +
      '    <a class="fc-button fc-button-ghost" href="/profile?uid=' + text(post.authorId || "") + '">View profile</a>' +
      '  </div>' +
      '</article>';
  }

  async function fetchPosts(limit) {
    var db = getDb();
    var snap = await db.collection("posts").limit(limit || 60).get();
    var posts = snap.docs.map(function (doc) {
      var data = doc.data() || {};
      data.id = doc.id;
      return data;
    }).sort(function (left, right) {
      var leftTime = toDate(left.createdAt);
      var rightTime = toDate(right.createdAt);
      return (rightTime ? rightTime.getTime() : 0) - (leftTime ? leftTime.getTime() : 0);
    });
    return posts;
  }

  async function enrichPosts(posts) {
    return Promise.all(posts.map(async function (post) {
      var profile = await getProfile(post.authorId || "");
      return { post: post, profile: profile };
    }));
  }

  function setStatus(id, message, klass) {
    var el = document.getElementById(id);
    if (!el) return;
    el.className = "fc-status" + (klass ? " " + klass : "");
    el.textContent = message;
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function uploadMedia(file, folder) {
    if (!file) return "";
    var user = state.user || firebase.auth().currentUser;
    if (!user) throw new Error("You need to be signed in before uploading.");

    if (firebase.storage) {
      try {
        var safeName = String(file.name || "upload").replace(/[^a-zA-Z0-9._-]/g, "_");
        var path = "uploads/" + user.uid + "/" + folder + "/" + Date.now() + "_" + safeName;
        var ref = firebase.storage().ref(path);
        await ref.put(file);
        return await ref.getDownloadURL();
      } catch (error) {
        console.warn("Storage upload failed", error);
      }
    }

    if (typeof uploadMediaViaServer === "function") {
      try {
        var uploaded = await uploadMediaViaServer(file);
        return uploaded.mediaUrl || uploaded.url || uploaded.downloadURL || "";
      } catch (error) {
        console.warn("Server upload failed", error);
      }
    }

    if (file.size <= 1024 * 1024) return readFileAsDataUrl(file);
    throw new Error("Media upload failed. Try a smaller file.");
  }

  function staticSection(title, items) {
    return '' +
      '<section class="fc-card">' +
      '  <h2>' + text(title) + '</h2>' +
      '  <ul class="fc-bullets">' + items.map(function (item) { return '<li>' + text(item) + '</li>'; }).join("") + '</ul>' +
      '</section>';
  }

  function attachFilterButtons(callback) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-filter]"), function (button) {
      button.addEventListener("click", function () {
        Array.prototype.forEach.call(document.querySelectorAll("[data-filter]"), function (node) {
          node.classList.remove("is-active");
        });
        button.classList.add("is-active");
        callback(button.dataset.filter);
      });
    });
  }

  async function renderFeedPage() {
    pageMeta("Felcin Feed", "Browse the latest creator posts and conversations on Felcin.");
    renderPage(
      "For you",
      "A live feed of creator posts, stories, and follow-up discussion.",
      '<section class="fc-card"><div id="fc-feed" class="fc-stack"><div class="fc-empty">Loading the latest posts...</div></div></section>',
      '<a class="fc-button fc-button-primary" href="/creator">Create a post</a><a class="fc-button fc-button-ghost" href="/explore">Open explore</a>'
    );

    try {
      var posts = (await fetchPosts(40)).filter(function (post) { return post.contentType !== "story"; }).slice(0, 20);
      var enriched = await enrichPosts(posts);
      var html = enriched.length
        ? enriched.map(function (entry) { return postCard(entry.post, entry.profile, false); }).join("")
        : '<div class="fc-empty">No posts yet. Use Create to publish the first post.</div>';
      document.getElementById("fc-feed").innerHTML = html;
    } catch (error) {
      renderError("For you", "Feed unavailable", error.message || "The feed could not be loaded.");
    }
  }

  async function renderExplorePage() {
    pageMeta("Felcin Explore", "Discover trending and recent creator posts on Felcin.");
    renderPage(
      "Explore",
      "Browse discovery cards, switch filters, and jump straight into discussion.",
      '<section class="fc-card"><div class="fc-toolbar"><button class="fc-pill is-active" data-filter="all" type="button">All</button><button class="fc-pill" data-filter="trending" type="button">Trending</button><button class="fc-pill" data-filter="following" type="button">Following</button><button class="fc-pill" data-filter="recent" type="button">Recent</button></div><div id="fc-explore" class="fc-grid"><div class="fc-empty">Loading explore cards...</div></div></section>',
      '<a class="fc-button fc-button-primary" href="/creator">Publish something</a>'
    );

    var posts = await fetchPosts(80);
    var enriched = await enrichPosts(posts.filter(function (post) { return post.contentType !== "story"; }));
    var followingIds = await getFollowingIds(state.user.uid);

    function draw(filter) {
      var sorted = enriched.slice();
      if (filter === "trending") {
        sorted.sort(function (left, right) {
          return ((right.post.likes || 0) + (right.post.comments || 0)) - ((left.post.likes || 0) + (left.post.comments || 0));
        });
      }
      if (filter === "recent") {
        sorted.sort(function (left, right) {
          var leftTime = toDate(left.post.createdAt);
          var rightTime = toDate(right.post.createdAt);
          return (rightTime ? rightTime.getTime() : 0) - (leftTime ? leftTime.getTime() : 0);
        });
      }
      if (filter === "following") {
        sorted = sorted.filter(function (entry) { return followingIds.indexOf(entry.post.authorId) >= 0; });
      }
      var html = sorted.length
        ? sorted.slice(0, 24).map(function (entry) { return postCard(entry.post, entry.profile, true); }).join("")
        : '<div class="fc-empty">Nothing matches this filter yet.</div>';
      document.getElementById("fc-explore").innerHTML = html;
    }

    attachFilterButtons(draw);
    draw("all");
  }

  async function renderCreatorPage() {
    pageMeta("Felcin Create", "Publish posts, stories, and live announcements on Felcin.");
    renderPage(
      "Create",
      "Upload a photo or video, choose where it belongs, and publish directly to your community.",
      '<section class="fc-card">' +
      '  <form id="fc-create-form" class="fc-form">' +
      '    <label><span>Content type</span><select id="fc-content-type"><option value="post">Post</option><option value="story">Story</option><option value="live">Live update</option></select></label>' +
      '    <label><span>Visibility</span><select id="fc-visibility"><option value="public">Public</option><option value="followers">Followers only</option></select></label>' +
      '    <label id="fc-expiry-wrap" class="is-hidden"><span>Story expiry</span><select id="fc-expiry"><option value="24">24 hours</option><option value="12">12 hours</option><option value="6">6 hours</option></select></label>' +
      '    <label><span>Caption</span><textarea id="fc-caption" rows="5" placeholder="What are you sharing?"></textarea></label>' +
      '    <label><span>Media</span><input id="fc-file" type="file" accept="image/*,video/*" /></label>' +
      '    <label class="fc-check"><input id="fc-policy" type="checkbox" /> <span>I confirm this is suitable for Felcin\'s 16+ community policy.</span></label>' +
      '    <div class="fc-actions"><button class="fc-button fc-button-primary" type="submit">Publish</button></div>' +
      '  </form>' +
      '  <div id="fc-create-status" class="fc-status">Choose a file or publish a text-only update.</div>' +
      '</section>',
      '<a class="fc-button fc-button-ghost" href="/guidelines">Review guidelines</a>'
    );

    var typeSelect = document.getElementById("fc-content-type");
    typeSelect.addEventListener("change", function () {
      document.getElementById("fc-expiry-wrap").classList.toggle("is-hidden", typeSelect.value !== "story");
    });

    document.getElementById("fc-create-form").addEventListener("submit", async function (event) {
      event.preventDefault();
      var statusId = "fc-create-status";
      var file = document.getElementById("fc-file").files[0];
      var contentType = typeSelect.value;
      var visibility = document.getElementById("fc-visibility").value;
      var caption = document.getElementById("fc-caption").value.trim();
      var policyConfirmed = document.getElementById("fc-policy").checked;
      if (!policyConfirmed) {
        setStatus(statusId, "You must confirm the 16+ policy before publishing.", "error");
        return;
      }

      try {
        setStatus(statusId, "Uploading media and saving your post...", "");
        var mediaUrl = await uploadMedia(file, contentType === "story" ? "stories" : "posts");
        var profile = await getProfile(state.user.uid);
        var mediaType = file && file.type && file.type.indexOf("video/") === 0 ? "video" : "image";
        var payload = {
          authorId: state.user.uid,
          authorName: profile.displayName || state.user.displayName || state.user.email || "Creator",
          contentType: contentType,
          text: caption,
          mediaUrl: mediaUrl || "",
          mediaType: file ? mediaType : "image",
          visibility: visibility,
          likes: 0,
          comments: 0,
          createdAt: new Date(),
          policyConfirmed16Plus: true
        };

        var db = getDb();
        if (contentType === "story") {
          payload.expiresAt = new Date(Date.now() + parseInt(document.getElementById("fc-expiry").value, 10) * 60 * 60 * 1000);
          await db.collection("stories").add(payload);
        } else {
          if (contentType === "live") payload.status = "scheduled";
          await db.collection("posts").add(payload);
        }
        setStatus(statusId, "Published successfully.", "success");
        document.getElementById("fc-create-form").reset();
        document.getElementById("fc-expiry-wrap").classList.add("is-hidden");
      } catch (error) {
        setStatus(statusId, error.message || "Publish failed.", "error");
      }
    });
  }

  async function loadStories() {
    var db = getDb();
    var results = [];
    try {
      var storySnap = await db.collection("stories").limit(60).get();
      results = results.concat(storySnap.docs.map(function (doc) {
        var data = doc.data() || {};
        data.id = doc.id;
        return data;
      }));
    } catch (error) {
      console.warn("Stories collection unavailable", error);
    }
    try {
      var postSnap = await db.collection("posts").limit(60).get();
      results = results.concat(postSnap.docs.map(function (doc) {
        var data = doc.data() || {};
        data.id = doc.id;
        return data;
      }).filter(function (story) { return story.contentType === "story"; }));
    } catch (error) {
      console.warn("Posts fallback unavailable", error);
    }

    var now = Date.now();
    var deduped = {};
    results.forEach(function (story) {
      if (!story.id) return;
      if (story.expiresAt && toDate(story.expiresAt) && toDate(story.expiresAt).getTime() < now) return;
      deduped[story.id] = story;
    });

    return Object.keys(deduped).map(function (key) { return deduped[key]; }).sort(function (left, right) {
      var leftTime = toDate(left.createdAt);
      var rightTime = toDate(right.createdAt);
      return (rightTime ? rightTime.getTime() : 0) - (leftTime ? leftTime.getTime() : 0);
    });
  }

  function storyModalMarkup() {
    return '' +
      '<div id="fc-story-modal" class="fc-modal is-hidden">' +
      '  <div class="fc-modal-backdrop"></div>' +
      '  <div class="fc-modal-card">' +
      '    <button class="fc-modal-close" type="button" id="fc-story-close">Close</button>' +
      '    <div id="fc-story-stage"></div>' +
      '    <div class="fc-modal-actions">' +
      '      <button class="fc-button fc-button-ghost" type="button" id="fc-story-prev">Previous</button>' +
      '      <button class="fc-button fc-button-primary" type="button" id="fc-story-next">Next</button>' +
      '    </div>' +
      '  </div>' +
      '</div>';
  }

  async function renderStoriesPage() {
    pageMeta("Felcin Stories", "See active 24-hour stories from the creators you follow.");
    renderPage(
      "Stories",
      "Short-lived updates with autoplay viewing and quick creator context.",
      '<section class="fc-card"><div id="fc-stories-grid" class="fc-story-grid"><div class="fc-empty">Loading stories...</div></div></section>' + storyModalMarkup(),
      '<a class="fc-button fc-button-primary" href="/creator">Create story</a>'
    );

    state.stories = await loadStories();
    var grid = document.getElementById("fc-stories-grid");
    if (!state.stories.length) {
      grid.innerHTML = '<div class="fc-empty">No active stories right now.</div>';
      return;
    }

    var cards = await Promise.all(state.stories.map(async function (story, index) {
      var profile = await getProfile(story.authorId || "");
      var preview = story.mediaUrl
        ? (mediaTypeFor(story) === "video"
          ? '<video class="fc-story-thumb" src="' + text(story.mediaUrl) + '" muted playsinline preload="metadata"></video>'
          : '<img class="fc-story-thumb" src="' + text(story.mediaUrl) + '" alt="Story preview" />')
        : '<div class="fc-story-thumb fc-story-fallback">No media</div>';
      return '<button class="fc-story-card" type="button" data-story-index="' + index + '">' + preview + '<span>' + profilePill(profile) + text(profile.displayName) + '</span></button>';
    }));
    grid.innerHTML = cards.join("");

    Array.prototype.forEach.call(document.querySelectorAll("[data-story-index]"), function (button) {
      button.addEventListener("click", function () {
        openStory(parseInt(button.dataset.storyIndex, 10));
      });
    });

    document.getElementById("fc-story-close").addEventListener("click", closeStory);
    document.querySelector(".fc-modal-backdrop").addEventListener("click", closeStory);
    document.getElementById("fc-story-prev").addEventListener("click", function () { openStory(state.storyIndex - 1); });
    document.getElementById("fc-story-next").addEventListener("click", function () { openStory(state.storyIndex + 1); });
  }

  async function openStory(index) {
    if (!state.stories.length) return;
    if (index < 0) index = state.stories.length - 1;
    if (index >= state.stories.length) index = 0;
    state.storyIndex = index;
    var story = state.stories[index];
    var profile = await getProfile(story.authorId || "");
    var stage = document.getElementById("fc-story-stage");
    var media = story.mediaUrl
      ? (mediaTypeFor(story) === "video"
        ? '<video class="fc-story-media" src="' + text(story.mediaUrl) + '" controls autoplay playsinline></video>'
        : '<img class="fc-story-media" src="' + text(story.mediaUrl) + '" alt="Story" />')
      : '<div class="fc-empty">Story has no media.</div>';
    stage.innerHTML = '<div class="fc-story-stage-head">' + profilePill(profile) + '<div><strong>' + text(profile.displayName) + '</strong><small>' + text(timeAgo(story.createdAt)) + '</small></div></div>' + media + '<p class="fc-post-copy">' + text(story.text || "") + '</p>';
    document.getElementById("fc-story-modal").classList.remove("is-hidden");
    clearTimeout(state.storyTimer);
    state.storyTimer = setTimeout(function () {
      openStory(index + 1);
    }, 5000);
  }

  function closeStory() {
    clearTimeout(state.storyTimer);
    document.getElementById("fc-story-modal").classList.add("is-hidden");
  }

  async function renderDashboardPage() {
    pageMeta("Felcin Dashboard", "Review your creator activity, follower counts, and recent publishing totals.");
    renderPage(
      "Dashboard",
      "A quick snapshot of your creator stats and recent content performance.",
      '<section class="fc-grid fc-grid-stats" id="fc-dashboard-grid"><div class="fc-card"><div class="fc-empty">Loading stats...</div></div></section>',
      '<a class="fc-button fc-button-primary" href="/creator">Create content</a>'
    );

    var db = getDb();
    var userId = state.user.uid;
    var postsSnap = await db.collection("posts").where("authorId", "==", userId).get();
    var stories = await loadStories();
    var followerSnap = await db.collection("follows").where("followingId", "==", userId).get();
    var followingSnap = await db.collection("follows").where("followerId", "==", userId).get();
    var liveCount = postsSnap.docs.filter(function (doc) { return (doc.data() || {}).contentType === "live"; }).length;
    document.getElementById("fc-dashboard-grid").innerHTML = [
      ["Posts", postsSnap.size],
      ["Active stories", stories.filter(function (story) { return story.authorId === userId; }).length],
      ["Followers", followerSnap.size],
      ["Following", followingSnap.size],
      ["Live updates", liveCount]
    ].map(function (item) {
      return '<section class="fc-card fc-stat"><p>' + text(item[0]) + '</p><strong>' + text(String(item[1])) + '</strong></section>';
    }).join("");
  }

  async function renderLivePage() {
    pageMeta("Felcin Live", "See scheduled and active live creator updates on Felcin.");
    renderPage(
      "Live",
      "A single place for active live rooms and scheduled creator updates.",
      '<section class="fc-card"><div id="fc-live-list" class="fc-stack"><div class="fc-empty">Loading live updates...</div></div></section>',
      '<a class="fc-button fc-button-primary" href="/creator">Schedule live update</a>'
    );

    var posts = await fetchPosts(80);
    var livePosts = posts.filter(function (post) { return post.contentType === "live"; });
    var list = document.getElementById("fc-live-list");
    if (!livePosts.length) {
      list.innerHTML = '<div class="fc-empty">No live updates are scheduled yet.</div>';
      return;
    }
    var enriched = await enrichPosts(livePosts);
    list.innerHTML = enriched.map(function (entry) {
      return '<section class="fc-card fc-live-card"><div class="fc-post-head"><div class="fc-post-author">' + profilePill(entry.profile) + '<span><strong>' + text(entry.profile.displayName) + '</strong><small>' + text(timeAgo(entry.post.createdAt)) + '</small></span></div><span class="fc-chip">' + text(entry.post.status || "scheduled") + '</span></div><h2>' + text(firstLine(entry.post.text || "Live update")) + '</h2><p class="fc-post-copy">' + text(entry.post.text || "") + '</p><div class="fc-post-actions"><a class="fc-button fc-button-ghost" href="/comments?postId=' + text(entry.post.id) + '">Open thread</a></div></section>';
    }).join("");
  }

  async function renderNotificationsPage() {
    pageMeta("Felcin Notifications", "Track messages, follows, comments, and likes across Felcin.");
    renderPage(
      "Notifications",
      "A live list of recent activity with direct links to the right conversation.",
      '<section class="fc-card"><div id="fc-notifications" class="fc-stack"><div class="fc-empty">Loading notifications...</div></div></section>'
    );

    var db = getDb();
    var items = [];
    try {
      var nested = await db.collection("notifications").doc(state.user.uid).collection("items").get();
      items = items.concat(nested.docs.map(function (doc) { var data = doc.data() || {}; data.id = doc.id; return data; }));
    } catch (error) {
      console.warn("Nested notifications unavailable", error);
    }
    try {
      var flat = await db.collection("notifications").where("targetUid", "==", state.user.uid).get();
      items = items.concat(flat.docs.map(function (doc) { var data = doc.data() || {}; data.id = doc.id; return data; }));
    } catch (error) {
      console.warn("Flat notifications unavailable", error);
    }
    var seen = {};
    items = items.filter(function (item) {
      var key = item.id || JSON.stringify(item);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).sort(function (left, right) {
      var leftTime = toDate(left.createdAt || left.timestamp);
      var rightTime = toDate(right.createdAt || right.timestamp);
      return (rightTime ? rightTime.getTime() : 0) - (leftTime ? leftTime.getTime() : 0);
    });

    var container = document.getElementById("fc-notifications");
    if (!items.length) {
      container.innerHTML = '<div class="fc-empty">No notifications yet.</div>';
      return;
    }

    var html = await Promise.all(items.slice(0, 40).map(async function (item) {
      var from = await getProfile(item.fromUser || item.userId || "");
      var href = item.postId ? "/comments?postId=" + item.postId : (item.chatId ? "/private-chats?chatId=" + item.chatId : "/profile?uid=" + (item.fromUser || item.userId || state.user.uid));
      return '<article class="fc-card"><div class="fc-post-head"><a class="fc-post-author" href="/profile?uid=' + text(from.uid || "") + '">' + profilePill(from) + '<span><strong>' + text(from.displayName) + '</strong><small>' + text(timeAgo(item.createdAt || item.timestamp)) + '</small></span></a><span class="fc-chip">' + text(item.type || "activity") + '</span></div><p class="fc-post-copy">' + text(item.text || item.message || "New activity on your account.") + '</p><div class="fc-post-actions"><a class="fc-button fc-button-ghost" href="' + href + '">Open</a></div></article>';
    }));
    container.innerHTML = html.join("");
  }

  async function renderChatsPage() {
    pageMeta("Felcin Private Chats", "Review conversations and send secure direct messages on Felcin.");
    renderPage(
      "Private chats",
      "Search your conversations, open a thread, and send text or media messages.",
      '<section class="fc-split"><div class="fc-card"><div id="fc-chat-list" class="fc-stack"><div class="fc-empty">Loading conversations...</div></div></div><div class="fc-card"><div id="fc-chat-thread" class="fc-chat-thread"><div class="fc-empty">Select a conversation to begin.</div></div><form id="fc-chat-form" class="fc-form fc-form-inline"><input id="fc-chat-text" type="text" placeholder="Write a message" /><input id="fc-chat-file" type="file" accept="image/*,video/*" /><button class="fc-button fc-button-primary" type="submit">Send</button></form><div id="fc-chat-status" class="fc-status">Messages are end-to-end handled by your Firebase rules.</div></div></section>'
    );

    var db = getDb();
    var chatsSnap = await db.collection("chats").get();
    var chats = chatsSnap.docs.map(function (doc) {
      var data = doc.data() || {};
      data.id = doc.id;
      return data;
    }).filter(function (chat) {
      return Array.isArray(chat.participants) && chat.participants.indexOf(state.user.uid) >= 0;
    });

    var list = document.getElementById("fc-chat-list");
    if (!chats.length) {
      list.innerHTML = '<div class="fc-empty">No chats yet. Open a profile and message someone to start.</div>';
    } else {
      var chatHtml = await Promise.all(chats.map(async function (chat) {
        var otherId = (chat.participants || []).filter(function (uid) { return uid !== state.user.uid; })[0] || state.user.uid;
        var profile = await getProfile(otherId);
        return '<button class="fc-chat-row" type="button" data-chat-id="' + text(chat.id) + '">' + profilePill(profile) + '<span><strong>' + text(profile.displayName) + '</strong><small>' + text(chat.lastMessage || "Open conversation") + '</small></span></button>';
      }));
      list.innerHTML = chatHtml.join("");
    }

    Array.prototype.forEach.call(document.querySelectorAll("[data-chat-id]"), function (button) {
      button.addEventListener("click", function () { openChat(button.dataset.chatId); });
    });

    var chatId = getQueryParam("chatId") || (chats[0] ? chats[0].id : "");
    if (chatId) openChat(chatId);

    document.getElementById("fc-chat-form").addEventListener("submit", async function (event) {
      event.preventDefault();
      var activeChatId = document.body.dataset.activeChatId;
      if (!activeChatId) {
        setStatus("fc-chat-status", "Open a conversation first.", "error");
        return;
      }
      var textInput = document.getElementById("fc-chat-text");
      var file = document.getElementById("fc-chat-file").files[0];
      try {
        var mediaUrl = await uploadMedia(file, "messages");
        await db.collection("messages").add({
          chatId: activeChatId,
          participants: getChatParticipants(activeChatId, chats),
          senderId: state.user.uid,
          text: textInput.value.trim(),
          mediaUrl: mediaUrl || "",
          mediaType: file && file.type && file.type.indexOf("video/") === 0 ? "video" : "image",
          createdAt: new Date()
        });
        await db.collection("chats").doc(activeChatId).set({
          participants: getChatParticipants(activeChatId, chats),
          lastMessage: textInput.value.trim() || (file ? "Sent media" : "Updated conversation"),
          updatedAt: new Date()
        }, { merge: true });
        textInput.value = "";
        document.getElementById("fc-chat-file").value = "";
        setStatus("fc-chat-status", "Message sent.", "success");
        openChat(activeChatId);
      } catch (error) {
        setStatus("fc-chat-status", error.message || "Message failed.", "error");
      }
    });

    async function openChat(activeChatId) {
      document.body.dataset.activeChatId = activeChatId;
      var thread = document.getElementById("fc-chat-thread");
      thread.innerHTML = '<div class="fc-empty">Loading messages...</div>';
      var messagesSnap = await db.collection("messages").get();
      var messages = messagesSnap.docs.map(function (doc) {
        var data = doc.data() || {};
        data.id = doc.id;
        return data;
      }).filter(function (msg) { return msg.chatId === activeChatId; }).sort(function (left, right) {
        var leftTime = toDate(left.createdAt);
        var rightTime = toDate(right.createdAt);
        return (leftTime ? leftTime.getTime() : 0) - (rightTime ? rightTime.getTime() : 0);
      });
      if (!messages.length) {
        thread.innerHTML = '<div class="fc-empty">No messages yet. Start the conversation below.</div>';
        return;
      }
      thread.innerHTML = messages.map(function (message) {
        var mine = message.senderId === state.user.uid;
        var media = message.mediaUrl ? (mediaTypeFor(message) === "video" ? '<video class="fc-media" src="' + text(message.mediaUrl) + '" controls playsinline preload="metadata"></video>' : '<img class="fc-media" src="' + text(message.mediaUrl) + '" alt="Message media" />') : '';
        return '<div class="fc-chat-bubble' + (mine ? ' is-mine' : '') + '"><p>' + text(message.text || '') + '</p>' + media + '<small>' + text(timeAgo(message.createdAt)) + '</small></div>';
      }).join("");
    }

    function getChatParticipants(activeChatId, chatList) {
      var chat = chatList.filter(function (item) { return item.id === activeChatId; })[0];
      return chat && Array.isArray(chat.participants) ? chat.participants : [state.user.uid];
    }
  }

  async function renderCommentsPage() {
    pageMeta("Felcin Comments", "Read and post replies on Felcin discussions.");
    renderPage(
      "Comments",
      "Read the post context, reply with text or media, and keep the conversation moving.",
      '<section class="fc-split"><div class="fc-card"><div id="fc-comment-post"><div class="fc-empty">Loading post...</div></div></div><div class="fc-card"><div id="fc-comments-list" class="fc-stack"><div class="fc-empty">Loading comments...</div></div><form id="fc-comment-form" class="fc-form"><textarea id="fc-comment-text" rows="4" placeholder="Add your reply"></textarea><input id="fc-comment-file" type="file" accept="image/*,video/*" /><button class="fc-button fc-button-primary" type="submit">Post comment</button></form><div id="fc-comment-status" class="fc-status">Comments sync with Firestore in real time once written.</div></div></section>'
    );

    var postId = getQueryParam("postId");
    if (!postId) {
      renderError("Comments", "Missing post", "Open this page with a postId query parameter.");
      return;
    }

    var db = getDb();
    var postSnap = await db.collection("posts").doc(postId).get();
    if (!postSnap.exists) {
      renderError("Comments", "Post not found", "That post could not be found.");
      return;
    }
    var post = postSnap.data() || {};
    post.id = postSnap.id;
    var profile = await getProfile(post.authorId || "");
    document.getElementById("fc-comment-post").innerHTML = postCard(post, profile, false);

    async function drawComments() {
      var commentsSnap = await db.collection("comments").get();
      var comments = commentsSnap.docs.map(function (doc) {
        var data = doc.data() || {};
        data.id = doc.id;
        return data;
      }).filter(function (comment) { return comment.postId === postId; }).sort(function (left, right) {
        var leftTime = toDate(left.createdAt);
        var rightTime = toDate(right.createdAt);
        return (leftTime ? leftTime.getTime() : 0) - (rightTime ? rightTime.getTime() : 0);
      });
      var list = document.getElementById("fc-comments-list");
      if (!comments.length) {
        list.innerHTML = '<div class="fc-empty">No comments yet.</div>';
        return;
      }
      var html = await Promise.all(comments.map(async function (comment) {
        var author = await getProfile(comment.userId || comment.authorId || "");
        var media = comment.mediaUrl ? (mediaTypeFor(comment) === "video" ? '<video class="fc-media" src="' + text(comment.mediaUrl) + '" controls playsinline preload="metadata"></video>' : '<img class="fc-media" src="' + text(comment.mediaUrl) + '" alt="Comment media" />') : '';
        return '<article class="fc-card"><div class="fc-post-head"><a class="fc-post-author" href="/profile?uid=' + text(author.uid || "") + '">' + profilePill(author) + '<span><strong>' + text(author.displayName) + '</strong><small>' + text(timeAgo(comment.createdAt)) + '</small></span></a></div><p class="fc-post-copy">' + text(comment.text || '') + '</p>' + media + '</article>';
      }));
      list.innerHTML = html.join("");
    }

    await drawComments();

    document.getElementById("fc-comment-form").addEventListener("submit", async function (event) {
      event.preventDefault();
      try {
        var file = document.getElementById("fc-comment-file").files[0];
        var mediaUrl = await uploadMedia(file, "comments");
        var me = await getProfile(state.user.uid);
        await db.collection("comments").add({
          postId: postId,
          userId: state.user.uid,
          userName: me.displayName,
          text: document.getElementById("fc-comment-text").value.trim(),
          mediaUrl: mediaUrl || "",
          mediaType: file && file.type && file.type.indexOf("video/") === 0 ? "video" : "image",
          createdAt: new Date()
        });
        setStatus("fc-comment-status", "Comment posted.", "success");
        document.getElementById("fc-comment-form").reset();
        drawComments();
      } catch (error) {
        setStatus("fc-comment-status", error.message || "Comment failed.", "error");
      }
    });
  }

  async function renderFollowingPage() {
    pageMeta("Felcin Connections", "Review followers and following lists on Felcin.");
    renderPage(
      "Connections",
      "See who follows this profile and which creators they follow back.",
      '<section class="fc-grid"><div class="fc-card"><h2>Followers</h2><div id="fc-followers" class="fc-stack"><div class="fc-empty">Loading followers...</div></div></div><div class="fc-card"><h2>Following</h2><div id="fc-following" class="fc-stack"><div class="fc-empty">Loading following...</div></div></div></section>'
    );

    var targetUid = getQueryParam("uid") || state.user.uid;
    var db = getDb();
    var followersSnap = await db.collection("follows").where("followingId", "==", targetUid).get();
    var followingSnap = await db.collection("follows").where("followerId", "==", targetUid).get();

    async function draw(containerId, docs, key) {
      var container = document.getElementById(containerId);
      if (!docs.length) {
        container.innerHTML = '<div class="fc-empty">Nothing to show yet.</div>';
        return;
      }
      var html = await Promise.all(docs.map(async function (doc) {
        var value = doc.data() || {};
        var profile = await getProfile(value[key] || "");
        return '<a class="fc-chat-row" href="/profile?uid=' + text(profile.uid || "") + '">' + profilePill(profile) + '<span><strong>' + text(profile.displayName) + '</strong><small>' + text(profile.bio || "Creator on Felcin") + '</small></span></a>';
      }));
      container.innerHTML = html.join("");
    }

    await draw("fc-followers", followersSnap.docs, "followerId");
    await draw("fc-following", followingSnap.docs, "followingId");
  }

  async function renderProfileSettingsPage() {
    pageMeta("Felcin Profile Settings", "Manage your public display name, bio, and profile image on Felcin.");
    renderPage(
      "Profile settings",
      "Update the public profile that appears across feed cards, comments, and chats.",
      '<section class="fc-split"><div class="fc-card"><div id="fc-profile-preview" class="fc-stack"><div class="fc-empty">Loading profile preview...</div></div></div><div class="fc-card"><form id="fc-profile-form" class="fc-form"><label><span>Display name</span><input id="fc-profile-name" type="text" maxlength="60" /></label><label><span>Bio</span><textarea id="fc-profile-bio" rows="5" maxlength="240"></textarea></label><label><span>Profile image</span><input id="fc-profile-photo" type="file" accept="image/*" /></label><button class="fc-button fc-button-primary" type="submit">Save profile</button></form><div id="fc-profile-status" class="fc-status">You can save text updates even without a new photo.</div></div></section>'
    );

    var db = getDb();
    var current = await getProfile(state.user.uid);
    document.getElementById("fc-profile-name").value = current.displayName || "";
    document.getElementById("fc-profile-bio").value = current.bio || "";
    drawProfilePreview(current);

    document.getElementById("fc-profile-photo").addEventListener("change", function () {
      var file = document.getElementById("fc-profile-photo").files[0];
      if (!file) return;
      readFileAsDataUrl(file).then(function (url) {
        drawProfilePreview({ displayName: document.getElementById("fc-profile-name").value, bio: document.getElementById("fc-profile-bio").value, photoURL: url });
      });
    });

    document.getElementById("fc-profile-form").addEventListener("submit", async function (event) {
      event.preventDefault();
      try {
        var photoFile = document.getElementById("fc-profile-photo").files[0];
        var photoURL = current.photoURL || "";
        if (photoFile) photoURL = await uploadMedia(photoFile, "avatars");
        var payload = {
          displayName: document.getElementById("fc-profile-name").value.trim() || current.displayName || state.user.email || "Creator",
          bio: document.getElementById("fc-profile-bio").value.trim(),
          photoURL: photoURL,
          updatedAt: new Date()
        };
        await db.collection("users").doc(state.user.uid).set(payload, { merge: true });
        await db.collection("users").doc(state.user.uid).collection("public").doc("profile").set(payload, { merge: true });
        PROFILE_CACHE[state.user.uid] = { uid: state.user.uid, displayName: payload.displayName, bio: payload.bio, photoURL: payload.photoURL };
        current = PROFILE_CACHE[state.user.uid];
        drawProfilePreview(current);
        setStatus("fc-profile-status", "Profile saved.", "success");
      } catch (error) {
        setStatus("fc-profile-status", error.message || "Could not save profile.", "error");
      }
    });

    function drawProfilePreview(profile) {
      document.getElementById("fc-profile-preview").innerHTML = '<div class="fc-post-author">' + profilePill(profile) + '<span><strong>' + text(profile.displayName || "Creator") + '</strong><small>Public profile preview</small></span></div><p class="fc-post-copy">' + text(profile.bio || "Add a short bio so people understand what you create.") + '</p><div class="fc-post-actions"><a class="fc-button fc-button-ghost" href="/profile?uid=' + text(state.user.uid) + '">View public profile</a></div>';
    }
  }

  async function renderReportPage() {
    pageMeta("Report Content | Felcin", "Report abuse, spam, harassment, or unsafe behavior to Felcin admins.");
    renderPage(
      "Report a problem",
      "Send a moderation report directly to the Felcin admin queue.",
      '<section class="fc-card"><form id="fc-report-form" class="fc-form"><label><span>Target user UID</span><input id="fc-report-target" type="text" placeholder="UID of the user you are reporting" required /></label><label><span>Report type</span><select id="fc-report-type"><option value="abuse">Abuse</option><option value="spam">Spam</option><option value="impersonation">Impersonation</option><option value="harassment">Harassment</option><option value="other">Other</option></select></label><label><span>Details</span><textarea id="fc-report-details" rows="6" placeholder="Describe what happened" required></textarea></label><button class="fc-button fc-button-primary" type="submit">Submit report</button></form><div id="fc-report-status" class="fc-status">Reports are visible to admins for moderation follow-up.</div></section>'
    );

    document.getElementById("fc-report-form").addEventListener("submit", async function (event) {
      event.preventDefault();
      try {
        await getDb().collection("reports").add({
          reporterId: state.user.uid,
          targetUserId: document.getElementById("fc-report-target").value.trim(),
          type: document.getElementById("fc-report-type").value,
          details: document.getElementById("fc-report-details").value.trim(),
          createdAt: new Date()
        });
        document.getElementById("fc-report-form").reset();
        setStatus("fc-report-status", "Report submitted.", "success");
      } catch (error) {
        setStatus("fc-report-status", error.message || "Could not submit report.", "error");
      }
    });
  }

  async function renderAdminPage() {
    pageMeta("Felcin Admin", "Moderation overview for admins on Felcin.");
    renderPage(
      "Admin",
      "Review platform health, recent reports, and high-level moderation counts.",
      '<section id="fc-admin-gate" class="fc-grid fc-grid-stats"><div class="fc-card"><div class="fc-empty">Checking access...</div></div></section><section class="fc-card"><h2>Recent reports</h2><div id="fc-admin-reports" class="fc-stack"><div class="fc-empty">Loading report queue...</div></div></section>'
    );

    if (typeof checkAdminStatus === "function") {
      var allowed = await checkAdminStatus(state.user.uid);
      if (!allowed) {
        renderError("Felcin Admin", "Access denied", "Your account is not listed in the admins collection.");
        return;
      }
    }

    var db = getDb();
    var postsSnap = await db.collection("posts").limit(200).get();
    var reportsSnap = await db.collection("reports").limit(40).get();
    var chatsSnap = await db.collection("chats").limit(200).get();
    var usersSnap = await db.collection("users").limit(200).get();

    document.getElementById("fc-admin-gate").innerHTML = [
      ["Users", usersSnap.size],
      ["Posts", postsSnap.size],
      ["Reports", reportsSnap.size],
      ["Chats", chatsSnap.size]
    ].map(function (item) {
      return '<section class="fc-card fc-stat"><p>' + text(item[0]) + '</p><strong>' + text(String(item[1])) + '</strong></section>';
    }).join("");

    var reports = reportsSnap.docs.map(function (doc) {
      var data = doc.data() || {};
      data.id = doc.id;
      return data;
    }).sort(function (left, right) {
      var leftTime = toDate(left.createdAt);
      var rightTime = toDate(right.createdAt);
      return (rightTime ? rightTime.getTime() : 0) - (leftTime ? leftTime.getTime() : 0);
    });
    var reportsEl = document.getElementById("fc-admin-reports");
    if (!reports.length) {
      reportsEl.innerHTML = '<div class="fc-empty">No reports in the queue.</div>';
      return;
    }
    reportsEl.innerHTML = reports.map(function (report) {
      return '<article class="fc-card"><div class="fc-post-head"><div><strong>' + text(report.type || "report") + '</strong><small>' + text(timeAgo(report.createdAt)) + '</small></div><span class="fc-chip">' + text(report.targetUserId || "unknown") + '</span></div><p class="fc-post-copy">' + text(report.details || "No details supplied.") + '</p><div class="fc-post-meta"><span>Reporter: ' + text(report.reporterId || "unknown") + '</span></div></article>';
    }).join("");
  }

  function authCard(title, subtitle, extra) {
    return '<section class="fc-card fc-auth-card"><h2>' + text(title) + '</h2><p class="fc-hero-copy">' + text(subtitle) + '</p>' + extra + '</section>';
  }

  function renderLoginPage() {
    pageMeta("Sign In | Felcin", "Sign in or create an account to access the Felcin community.");
    renderPage(
      "Welcome back",
      "Sign in to your Felcin account.",
      authCard("Sign in", "Use email and password. Felcin requires verified email for standard access.", '<form id="fc-login-form" class="fc-form fc-login-form"><label><span>Email address</span><input id="fc-login-email" type="email" required autocomplete="email" placeholder="you@example.com" /></label><label><span>Password</span><input id="fc-login-password" type="password" required autocomplete="current-password" placeholder="Enter your password" /></label><div class="fc-actions"><button class="fc-button fc-button-primary fc-login-submit" type="submit">Sign in</button><button class="fc-button fc-button-ghost" id="fc-switch-auth" type="button">Create account</button></div></form><div id="fc-login-status" class="fc-status">Enter your account details to continue.</div>') + staticSection("What you get", ["Creator feed with comments and stories", "Private chats with media attachments", "Notifications, following, and profile tools"]),
      '<a class="fc-button fc-button-ghost" href="/guidelines">Read community rules</a>'
    );

    var createMode = false;
    document.getElementById("fc-switch-auth").addEventListener("click", function () {
      createMode = !createMode;
      document.getElementById("fc-switch-auth").textContent = createMode ? "Use existing account" : "Create account";
      document.querySelector(".fc-auth-card h2").textContent = createMode ? "Create account" : "Sign in";
      setStatus("fc-login-status", createMode ? "Create an account. Verify your email after signup." : "Enter your account details to continue.", "");
    });

    document.getElementById("fc-login-form").addEventListener("submit", async function (event) {
      event.preventDefault();
      try {
        ensureFirebaseCompat();
        var email = document.getElementById("fc-login-email").value.trim();
        var password = document.getElementById("fc-login-password").value;
        if (createMode) {
          var credential = await firebase.auth().createUserWithEmailAndPassword(email, password);
          await credential.user.sendEmailVerification();
          setStatus("fc-login-status", "Account created. Verify your email, then sign in again.", "success");
          await firebase.auth().signOut();
          return;
        }
        await firebase.auth().signInWithEmailAndPassword(email, password);
        window.location.href = "/";
      } catch (error) {
        setStatus("fc-login-status", error.message || "Authentication failed.", "error");
      }
    });

    if (getQueryParam("verify")) {
      setStatus("fc-login-status", "Verify your email before continuing.", "error");
    }
  }

  function renderGuidelinesPage() {
    pageMeta("Felcin Guidelines", "Read Felcin community rules and 16+ safety expectations.");
    renderPage(
      "Guidelines",
      "Felcin is built for a 16+ audience. Consent, safety, and respectful behavior are mandatory.",
      staticSection("Core rules", [
        "Only share material appropriate for a 16+ audience.",
        "Do not harass, threaten, impersonate, or pressure other members.",
        "Use direct messages and comments respectfully and with consent.",
        "Report dangerous or abusive behavior immediately."
      ]) +
      staticSection("Messaging and stories", [
        "Stories are short-lived but still subject to moderation.",
        "Private messages must not be used for grooming, coercion, or spam.",
        "Media uploads are checked and may be reviewed for safety concerns."
      ]) +
      staticSection("Moderation outcomes", [
        "Content may be removed without notice.",
        "Accounts can be restricted, suspended, or permanently banned.",
        "Admin actions are logged for follow-up review."])
    );
  }

  function renderDownloadPage() {
    pageMeta("Felcin Download", "Download links, setup notes, and deployment package references for Felcin.");
    renderPage(
      "Downloads",
      "Useful package references and app entry points while the platform is hosted on the web.",
      '<section class="fc-card"><h2>Open Felcin</h2><div class="fc-actions"><a class="fc-button fc-button-primary" href="/">Open feed</a><a class="fc-button fc-button-ghost" href="/creator">Create content</a></div><p class="fc-hero-copy">Felcin currently runs as a web app. Use the browser entry points above on desktop or mobile.</p></section>' +
      staticSection("Deployment assets", ["`hostinger-upload.zip` in the GitHub repo is a Node/Next artifact.", "This static Hostinger pack is the active web deployment surface.", "Media uploads route through Firebase Storage or the Hostinger PHP upload endpoint."])
    );
  }

  async function init() {
    try {
      if (PUBLIC_PAGES[page]) {
        if (page === "login") renderLoginPage();
        if (page === "guidelines") renderGuidelinesPage();
        if (page === "download") renderDownloadPage();
        return;
      }

      await requireUser();
      if (page === "index") await renderFeedPage();
      else if (page === "explore") await renderExplorePage();
      else if (page === "creator") await renderCreatorPage();
      else if (page === "stories") await renderStoriesPage();
      else if (page === "dashboard") await renderDashboardPage();
      else if (page === "live") await renderLivePage();
      else if (page === "notifications") await renderNotificationsPage();
      else if (page === "private-chats") await renderChatsPage();
      else if (page === "comments") await renderCommentsPage();
      else if (page === "following") await renderFollowingPage();
      else if (page === "profile-settings") await renderProfileSettingsPage();
      else if (page === "report") await renderReportPage();
      else if (page === "admin") await renderAdminPage();
    } catch (error) {
      if (error && /Authentication required|Verification required/.test(error.message || "")) return;
      renderError("Felcin", "Page failed to load", error.message || "Something went wrong.");
    }
  }

  init();
})();
