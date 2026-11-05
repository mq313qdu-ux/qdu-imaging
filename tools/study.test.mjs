import assert from 'node:assert/strict'
import {test} from 'node:test'
import {validateContent} from '../site/js/content.js'
import {addStudyTime, moveQuestion, openAttempt, recordAnswer, removeDraft, score} from '../site/js/quiz.js'
import {createStore, storageKey} from '../site/js/storage.js'
import {dayStreak, lectureComparison, lectureProgress, mistakeBank, newStudy} from '../site/js/study.js'

const subject = {id: 'synthetic', repositoryId: 'qdu-tests', schemaVersion: 1, title: 'Synthetic', revision: '1'}
const options = [{id: 'yes', text: 'Correct'}, {id: 'no', text: 'Wrong'}]
const rows = Array.from({length: 101}, (_, i) => ({
    id: `synthetic-${i + 1}`, lectureId: 'lecture', text: `Question ${i + 1}`, options, correctOptionId: 'yes'
}))
const fixture = validateContent(subject, [{id: 'lecture', title: 'Synthetic lecture'}], rows, [])
const largeLecture = fixture.lectures[0]
const lecture = {...largeLecture, questions: largeLecture.questions.slice(0, 3)}
const state = () => ({drafts: [], history: [], achievements: [], study: newStudy()})
const onDay = day => new Date(2026, 9, day, 12).toISOString()

function answerAndMove(data, attempt, choices, date = onDay(1), time = 0) {
    addStudyTime(data, attempt.id, time)
    for (const [cursor, choice] of choices.entries()) {
        recordAnswer(data, attempt.id, cursor, choice, date)
        moveQuestion(data, attempt.id, cursor, 1, [lecture])
    }
    return data.history.at(-1)
}

test('coverage and mastery follow distinct latest answers across draft and custom tests', () => {
    const data = state()
    const full = openAttempt(data, lecture, '1')
    recordAnswer(data, full.id, 0, 'no', onDay(1))
    recordAnswer(data, full.id, 0, 'yes', onDay(1))
    assert.equal(mistakeBank(data.study).length, 1)
    const initial = lectureProgress(lecture, data.study)
    assert.equal(initial.coverage.toFixed(1), '33.3')
    assert.deepEqual([initial.total, initial.answered, initial.correct, initial.mastery], [3, 1, 0, 0])
    const source = {kind: 'mistakes', title: 'Practice', questions: [lecture.questions[0]]}
    const custom = openAttempt(data, source, '1')
    assert.equal(openAttempt(data, source, '1').id, custom.id)
    const completed = answerAndMove(data, custom, ['yes'])
    moveQuestion(data, custom.id, 0, 1, [lecture])
    assert.equal(data.history.length, 1)
    assert.equal(score(completed).percent, 100)
    assert.equal(mistakeBank(data.study).length, 0)
    assert.equal(full.answers[0], 'no')
    const corrected = lectureProgress(lecture, data.study)
    assert.equal(corrected.coverage, initial.coverage)
    assert.deepEqual([corrected.total, corrected.answered, corrected.correct, corrected.mastery], [3, 1, 1, 100])
    assert.equal(removeDraft(data, full.id), true)
    assert.equal(removeDraft(data, full.id), false)
    assert.equal(removeDraft(data, custom.id), false)
    assert.equal(lectureProgress(lecture, data.study).answered, 1)
})

test('comparisons use frozen full lecture attempts and exclude custom tests and other lectures', () => {
    const data = state()
    const first = answerAndMove(data, openAttempt(data, lecture, '1'), ['no', 'yes', 'no'], onDay(1), 15_000)
    const changed = {...lecture, questions: lecture.questions.slice(1)}
    const latest = answerAndMove(data, openAttempt(data, changed, '2'), ['yes', 'yes'], onDay(2), 9_000)
    const practice = {kind: 'favorites', id: lecture.id, title: 'Same ID', questions: lecture.questions}
    answerAndMove(data, openAttempt(data, practice, '2'), ['yes', 'yes', 'yes'], onDay(3))
    answerAndMove(data, openAttempt(data, {...lecture, id: 'other'}, '2'), ['yes', 'yes', 'yes'], onDay(3))
    assert.deepEqual(lectureComparison(data.history, lecture.id), {count: 2, first, last: latest})
    assert.equal(first.questions.length, 3)
    assert.equal(first.answers[0], 'no')
    assert.equal(first.activeTimeMs - latest.activeTimeMs, 6000)
    assert.equal(lectureProgress(changed, data.study).total, 2)
    const onlyWrong = state()
    const old = openAttempt(onlyWrong, lecture, '1')
    recordAnswer(onlyWrong, old.id, 0, 'no', onDay(1))
    removeDraft(onlyWrong, old.id)
    assert.equal(mistakeBank(onlyWrong.study)[0].question.id, lecture.questions[0].id)
    assert.equal(lectureProgress(changed, onlyWrong.study).answered, 0)
})

test('thresholds award once, streaks reset independently and unique counts ignore repeats', () => {
    const data = state()
    const large = openAttempt(data, largeLecture, '1')
    for (let i = 0; i < 100; i++) {
        const date = onDay(1 + Math.floor(i / 15))
        recordAnswer(data, large.id, i, 'yes', date)
        recordAnswer(data, large.id, i, 'yes', date)
        moveQuestion(data, large.id, i, 1, [largeLecture])
    }
    assert.equal(data.study.correctRun, 100)
    assert.equal(data.study.bestCorrectRun, 100)
    assert.deepEqual(dayStreak(data.study, new Date(onDay(8))), {current: 7, best: 7})
    assert.deepEqual(dayStreak(data.study, new Date(onDay(9))), {current: 0, best: 7})
    recordAnswer(data, large.id, 100, 'no', onDay(9))
    assert.equal(data.study.correctRun, 0)
    assert.equal(data.study.bestCorrectRun, 100)
    moveQuestion(data, large.id, 100, 1, [largeLecture])
    const single = {kind: 'favorites', title: 'Practice', questions: [lecture.questions[0]]}
    for (let i = 0; i < 10; i++) answerAndMove(data, openAttempt(data, single, '1'), ['yes'], onDay(9))
    assert.equal(Object.keys(data.study.latest).length, 101)
    assert.equal(data.history.length, 11)
    assert.equal(data.study.correctRun, 10)
    for (const id of ['distinct100', 'completed10', 'correct100', 'consistent', 'perfect']) {
        assert.equal(data.achievements.filter(entry => entry.id === id).length, 1, id)
    }
})

test('version 1 migrates under the same subject key and version 2 reload preserves exactly once', async () => {
    const base = new URL('https://example.test/qdu-tests/')
    const key = storageKey(base, subject)
    const draft = {...openAttempt(state(), lecture, '1'), startedAt: onDay(1), answers: ['no']}
    delete draft.kind
    const legacy = {
        version: 1, settings: {dark: true, autoAdvance: false},
        drafts: [draft], history: [], achievements: [], favorites: [lecture.questions[0].id]
    }
    const disk = new Map([[key, JSON.stringify(legacy)]])
    globalThis.localStorage = {getItem: key => disk.get(key) ?? null, setItem: (key, value) => disk.set(key, value)}
    const create = (scope = key) => createStore(scope, message => assert.fail(message))
    const store = create()
    await store.update(() => {})
    assert.equal(JSON.parse(disk.get(key)).version, 2)
    const reload = create().read()
    assert.deepEqual(reload.favorites, legacy.favorites)
    assert.deepEqual(reload.drafts[0].answers, ['no'])
    assert.equal(mistakeBank(reload.study).length, 1)
    const practice = {kind: 'mistakes', title: 'Practice', questions: [lecture.questions[0]]}
    const retry = await store.update(data => openAttempt(data, practice, '1'))
    await Promise.all([
        create().update(data => recordAnswer(data, retry.id, 0, 'yes', onDay(2))),
        create().update(data => recordAnswer(data, retry.id, 0, 'yes', onDay(2)))
    ])
    assert.equal(create().read().study.correctRun, 1)
    assert.equal(create().read().study.bestCorrectRun, 1)
    for (const other of [{...subject, id: 'different'}, {...subject, repositoryId: 'different'}]) {
        assert.equal(create(storageKey(base, other)).read().drafts.length, 0)
    }
})
