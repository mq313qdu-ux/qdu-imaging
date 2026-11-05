import assert from 'node:assert/strict'
import {once} from 'node:events'
import {spawn} from 'node:child_process'
import {test} from 'node:test'
import {loadContent, validateContent} from '../site/js/content.js'
import {readContent, validateProduction} from './validate.mjs'

const subject = {schemaVersion: 1, id: 'qa', repositoryId: 'qa-site', title: 'QA', revision: '1', direction: 'ltr'}
const lecture = {id: 'l1', title: 'Lecture'}
const question = {
    id: 'q1', lectureId: lecture.id, text: 'Question',
    options: [{id: 'a', text: 'A'}, {id: 'b', text: 'B'}], correctOptionId: 'a'
}

test('the data schema rejects duplicate IDs, unknown relationships and invalid correct options', () => {
    assert.throws(() => validateContent(subject, [lecture, lecture], [], []), /lectures\.json/)
    assert.throws(() => validateContent(subject, [lecture], [question, question], []), /questions\.json/)
    assert.throws(() => validateContent(subject, [], [question], []), /questions\.json/)
    const invalid = [
        {...question, correctOptionId: 'missing'},
        {...question, options: [question.options[0], question.options[0]]},
        {...question, options: []}
    ]
    for (const row of invalid) assert.throws(() => validateContent(subject, [lecture], [row], []), /questions\.json/)
    assert.throws(() => validateContent({...subject, direction: 'auto'}, [lecture], [question], []), /subject\.json/)
    for (const enrichment of [
        [{questionId: 'missing', translation: 'ترجمة'}],
        [{questionId: 'q1', translation: 1}],
        [{questionId: 'q1', optionTranslations: {unknown: 'ترجمة'}}],
        [{questionId: 'q1', hint: 'تلميح'}, {questionId: 'q1', explanation: 'شرح'}]
    ]) assert.throws(() => validateContent(subject, [lecture], [question], enrichment), /enrichment\.json/)
    assert.equal(validateContent(subject, [lecture], [question], []).questions.size, 1)
})

test('the publication gate refuses empty or Demo data, and allows a configured subject', async () => {
    const empty = validateContent(subject, [], [], [])
    assert.throws(() => validateProduction(empty, true), /configured subject/)
    assert.throws(() => validateProduction(validateContent({...subject, id: 'qdu-demo'}, [lecture], [question], []), true), /Demo/)
    assert.throws(() => validateProduction(validateContent(subject, [lecture], [{...question, id: 'demo-question'}], [])), /Demo/)
    assert.equal(validateProduction(validateContent(subject, [lecture], [question], []), true).questions.size, 1)
})

test('assets and JSON load from GitHub Pages-style subpaths without exposing the Demo directory', {timeout: 12000}, async () => {
    const child = spawn(process.execPath, ['tools/serve.mjs', '0'],
        {stdio: ['ignore', 'pipe', 'inherit'], cwd: new URL('../', import.meta.url)})
    try {
        const [line] = await once(child.stdout, 'data', {signal: AbortSignal.timeout(5000)})
        const address = line.toString().match(/http:\/\/127\.0\.0\.1:\d+/)[0]
        const site = new URL('/qdu-imaging/', address)
        const loaded = await loadContent(site)
        const expected = await readContent(new URL('../site/data/', import.meta.url))
        assert.deepEqual(loaded, expected)
        const assets = ['index.html', 'css/tokens.css', 'css/qdu.css', 'css/study.css', 'icons.svg', 'css/fonts.css', 'js/app.js', 'js/presentation.js', 'js/feedback.js', 'js/settings.js', 'favicon.svg']
        for (const asset of assets) assert.equal((await fetch(new URL(asset, site))).status, 200, asset)
        const css = await (await fetch(new URL('css/fonts.css', site))).text()
        const fonts = [...css.matchAll(/url\((\.\.\/fonts\/[^)]+)\)/g)]
        assert.equal(fonts.length, 16)
        await Promise.all(fonts.map(async ([, relative]) => {
            const response = await fetch(new URL(relative, new URL('css/fonts.css', site)))
            assert.equal(response.headers.get('content-type'), 'font/woff2')
            const signature = new TextDecoder().decode((await response.arrayBuffer()).slice(0, 4))
            assert.equal(signature, 'wOF2')
        }))
        for (const path of ['/qdu-demo/', 'demo/data/questions.json', '%2e%2e%2fREADME.md', 'tools/study.test.mjs']) {
            assert.equal((await fetch(new URL(path, site))).status, 404)
        }
    } finally {
        child.kill()
    }
})
