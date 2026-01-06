import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Premium card variants with smooth hover effects and transitions.
 * Uses carefully tuned timing functions for a luxurious feel.
 */
const cardVariants = cva(
  [
    "rounded-xl border bg-card text-card-foreground",
    // Premium transition with custom bezier curve
    "transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]",
    // Will-change for GPU acceleration
    "will-change-transform",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "shadow-sm",
        elevated: [
          "shadow-md",
          "hover:shadow-lg hover:-translate-y-1",
        ].join(" "),
        interactive: [
          "shadow-sm cursor-pointer",
          "hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30",
          "active:shadow-sm active:translate-y-0 active:scale-[0.995]",
        ].join(" "),
        ghost: "border-transparent shadow-none hover:bg-muted/50",
        outline: "border-2 shadow-none hover:border-primary/50",
        premium: [
          "shadow-md border-primary/20",
          "bg-gradient-to-br from-card to-card/80",
          "hover:shadow-xl hover:-translate-y-1 hover:border-primary/40",
          "dark:from-card dark:to-card/90",
        ].join(" "),
        glow: [
          "shadow-md",
          "hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-1",
          "hover:border-primary/30",
        ].join(" "),
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, className }))}
      {...props}
    />
  )
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "font-semibold leading-none tracking-tight",
      "transition-colors duration-200",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "text-sm text-muted-foreground",
      "transition-colors duration-200",
      className
    )}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants }
