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

  /* ---- answer engine: an on-device model on WebGPU, or the built-in guesser ---- */

  var ENGINE_AI = "ai";
  var ENGINE_LOCAL = "local";
  var currentEngine = ENGINE_AI; // always starts here; nothing is remembered between visits

  /* The model runs in this tab through transformers.js + WebGPU. Nothing is
   * uploaded; the weights download once (~260 MB) and the browser caches them.
   * Swap MODEL_ID/MODEL_MB for a bigger one (onnx-community/Qwen2.5-0.5B-Instruct,
   * ~460 MB) if you want better answers. */
  var TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/+esm";
  var MODEL_ID = "HuggingFaceTB/SmolLM2-360M-Instruct";
  var MODEL_DTYPE = "q4f16";
  var MODEL_LABEL = "SmolLM2-360M";
  var MODEL_MB = 260;

  var SYSTEM_PROMPT =
    "You are the memory of a forgetful person. Answer in one to three short " +
    "sentences, plainly and directly. If you do not know, say so in a few words. " +
    "Do not restate the question.";

  var aiLib = null;        // the transformers.js module, once imported
  var aiGenerator = null;  // the loaded pipeline
  var aiLoad = null;       // in-flight load promise
  var aiProgress = [];     // progress listeners waiting on the in-flight load
  var aiSeq = 0;           // guards against stale answers
  var aiQueue = Promise.resolve(); // serializes generations (warm-up vs. real question)
  var aiWarming = false;   // a background preload is running
  var aiWarmed = false;    // the model is loaded and its pipelines compiled
  var aiBusyWithQuestion = false; // a real question is being answered (keep the status quiet)

  function hasWebGPU() {
    return typeof navigator !== "undefined" &&
      !!navigator.gpu &&
      typeof navigator.gpu.requestAdapter === "function";
  }

  function checkWebGPU() {
    if (!hasWebGPU()) return Promise.reject({ code: "no-webgpu" });
    return navigator.gpu.requestAdapter().then(function (adapter) {
      if (!adapter) throw { code: "no-webgpu" };
      return true;
    });
  }

  function loadModel(onProgress) {
    if (aiGenerator) return Promise.resolve(aiGenerator);
    if (onProgress) aiProgress.push(onProgress);
    if (aiLoad) return aiLoad;
    aiLoad = checkWebGPU()
      .then(function () { return import(TRANSFORMERS_URL); })
      .then(function (mod) {
        aiLib = mod;
        mod.env.allowLocalModels = false;
        mod.env.useBrowserCache = true;
        return mod.pipeline("text-generation", MODEL_ID, {
          device: "webgpu",
          dtype: MODEL_DTYPE,
          progress_callback: function (p) {
            for (var i = 0; i < aiProgress.length; i++) {
              try { aiProgress[i](p); } catch (e) {}
            }
          }
        });
      })
      .then(function (gen) {
        aiGenerator = gen;
        aiProgress = [];
        return gen;
      })
      .catch(function (err) {
        aiLoad = null;
        aiProgress = [];
        throw err;
      });
    return aiLoad;
  }

  /* One pipeline, one generation at a time. The background warm-up and a real
   * question must not run on the same session together. */
  function generate(gen, messages, opts) {
    var run = aiQueue.then(function () { return gen(messages, opts); });
    aiQueue = run.then(function () {}, function () {});
    return run;
  }

  function setStatus(msg) {
    if (!els.engineStatus) return;
    els.engineStatus.textContent = msg || "";
  }

  /* Preload: fetch the runtime, the weights, and build the WebGPU session before
   * anyone asks. A one-token run compiles the GPU pipelines too. */
  function warmAI() {
    if (currentEngine !== ENGINE_AI) return;
    if (!hasWebGPU()) return;
    if (aiWarmed || aiWarming) return;
    if (aiBusyWithQuestion) return;
    if (aiGenerator) { aiWarmed = true; return; }

    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || "") || c.effectiveType === "3g")) return;
    if (typeof navigator.deviceMemory === "number" && navigator.deviceMemory > 0 && navigator.deviceMemory < 4) return;

    aiWarming = true;
    setStatus("loading " + MODEL_LABEL + "…");

    loadModel(function (p) {
      if (!aiWarming || currentEngine !== ENGINE_AI) return;
      if (p && p.status === "progress" && typeof p.progress === "number") {
        setStatus("loading " + MODEL_LABEL + "… " + Math.round(p.progress) + "%");
      }
    })
      .then(function (gen) {
        if (currentEngine !== ENGINE_AI) return;
        return generate(gen, [{ role: "user", content: "hi" }], {
          max_new_tokens: 1,
          do_sample: false
        });
      })
      .then(function () {
        aiWarming = false;
        aiWarmed = true;
        if (aiBusyWithQuestion) {
          setStatus("");
        } else {
          setStatus("model ready");
          setTimeout(function () { if (!aiBusyWithQuestion) setStatus(""); }, 4000);
        }
      })
      .catch(function () {
        aiWarming = false;
        setStatus("");
      });
  }

  function scheduleWarm() {
    var run = function () { warmAI(); };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 3000 });
    } else {
      setTimeout(run, 1500);
    }
  }

  function oracleWeights(query) {
    var q = String(query || "").trim();
    if (!q) {
      var r0 = mulberry32(0x1234567)();
      var y0 = 0.05 + r0 * 0.9;
      var c0 = Math.max(y0, 1 - y0);
      return { verdict: y0 >= 0.5 ? "yes" : "no", confidence: c0, yes: y0, source: "weights" };
    }
    var tokens = tokenize(q);
    if (tokens.length === 0) {
      var r1 = mulberry32(hashSeed(q))();
      var y1 = 0.05 + r1 * 0.9;
      var c1 = Math.max(y1, 1 - y1);
      return { verdict: y1 >= 0.5 ? "yes" : "no", confidence: c1, yes: y1, source: "weights" };
    }
    var items = tokens.slice();
    items = items.concat(ngrams(tokens, 2));
    items = items.concat(ngrams(tokens, 3));
    items = items.concat(ngrams(tokens, 4));
    var rngBase = mulberry32(hashSeed(q));
    var bias = (rngBase() - 0.5) * 0.35;
    var score = bias;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t === "not" || t === "no" || t === "never" || t === "none" || t === "nothing" || t === "nor" || t === "neither") score -= 0.4;
      if (t.indexOf("n't") !== -1 || t === "dont" || t === "doesnt" || t === "didnt" || t === "cant" || t === "wont") score -= 0.4;
    }
    for (var j = 0; j < items.length; j++) {
      var tok = items[j];
      var w = weightString(rngBase, tok);
      var pos = j / Math.max(1, items.length);
      var p = 1;
      var parts = tok.split(" ");
      for (var k = 0; k < parts.length; k++) {
        var pk = parts[k];
        if (pk === "not" || pk === "no" || pk === "never" || pk.indexOf("n't") !== -1) p *= -1;
      }
      score += w * (0.9 + 0.3 * (1 - pos)) * p;
    }
    score = score / (1 + Math.log(tokens.length + 1) / 3);
    if (score > 3.8) score = 3.8;
    if (score < -3.8) score = -3.8;
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
    engine: document.getElementById("engine"),
    engineStatus: document.getElementById("engine-status")
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
      if (f && f.question && normalize(f.question) === nq) return f;
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

  function renderFact(query, fact) {
    els.result.textContent = "";
    var card = el("article", "card");
    card.appendChild(askedLine(query));
    card.appendChild(el("p", "answer", fact.answer));
    if (fact.detail) card.appendChild(el("p", "detail", fact.detail));
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
    var detail = "AI-ish guess (deterministic): turns words, bigrams, trigrams, 4-grams into weights, handles simple negation, normalizes by length, adds a tiny bias, maps through sigmoid. Same question -> same answer. Invented behavior, not evidence.";
    card.appendChild(el("p", "detail", detail));
    var meta = el("p", "meta");
    meta.appendChild(el("span", "badge", "built-in"));
    meta.appendChild(el("span", "meta-note", "no network, no model — just word weights"));
    card.appendChild(meta);
    els.result.appendChild(card);
    document.title = o.verdict.toUpperCase() + " — i forgot again";
  }

  function tidyModelText(s) {
    return String(s || "")
      .replace(/\*\*/g, "")
      .replace(/\r\n/g, "\n")
      .trim();
  }

  function aiMeta() {
    var meta = el("p", "meta");
    meta.appendChild(el("span", "badge", "AI model"));
    meta.appendChild(el("span", "meta-note", MODEL_LABEL + " · WebGPU · runs on your device"));
    return meta;
  }

  /* Build the card up front, then fill it in as the model downloads and streams. */
  function renderAIShell(query) {
    els.result.textContent = "";
    var card = el("article", "card ai");
    card.appendChild(askedLine(query));
    var text = el("p", "ai-text thinking", "loading " + MODEL_LABEL + "…");
    card.appendChild(text);
    var bar = el("div", "bar ai-bar");
    bar.setAttribute("aria-hidden", "true");
    var fill = el("span", "fill");
    bar.appendChild(fill);
    card.appendChild(bar);
    var note = el("p", "ai-note", "first run downloads about " + MODEL_MB + " MB; the browser caches it after that");
    card.appendChild(note);
    card.appendChild(aiMeta());
    els.result.appendChild(card);
    return { query: query, text: text, bar: bar, fill: fill, note: note, buffer: "", done: false };
  }

  function setNote(st, msg) {
    if (st.note) st.note.textContent = msg == null ? "" : msg;
  }

  function appendStream(st, chunk) {
    if (st.done) return;
    if (st.text.classList.contains("thinking")) st.text.classList.remove("thinking");
    st.buffer += chunk;
    st.text.textContent = st.buffer;
  }

  function finishAI(st) {
    st.done = true;
    st.text.classList.remove("thinking");
    var clean = tidyModelText(st.buffer);
    st.text.textContent = clean || "(the model had nothing to say)";
    if (st.bar && st.bar.parentNode) st.bar.parentNode.removeChild(st.bar);
    setNote(st, "");
    document.title = st.query + " — i forgot again";
  }

  function renderAIError(query, err) {
    els.result.textContent = "";
    var card = el("article", "card ai ai-error");
    card.appendChild(askedLine(query));
    var message;
    if (err && err.code === "no-webgpu") {
      message = "This browser has no WebGPU, so the on-device model can't run. A recent desktop Chrome or Edge can; the built-in always works.";
    } else if (err && err.name === "TypeError") {
      message = "Couldn't load the model library. Check your connection — the code and weights come from a CDN the first time.";
    } else {
      message = "The model failed to run" + (err && err.message ? " (" + err.message + ")" : "") + ".";
    }
    card.appendChild(el("p", "ai-text", message));
    var again = el("p", "suggest");
    var retry = el("button", null, "try again");
    retry.type = "button";
    retry.addEventListener("click", function () { ask(query); });
    again.appendChild(retry);
    again.appendChild(document.createTextNode(" or "));
    var swap = el("button", null, "use the built-in");
    swap.type = "button";
    swap.addEventListener("click", function () { setEngine(ENGINE_LOCAL); ask(query); });
    again.appendChild(swap);
    card.appendChild(again);
    card.appendChild(aiMeta());
    els.result.appendChild(card);
    document.title = query + " — i forgot again";
  }

  function askAI(query) {
    var seq = aiSeq;
    var st = renderAIShell(query);
    aiBusyWithQuestion = true;
    setStatus("");

    loadModel(function (p) {
      if (seq !== aiSeq) return;
      if (p && p.status === "progress" && typeof p.progress === "number") {
        var pct = Math.max(0, Math.min(100, Math.round(p.progress)));
        st.text.textContent = "loading " + MODEL_LABEL + "… " + pct + "%";
        st.fill.style.width = pct + "%";
        setNote(st, p.file ? "downloading " + p.file : "downloading the model");
      } else if (p && p.status === "ready") {
        st.text.textContent = "warming up…";
        st.fill.style.width = "100%";
      }
    })
      .then(function (gen) {
        if (seq !== aiSeq) return;
        st.text.textContent = "";
        if (st.fill) st.fill.style.width = "100%";
        setNote(st, "");
        var streamer = new aiLib.TextStreamer(gen.tokenizer, {
          skip_prompt: true,
          skip_special_tokens: true,
          callback_function: function (chunk) {
            if (seq !== aiSeq) return;
            appendStream(st, chunk);
          }
        });
        var messages = [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: query }
        ];
        return generate(gen, messages, {
          max_new_tokens: 220,
          do_sample: true,
          temperature: 0.6,
          top_p: 0.9,
          repetition_penalty: 1.1,
          streamer: streamer
        });
      })
      .then(function () {
        aiBusyWithQuestion = false;
        aiWarmed = true;
        aiWarming = false;
        if (seq !== aiSeq) return;
        finishAI(st);
      })
      .catch(function (err) {
        aiBusyWithQuestion = false;
        if (seq !== aiSeq) return;
        if (err && err.name === "AbortError") return;
        renderAIError(query, err);
      });
  }

  function renderBlank(query) {
    els.result.textContent = "";
    var blank = el("div", "blank");
    blank.appendChild(el("p", "blank-title", "I forgot that one too."));
    blank.appendChild(el("p", "blank-sub", "Try asking it differently, or write it down in facts.js."));
    els.result.appendChild(blank);
    document.title = "i forgot again";
  }

  function clear() {
    aiSeq++;
    els.result.textContent = "";
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    document.title = "i forgot again";
  }

  function ask(raw) {
    var q = (raw == null ? els.input.value : raw).trim();
    if (!q) { clear(); return; }
    if (els.input.value !== q) els.input.value = q;
    aiSeq++; // any new question cancels a model answer still in flight
    var fact = findFact(q);
    if (fact) {
      renderFact(q, fact);
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
      return;
    }
    if (currentEngine === ENGINE_AI) {
      askAI(q);
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
      return;
    }
    if (looksYesNo(q)) {
      renderOracle(q, oracleWeights(q));
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
      return;
    }
    renderBlank(q);
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }

  function renderEngine() {
    if (!els.engine) return;
    var opts = els.engine.querySelectorAll(".engine-opt");
    for (var i = 0; i < opts.length; i++) {
      var on = opts[i].getAttribute("data-engine") === currentEngine;
      opts[i].classList.toggle("is-on", on);
      opts[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function setEngine(mode) {
    if (mode !== ENGINE_AI && mode !== ENGINE_LOCAL) return;
    currentEngine = mode;
    aiSeq++;
    renderEngine();
    if (mode === ENGINE_LOCAL) {
      setStatus("");
    } else {
      scheduleWarm();
    }
  }

  els.form.addEventListener("submit", function (e) { e.preventDefault(); ask(); });

  // start loading the model as soon as someone shows intent to ask
  if (els.input) {
    var warmOnIntent = function () { scheduleWarm(); };
    els.input.addEventListener("focus", warmOnIntent, { once: true });
    els.input.addEventListener("pointerdown", warmOnIntent, { once: true });
  }

  if (els.engine) {
    els.engine.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest(".engine-opt") : null;
      if (!btn) return;
      var mode = btn.getAttribute("data-engine");
      if (mode === currentEngine) return;
      setEngine(mode);
      if (els.input.value.trim()) ask();
    });
  }
  renderEngine();
  scheduleWarm();

  var hash = location.hash.slice(1);
  if (hash) {
    var decoded;
    try {
      decoded = decodeURIComponent(hash);
    } catch (e) {
      decoded = hash;
    }
    els.input.value = decoded;
    ask(decoded);
  }
})();
