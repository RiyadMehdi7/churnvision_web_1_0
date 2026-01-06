import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Premium button variants with smooth transitions and micro-interactions.
 * Features carefully tuned timing functions for a luxurious feel.
 */
const buttonVariants = cva(
  [
    // Base styles
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md",
    "text-sm font-medium",
    // Premium transitions with custom bezier curves
    "transition-all duration-200 ease-[cubic-bezier(0.25,1,0.5,1)]",
    // Transform origin for scale effects
    "origin-center",
    // Focus states
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    // Disabled states
    "disabled:pointer-events-none disabled:opacity-50",
    // SVG styling
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    "[&_svg]:transition-transform [&_svg]:duration-200",
    // Active state micro-interaction
    "active:scale-[0.97] active:transition-transform active:duration-75",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "bg-primary text-primary-foreground shadow-sm",
          "hover:bg-primary/90 hover:shadow-md hover:-translate-y-0.5",
          "active:shadow-sm active:translate-y-0",
        ].join(" "),
        destructive: [
          "bg-destructive text-destructive-foreground shadow-sm",
          "hover:bg-destructive/90 hover:shadow-md hover:-translate-y-0.5",
          "active:shadow-sm active:translate-y-0",
        ].join(" "),
        outline: [
          "border border-input bg-background shadow-sm",
          "hover:bg-accent hover:text-accent-foreground hover:border-accent",
          "hover:-translate-y-0.5 hover:shadow-md",
          "active:translate-y-0 active:shadow-sm",
        ].join(" "),
        secondary: [
          "bg-secondary text-secondary-foreground shadow-sm",
          "hover:bg-secondary/80 hover:-translate-y-0.5 hover:shadow-md",
          "active:translate-y-0 active:shadow-sm",
        ].join(" "),
        ghost: [
          "hover:bg-accent hover:text-accent-foreground",
          "active:bg-accent/80",
        ].join(" "),
        link: [
          "text-primary underline-offset-4",
          "hover:underline",
          "active:opacity-80",
        ].join(" "),
        // Premium gradient button
        premium: [
          "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md",
          "hover:from-emerald-600 hover:to-teal-600 hover:shadow-lg hover:-translate-y-0.5",
          "active:shadow-md active:translate-y-0",
          "dark:from-emerald-600 dark:to-teal-600",
          "dark:hover:from-emerald-500 dark:hover:to-teal-500",
        ].join(" "),
        // Subtle premium variant
        subtle: [
          "bg-primary/10 text-primary",
          "hover:bg-primary/20 hover:-translate-y-0.5",
          "active:bg-primary/15 active:translate-y-0",
        ].join(" "),
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-6 text-base",
        xl: "h-12 rounded-lg px-8 text-base font-semibold",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
        "icon-lg": "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Add loading spinner and disable button */
  isLoading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isLoading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4"
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
            <span className="opacity-70">Loading...</span>
          </>
        ) : (
          children
        )}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
