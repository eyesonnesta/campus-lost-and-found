import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Profile = { id: string; display_name: string; campus_id: string }
type Campus = { id: string; name: string }
type Mode = 'sign-in' | 'sign-up'

function formText(form: FormData, key: string) {
  const value = form.get(key)
  return typeof value === 'string' ? value : ''
}

export function AccountAccess({ openSignal = 0 }: { openSignal?: number }) {
  const [manualOpen, setManualOpen] = useState(false)
  const [dismissedSignal, setDismissedSignal] = useState(0)
  const [mode, setMode] = useState<Mode>('sign-in')
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [checkingProfile, setCheckingProfile] = useState(false)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [profileLoadFailed, setProfileLoadFailed] = useState(false)
  const [profileAttempt, setProfileAttempt] = useState(0)
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const open = manualOpen || openSignal > dismissedSignal
  const userId = user?.id
  const triggerRef = useRef<HTMLButtonElement>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const close = useCallback(() => {
    setManualOpen(false)
    setDismissedSignal(openSignal)
    setError('')
    setNotice('')
    triggerRef.current?.focus()
  }, [openSignal])

  useEffect(() => {
    if (!supabase) return
    let active = true
    let authEventSeen = false
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || authEventSeen) return
      if (sessionError) setError('Could not check your session. Please try again.')
      setUser(data.session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventSeen = true
      setUser(session?.user ?? null)
      if (!session) {
        setProfile(null)
        setProfileLoaded(false)
        setProfileLoadFailed(false)
      }
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!supabase || !userId) return
    const client = supabase
    let active = true
    // Keep database calls outside onAuthStateChange, which runs under the auth lock.
    const loadProfile = async () => {
      setCheckingProfile(true)
      setProfileLoaded(false)
      setProfileLoadFailed(false)
      const { data, error: profileError } = await client
        .from('profiles')
        .select('id, display_name, campus_id')
        .eq('id', userId)
        .maybeSingle()
      if (!active) return
      setCheckingProfile(false)
      if (profileError) {
        setProfileLoadFailed(true)
        setError('Could not load your campus profile. Please try again.')
        return
      }
      setProfile(data)
      setProfileLoaded(true)
    }
    void loadProfile()
    return () => { active = false }
  }, [userId, profileAttempt])

  useEffect(() => {
    if (!open || !userId || profile || !profileLoaded || checkingProfile || profileLoadFailed || !supabase) return
    const client = supabase
    let active = true
    void client.from('campuses').select('id, name').order('name').then(({ data, error: campusError }) => {
      if (!active) return
      if (campusError) setError('Could not load campuses. Please try again.')
      else setCampuses(data ?? [])
    })
    return () => { active = false }
  }, [open, userId, profile, profileLoaded, checkingProfile, profileLoadFailed])

  useEffect(() => {
    if (!open) return
    ;(firstFieldRef.current ?? closeRef.current)?.focus()
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)'))
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', keepFocusInside)
    return () => window.removeEventListener('keydown', keepFocusInside)
  }, [open, userId, profile, checkingProfile, mode, close])

  function changeMode(nextMode: Mode) {
    setMode(nextMode)
    setError('')
    setNotice('')
  }

  async function submitCredentials(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy) return
    const form = new FormData(event.currentTarget)
    const email = formText(form, 'email').trim().toLowerCase()
    const password = formText(form, 'password')
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (mode === 'sign-up') {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
        if (signUpError) throw signUpError
        if (!data.session) {
          setNotice('Check your email to confirm your account, then sign in. Campus access is checked after confirmation.')
          setMode('sign-in')
        } else setUser(data.session.user)
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
        setUser(data.user)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function submitProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !user || busy) return
    const form = new FormData(event.currentTarget)
    const displayName = formText(form, 'display_name').trim()
    const campusId = formText(form, 'campus_id')
    setError('')
    setBusy(true)
    try {
      const { data, error: insertError } = await supabase.from('profiles')
        .insert({ id: user.id, display_name: displayName, campus_id: campusId })
        .select('id, display_name, campus_id')
        .single()
      if (insertError) throw insertError
      setProfile(data)
      setNotice('Your campus profile is ready.')
    } catch {
      setError('Could not create your profile. Confirm your email and use a campus approved for its email domain.')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    if (!supabase || busy) return
    setBusy(true)
    setError('')
    const { error: signOutError } = await supabase.auth.signOut()
    setBusy(false)
    if (signOutError) setError('Could not sign out. Please try again.')
    else { setProfile(null); setNotice(''); close() }
  }

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => { setManualOpen(true); setError('') }}
        className="rounded-lg px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-950/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
        {profile ? 'Account' : user ? 'Finish setup' : 'Sign in'}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-emerald-950/60 px-4 py-8" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
          <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="account-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 text-emerald-950 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <h2 id="account-title" className="text-2xl font-bold">
                {!supabase ? 'Account setup needed' : profile ? 'Your account' : user ? 'Join your campus' : mode === 'sign-up' ? 'Create an account' : 'Sign in'}
              </h2>
              <button ref={closeRef} type="button" onClick={close} aria-label="Close account panel" className="rounded-md px-2 text-2xl hover:bg-stone-100">×</button>
            </div>
            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
            {!supabase ? (
              <p className="mt-5 text-sm leading-6">This site needs its public Supabase URL and anonymous key before account access is available.</p>
            ) : checkingProfile || (user && !profileLoaded && !profileLoadFailed) ? (
              <p role="status" className="mt-5">Checking your campus profile…</p>
            ) : profileLoadFailed ? (
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <button type="button" onClick={() => { setError(''); setProfileAttempt((attempt) => attempt + 1) }} className="rounded-lg bg-emerald-950 px-5 py-3 font-semibold text-white">Retry loading profile</button>
                <button type="button" disabled={busy} onClick={() => void signOut()} className="text-sm font-semibold underline">Sign out</button>
              </div>
            ) : profile ? (
              <div className="mt-5 space-y-4">
                <p>Signed in as <strong>{profile.display_name}</strong>.</p>
                <button type="button" disabled={busy} onClick={() => void signOut()} className="rounded-lg bg-emerald-950 px-5 py-3 font-semibold text-white disabled:opacity-50">Sign out</button>
              </div>
            ) : user ? (
              <form className="mt-5 space-y-4" onSubmit={(event) => void submitProfile(event)}>
                <p className="text-sm leading-6 text-emerald-950/70">Your email must be confirmed and approved for the campus you choose.</p>
                <label className="block text-sm font-semibold">Display name
                  <input ref={firstFieldRef} name="display_name" required minLength={2} maxLength={100} autoComplete="name" className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" />
                </label>
                <label className="block text-sm font-semibold">Campus
                  <select name="campus_id" required defaultValue="" className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2">
                    <option value="" disabled>Select your campus</option>
                    {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
                  </select>
                </label>
                {campuses.length === 0 && <p className="text-sm text-amber-800">No active campuses are available yet.</p>}
                <button type="submit" disabled={busy || campuses.length === 0} className="w-full rounded-lg bg-emerald-950 px-5 py-3 font-semibold text-white disabled:opacity-50">Create campus profile</button>
                <button type="button" disabled={busy} onClick={() => void signOut()} className="text-sm font-semibold underline">Sign out</button>
              </form>
            ) : (
              <form className="mt-5 space-y-4" onSubmit={(event) => void submitCredentials(event)}>
                <label className="block text-sm font-semibold">Email
                  <input ref={firstFieldRef} name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" />
                </label>
                <label className="block text-sm font-semibold">Password
                  <input name="password" type="password" required minLength={8} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" />
                </label>
                <button type="submit" disabled={busy} className="w-full rounded-lg bg-emerald-950 px-5 py-3 font-semibold text-white disabled:opacity-50">
                  {busy ? 'Please wait…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}
                </button>
                <button type="button" onClick={() => changeMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')} className="text-sm font-semibold underline">
                  {mode === 'sign-in' ? 'Create an account' : 'I already have an account'}
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  )
}
