// src/components/CircularLoader.tsx
export default function CircularLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
      <svg
        className="animate-spin h-16 w-16 text-blue-500"
        viewBox="0 0 50 50"
      >
        <circle
          className="opacity-25"
          cx="25"
          cy="25"
          r="20"
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
        />
        <circle
          className="opacity-75"
          cx="25"
          cy="25"
          r="20"
          stroke="currentColor"
          strokeWidth="8"
          strokeDasharray="100"
          strokeDashoffset="75"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  )
}

