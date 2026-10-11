# i forgot again

A tiny notebook for the stupid-simple facts I keep forgetting.

You land on a blank prompt box. You type the half-remembered thing. If it's
written down, you get the answer. If it isn't, you get a blank stare and a note
to write it down next time.

The first entry is the one that started this: **who was the teacher, Plato or
Socrates?**

## How it works

A **fact always wins**. If what you typed matches something in `facts.js`, you
get it, whatever the toggle says.

Otherwise the "answer with" toggle decides who answers:

| Side | Who answers | Notes |
| --- | --- | --- |
| **AI model** (default) | a small language model running in this tab on **WebGPU** | Answers any question. Downloads once (~260 MB), then cached. Nothing is uploaded. |
| **built-in** | the page's own word-weight guesser | A yes/no guess for yes/no questions, a blank stare for everything else. Zero download. |

So there are four outcomes, checked in order:

1. **A fact matches** → the fact, from `facts.js`.
2. **AI mode, no fact** → the on-device model's answer, streamed word by word.
3. **Built-in mode, yes/no question** → the oracle: a verdict plus a probability.
4. **Built-in mode, anything else** → a blank stare.

Your choice is remembered in `localStorage` (`ifa.engine`), so it survives a
refresh. The default is **AI model**.

No framework, no build step. Three local files do all the work:

| File | Job |
| --- | --- |
| `facts.js` | The data. Every fact lives in one array. |
| `app.js` | The matcher, the on-device model, and the word→weights oracle. |
| `styles.css` | The look. Dark by default, light if your OS asks. |

Everything runs in the browser, including the model. **Nothing you type is sent
anywhere**, by either engine.

## The built-in oracle

This is the `built-in` side of the toggle. Ask anything starting with *is / are / was / were / do / does / did / can /
could / will / would / should / has / have / had*, or anything ending in
*or not*, and you get a YES or NO with a percentage.

Be clear about what that is: **an invented guess.** The question you typed
is turned into words→weights (tokens + bigrams + trigrams), given a tiny seeded
bias, and passed through a sigmoid to get a number between 5% and 95%. Consequences worth knowing:

- The same question always gets the same answer. That's deterministic, not
  the oracle remembering anything.
- Rephrasing the question gives a different answer.
- It is capped at 95%, because something with no knowledge has no business
  being certain.

The UI says all of this out loud on the result itself. It is not pretending.

## Step 2: a very light JS "AI"

It just **turns words into weights**.

1. Normalize the question (lowercase, strip punctuation).
2. Split into tokens, also look at bigrams and trigrams.
3. Map each token/gram to a tiny deterministic weight using a seeded PRNG (same question → same weights). No network, no model files.
4. Weight by length and position (early words matter a bit more).
5. Sum into a single score, add a small seeded bias, pass through a sigmoid to get `p(yes)` between 0.05 and 0.95.
6. Clamp confidence to ≤ 95%.

It's invented behavior, not evidence about the world. The card says that out loud. No download, no build step, just plain JS.

## The AI model side

The default engine runs a real (if very small) language model **inside the
page**, on your GPU, using [transformers.js](https://huggingface.co/docs/transformers.js)
over WebGPU. There is no server and no API key.

- **Model:** `HuggingFaceTB/SmolLM2-360M-Instruct`, 4-bit (`q4f16`), about
  260 MB. It downloads the first time you ask, with a progress bar, then the
  browser caches it.
- **Library:** imported straight from a CDN, no bundler:
  `https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/+esm`.
- **Output:** streamed token by token into the card.

To use a bigger, better model, change `MODEL_ID` (and `MODEL_LABEL` / `MODEL_MB`)
in `app.js`. `onnx-community/Qwen2.5-0.5B-Instruct` is a good step up
(~460 MB). To make the offline word-weight answerer the default instead, change
the `currentEngine` initial value in `app.js` from `ENGINE_AI` to `ENGINE_LOCAL`.

**Two things to expect.** WebGPU support is ~85% of browsers; where it is
missing (or the GPU adapter can't be created) the card says so and offers the
built-in. And "small" means small: a 360M model answers simple questions and
can be confidently wrong on anything harder — treat it as a better guess, not
an oracle.



## Adding a fact

Open `facts.js`, copy the shape, fill it in, save, refresh. That's the whole
workflow.

## Adding a fact

Open `facts.js`, copy the shape, fill it in, save, refresh. That's the whole
workflow.

```js
{
  id: "plato-socrates",                  // the URL becomes index.html#plato-socrates
  question: "Who was the teacher, Plato or Socrates?",
  answer:   "Socrates was the teacher. Plato was the student.",
  detail:   "One or two extra sentences, if you have them.",
  yesNoAnswer: "Shown instead of a guess when you ask this as a yes/no question.",
  keywords: ["plato", "socrates", "teacher", "student", "greek", "philosophy"],
  tags:     ["philosophy", "history"]
}
```

`keywords` is the search engine. Put in the words you would actually type,
including the wrong guesses you keep making. That's why `teacher` and `student`
are in the Plato entry even though the question already contains them.

`yesNoAnswer` is optional and exists for one reason: a hash cannot tell whether
you meant *"was Socrates the teacher of Plato"* or *"was Plato the teacher of
Socrates"*. Both contain the same words. So when your question is a yes/no one
and it hits this fact, your hand-written sentence answers it instead of the
oracle guessing. Write it yourself.

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
