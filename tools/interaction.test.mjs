import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createEducationControls} from '../site/js/education.js'
import {createFeedback} from '../site/js/feedback.js'
import {createSpeechControls, rankedVoices, speechText} from '../site/js/speech.js'
import {nextTheme, normalizeSettings, themeIsDark} from '../site/js/settings.js'
import {setFavorite} from '../site/js/study.js'

class Control extends EventTarget {
    constructor(value = '') {
        super()
        this.value = value
        this.options = []
        this.textContent = ''
    }
    replaceChildren(...nodes) {
        this.options = []
        this.value = ''
        this.children = nodes
    }
    add(option) {
        if (!this.options.length) this.value = option.value
        this.options.push(option)
    }
    append(...nodes) { (this.children ??= []).push(...nodes) }
    fire(type) { this.dispatchEvent(new Event(type)) }
}

function controls(values) {
    const elements = new Map(Object.entries(values).map(([id, value]) => [`#${id}`, new Control(value)]))
    const root = new Control()
    root.querySelector = id => elements.get(id)
    return root
}

const question = {
    text: 'What is the answer?', translation: 'شنو الإجابة؟', hint: 'راجع السؤال.',
    explanation: 'التعليل', correctOptionId: 'a', options: [{id: 'a', text: 'One'}, {id: 'b', text: 'Two'}],
    optionTranslations: {a: 'واحد', b: 'اثنين'}, optionExplanations: {b: 'تعليل البديل'}
}

test('theme preferences migrate, cycle and follow the system only in System mode', () => {
    assert.equal(normalizeSettings().theme, 'system')
    assert.equal(normalizeSettings({dark: false}).theme, 'light')
    assert.equal(normalizeSettings({dark: true}).theme, 'dark')
    assert.equal(normalizeSettings({dark: true, theme: 'system'}).theme, 'system')
    assert.deepEqual(['system', 'light', 'dark'].map(nextTheme), ['light', 'dark', 'system'])
    assert.equal(themeIsDark('system', true), true)
    assert.equal(themeIsDark('system', false), false)
    assert.equal(themeIsDark('light', true), false)
    assert.equal(themeIsDark('dark', false), true)
})

test('favorites are idempotent when an action is repeated', () => {
    const state = {favorites: []}
    assert.equal(setFavorite(state, 'q1', true), true)
    setFavorite(state, 'q1', true)
    setFavorite(state, 'q2', true)
    assert.deepEqual(state.favorites, ['q1', 'q2'])
    setFavorite(state, 'q1', false)
    setFavorite(state, 'q1', false)
    assert.deepEqual(state.favorites, ['q2'])
})

test('translation modes leave source text alone and explanations are hidden until answered', () => {
    globalThis.document = {createElement: () => new Control()}
    const root = controls({translationMode: 'none', questionTranslation: '', hintText: '', whyText: '', hintPanel: '', whyPanel: ''})
    const get = id => root.querySelector(`#${id}`)
    const education = createEducationControls(root)
    const choices = [new Control(), new Control()]
    education.setQuestion(question, choices)
    education.setAnswered(false)
    assert.match(get('whyText').children[0].textContent, /جاوب أول/)
    assert.equal(get('hintText').textContent, question.hint)
    for (const [mode, questionHidden, choiceHidden] of [
        ['none', true, true], ['question', false, true], ['options', true, false], ['both', false, false]
    ]) {
        get('translationMode').value = mode
        get('translationMode').fire('change')
        assert.equal(get('questionTranslation').hidden, questionHidden)
        assert(choices.every(choice => choice.hidden === choiceHidden))
    }
    assert.equal(question.text, 'What is the answer?')
    education.setAnswered(true)
    assert.equal(get('whyText').children[0].textContent, question.explanation)
    assert.equal(get('whyText').children[2].children[0].children[2].textContent, 'تعليل البديل')
    education.setQuestion({...question, translation: '', hint: '', explanation: '', optionExplanations: {}}, choices)
    education.setAnswered(true)
    assert.match(get('questionTranslation').textContent, /ماكو ترجمة/)
    assert.match(get('hintText').textContent, /ماكو تلميح/)
    assert.match(get('whyText').children[0].textContent, /ماكو تعليل/)
})

test('speech handles delayed voices, Arabic or English scope, speed, missing data and stop', () => {
    const root = controls({speechLanguage: 'ar', speechScope: 'all', speechVoice: '', speechRate: '1.3',
        speechRateValue: '', speechPlay: '', speechStop: '', speechStatus: ''})
    const get = id => root.querySelector(`#${id}`)
    const ar = {name: 'Salma', voiceURI: 'salma', lang: 'ar-IQ'}
    const en = {name: 'Microsoft Zira', voiceURI: 'zira', lang: 'en-US'}
    const other = {name: 'David', voiceURI: 'david', lang: 'en-US', default: true}
    assert.deepEqual(rankedVoices([other, ar, en], 'en'), [en, other])
    const synth = new EventTarget()
    let voices = []
    let reading
    synth.getVoices = () => voices
    synth.speak = value => { reading = value; reading.onstart() }
    synth.cancel = () => { const stopped = reading; reading = undefined; stopped?.onend() }
    globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
    globalThis.Option = class { constructor(text, value) { this.text = text; this.value = value } }
    globalThis.window = {speechSynthesis: synth, SpeechSynthesisUtterance}
    const speech = createSpeechControls(root)
    speech.setQuestion(question)
    assert.equal(get('speechPlay').disabled, true)
    assert.match(get('speechStatus').textContent, /ماكو صوت/)
    voices = [en, ar]
    synth.dispatchEvent(new Event('voiceschanged'))
    assert.equal(get('speechPlay').disabled, false)
    assert.equal(reading, undefined)
    get('speechPlay').fire('click')
    assert.equal(reading.text, speechText(question, 'ar', true))
    assert.equal(reading.voice, ar)
    assert.equal(reading.rate, 1.3)
    get('speechStop').fire('click')
    assert.equal(reading, undefined)
    get('speechLanguage').value = 'en'
    get('speechScope').value = 'question'
    get('speechLanguage').fire('change')
    get('speechPlay').fire('click')
    assert.equal(reading.text, question.text)
    speech.setQuestion({...question, optionTranslations: {}})
    assert.equal(reading, undefined)
    assert.equal(speechText({...question, optionTranslations: {}}, 'ar', true), '')
})

test('feedback respects preferences and reduced motion and cancels device vibration', () => {
    const pulses = []
    const feedback = createFeedback({navigator: {vibrate: value => { pulses.push(value); return true }}})
    feedback.prepare(true)
    feedback.play(true, {sounds: true, haptics: true}, true)
    feedback.play(true, {sounds: false, haptics: false}, false)
    assert.deepEqual(pulses, [])
    feedback.play(false, {sounds: false, haptics: true}, false)
    feedback.close()
    assert.deepEqual(pulses, [[35, 35, 45], 0])
})

test('short answer sounds release their audio nodes when stopped or closed', () => {
    const events = []
    const parameter = {
        setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}
    }
    class Audio {
        state = 'running'
        currentTime = 0
        createOscillator() {
            return {
                frequency: parameter,
                connect: node => node,
                start: () => events.push('start'),
                stop(at) { if (at === undefined) this.onended() },
                disconnect: () => events.push('oscillator disconnected')
            }
        }
        createGain() {
            return {gain: parameter, connect() {}, disconnect: () => events.push('gain disconnected')}
        }
        async close() { this.state = 'closed'; events.push('closed') }
    }
    const feedback = createFeedback({AudioContext: Audio})
    feedback.prepare(true)
    feedback.play(true, {sounds: true, haptics: false}, false)
    feedback.close()
    assert.deepEqual(events, ['start', 'oscillator disconnected', 'gain disconnected', 'closed'])
})
