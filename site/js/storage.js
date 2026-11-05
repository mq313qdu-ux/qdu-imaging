import {migrateStudy, newStudy} from './study.js'
import {normalizeSettings} from './settings.js'

const version = 2

export function storageKey(base, subject) {
    return ['qdu', base.pathname, subject.repositoryId, subject.id].map(encodeURIComponent).join(':')
}

export function createStore(key, onError) {
    let memory = {
        version,
        settings: normalizeSettings(),
        drafts: [],
        history: [],
        favorites: [],
        achievements: [],
        study: newStudy()
    }
    let available = true
    let lastRead = null

    function read() {
        if (!available) return memory
        try {
            const raw = localStorage.getItem(key)
            if (raw === null || raw === lastRead) return memory
            const saved = JSON.parse(raw)
            if (![1, version].includes(saved?.version) ||
                !['drafts', 'history', 'favorites', 'achievements'].every(field => Array.isArray(saved[field])) ||
                !isRecord(saved.settings) || typeof saved.settings.autoAdvance !== 'boolean') {
                throw new Error('Unsupported or invalid saved data')
            }
            if (saved.version === 1) {
                migrateStudy(saved)
                saved.version = version
            } else if (!isRecord(saved.study?.latest) || !isRecord(saved.study.days) ||
                !Number.isInteger(saved.study.correctRun) || !Number.isInteger(saved.study.bestCorrectRun)) {
                throw new Error('Invalid study data')
            }
            saved.settings = normalizeSettings(saved.settings)
            memory = saved
            lastRead = raw
        } catch {
            available = false
            onError('تعذّر قراءة الحفظ المحلي. يمكنك المتابعة في هذه الصفحة، وتبقى البيانات السابقة محفوظة كما هي.')
        }
        return memory
    }

    function commit(change) {
        const state = read()
        const result = change(state)
        if (available) {
            try {
                const raw = JSON.stringify(state)
                localStorage.setItem(key, raw)
                lastRead = raw
            } catch {
                available = false
                onError('تعذّر حفظ التغييرات في المتصفح. تبقى تغييرات هذه الجلسة متاحة حتى إغلاق الصفحة أو تحديثها.')
            }
        }
        return result
    }

    return {
        read,
        // Serialize read/modify/write across tabs where Web Locks are available.
        update(change) {
            return navigator.locks
                ? navigator.locks.request(key, () => commit(change))
                : Promise.resolve(commit(change))
        }
    }
}

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
