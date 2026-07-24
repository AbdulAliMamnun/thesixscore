export function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-line/60 ${className}`}
      aria-hidden
    />
  )
}

export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading building data">
      <SkeletonBlock className="h-10 w-64" />
      <SkeletonBlock className="h-24 w-full max-w-2xl" />
      <SkeletonBlock className="h-12 w-full max-w-2xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        <SkeletonBlock className="h-72 w-full" />
        <SkeletonBlock className="h-72 w-full" />
      </div>
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div role="alert" className="panel px-6 py-10 text-center fade-up">
      <h2 className="font-display text-2xl font-semibold text-shame">
        Couldn’t load TheSixScore data
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-ink-muted">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 border border-ink bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent"
      >
        Retry
      </button>
    </div>
  )
}
