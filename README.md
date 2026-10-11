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
| `app.js` | The matcher and the very light word→weights oracle. All offline. |
| `styles.css` | The look. Dark by default, light if your OS asks. |

Everything runs in the browser. Nothing you type is sent anywhere.

## The oracle

Ask anything starting with *is / are / was / were / do / does / did / can /
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
