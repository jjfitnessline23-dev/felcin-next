/**
 * Felcin Common Module — v2026-04-16
 * Shared Firebase config, auth helpers, and utility functions.
 * Loaded by all HTML pages to eliminate duplication.
 */

/* ───────── Firebase Config ───────── */
/* firebaseConfig is declared inline in each HTML page's <script> block
   to avoid const-redeclaration errors (const cannot be declared twice
   in the global lexical scope). */

/* ───────── Firebase Load Guard ───────── */
/* If Firebase CDN scripts fail to load (e.g. network error, ad-blocker),
   redirect away from protected pages immediately rather than silently
   returning and showing the page shell without any auth enforcement. */
(function () {
  var PUBLIC_PATHS = ["/login", "/privacy", "/security", "/trust-center", "/guidelines", "/404"];
  window.addEventListener("DOMContentLoaded", function () {
    if (typeof firebase !== "undefined") return; // Firebase loaded correctly
    var path = window.location.pathname.replace(/\.html$/i, "").toLowerCase();
    var isPublic = PUBLIC_PATHS.some(function (p) { return path === p; });
    if (!isPublic) {
      window.location.replace("/login");
    }
  });
}());

/* ───────── App Check ───────── */
function initAppCheck() {
  if (typeof firebase === "undefined" || !firebase.appCheck) return;
  try {
    var appCheck = firebase.appCheck();
    appCheck.activate("6LeYiLssAAAAAB7t8M4mixFBGtGdTEoPfZmbur0Q", true);
  } catch (e) { /* App Check not available — non-blocking */ }
}

/* ───────── Admin Check ───────── */
var OWNER_UIDS = ["GnpVhd5SRMQGxm0lExe5Ycd6btf2"];

/* ───────── Auth Helpers ───────── */
function canAccessApp(user) {
  if (!user) return false;
  if (user.phoneNumber) return true;
  if (OWNER_UIDS.indexOf(user.uid) !== -1) return true;
  return !!user.email && !!user.emailVerified;
}

function showVerificationNoticeAndRedirect() {
  const banner = document.createElement("div");
  banner.textContent = "Please verify your email before accessing Felcin. Redirecting to login\u2026";
  banner.style.cssText =
    "position:fixed;top:14px;left:50%;transform:translateX(-50%);" +
    "background:linear-gradient(135deg,#ff6b6b,#ff4757);color:#fff;" +
    "padding:16px 28px;border-radius:14px;font-weight:600;" +
    "z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,.4);text-align:center;max-width:90vw;";
  document.body.appendChild(banner);
  setTimeout(function () { window.location.href = "/login?verify=1"; }, 1200);
}

/* ───────── Text Utilities ───────── */
function escapeHtml(text) {
  var div = document.createElement("div");
  div.textContent = String(text || "");
  return div.innerHTML;
}

function normalizeAvatarFocusY(value) {
  var numeric = Number(value);
  if (!isFinite(numeric)) return 50;
  if (numeric < 0) return 0;
  if (numeric > 100) return 100;
  return Math.round(numeric);
}

function getAvatarObjectPosition(value) {
  return "50% " + normalizeAvatarFocusY(value) + "%";
}

function getAvatarStyleAttr(value) {
  return ' style="object-position:' + getAvatarObjectPosition(value) + ';"';
}

function applyAvatarFocus(img, value) {
  if (!img) return;
  img.style.objectPosition = getAvatarObjectPosition(value);
}

async function shareUrl(url, options) {
  var opts = options || {};
  var title = opts.title || "Felcin";
  var text = opts.text || "";
  var shareButton = opts.button || null;
  var successLabel = opts.successLabel || "Link copied!";
  var defaultLabel = opts.defaultLabel || (shareButton ? shareButton.textContent : "Share");
  var resetMs = Number(opts.resetMs || 1800);

  if (!url) return false;

  try {
    if (navigator.share) {
      await navigator.share({ title: title, text: text, url: url });
      return true;
    }
  } catch (err) {
    if (err && err.name === "AbortError") return false;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
    } else {
      var temp = document.createElement("textarea");
      temp.value = url;
      temp.setAttribute("readonly", "");
      temp.style.position = "fixed";
      temp.style.opacity = "0";
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      document.body.removeChild(temp);
    }
    if (shareButton) {
      shareButton.textContent = successLabel;
      setTimeout(function () { shareButton.textContent = defaultLabel; }, resetMs);
    }
    return true;
  } catch (copyErr) {
    try {
      window.prompt("Copy this link:", url);
      return true;
    } catch (promptErr) {
      return false;
    }
  }
}

function setTemporaryButtonLabel(button, label, defaultLabel, timeoutMs) {
  if (!button) return;
  var fallback = defaultLabel || button.textContent;
  button.textContent = label;
  setTimeout(function () { button.textContent = fallback; }, Number(timeoutMs || 1800));
}

async function repostPost(postId, currentUser, db, options) {
  var opts = options || {};
  var actionButton = opts.button || null;
  var successLabel = opts.successLabel || "Reposted!";
  var alreadyLabel = opts.alreadyLabel || "Already reposted";
  var defaultLabel = opts.defaultLabel || (actionButton ? actionButton.textContent : "Repost");

  if (!postId || !currentUser || !db) {
    return { ok: false, reason: "missing_context" };
  }

  try {
    var existingSnap = await db.collection("posts")
      .where("authorId", "==", currentUser.uid)
      .where("repostOf", "==", postId)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      setTemporaryButtonLabel(actionButton, alreadyLabel, defaultLabel, 2200);
      return { ok: true, already: true, repostId: existingSnap.docs[0].id };
    }

    var sourceRef = db.collection("posts").doc(postId);
    var sourceSnap = await sourceRef.get();
    if (!sourceSnap.exists) {
      return { ok: false, reason: "source_missing" };
    }

    var source = sourceSnap.data() || {};
    var sourceCaption = source.caption || source.text || "";
    var mediaUrl = source.mediaUrl || "";

    if (!mediaUrl) {
      return { ok: false, reason: "source_has_no_media" };
    }

    var contentType = source.contentType || resolveMediaType(source.contentType, source.mimeType, source.mediaUrl);

    var payload = {
      authorId: currentUser.uid,
      caption: sourceCaption,
      text: sourceCaption,
      mediaUrl: mediaUrl,
      contentType: contentType,
      mimeType: source.mimeType || "",
      likes: 0,
      comments: 0,
      status: "published",
      repostOf: postId,
      repostBy: currentUser.uid,
      originalAuthorId: source.authorId || "",
      originalCaption: sourceCaption,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    var created = await db.collection("posts").add(payload);
    setTemporaryButtonLabel(actionButton, successLabel, defaultLabel, 1800);
    return { ok: true, created: true, repostId: created.id };
  } catch (err) {
    console.error("Repost failed:", err);
    return { ok: false, reason: "error", error: err };
  }
}

async function deleteCollectionDocs(collectionRef, batchSize) {
  var size = Number(batchSize || 100);
  var snapshot = await collectionRef.limit(size).get();
  while (!snapshot.empty) {
    var batch = firebase.firestore().batch();
    snapshot.docs.forEach(function (doc) { batch.delete(doc.ref); });
    await batch.commit();
    snapshot = await collectionRef.limit(size).get();
  }
}

async function deletePost(postId, currentUser, db, options) {
  var opts = options || {};
  if (!postId || !currentUser || !db) {
    return { ok: false, reason: "missing_context" };
  }

  try {
    var postRef = db.collection("posts").doc(postId);
    var postSnap = await postRef.get();
    if (!postSnap.exists) {
      return { ok: false, reason: "missing_post" };
    }

    var post = postSnap.data() || {};
    var isOwner = String(post.authorId || "") === String(currentUser.uid || "");
    var isAdmin = OWNER_UIDS.indexOf(String(currentUser.uid || "")) !== -1;

    if (!isOwner && !isAdmin) {
      return { ok: false, reason: "forbidden" };
    }

    if (opts.confirmMessage) {
      var confirmed = window.confirm(String(opts.confirmMessage));
      if (!confirmed) {
        return { ok: false, reason: "cancelled" };
      }
    }

    await Promise.all([
      deleteCollectionDocs(postRef.collection("likes"), 150),
      deleteCollectionDocs(postRef.collection("comments"), 150)
    ]);
    await postRef.delete();
    return { ok: true };
  } catch (err) {
    console.error("Delete post failed:", err);
    return { ok: false, reason: "error", error: err };
  }
}

function resolveMediaType(explicitType, mime, url) {
  if (String(explicitType || "").toLowerCase() === "video") return "video";
  var safeMime = String(mime || "").toLowerCase();
  if (safeMime.startsWith("video/")) return "video";
  var safeUrl = String(url || "").toLowerCase();
  if (/\.(mp4|webm|mov|m4v|ogg|m3u8)(\?|$)/i.test(safeUrl)) return "video";
  return "image";
}

function getTimeString(ts) {
  if (!ts) return "";
  var d;
  if (ts.toDate) d = ts.toDate();
  else if (ts.seconds) d = new Date(ts.seconds * 1000);
  else d = new Date(ts);
  var diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
  return d.toLocaleDateString();
}

async function checkAdminStatus(uid) {
  try {
    var db = firebase.firestore();
    var snap = await db.collection("admins").doc(uid).get();
    if (snap.exists) {
      var adminData = snap.data() || {};
      if (adminData.active === true) return true;
    }
    if (OWNER_UIDS.indexOf(uid) !== -1) {
      db.collection("admins").doc(uid).set({active:true,promotedBy:"owner-bootstrap",promotedAt:new Date()},{merge:true}).catch(function(){});
      return true;
    }
    return false;
  } catch (e) {
    return OWNER_UIDS.indexOf(uid) !== -1;
  }
}

/* ───────── Profile Loader ───────── */
async function loadCurrentUserProfile(uid) {
  try {
    var db = firebase.firestore();
    var snap = await db.collection("users").doc(uid).collection("public").doc("profile").get();
    if (snap.exists) return snap.data();
  } catch (e) { /* ignore */ }
  return null;
}

/* ───────── Upload Helper ───────── */
async function uploadMediaViaServer(file, onProgress) {
  var user = firebase.auth().currentUser;
  if (!user) throw new Error("Not signed in");
  var token = await user.getIdToken();
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/upload-media.php");
    xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.timeout = 600000; // 10 min timeout for large videos
    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch (e) { reject(new Error("Invalid server response")); }
      } else { reject(new Error("Upload failed: " + xhr.status)); }
    };
    xhr.onerror = function () { reject(new Error("Network error during upload")); };
    xhr.ontimeout = function () { reject(new Error("Upload timed out — try a shorter video")); };
    var fd = new FormData();
    fd.append("media", file);
    xhr.send(fd);
  });
}

/* ───────── LocalStorage Helpers (per-user sets) ───────── */
function getUserSet(uid, key) {
  try {
    var raw = localStorage.getItem(key + "_" + uid);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function setUserSet(uid, key, arr) {
  try { localStorage.setItem(key + "_" + uid, JSON.stringify(arr)); } catch (e) { /* quota */ }
}

/* ───────── URL Sanitisation for embeds ───────── */
function isSafeEmbedUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    var parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch (e) { return false; }
}

/* ───────── Mobile Header Icons ───────── */
document.addEventListener("DOMContentLoaded", function () {
  var header = document.querySelector(".feed-top") ||
               document.querySelector(".head") ||
               document.querySelector(".card-head") ||
               document.querySelector(".list-head");
  if (!header) return;

  var html = '<div class="mobile-actions">';

  html += '<div class="mobile-more" id="mobile-more-btn">' +
          '<span class="material-symbols-outlined">menu</span>' +
          '<div class="mobile-more-menu" id="mobile-more-menu">' +
      '<a href="/profile-settings"><span class="material-symbols-outlined">settings</span>Settings</a>' +
          '<a href="/stories"><span class="material-symbols-outlined">auto_stories</span>Stories</a>' +
          '<a href="/live"><span class="material-symbols-outlined">videocam</span>Live</a>' +
          '<a href="/dashboard"><span class="material-symbols-outlined">dashboard</span>Dashboard</a>' +
          '</div></div></div>';

  html += '<div class="mobile-menu-backdrop" id="mobile-menu-backdrop"></div>';
  header.insertAdjacentHTML("beforeend", html);

  var moreBtn = document.getElementById("mobile-more-btn");
  var backdrop = document.getElementById("mobile-menu-backdrop");

  function closeMenu() {
    if (moreBtn) moreBtn.classList.remove("open");
    if (backdrop) backdrop.classList.remove("open");
  }

  if (moreBtn) {
    moreBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = this.classList.toggle("open");
      if (backdrop) backdrop.classList.toggle("open", isOpen);
    });
  }

  if (backdrop) {
    backdrop.addEventListener("click", closeMenu);
  }

  document.addEventListener("click", function (e) {
    if (moreBtn && !moreBtn.contains(e.target)) closeMenu();
  });
});

/* ───────── Media Lightbox ───────── */
document.addEventListener("DOMContentLoaded", function () {
  var overlay = document.createElement("div");
  overlay.id = "felcin-media-lightbox";
  overlay.style.cssText = [
    "position:fixed",
    "top:0","left:0","right:0","bottom:0",
    "width:100%","height:100%",
    "background:#000",
    "display:none",
    "align-items:center",
    "justify-content:center",
    "padding:18px",
    "z-index:999999",
    "cursor:zoom-out",
    "overflow:hidden",
    "touch-action:none",
    "-webkit-overflow-scrolling:auto",
    "overscroll-behavior:none"
  ].join(";");

  var closeBtn = document.createElement("button");
  closeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.style.cssText = "position:absolute;top:14px;right:14px;width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,0.15);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:1;font-size:0;";
  closeBtn.querySelector("span").style.cssText = "font-size:22px;";
  overlay.appendChild(closeBtn);

  var img = document.createElement("img");
  img.alt = "Expanded media";
  img.style.cssText = "max-width:min(96vw,1200px);max-height:90vh;width:auto;height:auto;object-fit:contain;border-radius:8px;box-shadow:0 24px 60px rgba(0,0,0,.7);cursor:default;display:block;";
  overlay.appendChild(img);
  document.body.appendChild(overlay);

  var _savedScrollY = 0;

  function openLightbox(src) {
    img.src = src;
    _savedScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.position = "fixed";
    document.body.style.top = "-" + _savedScrollY + "px";
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.overflow = "hidden";
    overlay.style.display = "flex";
  }

  function closeLightbox() {
    overlay.style.display = "none";
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.overflow = "";
    window.scrollTo(0, _savedScrollY);
    img.removeAttribute("src");
  }

  overlay.addEventListener("click", closeLightbox);
  closeBtn.addEventListener("click", function (e) { e.stopPropagation(); closeLightbox(); });
  img.addEventListener("click", function (e) { e.stopPropagation(); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeLightbox();
  });

  // Capture phase prevents tile/card click handlers from navigating away.
  document.addEventListener("click", function (e) {
    var mediaImg = e.target.closest(".post-media img, .tile img, .story-card img");
    if (!mediaImg) return;
    e.preventDefault();
    e.stopPropagation();
    openLightbox(mediaImg.currentSrc || mediaImg.src);
  }, true);
});

/* ───────── Creator Modal (Instagram-style overlay) ───────── */
(function () {
  var _creatorFile = null;
  var _creatorOverlay = null;
  var _creatorFileInput = null;

  /* Intercept all Create links (skip when already on /creator — page has its own UI) */
  document.addEventListener("click", function (e) {
    var link = e.target.closest('a[href="/creator"]');
    if (!link) return;
    if (window.location.pathname === "/creator") return;
    e.preventDefault();
    openFilePicker();
  });

  function openFilePicker() {
    if (!_creatorFileInput) {
      _creatorFileInput = document.createElement("input");
      _creatorFileInput.type = "file";
      _creatorFileInput.accept = "image/*,video/*";
      _creatorFileInput.style.display = "none";
      document.body.appendChild(_creatorFileInput);
      _creatorFileInput.addEventListener("change", function () {
        if (_creatorFileInput.files.length) {
          _creatorFile = _creatorFileInput.files[0];
          showCreatorModal(_creatorFile);
        }
        _creatorFileInput.value = "";
      });
    }
    _creatorFileInput.click();
  }

  function showCreatorModal(file) {
    if (_creatorOverlay) _creatorOverlay.remove();

    var isVideo = file.type.startsWith("video/");
    var blobUrl = URL.createObjectURL(file);

    var overlay = document.createElement("div");
    overlay.className = "creator-modal-overlay";
    overlay.innerHTML =
      '<div class="creator-modal">' +
        '<div class="cm-top">' +
          '<button class="cm-back" id="cm-close" aria-label="Close"><span class="material-symbols-outlined">close</span></button>' +
          '<span class="cm-title">New Post</span>' +
          '<button class="cm-share" id="cm-share">Share</button>' +
        '</div>' +
        '<div class="cm-media" style="position:relative;">' +
          (isVideo
            ? '<video src="' + blobUrl + '" controls preload="metadata" class="cm-media-el" style="width:100%;max-height:55vh;object-fit:contain;display:block;background:#000;"></video>'
            : '<img src="' + blobUrl + '" alt="Preview" class="cm-media-el" style="width:100%;max-height:55vh;object-fit:contain;display:block;">') +
        '</div>' +
        '<div style="padding:12px 16px 8px;border-top:1px solid #f1f5f9;">' +
          '<textarea class="cm-caption" id="cm-caption" placeholder="Write a caption... use #hashtags" maxlength="2200" rows="2" style="width:100%;border:none;background:none;resize:none;font-family:inherit;font-size:15px;color:#1e293b;outline:none;line-height:1.5;overflow:hidden;box-sizing:border-box;"></textarea>' +
          '<div style="text-align:right;font-size:11px;color:#94a3b8;margin-top:2px;"><span id="cm-count">0</span>/2,200</div>' +
        '</div>' +
        '<div class="cm-status" id="cm-status"></div>' +
        '<div class="cm-publishing" id="cm-publishing">' +
          '<div class="cm-spinner"></div>' +
          '<div class="cm-pub-text" id="cm-pub-text">Sharing...</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    _creatorOverlay = overlay;
    document.body.style.overflow = "hidden";

    /* Caption counter + auto-grow */
    var captionEl = document.getElementById("cm-caption");
    var countEl = document.getElementById("cm-count");
    captionEl.addEventListener("input", function () {
      countEl.textContent = captionEl.value.length;
      captionEl.style.height = "auto";
      captionEl.style.height = Math.min(captionEl.scrollHeight, 120) + "px";
    });

    /* Close */
    document.getElementById("cm-close").addEventListener("click", closeCreatorModal);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeCreatorModal();
    });

    /* Share — delay to prevent ghost-tap from file picker closing */
    var shareBtn = document.getElementById("cm-share");
    shareBtn.disabled = true;
    setTimeout(function () { shareBtn.disabled = false; }, 500);
    shareBtn.addEventListener("click", function () {
      publishFromModal(file, captionEl.value.trim());
    });
  }

  function closeCreatorModal() {
    if (_creatorOverlay) {
      _creatorOverlay.remove();
      _creatorOverlay = null;
    }
    _creatorFile = null;
    document.body.style.overflow = "";
  }

  async function publishFromModal(file, caption) {
    var user = typeof firebase !== "undefined" && firebase.auth().currentUser;
    if (!user) { showModalStatus("Not signed in.", "error"); return; }

    var MAX_BYTES = 500 * 1024 * 1024; // 500 MB hard limit
    if (file.size > MAX_BYTES) {
      showModalStatus("File is too large (max 500 MB). Please trim your video.", "error");
      return;
    }

    var shareBtn = document.getElementById("cm-share");
    var pubEl = document.getElementById("cm-publishing");
    var pubText = document.getElementById("cm-pub-text");
    shareBtn.disabled = true;
    pubEl.classList.add("active");

    var sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    pubText.textContent = "Uploading... 0% (0 / " + sizeMB + " MB)";

    try {
      var mediaUrl = "";
      var _mime = file.type || "";
      var _fname = (file.name || "").toLowerCase();
      var contentType = (_mime.startsWith("video/") || /\.(mp4|mov|avi|webm|mkv|m4v|3gp)$/.test(_fname)) ? "video" : "image";
      if (typeof uploadMediaViaServer === "function") {
        var result = await uploadMediaViaServer(file, function (pct) {
          var done = ((file.size * pct / 100) / (1024 * 1024)).toFixed(1);
          pubText.textContent = "Uploading... " + pct + "% (" + done + " / " + sizeMB + " MB)";
        });
        mediaUrl = result.url || result.mediaUrl || "";
        if (!mediaUrl) throw new Error("Upload returned no URL — please try again.");
      } else {
        throw new Error("Upload module not loaded — refresh and try again.");
      }

      pubText.textContent = "Publishing...";
      var db = firebase.firestore();
      await db.collection("posts").add({
        authorId: user.uid,
        caption: caption,
        text: caption,
        mediaUrl: mediaUrl,
        contentType: contentType,
        mimeType: _mime,
        likes: 0,
        comments: 0,
        status: "published",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      pubText.textContent = "Post shared!";
      setTimeout(function () {
        closeCreatorModal();
        window.location.reload();
      }, 900);
    } catch (err) {
      console.error("Publish error:", err);
      pubEl.classList.remove("active");
      var _errMsg = (err && err.message) ? err.message : "Unknown error";
      showModalStatus(_errMsg, "error");
      shareBtn.disabled = false;
    }
  }

  function showModalStatus(msg, type) {
    var el = document.getElementById("cm-status");
    if (!el) return;
    el.className = "cm-status " + type;
    el.textContent = msg;
  }

  /* Expose so other pages can trigger the proper modal with caption */
  window.felcinOpenCreatorPicker = openFilePicker;
})();

/* ───────── Notification Badge ───────── */
(function () {
  var _notifUnsub = null;

  function addBadges() {
    document.querySelectorAll('a[href="/notifications"]').forEach(function (link) {
      if (link.querySelector(".notif-badge")) return;
      link.style.position = "relative";
      var b = document.createElement("span");
      b.className = "notif-badge";
      b.style.cssText = "display:none;position:absolute;top:3px;right:3px;min-width:16px;height:16px;background:#ef4444;color:#fff;border-radius:8px;font-size:10px;font-weight:700;align-items:center;justify-content:center;padding:0 3px;line-height:1;border:1.5px solid #fff;pointer-events:none;";
      link.appendChild(b);
    });
  }

  function setBadge(count) {
    document.querySelectorAll(".notif-badge").forEach(function (b) {
      if (count > 0) { b.textContent = count > 99 ? "99+" : String(count); b.style.display = "flex"; }
      else { b.style.display = "none"; }
    });
  }

  function startBadge(db, uid) {
    if (_notifUnsub) { try { _notifUnsub(); } catch (e) {} _notifUnsub = null; }
    if (!db || !uid) return;
    addBadges();
    try {
      _notifUnsub = db.collection("notifications")
        .where("recipientId", "==", uid)
        .where("read", "==", false)
        .onSnapshot(function (snap) { setBadge(snap.size); }, function () {});
    } catch (e) {}
  }

  window.startNotifBadge = startBadge;

  document.addEventListener("DOMContentLoaded", function () {
    addBadges();
    var waited = 0;
    var poll = setInterval(function () {
      waited += 150;
      if (waited > 8000) { clearInterval(poll); return; }
      if (typeof firebase === "undefined" || !firebase.apps || !firebase.apps.length) return;
      clearInterval(poll);
      try {
        firebase.auth().onAuthStateChanged(function (user) {
          if (user) {
            var db = firebase.firestore ? firebase.firestore() : null;
            if (db) startBadge(db, user.uid);
          } else {
            setBadge(0);
            if (_notifUnsub) { try { _notifUnsub(); } catch (e) {} _notifUnsub = null; }
          }
        });
      } catch (e) {}
    }, 150);
  });
})();
