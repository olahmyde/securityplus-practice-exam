# Security+ SY0-701 practice exam

A local study site for the CompTIA Security+ SY0-701 exam. It runs from `index.html` with no server and no install.

![The landing page: what the exam is, how it's scored, where to buy a voucher and when to book](docs/screenshots/landing.png)

- **Exams A, B and C:** 90 questions each, performance-based questions (PBQs) first, the way the real exam opens.
- **Mixed:** 30 questions from each exam, drawn fresh every time you start.
- **Study or exam mode:** check each answer as you go, or work against a 90-minute clock and review at the end.
- **Every option explained:** why the right answer is right, why each wrong one is wrong, and a link to the objective's video.
- **Drag-and-drop PBQs:** drag, or tap a choice and then tap a box. There's also a firewall-rule table.
- **Scores:** 90% and up is a pass, 75 to 89% is nearly there, and below 75% means read more. You also get a breakdown by domain, right and wrong totals across all attempts, and a retry of the questions you missed.
- **Ports flashcards:** 41 ports and protocols, VoIP included.

Progress is saved in your browser's localStorage.

## Screenshots

The screenshots use sample questions written for this README. The book's questions are not shown.

**Pick a set, and see your numbers across every attempt**

![Practice page with the four sets, overall accuracy, right and wrong counts, and past attempts with pass, nearly-there and not-yet labels](docs/screenshots/practice.png)

**Drag-and-drop PBQs, then the marked result with a note on each box**

| Answering | Checked |
| --- | --- |
| ![A PBQ with a bank of port numbers to drag onto protocols](docs/screenshots/pbq-live.png) | ![The same PBQ after checking: three right in green, one wrong in red with the right port shown](docs/screenshots/pbq.png) |

**Multiple choice, with the reason behind every option**

![A select-two question after checking, with right answers in green, the wrong pick in red, and a reason under each option](docs/screenshots/mcq.png)

**Results: pass ribbon at 90%, nearly there from 75%**

| Pass | Nearly there |
| --- | --- |
| ![Results at 100% with a gold pass ribbon](docs/screenshots/pass.png) | ![Results at 89% with a ring gauge and the weakest domain named](docs/screenshots/results.png) |

**Ports flashcards, and it works on a phone**

| Flashcards | Phone |
| --- | --- |
| ![A ports flashcard showing a port number to name](docs/screenshots/ports.png) | ![A question on a phone screen with the live right and wrong count in the top bar](docs/screenshots/mobile.png) |

## Building the question data

The questions come from **Professor Messer's SY0-701 CompTIA Security+ Practice Exams**, which is copyrighted. They are not in this repository. Build them from your own copy:

```bash
pip3 install pymupdf
python3 tools/build.py path/to/professor-messer-sy0-701-comptia-security-plus-practice-exams.pdf
```

That writes `data.js` (the 255 multiple-choice questions). The PBQs are hand-encoded in `pbq.js`, which is kept local for the same reason. Without it, the exams run with multiple choice only.

Then open `index.html` in Chrome, Safari, Firefox or Edge.

## Sources

- Questions and explanations: Professor Messer, SY0-701 Practice Exams ([professormesser.com](https://www.professormesser.com)). Get the book from him.
- Exam facts and tips on the landing page: Dion Training, SY0-701 Study Notes ([diontraining.com](https://www.diontraining.com)).

This is a personal study tool. It is not affiliated with CompTIA, Professor Messer or Dion Training.
