/* Felcin Realtime helpers — v20260417-1
   Adds live engagement counters, unread badges, and pagination utilities
   on top of the existing Firebase compat SDK already loaded by each page.
   Safe to include defer; checks for firebase availability before doing work.
*/
(function () {
  "use strict";

  if (typeof window === "undefined") return;

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function getDb() {
    if (typeof firebase === "undefined" || !firebase.apps || !firebase.apps.length) return null;
    try { return firebase.firestore(); } catch (_) { return null; }
  }

  // ---------- Live engagement counters on a post element ----------
  // Looks for [data-post-stats="<postId>"] inside `root` and binds a Firestore
  // snapshot listener to keep "<n> likes" / "<n> comments" current in real time.
  const postSubs = new Map(); // postId -> unsubscribe fn

  function subscribePostStats(postEl, postId) {
    const db = getDb();
    if (!db || !postId || !postEl) return;
    const target = postEl.querySelector('[data-post-stats="' + postId + '"]')
                || postEl.querySelector(".post-stats");
    if (!target) return;

    if (postSubs.has(postId)) return; // already subscribed

    const unsub = db.collection("posts").doc(postId).onSnapshot(
      (snap) => {
        if (!snap.exists) return;
        const d = snap.data() || {};
        const likes = Number(d.likes || 0);
        const comments = Number(d.comments || 0);
        target.innerHTML =
          '<span data-likes>' + likes + ' likes</span>' +
          '<span data-comments>' + comments + ' comments</span>';
      },
      (err) => {
        console.warn("post stats listener error", postId, err && err.code);
      }
    );
    postSubs.set(postId, unsub);
  }

  function detachAllPostStats() {
    postSubs.forEach((fn) => { try { fn(); } catch (_) {} });
    postSubs.clear();
  }

  // ---------- Unread nav badges ----------
  // Adds a small dot/count next to nav links matching href="/notifications"
  // and href="/private-chats". Listens to:
  //   notifications where recipientId==uid && read==false
  //   conversations where participants array-contains uid (uses
  //     localStorage(felcin:lastChatsVisit) to detect new since last visit)
  function ensureBadge(linkEl, badgeClass) {
    if (!linkEl) return null;
    let badge = linkEl.querySelector("." + badgeClass);
    if (!badge) {
      badge = document.createElement("span");
      badge.className = badgeClass;
      badge.style.cssText =
        "display:none;margin-left:6px;background:#ff5577;color:#fff;" +
        "font-size:11px;font-weight:800;padding:1px 7px;border-radius:999px;" +
        "vertical-align:middle;line-height:1.4;min-width:18px;text-align:center;";
      linkEl.appendChild(badge);
    }
    return badge;
  }

  function setBadge(badge, count) {
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.style.display = "inline-block";
    } else {
      badge.style.display = "none";
    }
  }

  let navUnsubs = [];

  function attachNavBadges(user) {
    if (!user || !user.uid) return;
    const db = getDb();
    if (!db) return;

    // Clear any existing
    navUnsubs.forEach((fn) => { try { fn(); } catch (_) {} });
    navUnsubs = [];

    const notifLinks = document.querySelectorAll('a[href="/notifications"], a[href="/notifications/"]');
    const chatLinks  = document.querySelectorAll('a[href="/private-chats"], a[href="/private-chats/"]');

    // --- Notifications: real unread count
    if (notifLinks.length) {
      const badges = Array.from(notifLinks).map((el) => ensureBadge(el, "felcin-rt-badge-notif"));
      try {
        const unsub = db.collection("notifications")
          .where("recipientId", "==", user.uid)
          .where("read", "==", false)
          .onSnapshot(
            (snap) => badges.forEach((b) => setBadge(b, snap.size)),
            (err) => console.warn("notif badge error", err && err.code)
          );
        navUnsubs.push(unsub);
      } catch (e) { console.warn("notif badge setup failed", e); }
    }

    // --- Chats: unread = conversations whose lastMessageTime is newer than
    //     the user's last visit AND where the last sender wasn't us.
    if (chatLinks.length) {
      const badges = Array.from(chatLinks).map((el) => ensureBadge(el, "felcin-rt-badge-chat"));
      const lastVisitMs = Number(localStorage.getItem("felcin:lastChatsVisit") || "0");
      try {
        const unsub = db.collection("conversations")
          .where("participants", "array-contains", user.uid)
          .onSnapshot(
            (snap) => {
              let count = 0;
              snap.forEach((doc) => {
                const d = doc.data() || {};
                const t = d.lastMessageTime && d.lastMessageTime.toMillis
                  ? d.lastMessageTime.toMillis()
                  : (d.lastMessageTime ? new Date(d.lastMessageTime).getTime() : 0);
                if (t && t > lastVisitMs && d.lastSenderId && d.lastSenderId !== user.uid) {
                  count++;
                }
              });
              badges.forEach((b) => setBadge(b, count));
            },
            (err) => console.warn("chat badge error", err && err.code)
          );
        navUnsubs.push(unsub);
      } catch (e) { console.warn("chat badge setup failed", e); }
    }

    // If user is currently on the chats page, mark visit on close
    if (location.pathname.indexOf("/private-chats") === 0) {
      window.addEventListener("beforeunload", () => {
        localStorage.setItem("felcin:lastChatsVisit", String(Date.now()));
      });
      // Also mark immediately so badge clears on this device
      localStorage.setItem("felcin:lastChatsVisit", String(Date.now()));
    }
  }

  // ---------- Infinite-scroll helper ----------
  // Usage: FelcinRT.makePager({ query, pageSize, onPage(snap, isFirstPage) })
  //   Returns { loadNext(), reset(query) }
  function makePager(opts) {
    const pageSize = opts.pageSize || 10;
    let baseQuery = opts.query;
    let lastDoc = null;
    let loading = false;
    let exhausted = false;
    let isFirst = true;

    async function loadNext() {
      if (loading || exhausted || !baseQuery) return { count: 0, exhausted };
      loading = true;
      try {
        let q = baseQuery.limit(pageSize);
        if (lastDoc) q = baseQuery.startAfter(lastDoc).limit(pageSize);
        const snap = await q.get();
        if (snap.empty) {
          exhausted = true;
        } else {
          lastDoc = snap.docs[snap.docs.length - 1];
          if (snap.size < pageSize) exhausted = true;
        }
        try { opts.onPage && opts.onPage(snap, isFirst); } catch (e) { console.warn(e); }
        isFirst = false;
        return { count: snap.size, exhausted };
      } finally {
        loading = false;
      }
    }

    function reset(newQuery) {
      baseQuery = newQuery || baseQuery;
      lastDoc = null;
      loading = false;
      exhausted = false;
      isFirst = true;
    }

    return { loadNext, reset, isExhausted: () => exhausted, isLoading: () => loading };
  }

  // Attach a sentinel-based infinite scroll inside `containerEl`.
  // Calls pager.loadNext() when the sentinel scrolls into view.
  function attachInfiniteScroll(containerEl, pager) {
    if (!containerEl || !pager) return () => {};
    let sentinel = containerEl.querySelector(".felcin-rt-sentinel");
    if (!sentinel) {
      sentinel = document.createElement("div");
      sentinel.className = "felcin-rt-sentinel";
      sentinel.style.cssText = "height:1px;width:100%;";
      containerEl.appendChild(sentinel);
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) pager.loadNext();
      });
    }, { rootMargin: "600px 0px 600px 0px" });
    io.observe(sentinel);
    return () => { try { io.disconnect(); } catch (_) {} };
  }

  // ---------- Public API ----------
  window.FelcinRT = {
    subscribePostStats,
    detachAllPostStats,
    attachNavBadges,
    makePager,
    attachInfiniteScroll
  };

  // Auto-attach nav badges as soon as auth is known
  ready(function () {
    let attached = false;
    function tryAttach() {
      if (attached) return;
      if (typeof firebase === "undefined" || !firebase.auth) {
        setTimeout(tryAttach, 300);
        return;
      }
      try {
        firebase.auth().onAuthStateChanged(function (user) {
          if (user) {
            attached = true;
            attachNavBadges(user);
          }
        });
      } catch (e) {
        setTimeout(tryAttach, 500);
      }
    }
    tryAttach();
  });
})();
