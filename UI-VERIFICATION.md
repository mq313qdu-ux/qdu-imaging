# Student entry simplification — v1.2.1

- First-visit browser checks confirmed four directly clickable lectures, a closed secondary-tools section, no resume banner until an attempt is saved, and no sidebar or hero.
- Settings remain accessible through the tools section. A wrong answer was saved, the quiz was exited, and the conditional resume button restored the same answered question.
- Re-ran all 13 Node tests, 96 quiz cases and 113 workspace cases at 320/375/768/1280/1440/1920px in both themes. All passed. Captured and inspected the new home page at 375px and 1280px.
- Content and all core study/scoring/storage/education/speech/keyboard engines are unchanged from v1.2.0.
- No physical-device or new WebKit claim is made. Published site verification follows the same Pages workflow.

---

# QDU interface verification — v1.2.0

## Executed on 6 November 2026 (Asia/Baghdad)

- Production validation and all 13 Node tests passed, including the new tokens stylesheet and presentation module served under `/qdu-imaging/`.
- Chromium 145: **96 quiz layout cases** (six widths × two themes × four translation modes × source/long synthetic content). Widths: 320, 375, 768, 1280, 1440, 1920px. Prompt/choice minimums are 20px/16px. Measured question/choice/translation/tool contrast was at least 5.55:1; this is a sampled check, not a complete accessibility audit.
- **113 workspace cases**: home, favorites, mistakes, history, drafts, achievements, settings, results, full review/comparison, empty and load-error screens, exit and delete dialogs. No measured horizontal overflow or offscreen/undersized interactive controls. Settings persistence, favorite removal, delete cancellation and draft resume passed. The settings test waits for the asynchronous storage commit before reloading.
- Quiz interactions passed: correct/wrong answers, independent translation, keyboard selection, 600ms auto-advance, cancellation on previous, restored answers, favorites, reload/resume, exit confirmation, a real full 23/24 result, review, and exactly one historical entry after reload.
- Actual touch emulation passed in Chromium for start, translation, explanation, wrong/correct answers and auto-advance. RTL and LTR layouts passed overflow checks at 320, 768 and 1280px.
- Light/Dark/System persistence, system changes, Reduced Motion and fullscreen enter/exit passed. No JavaScript errors or failed ordinary asset requests were recorded. A deliberately intercepted HTTP 500 was used only to exercise the error view.
- Inspected before/after home and quiz captures, plus mobile dark, settings and redesigned result screenshots. Current captures wait for theme transitions to settle. Artifacts are ignored local files under `test-results/visual/` and `test-results/redesign/`.

## Preservation

`git diff v1.1.1 -- site/data` is empty: 4 lectures, 157 questions, 601 options and all enrichment remain unchanged. The quiz, study, storage, education, speech, keyboard and feedback engine files are also unchanged. UI-only helpers derive dashboard metrics from current source IDs and stored answers; they do not award points or mutate attempts. Fixtures use separate browser contexts and are never written into `site/`.

## Limits

Physical Android/iOS devices were not available. WebKit could not run because the executable required by the installed Python Playwright version was absent; no Safari result is claimed. Device voice quality was not auditioned; speech behavior is covered by mocked-voice unit tests and browser control checks. Browser testing supplements, but does not certify, accessibility across every assistive technology.

## Reproduce

Run `npm run validate -- --publish`, `npm test`, `node tools/serve.mjs 8098`, then `python tools/browser_qa.py` and `python tools/workspace_qa.py`. Python Playwright and Chromium must be installed for optional browser checks. Deployment still uploads only `site/`.

---

## Prior release: v1.1.1

## Scope

Rebuilt the quiz markup into lecture metadata, progress, prompt, education tools, choices and navigation. Retained the original QDU purple/blue palette and bundled Tajawal/Poppins fonts. Quiz card maximum width: 960px. Question text: 20–23px; choices: 16–17px. Local SVG icons use a shared 24px grid. Choice translations sit immediately below the original text, left-aligned as a group with independent RTL text direction.

No source content, correct answers, stable identifiers, storage keys, scoring code or study-history code changed. `git diff v1.1.0 -- site/data` is empty: 4 lectures, 157 questions, 601 choices.

## Executed checks

- Production validation and all 13 Node tests passed, including the newly included stylesheet and SVG sprite under `/qdu-imaging/`.
- Chromium 145: 80 measured layout cases — five widths (320, 375, 768, 1280, 1920), two themes, four translation modes and two content scenarios. Long text fixtures are intercepted only in isolated test contexts.
- No page-level horizontal overflow, overlapping tools, undersized controls or text below the specified reading minimums in these cases. Sampled question/option/translation/tool foreground contrast was at least 6.08:1; this is not a claim of a complete accessibility audit.
- Compared screenshots before and after at 375px and 1280px, and inspected additional 320px, 768px and answer-state captures. Screenshots and JSON measurements are local ignored artifacts under `test-results/visual/`.
- Browser interactions passed: translation modes without changing originals, tool panels, favorites, keyboard answer selection, correct/wrong styling, automatic advance, cancellation on previous, saved-answer restoration, reload/resume, exit confirmation and drafts. Completed a full lecture with 23 correct and 1 wrong, reviewed all 24 questions, and verified one historical attempt after reload.
- Light/Dark/System persistence, system preference changes, Reduced Motion and fullscreen enter/exit passed. No JavaScript errors or failed asset responses were recorded.

## Limits

Viewport tests used desktop Chromium emulation, not physical phones/tablets or Safari. Voice availability and sound quality depend on the device; speech logic uses mocked-voice unit tests, with browser checks of the actual control panels. No scientific explanations were added or changed.

## Reproduce

Run `npm run validate -- --publish`, `npm test`, then `node tools/serve.mjs 8098` and `python tools/browser_qa.py`. The optional browser suite requires Python Playwright and Chromium already installed. Only `site/` is uploaded by the existing Pages workflow; fixtures, tests and screenshots are excluded from the published site.
