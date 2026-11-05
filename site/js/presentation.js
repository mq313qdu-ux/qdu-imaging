// Read-only view models. Scoring, content and persistence remain in their engines.
import {dayStreak, mistakeBank} from './study.js'

const get = id => document.getElementById(id)
export function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('class', 'qdu-icon')
    svg.setAttribute('aria-hidden', 'true')
    const use = document.createElementNS(svg.namespaceURI, 'use')
    use.setAttribute('href', new URL(`../icons.svg?v=1.2.0#${name}`, import.meta.url).href)
    svg.append(use)
    return svg
}

export function renderOverview(content, state) {
    const available = [...content.questions.keys()]
    const answered = available.filter(id => state.study.latest[`question:${id}`])
    const correct = answered.filter(id => state.study.latest[`question:${id}`].correct)
    const coverage = available.length ? Math.round(answered.length / available.length * 100) : 0
    get('coverageValue').textContent = `${coverage}%`
    get('coverageTrack').style.width = `${coverage}%`
    get('coverageDetail').textContent = `${answered.length} من ${available.length} سؤال مختلف`
    get('masteryValue').textContent = answered.length ? `${Math.round(correct.length / answered.length * 100)}%` : '—'
    get('completedValue').textContent = state.history.length
    get('railStreak').textContent = `${dayStreak(state.study).current} أيام`
    const counts = {drafts: state.drafts.length, favorites: state.favorites.length,
        mistakes: mistakeBank(state.study).length, history: state.history.length, achievements: state.achievements.length}
    for (const node of document.querySelectorAll('[data-count]')) {
        node.textContent = counts[node.dataset.count] ?? ''
        node.hidden = !counts[node.dataset.count]
    }
}

const library = {
    favorites: ['star', 'أسئلة تستحق الرجوع إليها. اجمعها هنا وراجعها باختبار خاص.'],
    mistakes: ['retry', 'حوّل أخطاءك إلى نقاط قوة. تتحدّث هذه القائمة بحسب آخر إجابة.'],
    drafts: ['clock', 'ابدأ من حيث توقفت. مكانك وإجاباتك بانتظارك.'],
    history: ['history', 'رحلتك بالأرقام. راجع كل محاولة وشاهد ما تغيّر.'],
    achievements: ['award', 'كل خطوة تُحسب. احتفِ بتقدّمك واستمر.'],
    settings: ['settings', 'اجعل مساحة الدراسة مناسبة لطريقتك.'],
    comparison: ['target', 'قارن بين أول وآخر اختبار كامل للمحاضرة.']
}
export function decorateLibrary(type) {
    const [symbol, description] = library[type] ?? ['book', '']
    get('libraryEmblem').replaceChildren(icon(symbol))
    get('libraryDescription').textContent = description
    for (const empty of get('libraryBody').querySelectorAll('.library-empty')) {
        const copy = document.createElement('span')
        copy.textContent = empty.textContent
        empty.replaceChildren(icon(symbol), copy)
    }
}
