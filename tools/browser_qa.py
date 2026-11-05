"""Optional browser regression suite. Requires Python Playwright + Chromium.

Run a preview server first, then: python tools/browser_qa.py [base URL]
Fixtures are intercepted in an isolated browser context, never written to site/.
Screenshots and measured results go to ignored test-results/visual/.
"""
import copy
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'test-results' / 'visual'
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8098/qdu-imaging/'
OUT.mkdir(parents=True, exist_ok=True)
QUESTIONS = json.loads((ROOT / 'site/data/questions.json').read_text(encoding='utf-8'))
ENRICHMENT = json.loads((ROOT / 'site/data/enrichment.json').read_text(encoding='utf-8'))
report = {'layouts': [], 'checks': [], 'errors': []}

MEASURE = """() => {
    const rect = el => el.getBoundingClientRect();
    const visible = el => el.getClientRects().length > 0;
    const issues = [];
    const controls = [...document.querySelectorAll('#quizSection button, #quizSection select, .utility-btn')].filter(visible);
    for (const el of controls) {
        const r = rect(el);
        if (r.height < 43.9 || r.width < 43.9) issues.push('small target: ' + (el.id || el.className));
        if (r.left < -1 || r.right > innerWidth + 1) issues.push('outside viewport: ' + (el.id || el.className));
    }
    for (const el of document.querySelectorAll('.choice-translation:not([hidden])')) {
        const original = el.parentElement.querySelector('.choice-original');
        const tr = rect(el), en = rect(original);
        if (tr.top < en.bottom - 1 || Math.abs(tr.left - en.left) > 1) issues.push('translation not below original');
        if (getComputedStyle(el).direction !== 'rtl') issues.push('translation direction');
    }
    const tools = [...document.querySelectorAll('.study-toolbar button')];
    for (let i = 0; i < tools.length; i++) for (let j = i + 1; j < tools.length; j++) {
        const a = rect(tools[i]), b = rect(tools[j]);
        if (Math.min(a.right,b.right) > Math.max(a.left,b.left) + 1 && Math.min(a.bottom,b.bottom) > Math.max(a.top,b.top) + 1) issues.push('overlapping tools');
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('horizontal overflow');
    const question = document.querySelector('#questionText');
    const choice = document.querySelector('.choice-original');
    const questionSize = parseFloat(getComputedStyle(question).fontSize);
    const optionSize = parseFloat(getComputedStyle(choice).fontSize);
    if (questionSize < 20 || optionSize < 16) issues.push('small reading text');
    if (getComputedStyle(question).direction !== 'ltr') issues.push('English direction');
    const cardWidth = rect(document.querySelector('.study-card')).width;
    if (innerWidth >= 1280 && (cardWidth < 900 || cardWidth > 1000)) issues.push('card width');
    // Check foreground contrast on the actual opaque surfaces after transitions.
    const rgb = value => (value.match(/[\\d.]+/g) || []).slice(0,3).map(Number);
    const lum = value => rgb(value).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((a,v,i) => a + v * [.2126,.7152,.0722][i],0);
    const contrast = (a,b) => (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
    const samples = [question, choice, ...document.querySelectorAll('.choice-translation:not([hidden]), .study-toolbar button')];
    let minContrast = 100;
    for (const el of samples) {
        let parent = el;
        while (parent && getComputedStyle(parent).backgroundColor === 'rgba(0, 0, 0, 0)') parent = parent.parentElement;
        const ratio = contrast(getComputedStyle(el).color, getComputedStyle(parent).backgroundColor);
        minContrast = Math.min(minContrast, ratio);
        if (ratio < 4.5) issues.push('low contrast: ' + el.className + ' ' + ratio.toFixed(2));
    }
    return {issues, cardWidth, questionSize, optionSize, minContrast};
}"""

def observe(page):
    page.on('pageerror', lambda error: report['errors'].append(str(error)))
    page.on('response', lambda response: report['errors'].append(f'{response.status} {response.url}') if response.status >= 400 else None)
    page.on('dialog', lambda dialog: dialog.accept())

def launch(page):
    page.goto(BASE)
    page.locator('.lecture-launch').first.click()
    page.evaluate('document.fonts.ready')

def state(page):
    return page.evaluate("JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('qdu:'))))")

def translation(page, mode):
    if not page.locator('#translationControls').is_visible():
        page.locator('#translationToggle').click()
    page.locator('#translationMode').select_option(mode)
    expect(page.locator('#questionTranslation')).to_be_visible() if mode in ['question', 'both'] else expect(page.locator('#questionTranslation')).to_be_hidden()
    for el in page.locator('.choice-translation').all():
        expect(el).to_be_visible() if mode in ['options', 'both'] else expect(el).to_be_hidden()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    report['browser'] = browser.version
    for scenario in ['source', 'long-fixture']:
        context = browser.new_context(viewport={'width':1280,'height':1000}, color_scheme='light')
        if scenario == 'long-fixture':
            fixture = copy.deepcopy(QUESTIONS)
            fixture[0]['text'] = ('Layout verification only: read this deliberately long question carefully, including the additional details, before selecting one of the available options. ' * 3).strip()
            for option in fixture[0]['options']:
                option['text'] = 'Layout test option with extended English text and a long-unbroken-token-' + 'x' * 100 + '. ' + 'Additional descriptive text to verify natural wrapping. ' * 3
            enriched = copy.deepcopy(ENRICHMENT)
            enriched[0]['translation'] = 'هذا نص تجريبي طويل لفحص ترتيب السؤال والتفاف السطور على الشاشة. ' * 4
            for key in enriched[0]['optionTranslations']:
                enriched[0]['optionTranslations'][key] = 'هذا اختيار تجريبي طويل لفحص عرض الترجمة العراقية أسفل النص الإنجليزي. ' * 4
            context.route('**/data/questions.json', lambda route: route.fulfill(json=fixture))
            context.route('**/data/enrichment.json', lambda route: route.fulfill(json=enriched))
        page = context.new_page()
        observe(page)
        launch(page)
        for width in [320, 375, 768, 1280, 1440, 1920]:
            page.set_viewport_size({'width':width,'height':1000})
            for theme in ['light', 'dark']:
                page.emulate_media(color_scheme=theme)
                expect(page.locator('#app')).to_have_class(__import__('re').compile(theme + '-mode'))
                for mode in ['none', 'question', 'options', 'both']:
                    translation(page, mode)
                    page.wait_for_timeout(220)
                    measured = page.evaluate(MEASURE)
                    case = {'width':width,'theme':theme,'scenario':scenario,'translation':mode,**measured}
                    report['layouts'].append(case)
                    assert not measured['issues'], case
                    if mode == 'both':
                        page.screenshot(path=str(OUT / f'{scenario}-{width}-{theme}.png'), full_page=True)
                # Actual actionability checks, not just bounding boxes.
                page.locator('#hintToggle').click()
                expect(page.locator('#hintText')).to_be_visible()
                page.locator('#hintToggle').click()
                page.locator('#speechToggle').click()
                expect(page.locator('#speechLanguage')).to_be_visible()
                page.locator('#speechLanguage').select_option('ar')
                page.locator('#speechScope').select_option('all')
                page.locator('#speechToggle').click()
                page.locator('#questionFavorite button').click()
                page.locator('#questionFavorite button').click()
        context.close()
        print(f'{scenario}: 48 responsive/translation cases passed', flush=True)

    context = browser.new_context(viewport={'width':1280,'height':1000}, color_scheme='light')
    page = context.new_page()
    observe(page)
    launch(page)
    originals = page.locator('.choice-original').all_text_contents()
    for mode in ['both','question','options','none']:
        translation(page,mode)
        assert page.locator('.choice-original').all_text_contents() == originals
    page.locator('#questionFavorite button').click()
    expect(page.locator('#questionFavorite button')).to_have_attribute('aria-pressed','true')
    page.locator('#questionText').focus()
    page.keyboard.press('ArrowDown')
    expect(page.locator('.study-option').first).to_be_focused()
    page.keyboard.press('Space')  # A is wrong in the unchanged source question.
    expect(page.locator('.study-option.incorrect')).to_have_attribute('data-option-id','a')
    expect(page.locator('.study-option.correct')).to_have_attribute('data-option-id','b')
    page.wait_for_timeout(750)
    expect(page.locator('#questionCounter')).to_have_text('السؤال 1 من 24')
    page.locator('#whyPanel summary').click()
    expect(page.locator('#whyText')).to_be_visible()
    page.screenshot(path=str(OUT/'answer-wrong.png'),full_page=True)
    page.locator('#nextQuestion').click()
    page.locator('[data-option-id="b"]').click()
    expect(page.locator('#questionCounter')).to_have_text('السؤال 3 من 24')
    page.locator('#previousQuestion').click()
    expect(page.locator('[data-option-id="b"]')).to_have_attribute('aria-pressed','true')
    assert sum(bool(a) for a in state(page)['drafts'][0]['answers']) == 2
    page.reload()
    page.locator('.lecture-launch').first.click()
    expect(page.locator('#questionCounter')).to_have_text('السؤال 2 من 24')
    assert state(page)['favorites'] == ['imaging-q001']
    assert len(state(page)['study']['latest']) == 2
    page.locator('#nextQuestion').click()
    third = QUESTIONS[2]
    page.locator('[data-option-id="'+third['correctOptionId']+'"]').click()
    page.locator('#previousQuestion').click()  # Cancel the pending correct-answer timer.
    page.wait_for_timeout(750)
    expect(page.locator('#questionCounter')).to_have_text('السؤال 2 من 24')
    page.locator('#nextQuestion').click()
    expect(page.locator('.correct')).to_have_count(1)
    page.screenshot(path=str(OUT/'answer-correct.png'),full_page=True)
    page.locator('#leaveQuiz').click()
    expect(page.locator('#exitQuiz')).to_be_visible()
    page.locator('#exitQuiz [value="leave"]').click()
    page.locator('[data-library="drafts"]').click()
    expect(page.locator('#libraryHeading')).to_be_visible()
    assert len(state(page)['drafts']) == 1
    page.locator('#libraryBack').click()
    page.locator('.lecture-launch').first.click()
    expect(page.locator('#questionCounter')).to_have_text('السؤال 3 من 24')
    # Finish a real full lecture by UI; no direct storage mutation.
    for index in range(2,24):
        expect(page.locator('#questionCounter')).to_have_text(f'السؤال {index+1} من 24')
        if index != 2:
            page.locator('[data-option-id="'+QUESTIONS[index]['correctOptionId']+'"]').click()
        page.locator('#nextQuestion').click()
    expect(page.locator('#resultsSection')).to_be_visible()
    saved = state(page)
    assert len(saved['history']) == 1 and len(saved['drafts']) == 0
    assert len(saved['study']['latest']) == 24
    assert len(saved['achievements']) == len({x['id'] for x in saved['achievements']})
    assert page.locator('#correctAnswers').inner_text() == '23'
    assert page.locator('#wrongAnswers').inner_text() == '1'
    page.locator('#reviewBtn').click()
    expect(page.locator('.review-question')).to_have_count(24)
    page.reload()
    assert len(state(page)['history']) == 1
    report['checks'].append('Correct/wrong, keyboard, auto advance, timer cancellation, back, reload/resume, favorites, full result 23/24, review and unique history')
    # System follows OS, explicit light/dark ignores OS; preference survives reload.
    for expected in ['light','dark','system']:
        page.locator('#themeToggle').click()
        expect(page.locator('#themeToggle')).to_have_attribute('data-theme',expected)
        page.emulate_media(color_scheme='dark')
        expect(page.locator('#app')).to_have_class(__import__('re').compile(('light' if expected=='light' else 'dark')+'-mode'))
    page.reload()
    expect(page.locator('#themeToggle')).to_have_attribute('data-theme','system')
    page.emulate_media(color_scheme='light',reduced_motion='reduce')
    expect(page.locator('#app')).to_have_class(__import__('re').compile('light-mode'))
    assert page.locator('#themeToggle').evaluate('(el)=>getComputedStyle(el).transitionDuration') == '0s'
    page.locator('.lecture-launch').first.click()
    page.locator('#fullscreenToggle').click()
    expect(page.locator('#fullscreenToggle')).to_have_attribute('aria-pressed','true')
    page.locator('#fullscreenToggle').click()
    expect(page.locator('#fullscreenToggle')).to_have_attribute('aria-pressed','false')
    report['checks'].append('Light/Dark/System persistence, Reduced Motion, fullscreen enter/exit')
    assert not report['errors'], report['errors']
    report['checks'].append('No JavaScript errors or failed asset requests')
    context.close()
    browser.close()

(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'PASS: {len(report["layouts"])} layout cases; all functional checks; report: test-results/visual/report.json')
