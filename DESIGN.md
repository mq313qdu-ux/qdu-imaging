# QDU — Study Workspace

## Direction

A calm, editorial learning workspace: pale lavender canvas, ink typography, violet controls and soft mint/blue/ochre accents. Dark mode uses layered ink/plum surfaces with independently chosen foreground colors. The visual identity is QDU; content and learning engines remain independent.

The student entry page shows the subject title, a brief lecture/question count and the lecture list. A lecture opens in one click. There is no marketing hero, permanent sidebar, or visible statistics dashboard. A compact resume banner appears only when a saved attempt exists.

Secondary destinations (favorites, mistakes, history, drafts, achievements and settings) and study statistics are grouped inside a closed native details element labeled «أدوات دراستي». The same element is available outside the quiz and closes on navigation. Lecture progress is expandable and appears only after study activity. The focused quiz and result screens retain their existing behavior and visual system.

## Sources and ownership

- [UIverse](https://uiverse.io/): reference for pill switches, soft card surfaces and restrained control feedback. No third-party component source was copied.
- [Magnific icons](https://www.magnific.com/icons): reference for consistent outline icon families and vector visual language. No stock assets were downloaded or incorporated; its attribution/licensing requirements were reviewed.
- Icons, logo mark, favicon and study-card illustration are authored locally with SVG/CSS. No runtime icon/CDN/image dependencies were added. Existing bundled font licenses remain in place.

## Tokens and component contracts

- `site/css/tokens.css`: palette, semantic surfaces/text/borders, radii, shadow and spacing tokens. Dark mode overrides semantic colors rather than inverting the page.
- `site/css/qdu.css`: foundation, shell, navigation, dashboard, library, results, settings, review, dialogs and responsive rules.
- `site/css/study.css`: focused quiz layout, tools, translation, options, answer states and navigation. No responsive zoom or scale.
- `site/js/presentation.js`: original SVG helper and read-only display models. Core data, scoring, history and storage modules are unchanged.
- `site/icons.svg`: 24px viewBox, 1.65px rounded outline strokes. Decorative SVGs are aria-hidden; interactive controls retain text or accessible names.

Typography uses bundled Tajawal for Arabic and Poppins for English. Quiz prompts are 20–23px, choices 16–17px. Smaller 12–15px labels communicate supporting metadata. Space increments are 4, 8, 12, 16, 24, 32 and 48px. Primary controls have at least 44px targets. Borders and surfaces indicate grouping; text and check/cross marks identify answer states in addition to color.

English content retains its original direction/text. Iraqi Arabic translations use RTL, and choice translations sit below their English originals within one copy block. Toolbar translation modes remain independently selectable. Explanation controls become available only after answering.

## Interaction

Motion uses short color/border/opacity transitions; hover movement is small and cosmetic. Reduced Motion disables animations/transitions. The theme control cycles System → Light → Dark and communicates the current and next mode in its accessible name. Settings use labeled native checkboxes styled as switches. No visual state changes scoring rules or stored question identifiers.

## Verification

See `UI-VERIFICATION.md`. Browser screenshots/measurements are ignored local artifacts, and synthetic fixture states stay inside isolated browser contexts. Production publishing uploads only `site/`.
