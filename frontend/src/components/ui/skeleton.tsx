import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

// Base Skeleton with shimmer effect
function Skeleton({
  className,
  shimmer = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { shimmer?: boolean }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-gray-200 dark:bg-gray-800",
        shimmer && "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent dark:before:via-white/10",
        className
      )}
      {...props}
    />
  )
}

// Text skeleton with multiple lines
function SkeletonText({
  lines = 3,
  className,
  lastLineWidth = "60%",
}: {
  lines?: number
  className?: string
  lastLineWidth?: string
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={{
            width: i === lines - 1 ? lastLineWidth : "100%",
          }}
        />
      ))}
    </div>
  )
}

// Avatar skeleton
function SkeletonAvatar({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
}) {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
    xl: "w-16 h-16",
  }

  return (
    <Skeleton
      className={cn("rounded-full", sizeClasses[size], className)}
    />
  )
}

// Card skeleton
function SkeletonCard({
  hasImage = false,
  hasAvatar = false,
  lines = 3,
  className,
}: {
  hasImage?: boolean
  hasAvatar?: boolean
  lines?: number
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-4",
        className
      )}
    >
      {hasImage && (
        <Skeleton className="w-full h-40 rounded-lg" />
      )}
      {hasAvatar && (
        <div className="flex items-center gap-3">
          <SkeletonAvatar size="md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      )}
      <SkeletonText lines={lines} />
    </div>
  )
}

// Stat card skeleton
function SkeletonStatCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="w-10 h-10 rounded-lg" />
      </div>
    </div>
  )
}

// Table skeleton
function SkeletonTable({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  return (
    <div className={cn("rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden", className)}>
      {/* Header */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="flex gap-4">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-4 flex-1"
              style={{ maxWidth: i === 0 ? "180px" : "120px" }}
            />
          ))}
        </div>
      </div>
      {/* Rows */}
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="px-4 py-4">
            <div className="flex gap-4 items-center">
              {Array.from({ length: columns }).map((_, colIndex) => (
                <Skeleton
                  key={colIndex}
                  className="h-4 flex-1"
                  style={{ maxWidth: colIndex === 0 ? "180px" : "120px" }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Chart skeleton
function SkeletonChart({
  type = "bar",
  className,
}: {
  type?: "bar" | "line" | "pie" | "area"
  className?: string
}) {
  if (type === "pie") {
    return (
      <div className={cn("flex items-center justify-center p-6", className)}>
        <Skeleton className="w-48 h-48 rounded-full" />
      </div>
    )
  }

  return (
    <div className={cn("p-4 space-y-4", className)}>
      {/* Y-axis labels */}
      <div className="flex items-end gap-3 h-48">
        <div className="flex flex-col justify-between h-full py-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-8" />
          ))}
        </div>
        {/* Bars or line points */}
        <div className="flex-1 flex items-end gap-2 h-full">
          {type === "bar" || type === "area" ? (
            Array.from({ length: 7 }).map((_, i) => (
              <Skeleton
                key={i}
                className="flex-1 rounded-t-md"
                style={{ height: `${30 + Math.random() * 60}%` }}
              />
            ))
          ) : (
            <div className="w-full h-full relative">
              <Skeleton className="absolute bottom-0 left-0 right-0 h-1/2 rounded-lg opacity-30" />
              <div className="absolute bottom-0 left-0 right-0 flex justify-between items-end h-full px-2">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="w-3 h-3 rounded-full"
                    style={{ marginBottom: `${20 + Math.random() * 50}%` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* X-axis labels */}
      <div className="flex gap-2 pl-11">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="flex-1 h-3" />
        ))}
      </div>
    </div>
  )
}

// List item skeleton
function SkeletonListItem({
  hasAvatar = true,
  hasAction = false,
  className,
}: {
  hasAvatar?: boolean
  hasAction?: boolean
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-4 p-4", className)}>
      {hasAvatar && <SkeletonAvatar size="md" />}
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      {hasAction && <Skeleton className="h-8 w-20 rounded-lg" />}
    </div>
  )
}

// Employee card skeleton (specific to ChurnVision)
function SkeletonEmployeeCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4",
        className
      )}
    >
      <div className="flex items-start gap-4">
        <SkeletonAvatar size="lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="text-right space-y-2">
          <Skeleton className="h-6 w-16 rounded-full ml-auto" />
          <Skeleton className="h-3 w-12 ml-auto" />
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
        <div className="flex gap-4">
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-12" />
          </div>
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-12" />
          </div>
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-12" />
          </div>
        </div>
      </div>
    </div>
  )
}

// Dashboard skeleton (full page)
function SkeletonDashboard({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-6 p-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800">
            <Skeleton className="h-5 w-40" />
          </div>
          <SkeletonChart type="area" />
        </div>

        {/* List */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800">
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonListItem key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Animated loading spinner with brand styling
const LoadingSpinner = motion(({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg"
  className?: string
}) => {
  const sizeClasses = {
    sm: "w-5 h-5 border-2",
    md: "w-8 h-8 border-2",
    lg: "w-12 h-12 border-3",
  }

  return (
    <div
      className={cn(
        "rounded-full border-gray-200 dark:border-gray-700 border-t-emerald-500 dark:border-t-emerald-400 animate-spin",
        sizeClasses[size],
        className
      )}
    />
  )
})

// Branded loading screen
function LoadingScreen({
  message = "Loading...",
  showLogo = true,
  className,
}: {
  message?: string
  showLogo?: boolean
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center bg-white dark:bg-gray-950",
        className
      )}
    >
      {showLogo && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          {/* Animated logo */}
          <div className="relative">
            <motion.div
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/25"
              animate={{
                boxShadow: [
                  "0 10px 40px -10px rgba(16, 185, 129, 0.25)",
                  "0 10px 40px -10px rgba(16, 185, 129, 0.5)",
                  "0 10px 40px -10px rgba(16, 185, 129, 0.25)",
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <svg
                className="w-8 h-8 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </motion.div>
            {/* Pulse rings */}
            <motion.div
              className="absolute inset-0 rounded-2xl border-2 border-emerald-500/30"
              animate={{
                scale: [1, 1.5],
                opacity: [0.5, 0],
              }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <motion.div
              className="absolute inset-0 rounded-2xl border-2 border-emerald-500/30"
              animate={{
                scale: [1, 1.5],
                opacity: [0.5, 0],
              }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
            />
          </div>
        </motion.div>
      )}

      {/* Loading indicator */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500"
              animate={{
                y: [0, -8, 0],
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.15,
              }}
            />
          ))}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
          {message}
        </p>
      </motion.div>
    </motion.div>
  )
}

// Inline loading dots
function LoadingDots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-current"
          animate={{
            y: [0, -4, 0],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.15,
          }}
        />
      ))}
    </span>
  )
}

// Progress loader with percentage
function LoadingProgress({
  progress,
  message,
  className,
}: {
  progress: number
  message?: string
  className?: string
}) {
  return (
    <div className={cn("w-full max-w-xs space-y-3", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600 dark:text-gray-400">{message || "Loading..."}</span>
        <span className="font-medium text-gray-900 dark:text-white">{Math.round(progress)}%</span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </div>
    </div>
  )
}

// Overlay loader for sections
function LoadingOverlay({
  message,
  className,
}: {
  message?: string
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-xl",
        className
      )}
    >
      <LoadingSpinner size="lg" />
      {message && (
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">{message}</p>
      )}
    </motion.div>
  )
}

// Button loading state
function ButtonLoader({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin h-4 w-4", className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

export {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonStatCard,
  SkeletonTable,
  SkeletonChart,
  SkeletonListItem,
  SkeletonEmployeeCard,
  SkeletonDashboard,
  LoadingSpinner,
  LoadingScreen,
  LoadingDots,
  LoadingProgress,
  LoadingOverlay,
  ButtonLoader,
}
