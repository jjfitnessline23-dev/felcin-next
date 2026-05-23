/* Felcin web push opt-in — v20260417-1
 *
 * Requires a Web Push VAPID key from Firebase Console:
 *   Project Settings → Cloud Messaging → Web configuration → "Generate key pair"
 * Paste it into VAPID_PUBLIC_KEY below.
 */
(function () {
  // TODO: replace with the real VAPID public key from Firebase Console
  var VAPID_PUBLIC_KEY = window.FELCIN_VAPID_KEY || "BBkzkpM2HSrwei89mIqxCB9iGQCCHPh1CDE_baZf_CqQYm3Nl1Tff_ux93RoT50PrDndOVus-E9XdV7Z5EG0Kn0";

  if (!("serviceWorker" in navigator) || !("Notification" in window)) return;
  if (typeof firebase === "undefined" || !firebase.messaging) return;

  var enabled = false;

  function register(user) {
    if (enabled || !user || !VAPID_PUBLIC_KEY) return;
    enabled = true;

    if (Notification.permission === "denied") return;

    var ask = function () {
      Notification.requestPermission().then(function (perm) {
        if (perm !== "granted") return;
        navigator.serviceWorker.register("/firebase-messaging-sw.js")
          .then(function (reg) {
            var msg = firebase.messaging();
            return msg.getToken({ vapidKey: VAPID_PUBLIC_KEY, serviceWorkerRegistration: reg });
          })
          .then(function (token) {
            if (!token) return;
            return firebase.firestore()
              .collection("users").doc(user.uid)
              .collection("tokens").doc(token)
              .set({ createdAt: firebase.firestore.FieldValue.serverTimestamp(), ua: navigator.userAgent }, { merge: true });
          })
          .catch(function (err) { console.warn("Push setup failed:", err); });
      });
    };

    // Prompt on first user gesture only (avoids autoplay/permission spam)
    if (Notification.permission === "granted") {
      ask();
    } else {
      var trigger = function () {
        document.removeEventListener("click", trigger);
        document.removeEventListener("touchstart", trigger);
        ask();
      };
      document.addEventListener("click", trigger, { once: true });
      document.addEventListener("touchstart", trigger, { once: true });
    }
  }

  function init() {
    if (typeof firebase === "undefined" || !firebase.auth) return;
    if (!firebase.apps || !firebase.apps.length) return;
    firebase.auth().onAuthStateChanged(function (user) { if (user) register(user); });
  }

  // defer scripts run when readyState is "interactive" — before DOMContentLoaded.
  // firebase.initializeApp() lives in each page's DOMContentLoaded handler,
  // so we must wait for that event instead of calling init() immediately.
  if (document.readyState === "complete") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
