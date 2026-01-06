/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', "class"],
  theme: {
  	extend: {
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
			foreground: 'hsl(var(--foreground))',
			surface: {
				DEFAULT: 'hsl(var(--surface))',
				muted: 'hsl(var(--surface-muted))',
				elevated: 'hsl(var(--surface-elevated))',
				subtle: 'hsl(var(--surface-subtle))'
			},
			neutral: {
				DEFAULT: 'hsl(var(--neutral-foreground))',
				muted: 'hsl(var(--neutral-foreground-muted))',
				subtle: 'hsl(var(--neutral-foreground-subtle))'
			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			'app-green': {
  				DEFAULT: '#75caa9',
  				light: '#e6f4ef',
  				hover: '#5ba98b',
  				dark: '#4a9d7c',
  				darkmode: '#3a8c6c',
  				'darkmode-light': '#2a3f35',
  				'darkmode-hover': '#4a9d7c'
  			},
  			dark: {
  				'100': '#f3f4f6',
  				'200': '#e5e7eb',
  				'300': '#d1d5db',
  				'400': '#9ca3af',
  				'500': '#6b7280',
  				'600': '#4b5563',
  				'700': '#374151',
  				'800': '#1f2937',
  				'850': '#172033',
  				'900': '#111827',
  				'950': '#0d1117'
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))',
  				grid: 'hsl(var(--chart-grid))',
  				axis: 'hsl(var(--chart-axis))'
  			},
  			risk: {
  				high: 'hsl(var(--risk-high))',
  				medium: 'hsl(var(--risk-medium))',
  				low: 'hsl(var(--risk-low))'
  			},
  			teams: {
  				purple: 'hsl(var(--teams-purple))'
  			},
  			tooltip: {
  				bg: 'hsl(var(--tooltip-bg))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			// Accordion animations
  			'accordion-down': {
  				from: { height: 0, opacity: 0 },
  				to: { height: 'var(--radix-accordion-content-height)', opacity: 1 }
  			},
  			'accordion-up': {
  				from: { height: 'var(--radix-accordion-content-height)', opacity: 1 },
  				to: { height: 0, opacity: 0 }
  			},
  			// Premium fade animations
  			'premium-fade-in': {
  				'0%': { opacity: '0' },
  				'100%': { opacity: '1' }
  			},
  			'premium-fade-in-up': {
  				'0%': { opacity: '0', transform: 'translateY(16px)' },
  				'100%': { opacity: '1', transform: 'translateY(0)' }
  			},
  			'premium-fade-in-down': {
  				'0%': { opacity: '0', transform: 'translateY(-16px)' },
  				'100%': { opacity: '1', transform: 'translateY(0)' }
  			},
  			'premium-fade-in-left': {
  				'0%': { opacity: '0', transform: 'translateX(-16px)' },
  				'100%': { opacity: '1', transform: 'translateX(0)' }
  			},
  			'premium-fade-in-right': {
  				'0%': { opacity: '0', transform: 'translateX(16px)' },
  				'100%': { opacity: '1', transform: 'translateX(0)' }
  			},
  			// Premium scale animations
  			'premium-scale-in': {
  				'0%': { opacity: '0', transform: 'scale(0.95)' },
  				'100%': { opacity: '1', transform: 'scale(1)' }
  			},
  			'premium-scale-out': {
  				'0%': { opacity: '1', transform: 'scale(1)' },
  				'100%': { opacity: '0', transform: 'scale(0.95)' }
  			},
  			// Premium slide animations
  			'premium-slide-in-up': {
  				'0%': { transform: 'translateY(100%)', opacity: '0' },
  				'100%': { transform: 'translateY(0)', opacity: '1' }
  			},
  			'premium-slide-in-down': {
  				'0%': { transform: 'translateY(-100%)', opacity: '0' },
  				'100%': { transform: 'translateY(0)', opacity: '1' }
  			},
  			'premium-slide-in-left': {
  				'0%': { transform: 'translateX(-100%)', opacity: '0' },
  				'100%': { transform: 'translateX(0)', opacity: '1' }
  			},
  			'premium-slide-in-right': {
  				'0%': { transform: 'translateX(100%)', opacity: '0' },
  				'100%': { transform: 'translateX(0)', opacity: '1' }
  			},
  			// Premium shimmer effect
  			'premium-shimmer': {
  				'0%': { transform: 'translateX(-100%)' },
  				'100%': { transform: 'translateX(100%)' }
  			},
  			// Premium pulse effects
  			'premium-pulse': {
  				'0%, 100%': { opacity: 1, transform: 'scale(1)' },
  				'50%': { opacity: 0.7, transform: 'scale(0.98)' }
  			},
  			'premium-pulse-glow': {
  				'0%, 100%': { opacity: 1, boxShadow: '0 0 20px rgba(16, 185, 129, 0.25)' },
  				'50%': { opacity: 0.9, boxShadow: '0 0 40px rgba(16, 185, 129, 0.4)' }
  			},
  			'premium-pulse-ring': {
  				'0%': { transform: 'scale(1)', opacity: 0.8 },
  				'100%': { transform: 'scale(2)', opacity: 0 }
  			},
  			// Premium float animation
  			'premium-float': {
  				'0%, 100%': { transform: 'translateY(0)' },
  				'50%': { transform: 'translateY(-6px)' }
  			},
  			// Premium bounce animations
  			'premium-bounce': {
  				'0%, 100%': { transform: 'translateY(0)' },
  				'25%': { transform: 'translateY(-8px)' },
  				'50%': { transform: 'translateY(0)' },
  				'75%': { transform: 'translateY(-4px)' }
  			},
  			'premium-bounce-dot': {
  				'0%, 80%, 100%': { transform: 'translateY(0)' },
  				'40%': { transform: 'translateY(-12px)' }
  			},
  			// Premium spin/rotate
  			'premium-spin': {
  				'0%': { transform: 'rotate(0deg)' },
  				'100%': { transform: 'rotate(360deg)' }
  			},
  			'premium-spin-slow': {
  				'0%': { transform: 'rotate(0deg)' },
  				'100%': { transform: 'rotate(360deg)' }
  			},
  			// Premium glow effect
  			'premium-glow': {
  				'0%, 100%': { boxShadow: '0 0 5px rgba(16, 185, 129, 0.3), 0 0 20px rgba(16, 185, 129, 0.1)' },
  				'50%': { boxShadow: '0 0 20px rgba(16, 185, 129, 0.5), 0 0 40px rgba(16, 185, 129, 0.2)' }
  			},
  			// Premium shake animation
  			'premium-shake': {
  				'0%, 100%': { transform: 'translateX(0)' },
  				'10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-2px)' },
  				'20%, 40%, 60%, 80%': { transform: 'translateX(2px)' }
  			},
  			// Premium wiggle
  			'premium-wiggle': {
  				'0%, 100%': { transform: 'rotate(0deg)' },
  				'25%': { transform: 'rotate(-3deg)' },
  				'75%': { transform: 'rotate(3deg)' }
  			},
  			// Card flip
  			'premium-flip-in': {
  				'0%': { transform: 'perspective(400px) rotateY(90deg)', opacity: 0 },
  				'100%': { transform: 'perspective(400px) rotateY(0deg)', opacity: 1 }
  			},
  			// Gradient flow
  			'premium-gradient-flow': {
  				'0%': { backgroundPosition: '0% 50%' },
  				'50%': { backgroundPosition: '100% 50%' },
  				'100%': { backgroundPosition: '0% 50%' }
  			},
  			// Border glow
  			'premium-border-glow': {
  				'0%, 100%': { borderColor: 'rgba(16, 185, 129, 0.3)' },
  				'50%': { borderColor: 'rgba(16, 185, 129, 0.7)' }
  			},
  			// Subtle breathe
  			'premium-breathe': {
  				'0%, 100%': { transform: 'scale(1)' },
  				'50%': { transform: 'scale(1.02)' }
  			},
  			// Enter from blur
  			'premium-blur-in': {
  				'0%': { filter: 'blur(8px)', opacity: 0 },
  				'100%': { filter: 'blur(0)', opacity: 1 }
  			},
  			// Legacy compatibility
  			fadeIn: {
  				'0%': { opacity: '0', transform: 'translateY(10px)' },
  				'100%': { opacity: '1', transform: 'translateY(0)' }
  			},
  			shimmer: {
  				'0%': { transform: 'translateX(-100%)' },
  				'100%': { transform: 'translateX(100%)' }
  			},
  			'pulse-glow': {
  				'0%, 100%': { opacity: 1, boxShadow: '0 0 20px rgba(16, 185, 129, 0.3)' },
  				'50%': { opacity: 0.8, boxShadow: '0 0 40px rgba(16, 185, 129, 0.5)' }
  			},
  			'bounce-dot': {
  				'0%, 100%': { transform: 'translateY(0)' },
  				'50%': { transform: 'translateY(-25%)' }
  			},
  			pulse: {
  				'0%, 100%': { opacity: 1 },
  				'50%': { opacity: 0.5 }
  			}
  		},
  		animation: {
  			// Accordion
  			'accordion-down': 'accordion-down 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
  			'accordion-up': 'accordion-up 0.25s cubic-bezier(0.4, 0, 1, 1)',
  			// Premium fade animations
  			'premium-fade-in': 'premium-fade-in 0.35s cubic-bezier(0.25, 1, 0.5, 1)',
  			'premium-fade-in-up': 'premium-fade-in-up 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
  			'premium-fade-in-down': 'premium-fade-in-down 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
  			'premium-fade-in-left': 'premium-fade-in-left 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
  			'premium-fade-in-right': 'premium-fade-in-right 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
  			// Premium scale
  			'premium-scale-in': 'premium-scale-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
  			'premium-scale-out': 'premium-scale-out 0.25s cubic-bezier(0.4, 0, 1, 1)',
  			// Premium slide
  			'premium-slide-in-up': 'premium-slide-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
  			'premium-slide-in-down': 'premium-slide-in-down 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
  			'premium-slide-in-left': 'premium-slide-in-left 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
  			'premium-slide-in-right': 'premium-slide-in-right 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
  			// Premium shimmer
  			'premium-shimmer': 'premium-shimmer 2s cubic-bezier(0.4, 0, 0.2, 1) infinite',
  			// Premium pulse
  			'premium-pulse': 'premium-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  			'premium-pulse-glow': 'premium-pulse-glow 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  			'premium-pulse-ring': 'premium-pulse-ring 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  			// Premium float
  			'premium-float': 'premium-float 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  			// Premium bounce
  			'premium-bounce': 'premium-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
  			'premium-bounce-dot': 'premium-bounce-dot 1.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  			// Premium spin
  			'premium-spin': 'premium-spin 0.8s linear infinite',
  			'premium-spin-slow': 'premium-spin-slow 3s linear infinite',
  			// Premium glow
  			'premium-glow': 'premium-glow 2s ease-in-out infinite',
  			// Premium shake
  			'premium-shake': 'premium-shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97)',
  			// Premium wiggle
  			'premium-wiggle': 'premium-wiggle 0.5s ease-in-out',
  			// Card flip
  			'premium-flip-in': 'premium-flip-in 0.5s cubic-bezier(0.25, 1, 0.5, 1)',
  			// Gradient flow
  			'premium-gradient-flow': 'premium-gradient-flow 4s ease infinite',
  			// Border glow
  			'premium-border-glow': 'premium-border-glow 2s ease-in-out infinite',
  			// Breathe
  			'premium-breathe': 'premium-breathe 3s ease-in-out infinite',
  			// Blur in
  			'premium-blur-in': 'premium-blur-in 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
  			// Legacy compatibility
  			'fade-in': 'fadeIn 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
  			shimmer: 'shimmer 2s infinite linear',
  			pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  			'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
  			'bounce-dot': 'bounce-dot 1.4s ease-in-out infinite'
  		},
  		typography: {
  			DEFAULT: {
  				css: {
  					maxWidth: 'none',
  					color: 'inherit',
  					a: {
  						color: '#75caa9',
  						'&:hover': {
  							color: '#4a9d7c'
  						}
  					},
  					code: {
  						color: 'inherit',
  						background: '#f3f4f6',
  						padding: '2px 4px',
  						borderRadius: '4px'
  					}
  				}
  			},
  			dark: {
  				css: {
  					color: 'inherit',
  					a: {
  						color: '#5ba98b',
  						'&:hover': {
  							color: '#75caa9'
  						}
  					},
  					code: {
  						color: 'inherit',
  						background: '#1f2937',
  						padding: '2px 4px',
  						borderRadius: '4px'
  					},
  					blockquote: {
  						borderLeftColor: '#374151',
  						color: '#9ca3af'
  					},
  					h1: {
  						color: '#e5e7eb'
  					},
  					h2: {
  						color: '#e5e7eb'
  					},
  					h3: {
  						color: '#e5e7eb'
  					},
  					h4: {
  						color: '#e5e7eb'
  					},
  					strong: {
  						color: '#e5e7eb'
  					}
  				}
  			}
  		},
  		zIndex: {
  			'100': '100'
  		},
  		boxShadow: {
  			'dark-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
  			'dark-md': '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)',
  			'dark-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.2)',
  			'dark-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3)'
  		},
  		backgroundImage: {
  			'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
  			'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
  			'dark-gradient': 'linear-gradient(to bottom, var(--tw-gradient-stops))'
  		}
  	}
  },
  plugins: [
    require("tailwindcss-animate"),
    require('@tailwindcss/typography')({
      className: 'prose',
    }),
  ],
} 
