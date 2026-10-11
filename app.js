/* app.js — the whole app. Reads window.FACTS, matches what you type, draws the answer.
 *
 * Three paths, in priority order:
 *
 *   1. a fact matches            -> the fact, from facts.js
 *   2. else, a yes/no question   -> the oracle: a verdict plus a probability
 *   3. else                      -> a blank stare
 *
 * ---------------------------------------------------------------------------
 * STEP 2 GOES HERE.
 * The oracle below is a hash, not an opinion. It cannot know anything. To make
 * it real, swap the body of oracle() for a call into a light in-browser model
 * (Transformers.js / WebLLM) and keep the same return shape:
 *     { verdict: "yes" | "no", confidence: 0..1, yes: 0..1, source: "model" }
 * Everything downstream reads that shape, so nothing else has to change.
 * ---------------------------------------------------------------------------
 *
 * Matching is deliberately dumb and offline: exact keyword hits score highest,
 * partial hits score lower, and words in the question text score a little.
 * Nothing you type ever leaves the page.
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

  /* A question is yes/no if it opens with one of these. Keys are the letters
     only, so "isn't" and "won't" fold down to "isnt" and "wont". */
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

  function firstWord(text) {
    var m = String(text).toLowerCase().match(/[a-z']+/);
    return m ? m[0].replace(/['\u2019]/g, "") : "";
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

  function looksYesNo(text) {
    var raw = String(text == null ? "" : text).trim();
    if (!raw) return false;
    if (/\bor not\b/i.test(raw)) return true;
    return !!YESNO_HEADS[firstWord(raw)];
  }

  function looksWh(text) {
    return !!WH_HEADS[firstWord(text)];
  }

  /* ---------------------------------------------------------------------------
     THE ORACLE (step 1)
     A deterministic hash. Same words in, same answer out, forever. It is honest
     about being arbitrary, and it never claims more than 95% certainty, because
     something with no knowledge has no business being sure.
     --------------------------------------------------------------------------- */

  function hash32(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  function oracle(question) {
    var key = normalize(question);
    var u = hash32(key) / 4294967296;           // 0 .. 1, stable per question
    var yes = 0.05 + u * 0.90;                  // 5% .. 95%, never certain
    var verdict = yes >= 0.5 ? "yes" : "no";
    return {
      verdict: verdict,
      confidence: verdict === "yes" ? yes : 1 - yes,
      yes: yes,
      source: "hash"
    };
  }

  /* ---------- scoring ---------- */

  function scoreFact(fact, terms) {
    var keywords = (fact.keywords || []).map(normalize);
    var haystack = normalize(
      [fact.question, fact.answer, fact.detail, (fact.tags || []).join(" ")].join(" ")
    );
    var total = 0;

    for (var i = 0; i < terms.length; i++) {
      var term = terms[i];
      var best = 0;

      for (var k = 0; k < keywords.length; k++) {
        if (keywords[k] === term) { best = PRESET; break; }
        if (best < NEAR && near(keywords[k], term)) best = NEAR;
      }

      if (!best && haystack.indexOf(term) !== -1) best = LOOSE;
      if (best) total += Math.min(best, MAX);
    }

    return total;
  }

  function find(query) {
    var terms = tokenize(query);
    if (!terms.length) return null;

    var ranked = FACTS.map(function (fact) {
      return { fact: fact, score: scoreFact(fact, terms) };
    }).sort(function (a, b) { return b.score - a.score; });

    var top = ranked[0];
    if (!top || top.score < NEAR) return null;
    return { fact: top.fact, score: top.score, confident: top.score >= PRESET };
  }

  /* ---------- rendering ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;   // never innerHTML with typed input
    return node;
  }

  function askedLine(query) {
    var p = el("p", "asked");
    if (query) {
      p.appendChild(document.createTextNode("you asked: "));
      p.appendChild(el("span", "echo", normalCase(query)));
    } else {
      p.appendChild(document.createTextNode("a thing you forgot, drawn at random"));
    }
    return p;
  }

  /* Typed input keeps the user's casing; this only tidies a leading lowercase. */
  function normalCase(text) {
    var t = String(text).trim().replace(/\s+/g, " ");
    return t.charAt(0).toLowerCase() + t.slice(1);
  }

  function clear() {
    els.result.textContent = "";
    if (location.hash) {
      history.replaceState(null, "", location.pathname + location.search);
    }
    document.title = "i forgot again";
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
      for (var i = 0; i < fact.tags.length; i++) {
        meta.appendChild(el("span", "tag", fact.tags[i]));
      }
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

    var note = el("p", "detail");
    note.appendChild(document.createTextNode(
      "No model behind this yet. It is a hash of your words, so the same question always " +
      "gets the same answer \u2014 that is a property of the code, not evidence about the " +
      "world. A real one lands next."
    ));
    card.appendChild(note);

    els.result.appendChild(card);
    document.title = o.verdict.toUpperCase() + " — i forgot again";
  }

  function renderBlank(query) {
    els.result.textContent = "";

    var blank = el("div", "blank");
    blank.appendChild(el("p", "lead", "Nothing written down for that yet."));

    if (looksWh(query)) {
      blank.appendChild(el("p", "sub",
        "I can only do two things right now: facts in facts.js, and yes/no questions. " +
        "Try flipping that into one: \u201cis \u2026 ?\u201d"));
    } else {
      blank.appendChild(el("p", "sub",
        "Which is on me, not on you. The next time you remember it, add it to facts.js."));
    }

    if (FACTS.length) {
      var suggest = el("p", "suggest");
      suggest.appendChild(document.createTextNode("Closest thing I do have: "));
      var b = el("button", null, FACTS[0].question);
      b.type = "button";
      b.addEventListener("click", function () {
        els.input.value = FACTS[0].question;
        renderFact(FACTS[0].question, FACTS[0], null);
      });
      suggest.appendChild(b);
      blank.appendChild(suggest);
    }

    els.result.appendChild(blank);
  }

  function countLabel() {
    var n = FACTS.length;
    els.count.textContent = n === 1 ? "1 thing written down" : n + " things written down";
  }

  /* ---------- the decision ---------- */

  function ask(query) {
    var cleaned = String(query == null ? "" : query).trim();
    if (!cleaned) { clear(); return; }

    var match = find(cleaned);
    var yn = looksYesNo(cleaned);

    if (match) {
      var note = (yn && match.fact.yesNoAnswer) ? match.fact.yesNoAnswer : null;
      renderFact(cleaned, match.fact, note);
      history.replaceState(null, "", "#" + match.fact.id);
      return;
    }

    if (yn) {
      renderOracle(cleaned, oracle(cleaned));
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
      return;
    }

    renderBlank(cleaned);
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }

  /* ---------- wiring ---------- */

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
    var pool = FACTS;
    if (FACTS.length > 1 && els.result.querySelector(".card")) {
      var shown = location.hash.replace("#", "");
      pool = FACTS.filter(function (f) { return f.id !== shown; });
    }
    var pick = pool[Math.floor(Math.random() * pool.length)];
    els.input.value = "";
    els.input.placeholder = pick.question;
    renderFact("", pick, null);
    history.replaceState(null, "", "#" + pick.id);
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
        renderFact(FACTS[i].question, FACTS[i], null);
        return;
      }
    }
  }

  countLabel();
  fromHash();
  els.input.focus();
})();
