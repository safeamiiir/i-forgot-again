# i forgot again

A tiny notebook for the stupid-simple facts I keep forgetting.

You land on a blank prompt box. You type the half-remembered thing. If it's
written down, you get the answer. If it isn't, you get a blank stare and a note
to write it down next time.

The first entry is the one that started this: **who was the teacher, Plato or
Socrates?**

## How it works

No framework, no build step, no dependencies, no tracking. Three files do all
the work:

| File | Job |
| --- | --- |
| `facts.js` | The data. Every fact lives in one array. |
| `app.js` | The matcher. Keyword scoring, all offline. |
| `styles.css` | The look. Dark by default, light if your OS asks. |

Everything runs in the browser. Nothing you type is sent anywhere.

## Adding a fact

Open `facts.js`, copy the shape, fill it in, save, refresh. That's the whole
workflow.

```js
{
  id: "plato-socrates",                  // the URL becomes index.html#plato-socrates
  question: "Who was the teacher, Plato or Socrates?",
  answer:   "Socrates was the teacher. Plato was the student.",
  detail:   "One or two extra sentences, if you have them.",
  keywords: ["plato", "socrates", "teacher", "student", "greek", "philosophy"],
  tags:     ["philosophy", "history"]
}
```

`keywords` is the search engine. Put in the words you would actually type,
including the wrong guesses you keep making. That's why `teacher` and `student`
are in the Plato entry even though the question already contains them.

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
