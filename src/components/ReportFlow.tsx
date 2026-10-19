import { useEffect, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

type Kind = 'lost' | 'found'
type Option = { id: string; name: string }
type Draft = {
  id: string
  kind: Kind
  category_id: string
  location_id: string
  title: string
  description: string
  event_date: string
  location_details: string | null
  colour: string | null
  brand: string | null
}
type Fields = {
  kind: Kind
  categoryId: string
  locationId: string
  title: string
  description: string
  eventDate: string
  locationDetails: string
  colour: string
  brand: string
  privateIdentifiers: string
  questions: string
}
type Access = 'loading' | 'ready' | 'signed-out' | 'needs-profile' | 'unconfigured' | 'error'

const draftRowsSchema = z.array(z.object({
  id: z.string().uuid(), kind: z.enum(['lost', 'found']),
  category_id: z.string().uuid(), location_id: z.string().uuid().nullable(),
  title: z.string(), description: z.string(), event_date: z.string(),
  location_details: z.string().nullable(), colour: z.string().nullable(),
  brand: z.string().nullable(),
}))
const questionsSchema = z.array(z.object({ question: z.string() }))

function reportingToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

function emptyFields(): Fields {
  return {
    kind: 'lost', categoryId: '', locationId: '', title: '', description: '',
    eventDate: reportingToday(), locationDetails: '', colour: '', brand: '',
    privateIdentifiers: '', questions: '',
  }
}

const reportSchema = z.object({
  categoryId: z.string().uuid(),
  locationId: z.string().uuid(),
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(20).max(2000),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => date <= reportingToday()),
  locationDetails: z.string().trim().max(300),
  colour: z.string().trim().max(80),
  brand: z.string().trim().max(100),
  privateIdentifiers: z.string().trim().max(2000),
  questions: z.array(z.string().trim().min(10).max(300)).max(5),
})

function publicContactDetails(fields: Fields) {
  const text = [fields.title, fields.description, fields.locationDetails, fields.colour, fields.brand].join(' ')
  return /[\w.%+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\.|(?:^|\D)\+?\d[\d .()-]{7,}\d(?:$|\D)/i.test(text)
}

export function ReportFlow({ onBack, onSignIn, client = supabase }: {
  onBack: () => void
  onSignIn: () => void
  client?: SupabaseClient | null
}) {
  const [access, setAccess] = useState<Access>(client ? 'loading' : 'unconfigured')
  const [categories, setCategories] = useState<Option[]>([])
  const [locations, setLocations] = useState<Option[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [hasMoreDrafts, setHasMoreDrafts] = useState(false)
  const [publishedReports, setPublishedReports] = useState<Draft[]>([])
  const [hasMorePublished, setHasMorePublished] = useState(false)
  const [archiveCandidateId, setArchiveCandidateId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [fields, setFields] = useState<Fields>(emptyFields)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [published, setPublished] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!client) return
    let active = true
    const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        active = false
        setUserId(null)
        setDrafts([])
        setPublishedReports([])
        setAccess('signed-out')
      }
    })
    const load = async () => {
      const { data: authData, error: authError } = await client.auth.getUser()
      if (!active) return
      if (authError) { setAccess('error'); return }
      if (!authData.user) { setAccess('signed-out'); return }
      setUserId(authData.user.id)

      const { data: profile, error: profileError } = await client.from('profiles')
        .select('campus_id, status').eq('id', authData.user.id).maybeSingle()
      if (!active) return
      if (profileError) { setAccess('error'); return }
      if (!profile || profile.status !== 'active') { setAccess('needs-profile'); return }

      const [categoryResult, locationResult, draftResult, publishedResult] = await Promise.all([
        client.from('categories').select('id, name').eq('is_active', true).order('sort_order'),
        client.from('locations').select('id, name').eq('campus_id', profile.campus_id)
          .eq('is_active', true).order('name'),
        client.from('items').select('id, kind, category_id, location_id, title, description, event_date, location_details, colour, brand')
          .eq('owner_id', authData.user.id).eq('status', 'draft').order('created_at', { ascending: false }).range(0, 19),
        client.from('items').select('id, kind, category_id, location_id, title, description, event_date, location_details, colour, brand')
          .eq('owner_id', authData.user.id).eq('status', 'published').order('created_at', { ascending: false }).range(0, 19),
      ])
      if (!active) return
      if (categoryResult.error || locationResult.error || draftResult.error || publishedResult.error) {
        setAccess('error')
        return
      }
      const parsedDrafts = draftRowsSchema.safeParse(draftResult.data ?? [])
      const parsedPublished = draftRowsSchema.safeParse(publishedResult.data ?? [])
      if (!parsedDrafts.success || !parsedPublished.success) { setAccess('error'); return }
      setCategories(categoryResult.data ?? [])
      setLocations(locationResult.data ?? [])
      setDrafts(parsedDrafts.data.map((draft) => ({ ...draft, location_id: draft.location_id ?? '' })))
      setHasMoreDrafts(parsedDrafts.data.length === 20)
      setPublishedReports(parsedPublished.data.map((report) => ({ ...report, location_id: report.location_id ?? '' })))
      setHasMorePublished(parsedPublished.data.length === 20)
      setAccess('ready')
    }
    void load()
    return () => { active = false; subscription.unsubscribe() }
  }, [client])

  async function loadMoreDrafts() {
    if (!client || !userId || busy || !hasMoreDrafts) return
    setBusy(true)
    const result = await client.from('items')
      .select('id, kind, category_id, location_id, title, description, event_date, location_details, colour, brand')
      .eq('owner_id', userId).eq('status', 'draft').order('created_at', { ascending: false })
      .range(drafts.length, drafts.length + 19)
    setBusy(false)
    const parsed = draftRowsSchema.safeParse(result.data ?? [])
    if (result.error || !parsed.success) {
      setError('Could not load more drafts. Please try again.')
      return
    }
    setDrafts((current) => [...current, ...parsed.data.map((draft) => ({ ...draft, location_id: draft.location_id ?? '' }))])
    setHasMoreDrafts(parsed.data.length === 20)
  }

  async function loadMorePublished() {
    if (!client || !userId || busy || !hasMorePublished) return
    setBusy(true)
    const result = await client.from('items')
      .select('id, kind, category_id, location_id, title, description, event_date, location_details, colour, brand')
      .eq('owner_id', userId).eq('status', 'published').order('created_at', { ascending: false })
      .range(publishedReports.length, publishedReports.length + 19)
    setBusy(false)
    const parsed = draftRowsSchema.safeParse(result.data ?? [])
    if (result.error || !parsed.success) {
      setError('Could not load more published reports. Please try again.')
      return
    }
    setPublishedReports((current) => [...current, ...parsed.data.map((report) => ({ ...report, location_id: report.location_id ?? '' }))])
    setHasMorePublished(parsed.data.length === 20)
  }

  async function archiveReport(id: string) {
    if (!client || busy) return
    setBusy(true)
    setError('')
    const result = await client.rpc('archive_item', { p_item_id: id })
    setBusy(false)
    if (result.error) {
      setError('Could not archive this report. Please try again.')
      return
    }
    setArchiveCandidateId(null)
    setPublishedReports((current) => current.filter((report) => report.id !== id))
    setDrafts((current) => current.filter((draft) => draft.id !== id))
    if (draftId === id) {
      setDraftId(null)
      setPublished(false)
      setFields(emptyFields())
    }
    setNotice('Report archived and removed from public listings.')
  }

  function update<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((current) => ({ ...current, [key]: value }))
    setError('')
    setNotice('')
  }

  async function openDraft(draft: Draft) {
    if (!client || busy) return
    setBusy(true)
    setError('')
    const [privateResult, questionResult] = await Promise.all([
      client.rpc('my_item_private_identifiers', { p_item_id: draft.id }),
      client.from('verification_questions').select('question').eq('item_id', draft.id).order('sort_order'),
    ])
    setBusy(false)
    if (privateResult.error || questionResult.error) {
      setError('Could not load this draft. Please try again.')
      return
    }
    const privateValue = z.string().nullable().safeParse(privateResult.data)
    const questionValues = questionsSchema.safeParse(questionResult.data ?? [])
    if (!privateValue.success || !questionValues.success) {
      setError('Could not read this draft safely. Please try again.')
      return
    }
    setDraftId(draft.id)
    setPublished(false)
    setFields({
      kind: draft.kind, categoryId: draft.category_id, locationId: draft.location_id,
      title: draft.title, description: draft.description, eventDate: draft.event_date,
      locationDetails: draft.location_details ?? '', colour: draft.colour ?? '',
      brand: draft.brand ?? '', privateIdentifiers: privateValue.data ?? '',
      questions: questionValues.data.map((row) => row.question).join('\n'),
    })
    setNotice('Draft loaded. Review it before publishing.')
  }

  function startNew() {
    setDraftId(null)
    setFields(emptyFields())
    setPublished(false)
    setError('')
    setNotice('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client || busy) return
    const publish = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === 'publish'
    const questions = fields.kind === 'found'
      ? fields.questions.split('\n').map((question) => question.trim()).filter(Boolean)
      : []
    const parsed = reportSchema.safeParse({ ...fields, questions })
    if (!parsed.success || !categories.some((item) => item.id === fields.categoryId)
        || !locations.some((item) => item.id === fields.locationId)) {
      setError('Check the category, location, date, text lengths, and verification questions.')
      return
    }
    if (publish && publicContactDetails(fields)) {
      setError('Remove contact details and links from public report fields. Keep ownership details in the private field.')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')
    const args = {
      p_category_id: fields.categoryId,
      p_location_id: fields.locationId,
      p_title: parsed.data.title,
      p_description: parsed.data.description,
      p_event_date: fields.eventDate,
      p_location_details: parsed.data.locationDetails || null,
      p_colour: parsed.data.colour || null,
      p_brand: parsed.data.brand || null,
      p_private_identifiers: fields.kind === 'lost' ? parsed.data.privateIdentifiers || null : null,
      p_questions: questions,
    }
    try {
      const saveResult = draftId
        ? await client.rpc('update_item_draft', { p_item_id: draftId, ...args })
        : await client.rpc('create_item_draft', { p_kind: fields.kind, ...args })
      if (saveResult.error || typeof saveResult.data !== 'string') {
        throw new Error('Could not save your draft. Please try again.')
      }
      const savedId = saveResult.data
      setDraftId(savedId)
      if (!draftId) {
        setDrafts((current) => [{
          id: savedId, kind: fields.kind, category_id: fields.categoryId,
          location_id: fields.locationId, title: parsed.data.title,
          description: parsed.data.description, event_date: fields.eventDate,
          location_details: parsed.data.locationDetails || null,
          colour: parsed.data.colour || null, brand: parsed.data.brand || null,
        }, ...current])
      } else {
        setDrafts((current) => current.map((draft) => draft.id === savedId
          ? { ...draft, title: parsed.data.title, description: parsed.data.description,
              category_id: fields.categoryId, location_id: fields.locationId,
              event_date: fields.eventDate, location_details: parsed.data.locationDetails || null,
              colour: parsed.data.colour || null, brand: parsed.data.brand || null }
          : draft))
      }
      if (!publish) {
        setNotice('Draft saved privately. You can continue it here later.')
        return
      }
      const publication = await client.rpc('publish_item', { p_item_id: savedId })
      if (publication.error) {
        setError(publication.error.message || 'Publication was blocked. Your draft is saved privately.')
        return
      }
      setDrafts((current) => current.filter((draft) => draft.id !== savedId))
      setPublishedReports((current) => [{
        id: savedId, kind: fields.kind, category_id: fields.categoryId,
        location_id: fields.locationId, title: parsed.data.title,
        description: parsed.data.description, event_date: fields.eventDate,
        location_details: parsed.data.locationDetails || null,
        colour: parsed.data.colour || null, brand: parsed.data.brand || null,
      }, ...current])
      setPublished(true)
      setNotice('Your report is published.')
    } catch {
      setError('Could not save your draft. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const inputClass = 'mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-emerald-700'
  return (
    <section className="mx-auto w-full max-w-5xl px-5 pb-20 pt-10 sm:px-8">
      <button type="button" onClick={onBack} className="text-sm font-semibold text-emerald-800 underline">← Back to home</button>
      <h1 className="mt-6 text-4xl font-bold tracking-tight">Report an item</h1>
      <p className="mt-3 max-w-2xl text-emerald-950/70">Help your campus return lost property. Public descriptions must not include contact details; ownership details stay private.</p>

      {access === 'loading' && <p role="status" className="mt-8">Checking your account…</p>}
      {access === 'unconfigured' && <p role="alert" className="mt-8 rounded-xl bg-amber-50 p-5">Reporting needs a configured Supabase development project.</p>}
      {access === 'signed-out' && <div className="mt-8 rounded-xl bg-white p-6 shadow-sm"><p>Sign in to report an item.</p><button type="button" onClick={onSignIn} className="mt-4 rounded-lg bg-emerald-950 px-5 py-3 font-semibold text-white">Sign in</button></div>}
      {access === 'needs-profile' && <div className="mt-8 rounded-xl bg-white p-6 shadow-sm"><p>Complete your confirmed campus profile before reporting.</p><button type="button" onClick={onSignIn} className="mt-4 rounded-lg bg-emerald-950 px-5 py-3 font-semibold text-white">Open account</button></div>}
      {access === 'error' && <p role="alert" className="mt-8 rounded-xl bg-red-50 p-5 text-red-800">Could not load reporting access. Please reload and try again.</p>}

      {access === 'ready' && (
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-8">
            {error && <p role="alert" className="mb-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>}
            {notice && <p role="status" className="mb-5 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p>}
            {published ? (
              <div>
                <h2 className="text-2xl font-bold">Report published</h2>
                <p className="mt-3">Your report is now available in the public listings without your private ownership details.</p>
                <button type="button" onClick={startNew} className="mt-6 rounded-lg bg-emerald-950 px-5 py-3 font-semibold text-white">Report another item</button>
              </div>
            ) : (
              <form onSubmit={(event) => void submit(event)} className="space-y-5">
                <fieldset>
                  <legend className="text-sm font-bold">What are you reporting?</legend>
                  <div className="mt-2 flex flex-wrap gap-4">
                    {(['lost', 'found'] as const).map((kind) => (
                      <label key={kind} className="flex items-center gap-2 text-sm font-semibold capitalize">
                        <input type="radio" name="kind" checked={fields.kind === kind} disabled={Boolean(draftId)} onChange={() => update('kind', kind)} />{kind} item
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="text-sm font-semibold">Category
                    <select required value={fields.categoryId} onChange={(event) => update('categoryId', event.target.value)} className={inputClass}>
                      <option value="">Select a category</option>
                      {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-semibold">Approximate location
                    <select required value={fields.locationId} onChange={(event) => update('locationId', event.target.value)} className={inputClass}>
                      <option value="">Select a location</option>
                      {locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
                </div>
                {(categories.length === 0 || locations.length === 0) && <p className="text-sm text-amber-800">Your campus needs active categories and locations before reports can be saved.</p>}
                <label className="block text-sm font-semibold">Title
                  <input required minLength={5} maxLength={120} value={fields.title} onChange={(event) => update('title', event.target.value)} className={inputClass} />
                </label>
                <label className="block text-sm font-semibold">Public description
                  <textarea required minLength={20} maxLength={2000} rows={5} value={fields.description} onChange={(event) => update('description', event.target.value)} className={inputClass} />
                </label>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="text-sm font-semibold">Date {fields.kind === 'lost' ? 'lost' : 'found'}
                    <input type="date" required max={reportingToday()} value={fields.eventDate} onChange={(event) => update('eventDate', event.target.value)} className={inputClass} />
                  </label>
                  <label className="text-sm font-semibold">Colour, if known
                    <input maxLength={80} value={fields.colour} onChange={(event) => update('colour', event.target.value)} className={inputClass} />
                  </label>
                </div>
                <label className="block text-sm font-semibold">Location detail, if helpful
                  <input maxLength={300} value={fields.locationDetails} onChange={(event) => update('locationDetails', event.target.value)} className={inputClass} />
                </label>
                <label className="block text-sm font-semibold">Brand, if known
                  <input maxLength={100} value={fields.brand} onChange={(event) => update('brand', event.target.value)} className={inputClass} />
                </label>
                {fields.kind === 'lost' ? (
                  <label className="block text-sm font-semibold">Private ownership details, if helpful
                    <textarea rows={3} maxLength={2000} value={fields.privateIdentifiers} onChange={(event) => update('privateIdentifiers', event.target.value)} className={inputClass} />
                    <span className="mt-1 block text-xs font-normal text-emerald-950/60">Only you can retrieve these details. Do not put them in the public description.</span>
                  </label>
                ) : (
                  <label className="block text-sm font-semibold">Private verification questions, one per line (up to five)
                    <textarea rows={4} value={fields.questions} onChange={(event) => update('questions', event.target.value)} className={inputClass} />
                    <span className="mt-1 block text-xs font-normal text-emerald-950/60">Members can view questions when preparing a claim; they are not shown in public listings.</span>
                  </label>
                )}
                <p className="text-sm text-emerald-950/60">Photo uploads are not available yet.</p>
                <div className="flex flex-wrap gap-3">
                  <button type="submit" value="save" disabled={busy || !categories.length || !locations.length} className="rounded-lg border border-emerald-950 px-5 py-3 font-semibold disabled:opacity-50">{busy ? 'Working…' : 'Save private draft'}</button>
                  <button type="submit" value="publish" disabled={busy || !categories.length || !locations.length} className="rounded-lg bg-emerald-950 px-5 py-3 font-semibold text-white disabled:opacity-50">Publish report</button>
                </div>
              </form>
            )}
          </div>
          <aside className="h-fit rounded-2xl bg-white p-5 shadow-sm" aria-label="Your reports">
            <h2 className="text-lg font-bold">Your drafts</h2>
            <p className="mt-1 text-sm text-emerald-950/60">Only you can see these reports.</p>
            {drafts.length === 0 ? <p className="mt-5 text-sm">No saved drafts yet.</p> : (
              <ul className="mt-5 space-y-3">
                {drafts.map((draft) => <li key={draft.id}>
                  <button type="button" disabled={busy} onClick={() => void openDraft(draft)} className="w-full rounded-lg border border-stone-200 p-3 text-left text-sm hover:border-emerald-700 disabled:opacity-50">
                    <span className="block font-semibold">{draft.title}</span>
                    <span className="mt-1 block capitalize text-emerald-950/60">{draft.kind} item</span>
                  </button>
                </li>)}
              </ul>
            )}
            {draftId && <button type="button" onClick={startNew} className="mt-5 text-sm font-semibold text-emerald-800 underline">Start a new report</button>}
            {hasMoreDrafts && <button type="button" disabled={busy} onClick={() => void loadMoreDrafts()} className="mt-5 block text-sm font-semibold text-emerald-800 underline disabled:opacity-50">Load more drafts</button>}
            <h2 className="mt-8 border-t border-stone-200 pt-6 text-lg font-bold">Published reports</h2>
            {publishedReports.length === 0 ? <p className="mt-4 text-sm">No published reports yet.</p> : (
              <ul className="mt-4 space-y-3">
                {publishedReports.map((report) => <li key={report.id} className="rounded-lg border border-stone-200 p-3 text-sm">
                  <span className="block font-semibold">{report.title}</span>
                  {archiveCandidateId === report.id ? (
                    <div className="mt-3 flex flex-wrap gap-3">
                      <button type="button" disabled={busy} onClick={() => void archiveReport(report.id)} className="font-semibold text-red-800 underline disabled:opacity-50">Confirm archive</button>
                      <button type="button" onClick={() => setArchiveCandidateId(null)} className="font-semibold underline">Cancel</button>
                    </div>
                  ) : <button type="button" onClick={() => setArchiveCandidateId(report.id)} className="mt-2 font-semibold text-emerald-800 underline">Archive report</button>}
                </li>)}
              </ul>
            )}
            {hasMorePublished && <button type="button" disabled={busy} onClick={() => void loadMorePublished()} className="mt-5 block text-sm font-semibold text-emerald-800 underline disabled:opacity-50">Load more published reports</button>}
          </aside>
        </div>
      )}
    </section>
  )
}
