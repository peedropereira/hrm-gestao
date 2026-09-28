import { Skeleton } from "@/components/ds";

// Esqueleto enquanto a tela carrega (nunca tela em branco).
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1180px] px-5 pt-5 md:px-7 md:pt-7" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-3 h-8 w-64" />
      <div className="mt-6 grid grid-cols-3 gap-2 md:grid-cols-4 md:gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={i === 3 ? "hidden rounded-[14px] border border-line bg-surface p-3 md:block" : "rounded-[14px] border border-line bg-surface p-3"}>
            <Skeleton className="h-9 w-12" />
            <Skeleton className="mt-3 h-3.5 w-20" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-2.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-3 rounded-[14px] border border-line bg-surface p-4">
            <Skeleton className="size-6 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="mt-2.5 h-3.5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
