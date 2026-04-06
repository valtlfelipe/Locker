"use client";

export function ExplorerSkeleton() {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="grid grid-cols-[1fr_40px] sm:grid-cols-[1fr_100px_140px_40px] gap-4 px-4 py-2 border-b bg-muted/50">
        <span className="text-xs font-medium text-muted-foreground">Name</span>
        <span className="hidden sm:block text-xs font-medium text-muted-foreground">
          Size
        </span>
        <span className="hidden sm:block text-xs font-medium text-muted-foreground">
          Modified
        </span>
        <span />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_40px] sm:grid-cols-[1fr_100px_140px_40px] gap-4 px-4 py-2.5 border-b last:border-b-0"
        >
          <div className="flex items-center gap-2.5">
            <div className="size-4 rounded bg-muted animate-pulse" />
            <div
              className="h-4 rounded bg-muted animate-pulse"
              style={{ width: `${40 + ((i * 23) % 40)}%` }}
            />
          </div>
          <div className="hidden sm:block">
            <div className="h-4 w-14 rounded bg-muted animate-pulse" />
          </div>
          <div className="hidden sm:block">
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
          </div>
          <div />
        </div>
      ))}
    </div>
  );
}
