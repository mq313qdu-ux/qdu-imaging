import {award, newStudy, quizKind, recordStudyAnswer} from './study.js'

export function matchingDraft(state, source) {
    const kind = quizKind(source)
    const ids = kind === 'lecture' ? null : new Set(source.questions.map(question => question.id))
    return state.drafts.find(draft => quizKind(draft) === kind && (kind === 'lecture'
        ? draft.lectureId === source.id
        : draft.questions.length === ids.size && draft.questions.every(question => ids.has(question.id))))
}

export function openAttempt(state, source, revision) {
    const kind = quizKind(source)
    const existing = matchingDraft(state, source)
    if (existing) return existing
    if (!source.questions.length) return null
    const attempt = {
        id: crypto.randomUUID(),
        kind,
        ...(kind === 'lecture' ? {lectureId: source.id} : {}),
        title: source.title,
        revision,
        startedAt: new Date().toISOString(),
        activeTimeMs: 0,
        questions: source.questions,
        answers: [],
        cursor: 0
    }
    state.drafts.push(attempt)
    return attempt
}

export function recordAnswer(state, attemptId, cursor, optionId, date = new Date().toISOString()) {
    const attempt = state.drafts.find(draft => draft.id === attemptId)
    const question = attempt?.questions[cursor]
    if (question && attempt.cursor === cursor && !attempt.answers[cursor] &&
        question.options.some(option => option.id === optionId)) {
        attempt.answers[cursor] = optionId
        state.study ??= newStudy()
        recordStudyAnswer(state, question, optionId, date)
    }
    return attempt
}

export function score(attempt) {
    const total = attempt.questions.length
    const correct = attempt.questions.filter((question, index) => question.correctOptionId === attempt.answers[index]).length
    return {total, correct, percent: total ? correct / total * 100 : 0}
}

export function removeDraft(state, id) {
    const index = state.drafts.findIndex(draft => draft.id === id)
    if (index < 0) return false
    state.drafts.splice(index, 1)
    return true
}

export function addStudyTime(state, attemptId, elapsedMs) {
    const attempt = state.drafts.find(draft => draft.id === attemptId)
    if (attempt) attempt.activeTimeMs = (attempt.activeTimeMs ?? 0) + elapsedMs
}

export function moveQuestion(state, attemptId, cursor, direction, lectures) {
    const attempt = state.drafts.find(draft => draft.id === attemptId)
    if (!attempt) return state.history.find(entry => entry.id === attemptId)
    if (attempt.cursor !== cursor) return attempt
    if (direction === -1) {
        attempt.cursor = Math.max(0, cursor - 1)
        return attempt
    }
    if (!attempt.answers[cursor]) return attempt
    if (cursor + 1 < attempt.questions.length) {
        attempt.cursor++
        return attempt
    }
    const unanswered = attempt.questions.findIndex((_, index) => !attempt.answers[index])
    if (unanswered !== -1) {
        attempt.cursor = unanswered
        return attempt
    }

    const finished = {...attempt, completedAt: new Date().toISOString()}
    removeDraft(state, attemptId)
    state.history.push(finished)
    const completedLectures = new Set(state.history.filter(entry => quizKind(entry) === 'lecture').map(entry => entry.lectureId))
    const availableLectures = lectures.filter(lecture => lecture.questions.length)
    const earned = {
        first: true,
        perfect: score(finished).percent === 100,
        completed10: state.history.length >= 10,
        all: availableLectures.length > 0 && availableLectures.every(lecture => completedLectures.has(lecture.id))
    }
    for (const [id, eligible] of Object.entries(earned)) {
        if (eligible) award(state, id, finished.completedAt)
    }
    return finished
}

