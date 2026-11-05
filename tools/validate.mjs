import {readFile, readdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {contentFiles, validateContent} from '../site/js/content.js'

const utf8 = new TextDecoder('utf-8', {fatal: true})
const root = new URL('../', import.meta.url)
const demoId = id => /^demo-|^qdu-(local-)?demo(?:$|[-._])/i.test(id)

export async function readContent(directory) {
    const data = await Promise.all(contentFiles.map(async name => {
        const file = new URL(`${name}.json`, directory)
        try {
            return JSON.parse(utf8.decode(await readFile(file)))
        } catch (error) {
            throw new Error(`${fileURLToPath(file)}: ${error.message}`, {cause: error})
        }
    }))
    return validateContent(...data)
}

export function validateProduction(content, publish = false) {
    const {subject, lectures, questions} = content
    if (demoId(subject.id) || demoId(subject.repositoryId) ||
        lectures.some(lecture => demoId(lecture.id)) || [...questions.keys()].some(demoId)) {
        throw new Error('Production data uses reserved Demo identifiers.')
    }
    if (publish && (subject.id === 'unconfigured' || subject.repositoryId === 'qdu-template' ||
        !subject.title?.trim() || !questions.size)) {
        throw new Error('Publishing requires a configured subject, repository ID and at least one question.')
    }
    return content
}

async function main() {
    const publish = process.argv.includes('--publish')
    const directory = new URL('site/data/', root)
    const production = validateProduction(await readContent(directory), publish)
    if (publish) {
        const allowed = new Set(contentFiles.map(name => `${name}.json`))
        const entries = await readdir(directory, {withFileTypes: true})
        if (entries.some(entry => !entry.isFile() || !allowed.has(entry.name))) {
            throw new Error('Publishing accepts only the four production files inside site/data/.')
        }
    }
    console.log(`Production: ${production.lectures.length} lectures, ${production.questions.size} questions`)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    main().catch(error => {
        console.error(error.message)
        process.exitCode = 1
    })
}
