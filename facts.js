/* facts.js — every fact lives here. No build step, no database.
 *
 * To add one, copy this shape, fill it in, save, refresh:
 *
 *   {
 *     id: "plato-socrates",                  // the URL becomes index.html#plato-socrates
 *     question: "Who was the teacher, Plato or Socrates?",
 *     answer:   "Socrates was the teacher.",
 *     detail:   "One or two extra sentences, if you have them.",
 *     yesNoAnswer: "Only shown when you ask this as a yes/no question.",
 *     keywords: ["plato", "socrates", "teacher", "student", "greek", "philosophy"],
 *     tags:     ["philosophy", "history"]
 *   }
 *
 * keywords are the whole search engine. Put the words you'd actually type in,
 * including the wrong guesses you keep making.
 *
 * yesNoAnswer is optional. If your fact matches a yes/no question ("was socrates
 * the teacher of plato?"), this sentence gets shown instead of letting a guess
 * answer it. Write it yourself. A hash cannot tell which way you're asking.
 */

window.FACTS = [
  {
    id: "plato-socrates",
    question: "Who was the teacher, Plato or Socrates?",
    answer: "Socrates was the teacher. Plato was the student.",
    detail: "The chain runs Socrates → Plato → Aristotle → Alexander the Great, in that order. Socrates never wrote a word down; we mostly know him through Plato's dialogues. That's exactly why the two blur together in your head.",
    yesNoAnswer: "If you're asking whether Socrates taught Plato: yes. If you're asking whether Plato taught Socrates: no. Socrates was the older one, and he came first.",
    keywords: [
      "plato", "socrates", "teacher", "student", "taught", "teach",
      "greek", "greece", "athens", "philosophy", "philosopher",
      "aristotle", "alexander", "dialogues", "old", "ancient"
    ],
    tags: ["philosophy", "history"]
  }

  // Add the next thing you forgot right here. Trailing comma on the line above.
];
