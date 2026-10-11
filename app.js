(function () {
  "use strict";

  var FACTS = Array.isArray(window.FACTS) ? window.FACTS : [];

  var STOPWORDS = {
    a: 1, an: 1, and: 1, are: 1, as: 1, at: 1, be: 1, been: 1, between: 1,
    but: 1, by: 1, can: 1, did: 1, do: 1, does: 1, for: 1, from: 1, had: 1,
    has: 1, have: 1, he: 1, her: 1, him: 1, his: 1, how: 1, i: 1, if: 1,
    in: 1, into: 1, is: 1, it: 1, its: 1, me: 1, my: 1, of: 1, on: 1,
    or: 1, our: 1, she: 1, so: 1, than: 1, that: 1, the: 1, their: 1,
    them: 1, then: 1, there: 1, they: 1, this: 1, to: 1, too: 1, up: 1,
    was: 1, we: 1, were: 1, what: 1, when: 1, which: 1, who: 1, whom: 1,
    why: 1, will: 1, with: 1, you: 1, your: 1, again: 1, forgot: 1,
    forget: 1, remember: 1, knew: 1, know: 1, tell: 1, say: 1,
    please: 1, thing: 1, things: 1, name: 1, called: 1
  };

  var YESNO_HEADS = {
    is: 1, are: 1, was: 1, were: 1, am: 1, do: 1, does: 1, did: 1,
    can: 1, could: 1, will: 1, would: 1, should: 1, shall: 1, may: 1,
    might: 1, must: 1, has: 1, have: 1, had: 1, isnt: 1, arent: 1,
    wasnt: 1, werent: 1, dont: 1, doesnt: 1, didnt: 1, cant: 1, couldnt: 1,
    wont: 1, wouldnt: 1, shouldnt: 1, hasnt: 1, havent: 1, hadnt: 1
  };

  var WH_HEADS = {
    who: 1, what: 1, when: 1, where: 1, why: 1, how: 1, which: 1, whose: 1
  };

  var MAX = 10;
  var PRESET = 4;
  var NEAR = 2;
  var LOOSE = 1;

  function mulberry32(a) {
    return function () {
      var t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashSeed(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function tokenize(s) {
    return (s.toLowerCase().match(/[a-z0-9']+/g) || []);
  }

  function ngrams(tokens, n) {
    var out = [];
    for (var i = 0; i <= tokens.length - n; i++) {
      out.push(tokens.slice(i, i + n).join(" "));
    }
    return out;
  }

  function weightString(rng, str) {
    var seed = hashSeed(str) ^ 0x9e3779b9;
    var r = mulberry32(seed);
    var v = r() - 0.5;
    return v * (0.8 + str.length / 16);
  }

  function sigmoid(x) {
    if (x > 20) return 1;
    if (x < -20) return 0;
    return 1 / (1 + Math.exp(-x));
  }

  function oracle(query) {
    var q = String(query || "").trim();
    if (!q) {
      var r0 = mulberry32(0x1234567)();
      var y0 = 0.05 + r0 * 0.9;
      var c0 = Math.max(y0, 1 - y0);
      return { verdict: y0 >= 0.5 ? "yes" : "no", confidence: c0, yes: y0, source: "weights" };
    }
    var tokens = tokenize(q);
    var items = tokens.slice();
    items = items.concat(ngrams(tokens, 2));
    items = items.concat(ngrams(tokens, 3));
    var rngBase = mulberry32(hashSeed(q));
    var bias = (rngBase() - 0.5) * 0.25;
    var score = bias;
    for (var i = 0; i < items.length; i++) {
      var tok = items[i];
      var w = weightString(rngBase, tok);
      var pos = i / Math.max(1, items.length);
      score += w * (0.9 + 0.2 * (1 - pos));
    }
    if (score > 3) score = 3;
    if (score < -3) score = -3;
    var yes = sigmoid(score);
    if (yes < 0.05) yes = 0.05;
    if (yes > 0.95) yes = 0.95;
    var conf = Math.max(yes, 1 - yes);
    return { verdict: yes >= 0.5 ? "yes" : "no", confidence: conf, yes: yes, source: "weights" };
  }

  var els = {
    form: document.getElementById("ask"),
    input: document.getElementById("q"),
    result: document.getElementById("result"),
    count: document.getElementById("count"),
    random: document.getElementById("random")
  };

  function normalize(s) {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function askedLine(q) {
    var p = el("p", "asked");
    p.appendChild(el("span", null, "you asked: "));
    p.appendChild(el("span", "echo", q));
    return p;
  }

  function findFact(q) {
    var nq = normalize(q);
    if (!nq) return null;
    for (var i = 0; i < FACTS.length; i++) {
      var f = FACTS[i];
      if (!f || !f.question) continue;
      if (normalize(f.question) === nq) return f;
      if (f.id && nq === f.id) return f;
      if (f.aliases) {
        for (var a = 0; a < f.aliases.length; a++) {
          if (normalize(f.aliases[a]) === nq) return f;
        }
      }
    }
    return null;
  }

  function looksYesNo(s) {
    var t = normalize(s);
    if (!t) return false;
    if (/^(who|what|when|where|why|how)\b/.test(t)) return false;
    if (/^(is|are|am|was|were|do|does|did|can|could|should|would|will|shall|may|might|must|has|have|had|isnt|arent|wasnt|werent|dont|doesnt|didnt|cant|couldnt|wont|wouldnt|shouldnt|hasnt|havent|hadnt)\b/.test(t)) return true;
    if (/\bor\s+not\b/.test(t) || /\?$/.test(t)) return true;
    return false;
  }

  function renderFact(query, fact, verdictNote) {
    els.result.textContent = "";
    var card = el("article", "card");
    card.appendChild(askedLine(query));
    if (verdictNote) {
      var box = el("div", "verdict-note");
      box.appendChild(el("span", "vw", "yes / no"));
      box.appendChild(el("p", null, verdictNote));
      card.appendChild(box);
    }
    card.appendChild(el("p", verdictNote ? "answer secondary" : "answer", fact.answer));
    if (fact.detail) card.appendChild(el("p", "detail", fact.detail));
    if (fact.tags && fact.tags.length) {
      var meta = el("p", "meta");
      for (var i = 0; i < fact.tags.length; i++) meta.appendChild(el("span", "tag", fact.tags[i]));
      card.appendChild(meta);
    }
    els.result.appendChild(card);
    document.title = fact.question + " — i forgot again";
  }

  function renderOracle(query, o) {
    els.result.textContent = "";
    var card = el("article", "card oracle is-" + o.verdict);
    card.appendChild(askedLine(query));
    card.appendChild(el("p", "verdict", o.verdict.toUpperCase()));
    var pct = Math.round(o.confidence * 100);
    card.appendChild(el("p", "prob", pct + "% confident"));
    var bar = el("div", "bar");
    var fill = el("span", "fill");
    fill.style.width = pct + "%";
    bar.appendChild(fill);
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", o.verdict + ", " + pct + " percent confident");
    card.appendChild(bar);
    card.appendChild(el("p", "detail", "An invented guess. The code turns your words into weights, adds a tiny bias, and maps through a sigmoid. Same question → same answer. It measures nothing."));
    els.result.appendChild(card);
    document.title = o.verdict.toUpperCase() + " — i forgot again";
  }

  function renderBlank(query) {
    els.result.textContent = "";
    var blank = el("div", "blank");
    blank.appendChild(el("p", "blank-title", "I forgot that one too."));
    blank.appendChild(el("p", "blank-sub", "Try asking it differently, or add it as a fact."));
    els.result.appendChild(blank);
    document.title = "i forgot again";
  }

  function clear() {
    els.result.textContent = "";
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    document.title = "i forgot again";
  }

  function ask(raw) {
    var q = (raw == null ? els.input.value : raw).trim();
    if (!q) { clear(); return; }
    if (els.input.value !== q) els.input.value = q;
    var fact = findFact(q);
    if (fact) {
      var yn = looksYesNo(q);
      if (yn && fact.yesNoAnswer) {
        renderFact(q, fact, fact.yesNoAnswer);
        if (location.hash) history.replaceState(null, "", location.pathname + location.search);
        return;
      }
      renderFact(q, fact);
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
      return;
    }
    if (looksYesNo(q)) {
      renderOracle(q, oracle(q));
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
      return;
    }
    renderBlank(q);
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }

  function randomFact() {
    if (!FACTS.length) return;
    var f = FACTS[Math.floor(Math.random() * FACTS.length)];
    els.input.value = f.question;
    ask();
  }

  els.form.addEventListener("submit", function (e) { e.preventDefault(); ask(); });
  if (els.random) els.random.addEventListener("click", randomFact);

  function updateCount() {
    if (els.count) els.count.textContent = FACTS.length + " fact" + (FACTS.length === 1 ? "" : "s");
  }
  updateCount();

  var hash = location.hash.slice(1);
  if (hash) {
    var decoded = decodeURIComponent(hash);
    els.input.value = decoded;
    ask(decoded);
  }
})();
