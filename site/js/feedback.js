export function createFeedback(env = window) {
    const Audio = env.AudioContext ?? env.webkitAudioContext
    const nodes = new Set()
    let context
    let vibrating = false

    function prepare(enabled) {
        if (!enabled || !Audio) return
        try {
            context ??= new Audio()
            if (context.state === 'suspended') void context.resume().catch(() => {})
        } catch {
            // Playback is optional when the device denies audio.
        }
    }

    function play(correct, {sounds, haptics}, reduced) {
        if (haptics && !reduced && env.navigator?.vibrate) {
            try {
                vibrating = env.navigator.vibrate(correct ? 30 : [35, 35, 45])
            } catch {
                // Device policies can disable vibration.
            }
        }
        if (!sounds || context?.state !== 'running') return
        try {
            tone(correct)
        } catch {
            // A restricted audio engine must not interrupt the quiz.
        }
    }

    function tone(correct) {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        const now = context.currentTime
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(correct ? 520 : 250, now)
        oscillator.frequency.exponentialRampToValueAtTime(correct ? 780 : 160, now + 0.14)
        gain.gain.setValueAtTime(0.001, now)
        gain.gain.linearRampToValueAtTime(0.08, now + 0.025)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
        const release = () => {
            nodes.delete(oscillator)
            oscillator.disconnect()
            gain.disconnect()
        }
        try {
            oscillator.connect(gain).connect(context.destination)
            nodes.add(oscillator)
            oscillator.onended = release
            oscillator.start(now)
            oscillator.stop(now + 0.19)
        } catch (error) {
            oscillator.onended = null
            release()
            throw error
        }
    }

    function stop() {
        if (vibrating) {
            try { env.navigator.vibrate(0) } catch {}
        }
        vibrating = false
        for (const node of nodes) {
            try { node.stop() } catch {}
        }
    }

    function close() {
        stop()
        if (context && context.state !== 'closed') void context.close().catch(() => {})
        context = undefined
    }

    return {prepare, play, stop, close}
}
