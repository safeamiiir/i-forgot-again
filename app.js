/* app.js — the whole app. Reads window.FACTS, matches what you type, draws the answer.
 *
 * Matching is deliberately dumb and offline: exact keyword hits score highest,
 * partial hits score lower, and words in the question text score a little.
 * There is no AI here and nothing leaves the page.
 */

(function () {
  "use strict";

  var FACTS = Array.isArray(window.FACTS) ? window.FACTS : [];

  /* Words too common to mean anything. Keeps "who is the teacher between
     plato or socrates" from wasting points on "who" and "between". */
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

  var MAX = 10;      // score ceiling for one word, keeps one loud word from winning alone
  var PRESET = 4;    // exact keyword hit
  var NEAR = 2;      // prefix / near miss
  var LOOSE = 1;     // appeared somewhere in the question text

  var els = {
    form: document.getElementById("ask"),
    input: document.getElementById("q"),
    result: document.getElementById("result"),
    count: document.getElementById("count"),
    random: document.getElementById("random")
  };

  /* ---------- text helpers ---------- */

  function normalize(text) {
    return String(text == null ? "" : text)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")   // strip accents
      .replace(/[^a-z0-9\s']/g, " ")
      .replace(/'s\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(text) {
    var raw = normalize(text).split(" ").filter(Boolean);
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var w = raw[i];
      if (w.length < 2) continue;
      if (STOPWORDS[w]) continue;
      if (out.indexOf(w) === -1) out.push(w);
    }
    return out;
  }

  /* Cheap stemmer: enough to catch "teachers" -> "teacher". */
  function stem(word) {
    if (word.length > 4 && /ies$/.test(word)) return word.slice(0, -3) + "y";
    if (word.length > 4 && /es$/.test(word)) return word.slice(0, -2);
    if (word.length > 3 && /s$/.test(word)) return word.slice(0, -1);
    if (word.length > 4 && /ing$/.test(word)) return word.slice(0, -3);
    if (word.length > 4 && /ed$/.test(word)) return word.slice(0, -2);
    return word;
  }

  function near(a, b) {
    if (a === b) return true;
    if (a.length >= 4 && b.length >= 4) {
      if (a.indexOf(b) === 0 || b.indexOf(a) === 0) return true;
      if (stem(a) === stem(b)) return true;
    }
    return false;
  }

  /* ---------- scoring ---------- */

  function scoreFact(fact, terms) {
    var keywords = (fact.keywords || []).map(normalize);
    var haystack = normalize(
      [fact.question, fact.answer, fact.detail, (fact.tags || []).join(" ")].join(" ")
    );
    var total = 0;
    var hits = [];

    for (var i = 0; i < terms.length; i++) {
      var term = terms[i];
      var best = 0;

      for (var k = 0; k < keywords.length; k++) {
        if (keywords[k] === term) { best = PRESET; break; }
        if (best < NEAR && near(keywords[k], term)) best = NEAR;
      }

      if (!best && haystack.indexOf(term) !== -1) best = LOOSE;

      if (best) {
        best = Math.min(best, MAX);
        total += best;
        hits.push(term);
      }
    }

    return { total: total, hits: hits };
  }

  function find(query) {
    var terms = tokenize(query);
    if (!terms.length) return null;

    var ranked = FACTS.map(function (fact) {
      var s = scoreFact(fact, terms);
      return { fact: fact, score: s.total, hits: s.hits };
    }).sort(function (a, b) { return b.score - a.score; });

    var top = ranked[0];
    if (!top || top.score < NEAR) return null;

    return {
      fact: top.fact,
      score: top.score,
      confident: top.score >= PRESET,
      runnerUp: ranked[1] && ranked[1].score > 0 ? ranked[1] : null
    };
  }

  /* ---------- rendering ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;   // never innerHTML with typed input
    return node;
  }

  function clear() {
    els.result.textContent = "";
    if (location.hash) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  function render(query, match) {
    els.result.textContent = "";

    if (!match) {
      var blank = el("div", "blank");
      blank.appendChild(el("p", "lead", "Nothing written down for that yet."));
      blank.appendChild(
        el("p", "sub", "Which is on me, not on you. The next time you remember it, add it to facts.js.")
      );

      if (FACTS.length) {
        var suggest = el("p", "suggest");
        suggest.appendChild(document.createTextNode("Closest thing I do have: "));
        var b = el("button", null, FACTS[0].question);
        b.type = "button";
        b.addEventListener("click", function () {
          els.input.value = FACTS[0].question;
          render(FACTS[0].question, { fact: FACTS[0], confident: true, runnerUp: null });
        });
        suggest.appendChild(b);
        blank.appendChild(suggest);
      }
      els.result.appendChild(blank);
      return;
    }

    var fact = match.fact;
    var card = el("article", "card");

    var asked = el("p", "asked");
    if (query) {
      asked.appendChild(document.createTextNode("you asked: "));
      asked.appendChild(el("span", "echo", normalCase(query)));
    } else {
      asked.appendChild(document.createTextNode("a thing you forgot, drawn at random"));
    }
    card.appendChild(asked);

    card.appendChild(el("p", "answer", fact.answer));

    if (fact.detail) card.appendChild(el("p", "detail", fact.detail));

    if (fact.tags && fact.tags.length) {
      var meta = el("p", "meta");
      for (var i = 0; i < fact.tags.length; i++) {
        meta.appendChild(el("span", "tag", fact.tags[i]));
      }
      card.appendChild(meta);
    }

    els.result.appendChild(card);
    document.title = fact.question + " — i forgot again";
  }

  /* Typed input keeps the user's casing; this only tidies a leading lowercase. */
  function normalCase(text) {
    var t = String(text).trim().replace(/\s+/g, " ");
    return t.charAt(0).toLowerCase() + t.slice(1);
  }

  function countLabel() {
    var n = FACTS.length;
    els.count.textContent = n === 1 ? "1 thing written down" : n + " things written down";
  }

  /* ---------- wiring ---------- */

  function ask(query) {
    var cleaned = String(query == null ? "" : query).trim();
    if (!cleaned) { clear(); return; }

    var match = find(cleaned);
    render(cleaned, match);
    if (match) {
      history.replaceState(null, "", "#" + match.fact.id);
      document.title = match.fact.question + " — i forgot again";
    }
  }

  els.form.addEventListener("submit", function (event) {
    event.preventDefault();
    ask(els.input.value);
    els.input.blur();
  });

  /* Typing clears a stale answer so the page goes blank again. */
  els.input.addEventListener("input", function () {
    if (els.result.firstChild) clear();
  });

  els.input.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      els.input.value = "";
      clear();
      els.input.blur();
    }
  });

  els.random.addEventListener("click", function () {
    if (!FACTS.length) return;
    // Never repeat the fact that's already on screen.
    var pool = FACTS;
    if (FACTS.length > 1 && els.result.querySelector(".card")) {
      var shown = location.hash.replace("#", "");
      pool = FACTS.filter(function (f) { return f.id !== shown; });
    }
    var pick = pool[Math.floor(Math.random() * pool.length)];
    els.input.value = "";
    els.input.placeholder = pick.question;
    render("", { fact: pick, confident: true, runnerUp: null });
    history.replaceState(null, "", "#" + pick.id);
    document.title = pick.question + " — i forgot again";
  });

  document.addEventListener("keydown", function (event) {
    var tag = (event.target && event.target.tagName) || "";
    var typing = tag === "INPUT" || tag === "TEXTAREA";
    if (event.key === "/" && !typing) {
      event.preventDefault();
      els.input.focus();
      els.input.select();
    }
  });

  /* A shared link opens straight to its fact. */
  function fromHash() {
    var id = decodeURIComponent(location.hash.replace("#", ""));
    if (!id) return;
    for (var i = 0; i < FACTS.length; i++) {
      if (FACTS[i].id === id) {
        render(FACTS[i].question, { fact: FACTS[i], confident: true, runnerUp: null });
        return;
      }
    }
  }

  countLabel();
  fromHash();
  els.input.focus();
})();
