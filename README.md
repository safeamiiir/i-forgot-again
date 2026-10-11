# i forgot again

A tiny notebook for the stupid-simple facts I keep forgetting.

You land on a blank prompt box. You type the half-remembered thing. If you've
written it down in `facts.js`, you get that answer back. If you haven't, a small
model running in the page answers.

It ships with an empty `facts.js` on purpose. That one file is the whole
database; every fact you add lives there.

## How it works

A **fact always wins**. If what you typed matches a question in `facts.js`, you
get it. Otherwise the question goes to a small language model running in this tab
on **WebGPU**, streamed word by word.

So there are two outcomes:

1. **A fact matches** → the fact, from `facts.js`.
2. **No fact** → the on-device model's answer.

Nothing is remembered between visits.

No framework, no build step. Three local files do all the work:

| File | Job |
| --- | --- |
| `facts.js` | The data. Every fact lives in one array. |
| `app.js` | The fact matcher and the on-device model. |
| `styles.css` | The look. Dark by default, light if your OS asks. |

Everything runs in the browser, including the model. **Nothing you type is sent
anywhere.**

## The AI model

The app runs a real (if very small) language model **inside the page**, on your
GPU, using [transformers.js](https://huggingface.co/docs/transformers.js) over
WebGPU. There is no server and no API key.

- **Model:** `HuggingFaceTB/SmolLM2-360M-Instruct`, 4-bit (`q4f16`), about
  260 MB. Downloading starts in the background as soon as the page is idle, and
  the browser caches it afterward.
- **Library:** imported straight from a CDN, no bundler:
  `https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/+esm`.
- **Output:** streamed token by token into the card.

## Preloading the model

Waiting for a 260 MB download *after* you press enter feels broken, so the app
starts early:

- **Resource hints** in `index.html` (`preconnect`, `dns-prefetch`,
  `modulepreload`) begin the connection and the runtime fetch as the page loads.
- **Background warm-up.** When the page is idle — and again the moment you focus
  the input — the app loads the model and runs a one-token generation to compile
  the GPU pipelines, before you ask anything.
- **Guards.** Warm-up is skipped when there is no WebGPU, when the browser reports
  `saveData`, on `2g`/`3g` connections, or on very low-memory devices. One
  pipeline never runs two generations at once.
- **Caching.** After the first load the weights live in the browser's Cache API,
  so later visits skip the download and only pay the session build — which the
  warm-up now does for you in the background.

To turn preloading off entirely, remove the `scheduleWarm()` call at the bottom
of `app.js`.

To use a bigger, better model, change `MODEL_ID` (and `MODEL_LABEL` / `MODEL_MB`)
in `app.js`. `onnx-community/Qwen2.5-0.5B-Instruct` is a good step up
(~460 MB).

**Two things to expect.** WebGPU support is ~85% of browsers; where it is
missing (or the GPU adapter can't be created) the card says so. And "small" means
small: a 360M model answers simple questions and can be confidently wrong on
anything harder — treat it as a better guess, not an oracle.

## Adding a fact

Open `facts.js`, copy the shape, fill it in, save, refresh. That's the whole
workflow.

```js
{
  question: "Who was the teacher, Plato or Socrates?",
  answer:   "Socrates was the teacher. Plato was the student.",
  detail:   "One or two extra sentences, if you have them."
}
```

A fact has three fields and no more. `question` is what you'll type back in —
case and punctuation don't matter, and the answer only appears when the question
matches. `answer` is the reply. `detail` is the optional "more info" line under
it.

## Running it locally

There's no build, so you can just open the file:

```
open index.html
```

Or serve it if you prefer real URLs:

```
npm start          # serves on http://localhost:5173
```

## Deploying

Deployed to Vercel as a static site. Push to `main`, or run:

```
npx vercel --prod
```

## License

MIT. See `LICENSE`.
