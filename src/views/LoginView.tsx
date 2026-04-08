import { useState, useCallback } from 'react'
import { APP_CONFIG } from '@/lib/constants'
import { Haptics } from '@/lib/haptics'
import { useAuth } from '@/contexts/AuthContext'

export function LoginView() {
  const { login, isLoading, error: authError } = useAuth()
  const [pin, setPin] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [isLocked, setIsLocked] = useState(false)
  const [localError, setLocalError] = useState(false)

  const appendDigit = useCallback(async (digit: string) => {
    if (isLocked || isLoading || pin.length >= 4) return
    const next = pin + digit
    setLocalError(false)
    Haptics.light()
    setPin(next)

    if (next.length === 4) {
      const success = await login(next)

      if (!success) {
        Haptics.error()
        const newAttempts = attempts + 1
        setAttempts(newAttempts)
        setLocalError(true)
        setPin('')

        if (newAttempts >= APP_CONFIG.maxLoginAttempts) {
          setIsLocked(true)
          setTimeout(() => {
            setIsLocked(false)
            setAttempts(0)
          }, APP_CONFIG.lockoutDurationMs)
        }
      } else {
        Haptics.success()
      }
    }
  }, [pin, isLocked, isLoading, attempts, login])

  const deleteDigit = useCallback(() => {
    if (pin.length === 0) return
    setPin(p => p.slice(0, -1))
    setLocalError(false)
  }, [pin])

  const PinButton = ({ label, onPress, dim }: { label: string; onPress: () => void; dim?: boolean }) => (
    <button
      onClick={onPress}
      disabled={isLocked || isLoading}
      className={`w-[72px] h-[72px] rounded-full bg-surface flex items-center justify-center
        active:bg-surface-hover transition-colors disabled:opacity-50
        ${dim ? 'text-gray text-base' : 'text-white text-2xl'} font-semibold`}
    >
      {label}
    </button>
  )

  const displayError = isLocked
    ? 'Too many attempts. Try again later.'
    : authError ?? (localError ? 'Incorrect PIN' : null)

  return (
    <div className="h-full flex flex-col items-center justify-center bg-bg px-8">
      {/* Wordmark */}
      <p
        className="text-maroon text-4xl tracking-[8px] uppercase"
        style={{ fontFamily: "'SF Pro Rounded', -apple-system, system-ui, sans-serif", fontWeight: 300 }}
      >
        VOX
      </p>
      <p className="text-gray text-[13px] -mt-1 mb-16">Main Street Cafe</p>

      {/* PIN dots */}
      <div className="flex gap-4 mb-4">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`w-3.5 h-3.5 rounded-full transition-colors duration-200 ${
              i < pin.length ? 'bg-maroon' : 'bg-gray-dim'
            }`}
          />
        ))}
      </div>

      {/* Status */}
      <div className="h-5 mb-4">
        {isLoading && <p className="text-gray text-[13px]">Checking...</p>}
        {!isLoading && displayError && <p className="text-error text-[13px]">{displayError}</p>}
      </div>

      {/* Number pad */}
      <div className="flex flex-col gap-4">
        {[
          ['1', '2', '3'],
          ['4', '5', '6'],
          ['7', '8', '9'],
        ].map((row, ri) => (
          <div key={ri} className="flex gap-6 justify-center">
            {row.map(d => (
              <PinButton key={d} label={d} onPress={() => appendDigit(d)} />
            ))}
          </div>
        ))}
        <div className="flex gap-6 justify-center">
          <div className="w-[72px] h-[72px]" />
          <PinButton label="0" onPress={() => appendDigit('0')} />
          <PinButton label="Del" onPress={deleteDigit} dim />
        </div>
      </div>
    </div>
  )
}
