(function () {
  "use strict";

  var FACTS = Array.isArray(window.FACTS) ? window.FACTS : [];

  /* ---- the answer engine: an on-device model on WebGPU ---- */

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

  /* Preload: fetch the runtime, the weights, and build the WebGPU session before
   * anyone asks. A one-token run compiles the GPU pipelines too. */
  function warmAI() {
    if (!hasWebGPU()) return;
    if (aiWarmed || aiWarming) return;
    if (aiGenerator) { aiWarmed = true; return; }

    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || "") || c.effectiveType === "3g")) return;
    if (typeof navigator.deviceMemory === "number" && navigator.deviceMemory > 0 && navigator.deviceMemory < 4) return;

    aiWarming = true;

    loadModel()
      .then(function (gen) {
        return generate(gen, [{ role: "user", content: "hi" }], {
          max_new_tokens: 1,
          do_sample: false
        });
      })
      .then(function () {
        aiWarming = false;
        aiWarmed = true;
      })
      .catch(function () {
        aiWarming = false;
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

  var els = {
    form: document.getElementById("ask"),
    input: document.getElementById("q"),
    result: document.getElementById("result")
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

  function renderFact(query, fact) {
    els.result.textContent = "";
    var card = el("article", "card");
    card.appendChild(askedLine(query));
    card.appendChild(el("p", "answer", fact.answer));
    if (fact.detail) card.appendChild(el("p", "detail", fact.detail));
    els.result.appendChild(card);
    document.title = fact.question + " — i forgot again";
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
      message = "This browser has no WebGPU, so the on-device model can't run. A recent desktop Chrome or Edge can.";
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
    card.appendChild(again);
    card.appendChild(aiMeta());
    els.result.appendChild(card);
    document.title = query + " — i forgot again";
  }

  function askAI(query) {
    var seq = aiSeq;
    var st = renderAIShell(query);

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
        aiWarmed = true;
        aiWarming = false;
        if (seq !== aiSeq) return;
        finishAI(st);
      })
      .catch(function (err) {
        if (seq !== aiSeq) return;
        if (err && err.name === "AbortError") return;
        renderAIError(query, err);
      });
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
    askAI(q);
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }

  els.form.addEventListener("submit", function (e) { e.preventDefault(); ask(); });

  // start loading the model as soon as someone shows intent to ask
  if (els.input) {
    var warmOnIntent = function () { scheduleWarm(); };
    els.input.addEventListener("focus", warmOnIntent, { once: true });
    els.input.addEventListener("pointerdown", warmOnIntent, { once: true });
  }

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
