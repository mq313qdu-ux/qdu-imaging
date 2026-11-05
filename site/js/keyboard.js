export function quizKeyboard({active, choices, previous, next}) {
    let control = null
    const answerTarget = target => !target?.closest(
        'input, select, textarea, a[href], summary, [contenteditable], [role="textbox"], button:not(.option-btn)'
    )
    const moveTarget = target => answerTarget(target) || target?.closest('#quizNavigation button')

    function confirm(target) {
        const options = choices()
        const selected = options.find(option => option === target) ?? options.find(option => option === document.activeElement)
        selected?.click()
        return Boolean(selected)
    }

    document.addEventListener('keydown', event => {
        if (event.key === 'Control') {
            if (!event.repeat) {
                control = active() && answerTarget(event.target) && !event.defaultPrevented &&
                    !event.altKey && !event.shiftKey && !event.metaKey ? event.code : null
            }
            return
        }
        control = null
        if (!active() || event.defaultPrevented || event.isComposing ||
            event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return

        if (['ArrowUp', 'ArrowDown'].includes(event.key) && answerTarget(event.target)) {
            const options = choices()
            if (!options.length) return
            const index = options.indexOf(document.activeElement)
            const direction = event.key === 'ArrowDown' ? 1 : -1
            const target = index < 0 ? (direction > 0 ? 0 : options.length - 1) : index + direction
            event.preventDefault()
            options[Math.max(0, Math.min(options.length - 1, target))].focus()
        } else if (event.code === 'Space' && answerTarget(event.target) && !event.repeat) {
            if (confirm(event.target)) event.preventDefault()
        } else if (['ArrowRight', 'ArrowLeft'].includes(event.key) && moveTarget(event.target) && !event.repeat) {
            const moved = event.key === 'ArrowRight' ? next() : previous()
            if (moved) event.preventDefault()
        }
    })

    document.addEventListener('keyup', event => {
        if (event.key !== 'Control') return
        const alone = control !== null && control === event.code
        control = null
        if (alone && active() && answerTarget(event.target) && !event.defaultPrevented &&
            !event.altKey && !event.shiftKey && !event.metaKey && !event.ctrlKey && confirm(event.target)) event.preventDefault()
    })
    for (const event of ['pointerdown', 'visibilitychange']) {
        document.addEventListener(event, () => { control = null })
    }
    window.addEventListener('blur', () => { control = null })
}
