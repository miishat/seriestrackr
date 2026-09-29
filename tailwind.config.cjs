/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        'brand': 'hsl(260, 65%, 55%)',
        'brand-hover': 'hsl(260, 65%, 50%)',
        'bg-primary': 'hsl(45, 40%, 94%)',
        'bg-secondary': 'hsl(0, 0%, 100%)',
        'text-primary': 'hsl(0, 0%, 8%)',
        'text-secondary': 'hsl(0, 0%, 40%)',
        'border-primary': 'hsl(0, 0%, 8%)',
        'dark-brand': 'hsl(260, 85%, 75%)',
        'dark-brand-hover': 'hsl(260, 85%, 70%)',
        'dark-bg-primary': 'hsl(240, 10%, 10%)',
        'dark-bg-secondary': 'hsl(240, 10%, 15%)',
        'dark-text-primary': 'hsl(0, 0%, 98%)',
        'dark-text-secondary': 'hsl(0, 0%, 70%)',
        'dark-border-primary': 'hsl(0, 0%, 98%)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.5s infinite',
      },
    },
  },
};
