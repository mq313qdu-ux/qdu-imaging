export const achievements = {
    first: 'المحاولة الأولى',
    perfect: 'علامة كاملة',
    all: 'إكمال جميع المحاضرات',
    distinct100: 'حل 100 سؤال مختلف',
    completed10: 'إكمال 10 اختبارات',
    correct100: '100 إجابة صحيحة متتالية',
    consistent: 'الدراسة 7 أيام متتالية'
}

export const quizTypes = {
    lecture: 'اختبار محاضرة كامل',
    favorites: 'اختبار المفضلة',
    mistakes: 'اختبار الأخطاء'
}

export const quizKind = attempt => attempt.kind ?? 'lecture'
const answerKey = id => `question:${id}`
const dayMs = 86_400_000

export function newStudy() {
    return {latest: {}, correctRun: 0, bestCorrectRun: 0, days: {}}
}

export function setFavorite(state, id, saved) {
    if (saved && !state.favorites.includes(id)) state.favorites.push(id)
    if (!saved) state.favorites = state.favorites.filter(value => value !== id)
    return saved
}

function dayNumber(date) {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / dayMs
}

export function dayStreak(study, now = new Date()) {
    const days = Object.keys(study.days).map(Number).sort((a, b) => a - b)
    let run = 0
    let best = 0
    let last = -Infinity
    for (const day of days) {
        run = day === last + 1 ? run + 1 : 1
        best = Math.max(best, run)
        last = day
    }
    const today = dayNumber(now)
    return {current: last === today || last === today - 1 ? run : 0, best}
}

export function award(state, id, date) {
    if (!state.achievements.some(entry => entry.id === id)) {
        state.achievements.push({id, earnedAt: date})
    }
}

export function recordStudyAnswer(state, question, selected, at) {
    const {study} = state
    const correct = question.correctOptionId === selected
    const key = answerKey(question.id)
    const firstAnswer = !Object.hasOwn(study.latest, key)
    // Reinserting keeps the bank in answer order, including answers across open attempts.
    delete study.latest[key]
    study.latest[key] = correct ? {correct} : {correct, question, selected}
    study.correctRun = correct ? study.correctRun + 1 : 0
    study.bestCorrectRun = Math.max(study.bestCorrectRun, study.correctRun)
    const day = dayNumber(new Date(at))
    if (Number.isFinite(day) && !Object.hasOwn(study.days, day)) {
        study.days[day] = true
        if (dayStreak(study, new Date(at)).best >= 7) award(state, 'consistent', at)
    }
    if (firstAnswer && !state.achievements.some(entry => entry.id === 'distinct100') &&
        Object.keys(study.latest).length >= 100) award(state, 'distinct100', at)
    if (study.correctRun >= 100) award(state, 'correct100', at)
}

export function lectureProgress(lecture, study) {
    const total = lecture.questions.length
    let answered = 0
    let correct = 0
    for (const question of lecture.questions) {
        const result = study.latest[answerKey(question.id)]
        if (!result) continue
        answered++
        if (result.correct) correct++
    }
    return {total, answered, correct, coverage: total ? answered / total * 100 : 0, mastery: answered ? correct / answered * 100 : null}
}

export function mistakeBank(study) {
    return Object.values(study.latest).filter(entry => !entry.correct).reverse()
}

export function lectureComparison(history, lectureId) {
    const attempts = history.filter(attempt => quizKind(attempt) === 'lecture' && attempt.lectureId === lectureId)
    return {count: attempts.length, first: attempts[0], last: attempts.at(-1)}
}

export function migrateStudy(state) {
    state.study = newStudy()
    const attempts = [
        ...state.history.map(attempt => ({attempt, date: attempt.completedAt})),
        ...state.drafts.map(attempt => ({attempt, date: attempt.startedAt}))
    ]
    attempts.sort((a, b) => a.date.localeCompare(b.date))
    for (const {attempt, date} of attempts) {
        attempt.questions.forEach((question, index) => {
            const selected = attempt.answers[index]
            if (selected) recordStudyAnswer(state, question, selected, date)
        })
    }
    if (state.history.length >= 10) award(state, 'completed10', state.history[9].completedAt)
    return state
}
