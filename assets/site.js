/* IridescentCraft wiki site: navigation drawer, page/heading search, code copy.
   No dependencies, no network requests: the search index is a static script. */
(function () {
  "use strict";
  var doc = document.documentElement;
  var root = doc.getAttribute("data-root") || "";
  var body = document.body;

  /* ---- Navigation drawer (small screens) ---------------------------- */
  var toggle = document.querySelector(".nav-toggle");
  var sidebar = document.getElementById("sidebar");
  var scrim = document.querySelector(".scrim");

  function setNav(open) {
    body.classList.toggle("nav-open", open);
    if (toggle) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Hide navigation" : "Show navigation");
    }
  }
  if (toggle) {
    toggle.addEventListener("click", function (ev) {
      ev.preventDefault(); // the href="#sidebar" fallback is for no-JS only
      setNav(!body.classList.contains("nav-open"));
    });
  }
  if (scrim) {
    scrim.addEventListener("click", function (ev) { ev.preventDefault(); setNav(false); });
  }
  if (sidebar) {
    sidebar.addEventListener("click", function (ev) {
      if (ev.target.closest && ev.target.closest("a")) setNav(false);
    });
  }
  if (location.hash === "#sidebar") {
    history.replaceState(null, "", location.pathname + location.search);
    setNav(true);
  }

  /* ---- Search ------------------------------------------------------- */
  var input = document.getElementById("search");
  var list = document.getElementById("search-results");
  var index = window.SEARCH_INDEX || [];
  var active = -1;
  var results = [];

  function fold(s) {
    // Lower-case, drop accents, and turn punctuation into spaces one for one
    // (so "boss rush" finds "boss-rush" and highlight offsets still line up).
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ");
  }
  for (var i = 0; i < index.length; i++) {
    index[i].ft = fold(index[i].t);
    index[i].fp = fold(index[i].p || "");
  }
  function esc(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function highlight(text, terms) {
    var f = fold(text);
    var marks = [];
    terms.forEach(function (t) {
      var at = f.indexOf(t);
      if (at >= 0) marks.push([at, at + t.length]);
    });
    if (!marks.length || f.length !== text.length) return esc(text);
    marks.sort(function (a, b) { return a[0] - b[0]; });
    var out = "", pos = 0;
    marks.forEach(function (m) {
      if (m[0] < pos) return;
      out += esc(text.slice(pos, m[0])) + "<mark>" + esc(text.slice(m[0], m[1])) + "</mark>";
      pos = m[1];
    });
    return out + esc(text.slice(pos));
  }
  function search(q) {
    var terms = fold(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    var hits = [];
    var whole = terms.join(" ");
    for (var i = 0; i < index.length; i++) {
      var e = index[i];
      var hay = e.ft + " " + e.fp;
      var ok = true, inTitle = 0;
      for (var j = 0; j < terms.length; j++) {
        if (hay.indexOf(terms[j]) < 0) { ok = false; break; }
        if (e.ft.indexOf(terms[j]) >= 0) inTitle++;
      }
      if (!ok) continue;
      var score = inTitle * 10;
      if (e.ft === whole) score += 60;
      else if (e.ft.indexOf(whole) === 0) score += 35;
      else if (e.ft.indexOf(whole) >= 0) score += 15;
      if (e.k === 0) score += 25;
      else if (e.k === 2) score += 4;
      hits.push({ e: e, s: score, i: i });
    }
    hits.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
    return hits.slice(0, 30).map(function (h) { return h.e; });
  }
  function render(q) {
    var terms = fold(q).split(/\s+/).filter(Boolean);
    results = search(q);
    active = results.length ? 0 : -1;
    if (!q.trim()) { close(); return; }
    if (!results.length) {
      list.innerHTML = '<li class="empty" role="option" aria-disabled="true">No page or heading matches “' + esc(q) + "”</li>";
    } else {
      list.innerHTML = results.map(function (e, n) {
        var kind = e.k === 0 ? '<span class="r-kind">page</span>' : "";
        var ctx = e.k === 0 ? "" : '<span class="r-p">' + esc(e.p) + "</span>";
        return '<li role="option" id="sr-' + n + '"' + (n === 0 ? ' aria-selected="true"' : "") + '><a href="' +
          esc(root + e.u) + '"><span class="r-t">' + highlight(e.t, terms) + kind + "</span>" + ctx + "</a></li>";
      }).join("");
    }
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    if (active >= 0) input.setAttribute("aria-activedescendant", "sr-0");
  }
  function close() {
    list.hidden = true;
    list.innerHTML = "";
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  }
  function move(delta) {
    if (!results.length) return;
    var items = list.querySelectorAll("li[role=option]");
    if (items[active]) items[active].removeAttribute("aria-selected");
    active = (active + delta + results.length) % results.length;
    items[active].setAttribute("aria-selected", "true");
    items[active].scrollIntoView({ block: "nearest" });
    input.setAttribute("aria-activedescendant", "sr-" + active);
  }
  if (input && list) {
    input.addEventListener("input", function () { render(input.value); });
    input.addEventListener("focus", function () { if (input.value.trim()) render(input.value); });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowDown") { ev.preventDefault(); move(1); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); move(-1); }
      else if (ev.key === "Enter") {
        if (active >= 0 && results[active]) {
          ev.preventDefault();
          var href = root + results[active].u;
          close();
          input.blur();
          location.href = href;
        }
      } else if (ev.key === "Escape") {
        if (input.value) { input.value = ""; close(); } else { input.blur(); }
      }
    });
    list.addEventListener("click", function (ev) {
      if (ev.target.closest && ev.target.closest("a")) { close(); input.blur(); }
    });
    document.addEventListener("click", function (ev) {
      if (!ev.target.closest || !ev.target.closest(".search")) close();
    });
    document.addEventListener("keydown", function (ev) {
      var t = ev.target;
      var typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (ev.key === "/" && !typing && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ev.preventDefault();
        input.focus();
        input.select();
      } else if (ev.key === "Escape" && body.classList.contains("nav-open")) {
        setNav(false);
      }
    });
  }

  /* ---- Copy buttons on code blocks ---------------------------------- */
  if (navigator.clipboard && window.isSecureContext) {
    document.querySelectorAll(".prose .code").forEach(function (block) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-btn";
      btn.textContent = "Copy";
      btn.addEventListener("click", function () {
        var code = block.querySelector("code");
        navigator.clipboard.writeText(code ? code.textContent : "").then(function () {
          btn.textContent = "Copied";
          setTimeout(function () { btn.textContent = "Copy"; }, 1500);
        }, function () { btn.textContent = "Copy failed"; });
      });
      block.appendChild(btn);
    });
  }
})();
