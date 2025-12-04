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
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: 0
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: 0
  				}
  			},
  			fadeIn: {
  				'0%': {
  					opacity: '0',
  					transform: 'translateY(10px)'
  				},
  				'100%': {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			},
  			shimmer: {
  				'0%': {
  					transform: 'translateX(-100%)'
  				},
  				'100%': {
  					transform: 'translateX(100%)'
  				}
  			},
  			'pulse-glow': {
  				'0%, 100%': {
  					opacity: 1,
  					boxShadow: '0 0 20px rgba(16, 185, 129, 0.3)'
  				},
  				'50%': {
  					opacity: 0.8,
  					boxShadow: '0 0 40px rgba(16, 185, 129, 0.5)'
  				}
  			},
  			'bounce-dot': {
  				'0%, 100%': {
  					transform: 'translateY(0)'
  				},
  				'50%': {
  					transform: 'translateY(-25%)'
  				}
  			},
  			pulse: {
  				'0%, 100%': {
  					opacity: 1
  				},
  				'50%': {
  					opacity: 0.5
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'fade-in': 'fadeIn 0.3s ease-in-out',
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
