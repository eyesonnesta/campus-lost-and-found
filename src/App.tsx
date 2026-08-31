import { ArrowRight, CheckCircle2, MapPin, Search, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

const steps = [
  {
    number: '01',
    title: 'Report it clearly',
    copy: 'Share the essentials in minutes while keeping ownership details private.',
  },
  {
    number: '02',
    title: 'Find a credible match',
    copy: 'Search campus listings and review explainable suggestions—not black-box decisions.',
  },
  {
    number: '03',
    title: 'Return it securely',
    copy: 'Verify ownership, arrange a handover, and confirm the return together.',
  },
]

function BrandMark() {
  return (
    <span className="grid size-10 place-items-center rounded-2xl bg-amber-400 text-emerald-950 shadow-sm">
      <Search aria-hidden="true" className="size-5" strokeWidth={2.5} />
    </span>
  )
}

export default function App() {
  return (
    <div className="min-h-screen bg-stone-50 text-emerald-950">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <a className="flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-950" href="#top">
          <BrandMark />
          <span>
            <span className="block text-lg font-bold leading-none tracking-tight">PataTena</span>
            <span className="mt-1 block text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-emerald-800/70">
              Lost. Matched. Returned.
            </span>
          </span>
        </a>
        <nav aria-label="Primary navigation" className="flex items-center gap-1 sm:gap-3">
          <Button className="hidden sm:inline-flex" variant="ghost">Sign in</Button>
          <Button variant="secondary">Browse items</Button>
        </nav>
      </header>

      <main id="top">
        <section className="relative isolate overflow-hidden px-5 pb-20 pt-12 sm:px-8 sm:pt-20 lg:px-12 lg:pb-28">
          <div aria-hidden="true" className="absolute left-1/2 top-12 -z-10 size-[34rem] -translate-x-1/2 rounded-full bg-amber-200/40 blur-3xl" />
          <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.06fr_0.94fr]">
            <div className="max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-900/10 bg-white/80 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-800 shadow-sm">
                <MapPin aria-hidden="true" className="size-4 text-amber-600" />
                Built for your campus
              </div>
              <h1 className="text-balance text-5xl font-bold leading-[0.98] tracking-[-0.05em] sm:text-6xl lg:text-7xl">
                What went missing can find its way <span className="text-amber-600">back.</span>
              </h1>
              <p className="mt-7 max-w-xl text-pretty text-lg leading-8 text-emerald-950/70 sm:text-xl">
                Report lost and found items, discover credible matches, and complete a secure, traceable handover—all in one place.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button className="group gap-2 px-6">Report an item <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" /></Button>
                <Button className="px-6" variant="secondary">Search found items</Button>
              </div>
              <p className="mt-5 flex items-center gap-2 text-sm font-medium text-emerald-900/60">
                <ShieldCheck aria-hidden="true" className="size-4" />
                Private evidence stays private.
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div className="absolute -inset-3 rotate-2 rounded-[2.2rem] bg-emerald-900/10" />
              <div className="relative rounded-[2rem] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_-32px_rgba(6,78,59,0.45)] backdrop-blur sm:p-7">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800/50">Promising match</p>
                    <h2 className="mt-2 text-2xl font-bold tracking-tight">Black wireless earbuds</h2>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">86%</span>
                </div>
                <div className="mt-6 aspect-[16/9] overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-950 via-emerald-800 to-emerald-600 p-6 text-white">
                  <div className="flex h-full flex-col justify-between">
                    <Search aria-hidden="true" className="size-10 text-amber-300" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-100">Found near</p>
                      <p className="mt-1 text-xl font-bold">Main Library · 18 Aug</p>
                    </div>
                  </div>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {['Category matches', 'Date is close', 'Location nearby'].map((reason) => (
                    <div className="flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-3 text-xs font-semibold text-emerald-950/70" key={reason}>
                      <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-emerald-600" />
                      {reason}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="how-it-works" className="bg-emerald-950 px-5 py-20 text-white sm:px-8 lg:px-12">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-300">A safer return journey</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl" id="how-it-works">Three steps. One clear trail.</h2>
              <p className="mt-4 text-lg leading-8 text-emerald-100/70">Designed to move quickly without sacrificing privacy or proof of ownership.</p>
            </div>
            <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-white/10 lg:grid-cols-3">
              {steps.map((step) => (
                <li className="bg-emerald-950 p-7 sm:p-9" key={step.number}>
                  <span className="text-sm font-bold text-amber-300">{step.number}</span>
                  <h3 className="mt-7 text-xl font-bold">{step.title}</h3>
                  <p className="mt-3 leading-7 text-emerald-100/65">{step.copy}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="bg-emerald-950 px-5 pb-8 pt-3 text-emerald-100/60 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 border-t border-white/10 pt-7 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} PataTena. Campus property recovery, handled responsibly.</p>
          <p>Lost. Matched. Returned.</p>
        </div>
      </footer>
    </div>
  )
}
