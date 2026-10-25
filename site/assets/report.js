/* IridescentCraft site: the "Report an issue" form (report/) and its thank-you
   page (report/sent/). Same-origin script, no dependencies.

   Without this script the form is a plain POST: the server answers 303 to
   report/sent/?n=<number> or back to report/?problem=<code>. With it, the form
   is sent with fetch (Accept: application/json, the same form-encoded body);
   the server answers {ok: true, number} or {error, problem}, and a failure is
   shown on the page with everything the visitor typed kept. */
(function () {
  "use strict";

  var PROBLEMS = {
    missing: "Fill in a title (at least 4 characters) and what happened (at least 10 characters).",
    long: "Something is too long. The limits: title 120 characters, what happened 8,000, steps 4,000, " +
      "log 50,000, version 60, contact 200. For a long log, paste only its last part, where the error is.",
    origin: "The report has to be sent from this page on iridescentcraft.sereneblossom.gay. Reload the page and send it again.",
    busy: "Too many reports from here just now. Wait a few minutes, then send it again.",
    off: "Reports can't be sent right now. Please try again later.",
    failed: "The report could not be filed just now. Wait a minute and send it again."
  };
  var BY_STATUS = { 400: "missing", 403: "origin", 413: "long", 429: "busy", 502: "failed", 503: "off" };
  var GENERIC = "The report was not sent. Check your connection and send it again.";

  function param(name) {
    var m = new RegExp("[?&]" + name + "=([^&#]*)").exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : null;
  }

  /* ---- Thank-you page ------------------------------------------------- */
  var num = document.getElementById("report-number");
  if (num) {
    var n = parseInt(param("n") || "", 10);
    if (n > 0) { // 0 is what the server tells a bot: no number to show
      num.textContent = "Report #" + n + ".";
      num.hidden = false;
    }
    return;
  }

  /* ---- Report page ---------------------------------------------------- */
  var form = document.getElementById("report-form");
  if (!form) return;
  var status = document.getElementById("report-status");
  var button = form.querySelector("button[type=submit]");
  var t = document.getElementById("t");
  if (t) t.value = String(Date.now());

  function show(message) {
    status.textContent = message;
    status.hidden = false;
    status.focus();
    if (status.scrollIntoView) status.scrollIntoView({ block: "center" });
  }

  var code = param("problem");
  if (code) show(PROBLEMS[code] || GENERIC);

  // Character counters for the fields with a limit.
  var counters = form.querySelectorAll(".count[data-for]");
  Array.prototype.forEach.call(counters, function (c) {
    var input = document.getElementById(c.getAttribute("data-for"));
    var max = input && parseInt(input.getAttribute("maxlength"), 10);
    if (!input || !max) return;
    function update() {
      var len = input.value.length;
      c.textContent = len > max * 0.8 ? len.toLocaleString() + " / " + max.toLocaleString() : "";
    }
    input.addEventListener("input", update);
    update();
  });

  if (!window.fetch || !window.URLSearchParams || !window.FormData) return; // plain POST

  var sending = false;
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (sending) return;
    if (form.reportValidity && !form.reportValidity()) return;
    sending = true;
    button.disabled = true;
    var label = button.textContent;
    button.textContent = "Sending…";
    status.hidden = true;

    var body = new URLSearchParams();
    new FormData(form).forEach(function (value, key) { body.append(key, value); });

    fetch(form.getAttribute("action"), {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: body.toString(),
      credentials: "same-origin"
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.ok && data && data.ok) {
          var n = parseInt(data.number, 10) || 0;
          location.href = form.getAttribute("action") + "sent/?n=" + n;
          return;
        }
        var code = (data && data.problem) || BY_STATUS[res.status];
        show((data && data.error) || PROBLEMS[code] || GENERIC);
        done();
      });
    }).catch(function () {
      show(GENERIC);
      done();
    });

    function done() {
      sending = false;
      button.disabled = false;
      button.textContent = label;
    }
  });
})();
