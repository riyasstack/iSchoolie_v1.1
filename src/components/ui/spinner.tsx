import clsx from "clsx";

export function Spinner({ size = 26, className, label = "Loading" }: { size?: number; className?: string; label?: string }) {
  return (
    <div role="status" aria-label={label} className={clsx("flex justify-center", className)}>
      <svg className="spin" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="14" fill="none" stroke="var(--accent-soft)" strokeWidth="4" />
        <path d="M16 2 a14 14 0 0 1 14 14" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function PostSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="mx-3 mt-3 overflow-hidden rounded-2xl border border-line bg-bg px-4 pb-3 pt-3 shadow-card">
          <div className="flex items-center gap-3">
            <div className="skeleton h-[42px] w-[42px] shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3.5 w-1/3 rounded-md" />
              <div className="skeleton h-3 w-1/4 rounded-md" />
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <div className="skeleton h-3.5 w-11/12 rounded-md" />
            <div className="skeleton h-3.5 w-3/5 rounded-md" />
          </div>
          {i % 2 === 0 && <div className="skeleton -mx-4 mt-3 aspect-[4/3] max-h-[420px]" />}
          <div className="mt-3 flex gap-2">
            {[0, 1, 2].map((k) => (
              <div key={k} className="skeleton h-7 w-16 rounded-xl" />
            ))}
            <div className="skeleton ml-auto h-7 w-16 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function UserSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="skeleton h-12 w-12 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-1/3 rounded" />
            <div className="skeleton h-3.5 w-1/4 rounded" />
          </div>
          <div className="skeleton h-8 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
