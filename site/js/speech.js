const femaleVoice = /\b(female|zira|jenny|aria|ava|emma|samantha|victoria|karen|tessa|sonia|libby|hazel|susan|natasha|salma|hoda|laila|mariam|fatima|zeina|naayfah)\b|سلمى|مريم|ليلى|فاطمة|هدى|زينة/i

export function rankedVoices(voices, language) {
    const prefix = language.toLowerCase()
    const matches = voice => voice.lang.toLowerCase().replaceAll('_', '-').split('-')[0] === prefix
    const rank = voice => Number(femaleVoice.test(voice.name)) * 4 +
        Number(voice.lang.toLowerCase().replaceAll('_', '-') === 'ar-iq') * 2 + Number(Boolean(voice.default))
    return voices.filter(matches).sort((a, b) => rank(b) - rank(a))
}

export function speechText(question, language, includeOptions) {
    if (!question) return ''
    const translated = language === 'ar'
    const text = translated ? question.translation : question.text
    if (!text?.trim()) return ''
    if (!includeOptions) return text
    const translations = question.optionTranslations ?? {}
    const choices = question.options.map(option => {
        if (!translated) return option.text
        return Object.hasOwn(translations, option.id) ? translations[option.id] : ''
    })
    if (choices.some(choice => !choice?.trim())) return ''
    return [text, ...choices.map((choice, index) => `${index + 1}. ${choice}`)].join('\n')
}

export function createSpeechControls(root) {
    const synth = window.speechSynthesis
    const supported = Boolean(synth && window.SpeechSynthesisUtterance)
    const language = root.querySelector('#speechLanguage')
    const scope = root.querySelector('#speechScope')
    const voice = root.querySelector('#speechVoice')
    const rate = root.querySelector('#speechRate')
    const rateValue = root.querySelector('#speechRateValue')
    const play = root.querySelector('#speechPlay')
    const stopButton = root.querySelector('#speechStop')
    const status = root.querySelector('#speechStatus')
    const preferred = new Map()
    let question
    let availableVoices = []
    let utterance
    let readingStarted = false
    let playbackError = ''

    function refresh() {
        availableVoices = supported ? rankedVoices(synth.getVoices(), language.value) : []
        voice.replaceChildren()
        if (availableVoices.length) {
            for (const item of availableVoices) {
                voice.add(new Option(`${item.name} (${item.lang})`, item.voiceURI))
            }
            const requested = preferred.get(language.value)
            if (availableVoices.some(item => item.voiceURI === requested)) voice.value = requested
        } else {
            voice.add(new Option('لا توجد أصوات متاحة', ''))
        }
        const text = speechText(question, language.value, scope.value === 'all')
        voice.disabled = !availableVoices.length
        play.disabled = !availableVoices.length || !text || Boolean(utterance)
        stopButton.disabled = !utterance
        status.textContent = utterance ? (readingStarted ? 'القراءة جارية…' : 'جارٍ تجهيز القراءة…') :
            !supported ? 'القراءة الصوتية غير مدعومة في هذا المتصفح.' :
            !text ? 'ترجمة هذا النطاق غير مكتملة. اختر الإنجليزية أو قراءة السؤال فقط إذا كانت ترجمته متاحة.' :
            !availableVoices.length ? 'ماكو صوت متاح بهذه اللغة على جهازك حاليًا.' : playbackError
    }

    function stop() {
        if (utterance) {
            utterance = null
            synth.cancel()
            refresh()
        }
    }

    function updateSelection() {
        playbackError = ''
        stop()
        refresh()
    }

    for (const field of [language, scope]) field.addEventListener('change', updateSelection)
    voice.addEventListener('change', () => {
        preferred.set(language.value, voice.value)
        updateSelection()
    })
    rate.addEventListener('input', () => { rateValue.value = `${rate.value}×` })
    rate.addEventListener('change', stop)
    root.addEventListener('toggle', () => {
        if (root.open) refresh()
        else stop()
    })
    stopButton.addEventListener('click', stop)
    play.addEventListener('click', () => {
        const selected = availableVoices.find(item => item.voiceURI === voice.value)
        const text = speechText(question, language.value, scope.value === 'all')
        if (!selected || !text || utterance) return
        const reading = new SpeechSynthesisUtterance(text)
        reading.lang = selected.lang
        reading.voice = selected
        reading.rate = Number(rate.value)
        readingStarted = false
        playbackError = ''
        utterance = reading
        function finish(failed) {
            if (utterance !== reading) return
            utterance = null
            if (failed) playbackError = 'تعذّر تشغيل القراءة بهذا الصوت. جرّب صوتًا آخر متاحًا.'
            refresh()
        }
        reading.onstart = () => {
            if (utterance !== reading) return
            readingStarted = true
            status.textContent = 'القراءة جارية…'
        }
        reading.onend = () => finish(!readingStarted)
        reading.onerror = () => finish(true)
        refresh()
        try {
            synth.speak(reading)
        } catch {
            finish(true)
        }
    })
    if (supported) synth.addEventListener?.('voiceschanged', refresh)
    return {
        stop,
        setQuestion(next) {
            playbackError = ''
            stop()
            question = next
            refresh()
        }
    }
}
