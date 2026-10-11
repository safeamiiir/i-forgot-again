# i forgot again

A tiny notebook for the stupid-simple facts I keep forgetting.

You land on a blank prompt box. You type the half-remembered thing. If it's
written down, you get the answer. If it isn't, you get a blank stare and a note
to write it down next time.

The first entry is the one that started this: **who was the teacher, Plato or
Socrates?**

## How it works

Three paths, checked in order:

1. **A fact matches** → the fact, from `facts.js`.
2. **No fact, but it's a yes/no question** → the oracle: a verdict plus a probability.
3. **Neither** → a blank stare.

No framework, no build step, no dependencies, no tracking. Three files do all
the work:

| File | Job |
| --- | --- |
| `facts.js` | The data. Every fact lives in one array. |
| `app.js` | The matcher and the oracle. All offline. |
| `styles.css` | The look. Dark by default, light if your OS asks. |

Everything runs in the browser. Nothing you type is sent anywhere.

## The oracle

Ask anything starting with *is / are / was / were / do / does / did / can /
could / will / would / should / has / have / had*, or anything ending in
*or not*, and you get a YES or NO with a percentage.

Be clear about what that is: **a hash, not an opinion.** The question you typed
is hashed into a number between 5% and 95%, and the verdict follows from which
side of 50% it lands on. Consequences worth knowing:

- The same question always gets the same answer. That's the hash being stable,
  not the oracle remembering anything.
- Rephrasing the question gives a completely different answer.
- It is capped at 95%, because something with no knowledge has no business
  being certain.

The UI says all of this out loud on the result itself. It is not pretending.

## Step 2: making it real

The oracle is written as a seam. To replace it with an actual model, swap the
body of `oracle()` in `app.js` and keep the same return shape:

```js
{ verdict: "yes" | "no", confidence: 0..1, yes: 0..1, source: "model" }
```

Rendering reads only that shape, so nothing downstream changes. The realistic
options for a light model that runs in the browser:

- **Transformers.js** — a tiny open-weight model via ONNX/WASM. Works without
  WebGPU, a few tens of MB, runs offline after first load.
- **WebLLM** — a small quantized LLM on WebGPU. Much better answers, needs
  Chrome/Edge and a real download.
- **A hosted API** — smallest bundle, best answers, but it breaks the
  no-backend promise and costs money per question.

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
