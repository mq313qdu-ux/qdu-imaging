export const contentFiles = ['subject', 'lectures', 'questions', 'enrichment']
const idPattern = /^[a-z0-9][a-z0-9._-]*$/i

function requireData(condition, file, message) {
    if (!condition) throw new Error(`${file}.json — ${message}`)
}

function nonempty(value) {
    return typeof value === 'string' && value.trim().length > 0
}

function validId(value) {
    return typeof value === 'string' && idPattern.test(value)
}

function indexRows(rows, file, key = 'id') {
    requireData(Array.isArray(rows), file, 'القيمة المطلوبة قائمة JSON.')
    const index = new Map()
    rows.forEach((row, i) => {
        const id = row?.[key]
        requireData(validId(id), file, `معرّف غير صالح في السجل ${i + 1}.`)
        requireData(!index.has(id), file, `المعرّف ${id} مكرر.`)
        index.set(id, row)
    })
    return index
}

export function validateContent(subject, lectureRows, questionRows, enrichmentRows) {
    requireData(subject?.schemaVersion === 1, 'subject', 'إصدار بنية المحتوى غير مدعوم.')
    requireData(validId(subject.id) && validId(subject.repositoryId), 'subject', 'يلزم معرّف ثابت للمادة والمستودع.')
    requireData(nonempty(subject.revision), 'subject', 'يلزم رقم أو اسم إصدار المحتوى كنص.')
    for (const field of ['title', 'credit', 'badge']) {
        requireData(typeof (subject[field] ?? '') === 'string', 'subject', `الحقل ${field} يجب أن يكون نصًا.`)
    }
    requireData(subject.direction === undefined || ['rtl', 'ltr'].includes(subject.direction), 'subject', 'اتجاه العرض يجب أن يكون rtl أو ltr.')

    const lectureIndex = indexRows(lectureRows, 'lectures')
    const questionIndex = indexRows(questionRows, 'questions')
    const enrichment = indexRows(enrichmentRows, 'enrichment', 'questionId')
    requireData(lectureIndex.size === 0 || nonempty(subject.title), 'subject', 'أضف اسم المادة عند إدراج محاضرات.')

    for (const [id, entry] of enrichment) {
        requireData(questionIndex.has(id), 'enrichment', `السؤال ${id} غير موجود.`)
        for (const field of ['translation', 'explanation', 'hint']) {
            requireData(typeof (entry[field] ?? '') === 'string', 'enrichment', `الحقل ${field} للسؤال ${id} يجب أن يكون نصًا.`)
        }
    }

    const lectures = lectureRows.map(({id, title}) => {
        requireData(nonempty(title), 'lectures', `أضف عنوان المحاضرة ${id}.`)
        return {id, title, questions: []}
    })
    const lecturesById = new Map(lectures.map(lecture => [lecture.id, lecture]))
    const questions = new Map()
    for (const [id, row] of questionIndex) {
        const lecture = lecturesById.get(row.lectureId)
        requireData(lecture, 'questions', `محاضرة السؤال ${id} غير موجودة.`)
        requireData(nonempty(row.text), 'questions', `أضف نص السؤال ${id}.`)
        const options = indexRows(row.options, 'questions')
        requireData(options.size > 0 && [...options.values()].every(option => nonempty(option.text)),
            'questions', `أضف اختيارات صالحة للسؤال ${id}.`)
        requireData(options.has(row.correctOptionId), 'questions', `معرّف الإجابة الصحيحة للسؤال ${id} غير موجود في الاختيارات.`)
        const entry = enrichment.get(id) ?? {}
        const question = {
            id, text: row.text, options: row.options, correctOptionId: row.correctOptionId,
            translation: entry.translation?.trim() ?? '',
            explanation: entry.explanation?.trim() ?? '',
            hint: entry.hint?.trim() ?? ''
        }
        for (const field of ['optionTranslations', 'optionExplanations']) {
            const values = entry[field] ?? {}
            requireData(typeof values === 'object' && !Array.isArray(values), 'enrichment', `الحقل ${field} للسؤال ${id} يجب أن يكون كائنًا.`)
            for (const [optionId, value] of Object.entries(values)) {
                requireData(options.has(optionId) && nonempty(value), 'enrichment', `بيانات الاختيار ${optionId} في ${field} للسؤال ${id} غير صالحة.`)
            }
            question[field] = values
        }
        lecture.questions.push(question)
        questions.set(id, question)
    }
    return {subject, lectures, questions}
}

export async function loadContent(base) {
    const data = await Promise.all(contentFiles.map(async file => {
        try {
            const response = await fetch(new URL(`data/${file}.json`, base), {cache: 'no-cache'})
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            return await response.json()
        } catch (error) {
            throw new Error(`تعذّر تحميل data/${file}.json (${error.message}).`, {cause: error})
        }
    }))
    return validateContent(...data)
}
