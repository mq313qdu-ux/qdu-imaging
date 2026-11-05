# QDU interface verification — v1.1.1

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
