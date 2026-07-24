import { Link } from 'react-router-dom'
import { useState } from 'react'
import { RequestBuildingForm } from '../components/RequestBuildingForm'
import { useData } from '../context/DataContext'
import { TENANT_REVIEW_LINK_OUT } from '../lib/buildings'

export function ScoringPage() {
  const { meta, buildings, scoredBuildings } = useData()
  const correctionEmail = meta?.correctionEmail ?? 'corrections@thesixscore.example'
  const tier1 = buildings.filter((b) => b.tier === 1).length
  const tier2 = buildings.filter((b) => b.tier === 2).length
  const tier3 = buildings.filter((b) => b.tier === 3).length

  return (
    <div className="fade-up">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
        Methodology
      </p>
      <h1 className="mt-2 max-w-3xl font-display text-3xl font-semibold tracking-tight sm:text-5xl">
        How scoring works
      </h1>

      <div className="mt-6 max-w-2xl space-y-4 text-base leading-relaxed text-ink sm:text-lg">
        <p>
          RentSafeTO is the City of Toronto&apos;s apartment building evaluation
          program for purpose-built rentals — typically three or more storeys and
          ten or more units. Those buildings get an official inspection score on
          TheSixScore.
        </p>
        <p>
          Condos, houses, and smaller buildings aren&apos;t covered yet because the
          City doesn&apos;t inspect them under this program. Expanding beyond that
          list is our roadmap — if your address is missing,{' '}
          <a href="#request-building" className="font-semibold text-accent">
            request it below
          </a>
          .
        </p>
        <p>
          Absence of a score is not evidence a building is good. It means there was
          no official RentSafeTO evaluation in our dataset for that address — not a
          clean bill of health.
        </p>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <TierCard
          tier="Tier 1"
          title="Official RentSafeTO score"
          body="City-inspected evaluation score out of 100, with colour band and readability letter grade."
        />
        <TierCard
          tier="Tier 2"
          title="Public records (no score)"
          body="Registration, MLS investigations, TCHC/subsidized listings, and enrichment signals — never an A–F grade."
        />
        <TierCard
          tier="Tier 3"
          title="Limited data"
          body="Classified residential multi-unit address with few/no public records. Not a rating and never coloured green."
        />
      </div>

      <RequestBuildingForm id="request-building" />

      <section className="mt-12 border-t border-line pt-10">
        <h2 className="font-display text-2xl font-semibold">Build-time sources</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-ink-muted">
          <li>Toronto Address Points spine (OGL–Toronto) — verified package id</li>
          <li>RentSafeTO Evaluation + Registration + MLS Investigations (OGL–Toronto)</li>
          <li>TCHC / Subsidized Housing Listings (OGL–Toronto)</li>
          <li>Overture Places (CDLA-Permissive 2.0) / Foursquare OS Places (Apache-2.0) when available</li>
          <li>Wikidata (CC0)</li>
          <li>Overture Buildings footprints kept separately under ODbL (not merged into buildings.json)</li>
          <li>RHRA / Ontario LTC gated behind SENIORS_SIGNAL_ENABLED=false until reuse terms are confirmed</li>
        </ul>
        <p className="mt-4 text-sm text-ink-muted">
          Licence texts: <Link to="/data/LICENSES/OGL-Toronto.txt">/data/LICENSES/</Link>
        </p>
        <p className="mt-2 text-xs text-ink-muted">
          Dataset generated {meta?.generatedAt ?? '—'} · {buildings.length} buildings · Tier1{' '}
          {tier1} · Tier2 {tier2} · Tier3 {tier3} · scored {scoredBuildings.length}
        </p>
      </section>

      <section className="mt-12 border-t border-line pt-10">
        <h2 className="font-display text-2xl font-semibold">Request a correction</h2>
        <a
          href={`mailto:${correctionEmail}?subject=TheSixScore%20correction%20request`}
          className="mt-4 inline-flex border border-ink bg-ink px-4 py-2.5 text-sm font-semibold text-white no-underline"
        >
          {correctionEmail}
        </a>
      </section>

      <p className="mt-10 text-xs text-ink-muted">
        TheSixScore displays public records and official inspection results. It does not host
        tenant reviews. For resident experiences, see{' '}
        <a href={TENANT_REVIEW_LINK_OUT} target="_blank" rel="noreferrer" className="text-accent">
          Toronto tenant rights
        </a>{' '}
        (link-out only).
      </p>

      <div className="mt-8">
        <Faq
          q="Why isn’t there a score for my condo rental?"
          a="Condos are generally outside RentSafeTO. TheSixScore will not invent a numeric rating. You may see Tier 2 records or Tier 3 Limited Data instead — or request coverage via the form above."
        />
      </div>
    </div>
  )
}

function TierCard({
  tier,
  title,
  body,
}: {
  tier: string
  title: string
  body: string
}) {
  return (
    <div className="panel px-4 py-5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">
        {tier}
      </div>
      <h3 className="mt-2 font-display text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-ink-muted">{body}</p>
    </div>
  )
}

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="panel">
      <button
        type="button"
        className="flex w-full justify-between gap-3 px-4 py-3 text-left font-semibold"
        onClick={() => setOpen((v) => !v)}
      >
        {q}
        <span className="text-xs text-ink-muted">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <p className="border-t border-line bg-canvas px-4 py-3 text-sm text-ink-muted">{a}</p>
      )}
    </div>
  )
}
