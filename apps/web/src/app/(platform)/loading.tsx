export default function PlatformLoading() {
  return (
    <div className="space-y-6">
      {/* Page title skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-48 animate-pulse rounded-md bg-indigo-100" />
        <div className="h-4 w-64 animate-pulse rounded-md bg-indigo-100" />
      </div>

      {/* Stats row skeleton */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg bg-indigo-100" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-lg border border-indigo-100 bg-white">
        <div className="border-b border-indigo-100 p-4">
          <div className="h-9 w-full animate-pulse rounded-md bg-indigo-100" />
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-indigo-50" />
          ))}
        </div>
      </div>
    </div>
  );
}
