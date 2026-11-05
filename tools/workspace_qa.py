"""Exercise every redesigned workspace view with isolated real-engine study fixtures.
Requires a running preview and Python Playwright. Never writes production data.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'test-results/redesign'
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:8098/qdu-imaging/'
WIDTHS = [320, 375, 768, 1280, 1440, 1920]
report = {'cases': [], 'errors': [], 'checks': []}

def measure(page, name, width, theme):
    page.wait_for_timeout(220)
    result = page.evaluate("""() => {
        const issues=[];
        if(document.documentElement.scrollWidth>innerWidth+1) issues.push('horizontal overflow');
        for(const el of document.querySelectorAll('button,select,summary')) {
            if(!el.getClientRects().length) continue;
            const r=el.getBoundingClientRect();
            if(r.height<43.9) issues.push('small target '+(el.id||el.className));
            if(r.left<-.5||r.right>innerWidth+.5) issues.push('offscreen control '+(el.id||el.className));
        }
        return issues;
    }""")
    assert not result, (name, width, theme, result)
    report['cases'].append([name, width, theme])

def navigate(page, kind, width):
    page.locator('#studentTools summary').first.click()
    page.locator('[data-library="'+kind+'"]').click()
    expect(page.locator('#library')).to_be_visible()

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width':1440, 'height':1040},color_scheme='light')
    page = context.new_page()
    page.on('pageerror', lambda error: report['errors'].append(str(error)))
    page.on('dialog', lambda d:d.accept())
    page.goto(BASE)
    page.locator('.lecture-launch').first.wait_for()
    # Create history, a saved draft, favorites and a mistake via the same public engines.
    page.evaluate("""async () => {
        const base=new URL('./',location.href);
        const {loadContent}=await import('./js/content.js');
        const {openAttempt,recordAnswer,moveQuestion}=await import('./js/quiz.js');
        const content=await loadContent(base);
        const key=Object.keys(localStorage).find(k=>k.startsWith('qdu:'));
        const state=JSON.parse(localStorage.getItem(key));
        for(let run=0;run<2;run++) {
            const a=openAttempt(state,content.lectures[0],content.subject.revision);
            for(let i=0;i<a.questions.length;i++) {
                const q=a.questions[i];
                const selected=i===0?q.options.find(o=>o.id!==q.correctOptionId).id:q.correctOptionId;
                recordAnswer(state,a.id,i,selected);
                moveQuestion(state,a.id,i,1,content.lectures);
            }
        }
        openAttempt(state,content.lectures[1],content.subject.revision);
        state.favorites=[content.lectures[0].questions[0].id];
        localStorage.setItem(key,JSON.stringify(state));
    }""")
    page.reload()
    expect(page.locator('#completedValue')).to_have_text('2')
    expect(page.locator('#coverageValue')).to_have_text('15%')
    expect(page.locator('#masteryValue')).to_have_text('96%')
    for width in WIDTHS:
        page.set_viewport_size({'width':width,'height':1040})
        for theme in ['light','dark']:
            page.emulate_media(color_scheme=theme)
            page.locator('#libraryBack').click() if page.locator('#library').is_visible() else None
            measure(page,'home',width,theme)
            if width in [375,1440]:
                page.screenshot(path=str(OUT/f'home-{width}-{theme}.png'),full_page=True)
            for kind in ['favorites','mistakes','history','drafts','achievements','settings']:
                navigate(page,kind,width)
                measure(page,kind,width,theme)
                if width in [375,1440]:
                    page.screenshot(path=str(OUT/f'{kind}-{width}-{theme}.png'),full_page=True)
            navigate(page,'history',width)
            page.locator('#libraryBody button.library-row').first.click()
            expect(page.locator('#correctAnswers')).to_have_text('23')
            measure(page,'results',width,theme)
            if width in [375,1440]:
                page.screenshot(path=str(OUT/f'results-{width}-{theme}.png'),full_page=True)
            page.locator('#reviewBtn').click()
            expect(page.locator('.review-question')).to_have_count(24)
            measure(page,'review-and-comparison',width,theme)
            page.locator('#resultsBack').click()
            page.locator('#libraryBack').click()
    # Settings, favorite removal, deletion confirmation and resume remain actionable.
    page.set_viewport_size({'width':375,'height':900})
    navigate(page,'settings',375)
    toggle=page.locator('input[role="switch"]').nth(1)
    toggle.check()
    page.wait_for_function("JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('qdu:')))).settings.sounds === true")
    page.reload()
    navigate(page,'settings',375)
    expect(page.locator('input[role="switch"]').nth(1)).to_be_checked()
    navigate(page,'favorites',375)
    page.get_by_role('button',name='إزالة من المفضلة').click()
    expect(page.locator('.library-empty')).to_be_visible()
    measure(page,'empty-favorites',375,'dark')
    navigate(page,'drafts',375)
    page.get_by_role('button',name='حذف',exact=True).click()
    expect(page.locator('#deleteDraft')).to_be_visible()
    measure(page,'delete-dialog',375,'dark')
    page.locator('#deleteDraft [value="cancel"]').click()
    expect(page.locator('.draft-row')).to_have_count(1)
    page.get_by_role('button',name='استكمال',exact=True).click()
    expect(page.locator('#quizSection')).to_be_visible()
    page.locator('#leaveQuiz').click()
    measure(page,'exit-dialog',375,'dark')
    page.locator('#exitQuiz [value="leave"]').click()
    report['checks'].append('Settings persist; favorite removal; delete cancellation; resume; exit dialog')
    # Missing content/error views, independent context and in-memory routes only.
    for case in ['empty','load-error']:
        ctx=browser.new_context(viewport={'width':320,'height':900})
        if case=='empty':
            for file in ['lectures','questions','enrichment']:
                ctx.route('**/data/'+file+'.json',lambda route:route.fulfill(json=[]))
        else:
            ctx.route('**/data/questions.json',lambda route:route.fulfill(status=500,body='QA failure'))
        tab=ctx.new_page()
        tab.goto(BASE)
        expect(tab.locator('#emptyState' if case=='empty' else '#loadError')).to_be_visible()
        measure(tab,case,320,'light')
        tab.screenshot(path=str(OUT/f'{case}-320.png'),full_page=True)
        ctx.close()
    assert not report['errors'],report['errors']
    browser.close()

(OUT/'workspace-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
print(f'PASS: {len(report["cases"])} workspace cases; persisted controls and dialogs; no page errors')
