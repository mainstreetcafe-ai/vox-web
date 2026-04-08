interface Props {
  pageCount: number
  currentPage: number
}

export function PageIndicator({ pageCount, currentPage }: Props) {
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      {Array.from({ length: pageCount }).map((_, i) =>
        i === currentPage ? (
          <div key={i} className="w-5 h-1.5 rounded-full bg-maroon transition-all duration-300" />
        ) : (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-dim transition-all duration-300" />
        )
      )}
    </div>
  )
}
