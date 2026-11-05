function paragraph(text, className) {
    const node = document.createElement('p')
    if (className) node.className = className
    node.textContent = text
    node.dir = 'auto'
    return node
}

export function explanationContent(question) {
    const correct = paragraph(question.explanation || 'ماكو تعليل مضاف للإجابة الصحيحة بعد.')
    const nodes = [correct]
    const alternatives = question.options.filter(option => option.id !== question.correctOptionId)
    if (!alternatives.length) return nodes
    const heading = paragraph('ليش الاختيارات الثانية مو الإجابة؟', 'education-subtitle')
    const list = document.createElement('ul')
    for (const option of alternatives) {
        const item = document.createElement('li')
        const label = document.createElement('bdi')
        label.textContent = option.text
        const reason = document.createElement('bdi')
        const source = question.optionExplanations
        reason.textContent = source && Object.hasOwn(source, option.id) ? source[option.id] : 'ماكو تعليل مضاف لهذا الاختيار.'
        item.append(label, ' — ', reason)
        list.append(item)
    }
    return [...nodes, heading, list]
}

export function createEducationControls(root) {
    const mode = root.querySelector('#translationMode')
    const questionText = root.querySelector('#questionTranslation')
    const hint = root.querySelector('#hintText')
    const why = root.querySelector('#whyText')
    let question
    let optionTexts = []

    function applyTranslations() {
        questionText.hidden = !['question', 'both'].includes(mode.value)
        for (const node of optionTexts) node.hidden = !['options', 'both'].includes(mode.value)
    }

    mode.addEventListener('change', applyTranslations)
    return {
        setQuestion(next, translations) {
            question = next
            optionTexts = translations
            questionText.textContent = question.translation || 'ماكو ترجمة مضافة للسؤال بعد.'
            hint.textContent = question.hint || 'ماكو تلميح مضاف لهذا السؤال.'
            root.querySelector('#hintPanel').open = false
            root.querySelector('#whyPanel').open = false
            applyTranslations()
        },
        setAnswered(answered) {
            why.replaceChildren(...(answered ? explanationContent(question) : [paragraph('جاوب أول، وبعدين تگدر تشوف التعليل.')]))
        }
    }
}
