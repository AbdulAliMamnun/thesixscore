import { track } from '../lib/analytics'
import { RequestBuildingForm } from './RequestBuildingForm'

const LINKS = [
  {
    destination: 'reddit',
    label: 'Reddit discussions',
    description: 'Tenant threads about this building or neighbourhood.',
    href: (encoded: string) =>
      `https://www.reddit.com/search/?q=${encoded}%20toronto`,
  },
  {
    destination: 'google_maps',
    label: 'Google Maps',
    description: 'Reviews, photos, and street view.',
    href: (encoded: string) =>
      `https://www.google.com/maps/search/${encoded}%20Toronto`,
  },
  {
    destination: 'openroom',
    label: 'Openroom',
    description: 'Ontario tribunal and court records involving landlords and tenants.',
    href: () => 'https://openroom.ca/',
  },
  {
    destination: 'rate_the_landlord',
    label: 'Rate The Landlord',
    description: 'Tenant-submitted landlord reviews across Ontario.',
    href: () => 'https://ratethelandlord.org/',
  },
  {
    destination: 'toronto_bylaw',
    label: 'City of Toronto bylaw lookup',
    description: 'Property standards investigations and municipal enforcement records.',
    href: () => 'https://www.toronto.ca/',
  },
] as const

export function NotFoundPanel({ query }: { query: string }) {
  const encoded = encodeURIComponent(query.trim())

  return (
    <div className="panel mt-3 px-4 py-5 sm:px-5">
      <h2 className="font-display text-xl font-semibold text-ink sm:text-2xl">
        We don&apos;t have {query} yet.
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted sm:text-base">
        TheSixScore covers buildings the City inspects under RentSafeTO — purpose-built
        rentals with 3+ storeys and 10+ units. Condos, houses, and smaller buildings
        aren&apos;t inspected under that program, so there&apos;s no official score to
        show. Here&apos;s where else to look.
      </p>

      <section className="mt-6">
        <h3 className="font-display text-lg font-semibold text-ink">
          Research this address
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          These are third-party sites. TheSixScore doesn&apos;t verify or endorse what
          you&apos;ll find — read it as you would any online review.
        </p>
        {/*
          Outbound links only. We do not fetch, scrape, embed, cache, or store
          third-party review content — a proxy would be required for that and is
          intentionally out of scope for this static site.
        */}
        <ul className="mt-4 space-y-3">
          {LINKS.map((link) => (
            <li key={link.destination}>
              <a
                href={link.href(encoded)}
                target="_blank"
                rel="noopener noreferrer"
                className="block border border-line px-3 py-3 no-underline transition hover:border-accent hover:bg-accent-soft/40"
                onClick={() =>
                  track('research_link_click', { destination: link.destination })
                }
              >
                <span className="font-semibold text-accent">{link.label}</span>
                <span className="mt-1 block text-sm text-ink-muted">
                  {link.description}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <RequestBuildingForm initialAddress={query} />
    </div>
  )
}
