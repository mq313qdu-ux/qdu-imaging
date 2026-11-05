export const themeLabels = {system: 'النظام', light: 'فاتح', dark: 'داكن'}
const themes = Object.keys(themeLabels)

export function normalizeSettings(settings = {}) {
    const theme = themes.includes(settings.theme) ? settings.theme :
        typeof settings.dark === 'boolean' ? (settings.dark ? 'dark' : 'light') : 'system'
    return {
        theme,
        autoAdvance: settings.autoAdvance !== false,
        sounds: settings.sounds === true,
        haptics: settings.haptics === true,
        deterrence: settings.deterrence !== false
    }
}

export function nextTheme(theme) {
    return themes[(themes.indexOf(theme) + 1) % themes.length]
}

export function themeIsDark(theme, systemDark) {
    return theme === 'dark' || (theme === 'system' && systemDark)
}
