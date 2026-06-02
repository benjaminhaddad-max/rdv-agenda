/* Diploma web tracker v1
 * Install:
 * <script>
 *   window.DiplomaTrackerConfig = {
 *     endpoint: "https://hub.diploma-sante.fr/api/web/track",
 *     token: "OPTIONAL_WEB_TRACKING_TOKEN",
 *     site: "my-site",
 *     contact: { hubspot_contact_id: "...", email: "...", phone: "..." }
 *   };
 * </script>
 * <script defer src="https://hub.diploma-sante.fr/diploma-tracker.js"></script>
 */
(function () {
  var cfg = window.DiplomaTrackerConfig || {};
  var endpoint = cfg.endpoint || "/api/web/track";
  var token = cfg.token || "";
  var site = cfg.site || window.location.hostname;
  var contact = cfg.contact || {};
  var sessionId = cfg.sessionId || (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  var pageLoadedAt = Date.now();

  // ── Tracking attribution publicitaire ────────────────────────────────────
  // A la 1re visite avec un click ID dans l'URL (gclid de Google Ads,
  // fbclid de Meta, etc.), on stocke l'ID dans un cookie 90 jours pour
  // pouvoir le retrouver lors d'une soumission de form ulterieure (meme
  // sur une autre page du site, meme apres navigation).
  var AD_CLICK_PARAMS = ["gclid", "gbraid", "wbraid", "fbclid", "msclkid", "ttclid", "li_fat_id", "sccid"];
  var COOKIE_TTL_DAYS = 90;

  function setCookie(name, value, days) {
    try {
      var d = new Date();
      d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
      // Cookie sur le domaine racine pour qu'il survive aux sous-domaines
      var host = window.location.hostname;
      var parts = host.split(".");
      var domain = parts.length > 1 ? "." + parts.slice(-2).join(".") : host;
      document.cookie = name + "=" + encodeURIComponent(value) +
        ";expires=" + d.toUTCString() +
        ";path=/;domain=" + domain + ";SameSite=Lax";
    } catch (_e) {}
  }

  function getCookie(name) {
    try {
      var prefix = name + "=";
      var cookies = document.cookie.split(";");
      for (var i = 0; i < cookies.length; i++) {
        var c = cookies[i].trim();
        if (c.indexOf(prefix) === 0) {
          return decodeURIComponent(c.substring(prefix.length));
        }
      }
    } catch (_e) {}
    return null;
  }

  function captureAdClickIds() {
    try {
      var u = new URL(window.location.href);
      for (var i = 0; i < AD_CLICK_PARAMS.length; i++) {
        var k = AD_CLICK_PARAMS[i];
        var v = u.searchParams.get(k);
        if (v) {
          // First-touch wins : si le cookie existe deja, on ne l'ecrase pas
          // (sinon une nav interne avec ?gclid= du dernier clic ecraserait
          // l'attribution initiale). On garde le 1er clic.
          if (!getCookie("_dpa_" + k)) {
            setCookie("_dpa_" + k, v, COOKIE_TTL_DAYS);
          }
        }
      }
    } catch (_e) {}
  }

  function getAttributionPayload() {
    var out = {};
    for (var i = 0; i < AD_CLICK_PARAMS.length; i++) {
      var k = AD_CLICK_PARAMS[i];
      var fromUrl = getUtm(k);
      var fromCookie = getCookie("_dpa_" + k);
      if (fromUrl || fromCookie) out[k] = fromUrl || fromCookie;
    }
    return out;
  }

  // Capture des le 1er chargement (avant tout submit / click)
  captureAdClickIds();

  // Expose la fonction pour les forms internes (FormRenderer)
  window.DiplomaAttribution = { get: getAttributionPayload };

  function basePayload(eventName, extra) {
    var out = {
      event_name: eventName,
      occurred_at: new Date().toISOString(),
      page_url: window.location.href,
      page_title: document.title || null,
      referrer: document.referrer || null,
      utm_source: getUtm("utm_source"),
      utm_medium: getUtm("utm_medium"),
      utm_campaign: getUtm("utm_campaign"),
      attribution: getAttributionPayload(),
      session_id: sessionId,
      event_id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      site: site,
      contact: contact,
      metadata: extra || null
    };
    return out;
  }

  function getUtm(name) {
    try {
      var u = new URL(window.location.href);
      return u.searchParams.get(name);
    } catch (_e) {
      return null;
    }
  }

  function send(payload) {
    var body = JSON.stringify(payload);
    var headers = { "Content-Type": "application/json" };
    if (token) headers["X-Tracking-Token"] = token;

    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([body], { type: "application/json" });
        if (token) {
          fetch(endpoint, { method: "POST", headers: headers, body: body, keepalive: true }).catch(function () {});
        } else {
          navigator.sendBeacon(endpoint, blob);
        }
        return;
      } catch (_e) {}
    }
    fetch(endpoint, { method: "POST", headers: headers, body: body, keepalive: true }).catch(function () {});
  }

  function track(eventName, extra) {
    send(basePayload(eventName, extra));
  }

  document.addEventListener("click", function (ev) {
    var el = ev.target;
    if (!el) return;
    var target = el.closest("a,button,[data-track-event]");
    if (!target) return;

    var eventName = target.getAttribute("data-track-event");
    if (!eventName) {
      if (target.tagName === "A") eventName = "link_click";
      else if (target.tagName === "BUTTON") eventName = "button_click";
      else eventName = "element_click";
    }

    track(eventName, {
      text: (target.innerText || "").trim().slice(0, 180),
      href: target.tagName === "A" ? target.getAttribute("href") : null,
      id: target.id || null,
      classes: target.className || null
    });
  }, { capture: true });

  document.addEventListener("submit", function (ev) {
    var form = ev.target;
    if (!form || !form.tagName) return;
    track("form_submit", {
      form_id: form.id || null,
      form_name: form.getAttribute("name") || null,
      form_action: form.getAttribute("action") || null
    });
  }, { capture: true });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      var seconds = Math.max(0, Math.round((Date.now() - pageLoadedAt) / 1000));
      track("page_leave", { seconds_on_page: seconds });
    }
  });

  track("page_view", { path: window.location.pathname });

  window.DiplomaTracker = {
    track: track,
    setContact: function (next) {
      contact = next || {};
    },
    setToken: function (nextToken) {
      token = nextToken || "";
    }
  };
})();
