import {loadContent} from './content.js'
import {createStore, storageKey} from './storage.js'
import {addStudyTime, matchingDraft, moveQuestion, openAttempt, recordAnswer, removeDraft, score} from './quiz.js'
import {achievements, dayStreak, lectureComparison, lectureProgress, mistakeBank, quizKind, quizTypes, setFavorite} from './study.js'
import {createEducationControls, explanationContent} from './education.js'
import {createSpeechControls} from './speech.js'
import {quizKeyboard} from './keyboard.js'
import {createFeedback} from './feedback.js'
import {nextTheme, themeIsDark, themeLabels} from './settings.js'

const base = new URL('../', import.meta.url)
const byId = id => document.getElementById(id)
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')
const systemDark = matchMedia('(prefers-color-scheme: dark)')
const feedback = createFeedback()
const dateFormat = new Intl.DateTimeFormat('ar-IQ', {dateStyle: 'medium', timeStyle: 'short'})
const education = createEducationControls(byId('questionSection'))
const speech = createSpeechControls(byId('speechPanel'))
const exitDialog = byId('exitQuiz')
const deleteDialog = byId('deleteDraft')
const views = ['lectureSelection', 'quizSection', 'resultsSection', 'library']
const autoAdvanceDelay = 600
let content
let store
let key
let view
let current
let timer = null
let pendingQuiz = null
let sessionTimeMs = 0
let activeSince = null
let clock = null
let celebration
let celebrationTimer
let studyFocus = false
let quizOrigin = null
let deletingDraft = null
let launchingQuiz = false

function element(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
}

function button(label, className, action) {
    const node = element('button', className, label)
    node.type = 'button'
    if (action) node.addEventListener('click', action)
    return node
}

function switchView(next) {
    stopCelebration()
    if (view === 'quizSection') {
        cancelAdvance()
        speech.stop()
        feedback.stop()
        checkpointTime(true)
        stopClock()
        window.removeEventListener('beforeunload', warnBeforeUnload)
        if (studyFocus) setStudyFocus(false)
        if (exitDialog.open) {
            exitDialog.returnValue = ''
            exitDialog.close()
        }
    }
    view = next
    pendingQuiz = null
    for (const id of views) byId(id).hidden = id !== next
    window.scrollTo(0, 0)
}

function notice(message) {
    byId('notice').textContent = message
    byId('notice').hidden = false
}

function showHome(focus = true) {
    const state = store.read()
    const {lectures, questions} = content
    const historyLectures = new Set(state.history.filter(entry => quizKind(entry) === 'lecture').map(entry => entry.lectureId))
    const drafts = new Map(state.drafts.filter(entry => quizKind(entry) === 'lecture').map(entry => [entry.lectureId, entry]))
    const completed = lectures.filter(lecture => lecture.questions.length && historyLectures.has(lecture.id)).length
    byId('overview').textContent = `المحاضرات: ${lectures.length} · الأسئلة: ${questions.size} · المحاضرات المكتملة: ${completed}`
    const cards = document.createDocumentFragment()
    lectures.forEach((lecture, i) => cards.append(lectureCard(lecture, i, drafts.get(lecture.id), state.study, historyLectures.has(lecture.id))))
    byId('lectureGrid').replaceChildren(cards)
    document.querySelector('.progress-guide').hidden = lectures.length === 0
    byId('emptyState').hidden = lectures.length > 0
    switchView('lectureSelection')
    current = null
    if (focus) byId('lecturesHeading').focus()
}

async function launchAttempt(control, change, returnLibrary = null) {
    if (launchingQuiz) return
    launchingQuiz = true
    const from = view
    control.disabled = true
    try {
        const attempt = await store.update(change)
        if (view !== from || !control.isConnected) return
        if (!attempt) {
            notice('هذه المحاولة أو أسئلتها غير متاحة الآن.')
            if (view === 'library') showLibrary(byId('library').dataset.type)
            return
        }
        current = attempt
        quizOrigin = returnLibrary
        switchView('quizSection')
        byId('leaveQuiz').textContent = returnLibrary ? 'حفظ والعودة' : 'العودة للمحاضرات'
        startClock()
        window.addEventListener('beforeunload', warnBeforeUnload)
        renderQuestion()
    } finally {
        launchingQuiz = false
        control.disabled = false
    }
}

function lectureCard(lecture, index, draft, study, completed) {
    const card = element('article', 'lecture-card')
    const icon = element('span', 'lecture-icon')
    icon.append(byId('bookIcon').content.cloneNode(true))
    const title = element('h3', 'lecture-title', lecture.title)
    title.dir = 'auto'
    const {total, answered, correct, coverage, mastery} = lectureProgress(lecture, study)
    card.append(icon, element('p', 'lecture-number', `المحاضرة ${index + 1}`), title,
        element('p', 'lecture-status', `عدد الأسئلة: ${total}`),
        progressMetric('التغطية', coverage, `${answered} من ${total}`),
        progressMetric('الإتقان', mastery, answered ? `${correct} من ${answered}` : 'بانتظار إجابة'))
    const actions = element('div', 'lecture-actions')
    const start = button(draft ? 'استكمال الاختبار' : 'بدء الاختبار', 'action-btn primary-btn compact', () =>
        launchAttempt(start, state => openAttempt(state, lecture, content.subject.revision)))
    start.disabled = !total && !draft
    actions.append(start)
    if (completed) actions.append(button('مقارنة المحاولات', 'action-btn secondary-btn compact', () => showComparison(lecture)))
    card.append(actions)
    return card
}

function progressMetric(label, value, fraction) {
    const metric = element('div', 'lecture-metric')
    const line = element('div', 'metric-label')
    line.append(element('strong', '', label), element('span', '', `${value === null ? '—' : percentLabel(value)} · ${fraction}`))
    const meter = element('meter', 'metric-meter')
    meter.min = 0
    meter.max = 100
    meter.value = value ?? 0
    meter.setAttribute('aria-label', label)
    meter.hidden = value === null
    metric.append(line, meter)
    return metric
}

function percentLabel(value) {
    const rounded = Math.round(value * 10) / 10
    return `${rounded}%`
}

function renderQuestion() {
    const {cursor, title, questions, revision} = current
    const question = questions[cursor]
    byId('quizTitle').textContent = title
    const old = revision !== content.subject.revision ? ` · إصدار المحتوى ${revision}` : ''
    byId('quizRevision').textContent = `${quizTypes[quizKind(current)]}${old}`
    byId('questionCounter').textContent = `السؤال ${cursor + 1} من ${questions.length}`
    const progress = byId('progressBar')
    progress.max = questions.length
    progress.value = cursor + 1

    const heading = byId('questionText')
    heading.textContent = question.text
    byId('questionFavorite').replaceChildren(favoriteButton(question.id))
    const options = document.createDocumentFragment()
    const translations = []
    for (const [index, option] of question.options.entries()) {
        const choice = button('', 'option-btn', () => submitAnswer(option.id))
        choice.dataset.optionId = option.id
        const original = element('span', 'choice-original')
        original.dir = 'auto'
        original.append(element('bdi', 'choice-index', `${index + 1}.`), ' ', element('bdi', '', option.text))
        const source = question.optionTranslations
        const translation = element('span', 'choice-translation', source && Object.hasOwn(source, option.id)
            ? source[option.id] : 'ماكو ترجمة مضافة لهذا الاختيار.')
        translation.dir = 'rtl'
        translation.lang = 'ar-IQ'
        translations.push(translation)
        const label = element('span', 'choice-label')
        label.hidden = true
        choice.append(original, translation, label)
        options.append(choice)
    }
    byId('quizOptions').replaceChildren(options)
    education.setQuestion(question, translations)
    speech.setQuestion(question)
    paintAnswer()
    if (!exitDialog.open) {
        heading.focus({preventScroll: true})
        window.scrollTo(0, byId('quizSection').getBoundingClientRect().top + window.scrollY - 12)
    }
}

function paintAnswer(fresh = false) {
    const {cursor, questions, answers} = current
    const question = questions[cursor]
    const selected = answers[cursor]
    const answered = Boolean(selected)
    const correct = selected === question.correctOptionId
    for (const choice of byId('quizOptions').children) {
        const id = choice.dataset.optionId
        const isSelected = id === selected
        const isCorrect = answered && id === question.correctOptionId
        const isWrong = isSelected && !correct
        choice.disabled = answered
        choice.setAttribute('aria-pressed', String(isSelected))
        choice.classList.toggle('correct', isCorrect)
        choice.classList.toggle('incorrect', isWrong)
        choice.classList.toggle('answer-fresh', fresh && (isCorrect || isWrong))
        const label = choice.lastElementChild
        label.textContent = isCorrect ? (isSelected ? 'إجابتك صحيحة' : 'الإجابة الصحيحة') : 'إجابتك خاطئة'
        label.hidden = !isCorrect && !isWrong
    }
    const feedback = byId('answerFeedback')
    feedback.className = correct ? 'answer-status' : 'feedback-box error'
    feedback.textContent = !answered ? '' : correct ? 'إجابة صحيحة' :
        `إجابة خاطئة. ${question.explanation || 'ماكو تعليل مضاف للإجابة الصحيحة بعد. راجع الاختيار المميز أعلاه.'}`
    education.setAnswered(answered)
    byId('previousQuestion').disabled = cursor === 0
    byId('nextQuestion').disabled = !answered
    byId('nextQuestion').textContent = cursor + 1 === questions.length ? 'عرض النتيجة' : 'التالي'
}

function quizActive() {
    return view === 'quizSection' && !exitDialog.open && !pendingQuiz
}

async function submitAnswer(optionId) {
    if (!quizActive() || current.answers[current.cursor]) return
    const {id, cursor} = current
    feedback.prepare(store.read().settings.sounds)
    checkpointTime()
    pendingQuiz = store.update(state => {
        const previous = state.drafts.find(draft => draft.id === id)?.answers[cursor]
        const attempt = recordAnswer(state, id, cursor, optionId)
        return {attempt, saved: !previous && attempt?.answers[cursor] === optionId}
    })
    const {attempt, saved} = await pendingQuiz
    if (view !== 'quizSection' || current.id !== id) return
    pendingQuiz = null
    if (!attempt) return showHome()
    current = attempt
    if (attempt.cursor !== cursor) return renderQuestion()
    paintAnswer(saved)
    if (exitDialog.open) return
    const correct = attempt.answers[cursor] === attempt.questions[cursor].correctOptionId
    const settings = store.read().settings
    if (saved && !document.hidden) feedback.play(correct, settings, reduceMotion.matches)
    // Keep the marked options in view while announcing the answer.
    byId('nextQuestion').focus({preventScroll: true})
    if (saved && correct && settings.autoAdvance && !document.hidden) {
        cancelAdvance()
        timer = setTimeout(() => {
            timer = null
            if (current?.id === id && current.cursor === cursor) navigateQuestion(1)
        }, autoAdvanceDelay)
    }
}

function cancelAdvance() {
    clearTimeout(timer)
    timer = null
}

function navigateQuestion(direction) {
    if (!quizActive()) return false
    const {id, cursor, answers} = current
    if (direction < 0 ? cursor === 0 : !answers[cursor]) return false
    cancelAdvance()
    speech.stop()
    checkpointTime()
    pendingQuiz = store.update(state => moveQuestion(state, id, cursor, direction, content.lectures))
    pendingQuiz.then(attempt => {
        if (view !== 'quizSection' || current.id !== id) return
        pendingQuiz = null
        if (!attempt) return showHome()
        current = attempt
        if (attempt.completedAt) showResults(attempt, true)
        else renderQuestion()
    })
    return true
}

function duration(ms) {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    return `${minutes} د ${seconds % 60} ث`
}

function startClock() {
    sessionTimeMs = current.activeTimeMs ?? 0
    resumeClock()
    renderTime()
}

function stopClock() {
    clearInterval(clock)
    clock = null
}

function renderTime() {
    const pending = activeSince === null ? 0 : performance.now() - activeSince
    byId('quizTime').textContent = `وقت الاختبار: ${duration(sessionTimeMs + pending)}`
    if (pending >= 5000) checkpointTime()
}

function checkpointTime(pause = false) {
    if (activeSince === null) return
    const now = performance.now()
    const elapsed = Math.round(now - activeSince)
    const id = current.id
    activeSince = pause ? null : now
    sessionTimeMs += elapsed
    if (elapsed > 0) void store.update(state => addStudyTime(state, id, elapsed))
}

function warnBeforeUnload(event) {
    cancelAdvance()
    checkpointTime()
    event.preventDefault()
    event.returnValue = true
}

function favoriteButton(id, onChange) {
    const control = button('', 'action-btn secondary-btn compact', async () => {
        control.disabled = true
        const save = control.getAttribute('aria-pressed') !== 'true'
        const saved = await store.update(state => setFavorite(state, id, save))
        paint(saved)
        control.disabled = false
        onChange?.()
    })
    function paint(saved) {
        control.textContent = saved ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'
        control.setAttribute('aria-pressed', String(saved))
    }
    paint(store.read().favorites.includes(id))
    return control
}

function reviewItem(question, selected, index) {
    const item = element('article', 'review-question')
    item.dataset.protected = ''
    const title = element('h3', 'review-question-text', index === undefined ? question.text : `${index + 1}. ${question.text}`)
    title.dir = 'auto'
    item.append(title)
    if (question.translation) item.append(element('p', 'review-translation', question.translation))
    const options = element('ol', 'review-options')
    for (const option of question.options) {
        const correct = option.id === question.correctOptionId
        const chosen = option.id === selected
        const line = element('li', `review-answer${correct ? ' correct' : chosen ? ' user' : ''}`)
        line.append(element('bdi', '', option.text))
        const translation = question.optionTranslations
        if (translation && Object.hasOwn(translation, option.id)) {
            line.append(element('p', 'review-translation', translation[option.id]))
        }
        if (correct || chosen) {
            const label = correct ? (chosen ? 'إجابتك الصحيحة' : 'الإجابة الصحيحة') : 'إجابتك الخاطئة'
            line.append(element('span', 'choice-label', label))
        }
        options.append(line)
    }
    item.append(options)
    if (selected && index !== undefined && !content.questions.has(question.id)) {
        item.append(element('p', 'archive-label', 'سؤال من نسخة سابقة للمادة'))
    }
    const explanation = element('details', 'question-panel')
    explanation.append(element('summary', '', 'لماذا هذه الإجابة؟'), ...explanationContent(question))
    item.append(explanation)
    return item
}

function showResults(attempt, fresh = false) {
    current = attempt
    const {total, correct, percent} = score(attempt)
    const level = percent < 50 ? 'fail' : percent < 90 ? 'pass' : 'excellent'
    const [badge, message] = {
        fail: ['راسب', 'حاول مرة أخرى. التعلم يحتاج للممارسة المستمرة.'],
        pass: ['ناجح', 'أحسنت، واصل التقدم.'],
        excellent: ['متفوق', 'ممتاز! أداء رائع ومتميز.']
    }[level]
    byId('resultLecture').textContent = attempt.title
    const kind = quizKind(attempt)
    byId('resultMeta').textContent = `${quizTypes[kind]} · ${dateFormat.format(new Date(attempt.completedAt))} · الإصدار ${attempt.revision} · المدة: ${attemptTime(attempt)}`
    byId('resultGrade').textContent = `الدرجة: ${correct} من ${total}`
    byId('finalScore').textContent = percentLabel(percent)
    byId('finalScore').className = `results-score ${level}`
    const ring = byId('progressRing')
    ring.setAttribute('class', `progress-ring ${level}`)
    ring.style.strokeDashoffset = 534 * (1 - percent / 100)
    byId('performanceBadge').className = `performance-badge badge-${level}`
    byId('performanceBadge').textContent = badge
    byId('correctAnswers').textContent = correct
    byId('wrongAnswers').textContent = total - correct
    byId('totalQuestions').textContent = total
    byId('resultsMessage').textContent = message
    const destination = fresh ? quizOrigin : 'history'
    byId('resultsBack').textContent = destination ? `العودة إلى ${libraryTitles[destination]}` : 'العودة للمحاضرات'
    byId('resultsBack').onclick = () => returnFromQuiz(destination)
    const retry = byId('retryQuiz')
    const source = retrySource(attempt)
    const unfinished = source && matchingDraft(store.read(), source)
    retry.textContent = unfinished ? 'استكمال محاولة جارية' : 'إعادة الاختبار'
    retry.disabled = !source?.questions.length && !unfinished
    retry.onclick = () => launchAttempt(retry, state => source && openAttempt(state, source, content.subject.revision), destination)
    const removed = kind !== 'lecture' && source.questions.length < total
    byId('retryNote').hidden = !retry.disabled && !removed
    byId('retryNote').textContent = retry.disabled ? 'أسئلة هذه المحاولة متاحة للمراجعة فقط.' : 'الإعادة تشمل الأسئلة المتاحة حاليًا.'
    const comparison = byId('resultComparison')
    comparison.open = kind === 'lecture' && lectureComparison(store.read().history, attempt.lectureId).count > 1
    comparison.hidden = kind !== 'lecture'
    byId('resultComparisonBody').replaceChildren()
    if (kind === 'lecture') byId('resultComparisonBody').append(comparisonPanel(attempt.lectureId))
    byId('reviewContainer').replaceChildren()
    setReviewExpanded(false)
    switchView('resultsSection')
    byId('resultsHeading').focus()
    if (fresh && level === 'excellent' && !reduceMotion.matches) celebrate()
}

function attemptTime(attempt) {
    return Number.isFinite(attempt.activeTimeMs) ? duration(attempt.activeTimeMs) : 'غير مسجّلة'
}

function retrySource(attempt) {
    const kind = quizKind(attempt)
    if (kind === 'lecture') return content.lectures.find(lecture => lecture.id === attempt.lectureId)
    const questions = attempt.questions.map(question => content.questions.get(question.id)).filter(Boolean)
    return {kind, title: quizTypes[kind], questions}
}

function returnFromQuiz(destination) {
    if (destination) showLibrary(destination)
    else showHome()
}

function comparisonPanel(lectureId) {
    const {first, last, count} = lectureComparison(store.read().history, lectureId)
    if (count < 2) return element('p', 'library-empty', 'تظهر المقارنة بعد إكمال اختبار المحاضرة مرتين.')
    const a = score(first)
    const b = score(last)
    const gradeDelta = Math.round((b.percent - a.percent) * 10) / 10
    const errorDelta = (b.total - b.correct) - (a.total - a.correct)
    const timeDelta = Number.isFinite(first.activeTimeMs) && Number.isFinite(last.activeTimeMs)
        ? Math.floor(last.activeTimeMs / 1000) - Math.floor(first.activeTimeMs / 1000) : null
    const change = (delta, unit, positive, negative) =>
        delta === 0 ? 'بلا تغيير' : `${delta > 0 ? positive : negative} · ${unit(Math.abs(delta))}`
    const rows = [
        ['الدرجة', `${a.correct}/${a.total} · ${percentLabel(a.percent)}`, `${b.correct}/${b.total} · ${percentLabel(b.percent)}`,
            change(gradeDelta, value => `${value} نقطة مئوية`, 'تحسّن', 'تراجع')],
        ['الأخطاء', `${a.total - a.correct} من ${a.total}`, `${b.total - b.correct} من ${b.total}`,
            change(errorDelta, value => String(value), 'أخطاء أكثر', 'أخطاء أقل')],
        ['المدة', attemptTime(first), attemptTime(last), timeDelta === null ? 'المدة غير مكتملة' :
            change(timeDelta, value => duration(value * 1000), 'أطول', 'أقصر')]
    ]
    const panel = element('div', 'comparison-panel')
    const table = element('table', 'comparison-table')
    const caption = element('caption', '', `الأول: ${dateFormat.format(new Date(first.completedAt))} · الأخير: ${dateFormat.format(new Date(last.completedAt))}`)
    const heading = table.createTHead().insertRow()
    for (const label of ['المقياس', 'الأول', 'الأخير', 'التغيّر']) {
        const cell = element('th', '', label)
        cell.scope = 'col'
        heading.append(cell)
    }
    const body = table.createTBody()
    for (const [label, ...values] of rows) {
        const row = body.insertRow()
        const title = element('th', '', label)
        title.scope = 'row'
        row.append(title, ...values.map(value => element('td', '', value)))
    }
    table.prepend(caption)
    panel.append(table)
    if (first.revision !== last.revision || a.total !== b.total) {
        panel.append(element('p', 'archive-label', `قد يختلف المحتوى بين المحاولتين. الإصدار الأول: ${first.revision} · الأخير: ${last.revision}.`))
    }
    return panel
}

function setReviewExpanded(expanded) {
    byId('reviewContainer').hidden = !expanded
    byId('reviewBtn').textContent = expanded ? 'إخفاء المراجعة' : 'مراجعة الاختبار'
    byId('reviewBtn').setAttribute('aria-expanded', String(expanded))
}

function celebrate() {
    const layer = element('div', 'confetti-canvas confetti')
    layer.setAttribute('aria-hidden', 'true')
    for (let i = 0; i < 45; i++) {
        const piece = element('span')
        piece.style.left = `${Math.random() * 100}%`
        piece.style.backgroundColor = `hsl(${Math.random() * 360} 75% 55%)`
        piece.style.animationDelay = `${Math.random() * 0.6}s`
        layer.append(piece)
    }
    document.body.append(layer)
    celebration = layer
    celebrationTimer = setTimeout(stopCelebration, 3200)
}

function stopCelebration() {
    clearTimeout(celebrationTimer)
    celebration?.remove()
    celebration = undefined
}

const libraryTitles = {
    history: 'سجل المحاولات',
    favorites: 'المفضلة',
    mistakes: 'بنك الأخطاء',
    drafts: 'الاختبارات غير المكتملة',
    achievements: 'الإنجازات',
    settings: 'الإعدادات'
}
const libraryEmpty = {
    history: 'ستظهر هنا الاختبارات بعد إكمالها.',
    favorites: 'أضف سؤالًا إلى المفضلة أثناء الاختبار ليظهر هنا.',
    mistakes: 'ماكو أخطاء نشطة. يظهر هنا السؤال إذا كانت آخر إجابة محفوظة عنه خاطئة.',
    drafts: 'ماكو اختبارات غير مكتملة حاليًا.'
}

function renderLibrary(type, title, items) {
    byId('libraryBody').replaceChildren(items)
    byId('libraryHeading').textContent = title
    byId('library').dataset.type = type
    switchView('library')
    current = null
    byId('libraryHeading').focus()
}

function showComparison(lecture) {
    renderLibrary('comparison', `مقارنة المحاولات · ${lecture.title}`, comparisonPanel(lecture.id))
}

function showLibrary(type) {
    const state = store.read()
    const items = document.createDocumentFragment()
    if (type === 'history') {
        for (const attempt of [...state.history].reverse()) {
            const result = score(attempt)
            const row = button('', 'library-row', () => showResults(attempt))
            const title = element('strong', '', attempt.title)
            title.dir = 'auto'
            const detail = element('span', '', `${quizTypes[quizKind(attempt)]} · ${result.correct} من ${result.total} (${percentLabel(result.percent)}) · ${dateFormat.format(new Date(attempt.completedAt))}`)
            row.append(title, detail)
            items.append(row)
        }
    } else if (type === 'favorites' || type === 'mistakes') {
        renderBank(items, state, type)
    } else if (type === 'drafts') {
        for (const draft of [...state.drafts].reverse()) items.append(draftRow(draft))
    } else if (type === 'achievements') {
        renderAchievements(items, state)
    } else {
        items.append(themeSetting(state.settings.theme),
            setting('الانتقال تلقائيًا بعد الإجابة الصحيحة', 'autoAdvance', state),
            setting('أصوات الإجابات', 'sounds', state),
            setting('اهتزاز الإجابات على الأجهزة المدعومة', 'haptics', state),
            setting('ردع نسخ وطباعة الأسئلة', 'deterrence', state))
    }
    if (!items.hasChildNodes()) items.append(element('p', 'library-empty', libraryEmpty[type]))
    renderLibrary(type, libraryTitles[type], items)
}

function bankIds(state, type) {
    return type === 'favorites' ? state.favorites : mistakeBank(state.study).map(entry => entry.question.id)
}

function bankSource(state, type) {
    const questions = bankIds(state, type).map(id => content.questions.get(id)).filter(Boolean)
    return {kind: type, title: quizTypes[type], questions}
}

function renderBank(items, state, type) {
    const ids = bankIds(state, type)
    if (!ids.length) return
    const source = bankSource(state, type)
    const bar = element('div', 'bank-tools')
    const label = matchingDraft(state, source) ? `استكمال ${quizTypes[type]}` : `بدء ${quizTypes[type]}`
    const start = button(label, 'action-btn primary-btn compact', () =>
        launchAttempt(start, data => openAttempt(data, bankSource(data, type), content.subject.revision), type))
    start.disabled = !source.questions.length
    bar.append(start, element('p', '', `متاح للاختبار: ${source.questions.length} · مؤرشف: ${ids.length - source.questions.length}`))
    items.append(bar)

    if (type === 'mistakes') {
        for (const {question, selected} of mistakeBank(state.study)) {
            const row = reviewItem(question, selected)
            if (!content.questions.has(question.id)) markArchived(row)
            items.append(row)
        }
        return
    }

    const archived = new Map()
    const missing = new Set(ids.filter(id => !content.questions.has(id)))
    if (missing.size) {
        for (const attempt of [...state.history, ...state.drafts]) {
            for (const question of attempt.questions) {
                if (missing.has(question.id)) archived.set(question.id, question)
            }
        }
        for (const {question} of mistakeBank(state.study)) {
            if (missing.has(question.id)) archived.set(question.id, question)
        }
    }
    for (const id of ids) {
        const question = content.questions.get(id) ?? archived.get(id)
        const row = question ? reviewItem(question) : element('article', 'review-question', id)
        if (missing.has(id)) markArchived(row)
        row.append(favoriteButton(id, () => {
            if (view === 'library' && byId('library').dataset.type === type) showLibrary(type)
        }))
        items.append(row)
    }
}

function markArchived(row) {
    row.prepend(element('p', 'archive-label', 'سؤال مؤرشف · خارج الاختبارات الجديدة'))
}

function draftRow(draft) {
    const row = element('article', 'library-row draft-row')
    const info = element('div', 'draft-info')
    const title = element('h3', '', draft.title)
    title.dir = 'auto'
    const answered = draft.answers.filter(Boolean).length
    info.append(title, element('p', '', `${quizTypes[quizKind(draft)]} · ${answered} من ${draft.questions.length} مجاب عنها`),
        element('p', '', `السؤال ${draft.cursor + 1} · المدة: ${attemptTime(draft)}`))
    const deletedLecture = quizKind(draft) === 'lecture' && !content.lectures.some(lecture => lecture.id === draft.lectureId)
    if (deletedLecture || draft.revision !== content.subject.revision || draft.questions.some(q => !content.questions.has(q.id))) {
        info.append(element('p', 'archive-label', `يُستكمل بمحتوى الإصدار ${draft.revision} المحفوظ.`))
    }
    const actions = element('div', 'question-tools')
    const resume = button('استكمال', 'action-btn primary-btn compact', () =>
        launchAttempt(resume, state => state.drafts.find(entry => entry.id === draft.id), 'drafts'))
    actions.append(resume, button('حذف', 'action-btn secondary-btn compact', () => {
        deletingDraft = draft.id
        deleteDialog.returnValue = ''
        deleteDialog.showModal()
    }))
    row.append(info, actions)
    return row
}

function renderAchievements(items, state) {
    const {study} = state
    const days = dayStreak(study)
    const streaks = element('div', 'streak-grid')
    for (const [label, currentValue, best] of [
        ['الإجابات الصحيحة المتتالية', study.correctRun, study.bestCorrectRun],
        ['أيام الدراسة المتتالية', days.current, days.best]
    ]) {
        const card = element('article', 'streak-card')
        card.append(element('h3', '', label), element('p', '', `السلسلة الحالية: ${currentValue}`), element('p', '', `أفضل سلسلة: ${best}`))
        streaks.append(card)
    }
    items.append(streaks)
    const earned = new Map(state.achievements.map(entry => [entry.id, entry.earnedAt]))
    const progress = {
        distinct100: `${Math.min(Object.keys(study.latest).length, 100)} من 100`,
        completed10: `${Math.min(state.history.length, 10)} من 10`,
        correct100: `${Math.min(study.bestCorrectRun, 100)} من 100`,
        consistent: `${Math.min(days.best, 7)} من 7`
    }
    for (const [id, label] of Object.entries(achievements)) {
        const row = element('article', 'library-row')
        const date = earned.get(id)
        const status = date ? `تحقّق في ${dateFormat.format(new Date(date))}` : progress[id] ?? 'لم يتحقق بعد'
        row.append(element('strong', '', label), element('span', '', status))
        items.append(row)
    }
}

function setting(label, name, state) {
    const row = element('label', 'library-row setting')
    const checkbox = element('input')
    checkbox.type = 'checkbox'
    checkbox.checked = state.settings[name]
    checkbox.addEventListener('change', async () => {
        const checked = checkbox.checked
        await store.update(data => { data.settings[name] = checked })
        applySettings()
    })
    row.append(element('span', '', label), checkbox)
    return row
}

function themeSetting(theme) {
    const row = element('label', 'library-row setting theme-setting')
    const select = element('select')
    for (const [value, label] of Object.entries(themeLabels)) select.add(new Option(label, value))
    select.value = theme
    select.addEventListener('change', async () => {
        const value = select.value
        await store.update(state => { state.settings.theme = value })
        applySettings()
    })
    row.append(element('span', '', 'مظهر العرض'), select)
    return row
}

function applySettings() {
    const {theme, deterrence} = store.read().settings
    const dark = themeIsDark(theme, systemDark.matches)
    const app = byId('app')
    app.classList.toggle('dark-mode', dark)
    app.classList.toggle('light-mode', !dark)
    app.classList.toggle('deterrence', deterrence)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    const control = byId('themeToggle')
    control.dataset.theme = theme
    control.setAttribute('aria-label', `مظهر العرض: ${themeLabels[theme]}، التبديل إلى ${themeLabels[nextTheme(theme)]}`)
    control.title = themeLabels[theme]
}

async function init() {
    try {
        content = await loadContent(base)
    } catch (error) {
        byId('loading').hidden = true
        byId('loadError').hidden = false
        byId('errorDetail').textContent = error.message
        return
    }

    const {subject} = content
    document.documentElement.dir = subject.direction ?? 'rtl'
    key = storageKey(base, subject)
    store = createStore(key, notice)
    await store.update(() => {})
    for (const [id, value] of [['subjectName', subject.title], ['credit', subject.credit], ['badge', subject.badge]]) {
        byId(id).textContent = value ?? ''
        byId(id).hidden = !value
    }
    if (subject.title) document.title = `${subject.title} | QDU`
    byId('loading').hidden = true
    byId('themeToggle').disabled = false
    applySettings()
    showHome(false)
}

byId('themeToggle').addEventListener('click', async () => {
    await store.update(state => { state.settings.theme = nextTheme(state.settings.theme) })
    applySettings()
    if (view === 'library' && byId('library').dataset.type === 'settings') showLibrary('settings')
})
systemDark.addEventListener('change', () => { if (store) applySettings() })
reduceMotion.addEventListener('change', event => {
    if (event.matches) {
        stopCelebration()
        feedback.stop()
    }
})
document.addEventListener('copy', event => {
    if (!byId('app').classList.contains('deterrence') ||
        event.target instanceof Element && event.target.closest('input, textarea, [contenteditable]')) return
    const selection = window.getSelection()
    if (selection?.isCollapsed !== false) return
    const protectedNode = node => (node instanceof Element ? node : node?.parentElement)?.closest('[data-protected]')
    if (protectedNode(selection.anchorNode) && protectedNode(selection.focusNode)) event.preventDefault()
})
function setStudyFocus(enabled) {
    studyFocus = enabled
    byId('app').classList.toggle('study-focus', enabled)
    paintFullscreen()
}
function paintFullscreen() {
    const fullscreen = Boolean(document.fullscreenElement)
    byId('fullscreenToggle').setAttribute('aria-pressed', String(fullscreen))
    byId('studyFullscreen').setAttribute('aria-pressed', String(fullscreen || studyFocus))
    byId('studyFullscreen').textContent = fullscreen || studyFocus ? 'إنهاء وضع الدراسة' : 'وضع الدراسة بملء الشاشة'
}
async function toggleFullscreen() {
    if (studyFocus) return setStudyFocus(false)
    try {
        if (document.fullscreenElement) await document.exitFullscreen()
        else await document.documentElement.requestFullscreen()
    } catch {
        if (view === 'quizSection') setStudyFocus(true)
        else notice('تعذّر تبديل وضع ملء الشاشة في هذا المتصفح.')
    }
}
byId('fullscreenToggle').hidden = !document.fullscreenEnabled
byId('fullscreenToggle').addEventListener('click', toggleFullscreen)
byId('studyFullscreen').addEventListener('click', toggleFullscreen)
document.addEventListener('fullscreenchange', paintFullscreen)
byId('leaveQuiz').addEventListener('click', () => {
    cancelAdvance()
    speech.stop()
    feedback.stop()
    exitDialog.returnValue = ''
    exitDialog.showModal()
})
exitDialog.addEventListener('close', async () => {
    if (exitDialog.returnValue !== 'leave' || view !== 'quizSection') return
    await pendingQuiz
    if (view === 'quizSection') returnFromQuiz(quizOrigin)
})
deleteDialog.addEventListener('close', async () => {
    const id = deletingDraft
    deletingDraft = null
    if (deleteDialog.returnValue !== 'delete' || id === null) return
    await store.update(state => removeDraft(state, id))
    if (view === 'library' && byId('library').dataset.type === 'drafts') showLibrary('drafts')
})
byId('previousQuestion').addEventListener('click', () => navigateQuestion(-1))
byId('nextQuestion').addEventListener('click', () => navigateQuestion(1))
quizKeyboard({
    active: quizActive,
    choices: () => [...byId('quizOptions').querySelectorAll('button:enabled')],
    previous: () => navigateQuestion(-1),
    next: () => navigateQuestion(1)
})
function pauseQuiz() {
    cancelAdvance()
    speech.stop()
    feedback.stop()
    stopCelebration()
    stopClock()
    if (view === 'quizSection') checkpointTime(true)
}
function resumeClock() {
    if (view !== 'quizSection' || document.hidden) return
    activeSince ??= performance.now()
    clock ??= setInterval(renderTime, 1000)
}
document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseQuiz()
    else resumeClock()
})
window.addEventListener('pagehide', () => {
    pauseQuiz()
    feedback.close()
})
window.addEventListener('pageshow', resumeClock)
byId('libraryBack').addEventListener('click', () => showHome())
byId('retryLoad').addEventListener('click', () => location.reload())
byId('reviewBtn').addEventListener('click', () => {
    const expanded = byId('reviewContainer').hidden
    if (expanded) {
        const items = document.createDocumentFragment()
        current.questions.forEach((question, i) => items.append(reviewItem(question, current.answers[i], i)))
        byId('reviewContainer').replaceChildren(items)
    }
    setReviewExpanded(expanded)
})
for (const control of document.querySelectorAll('[data-library]')) {
    control.addEventListener('click', () => showLibrary(control.dataset.library))
}
window.addEventListener('storage', event => {
    if (event.key !== key) return
    applySettings()
    if (view === 'lectureSelection' && !byId('lectureGrid').contains(document.activeElement)) showHome(false)
})
init()
