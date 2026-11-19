import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1320px' },
    },
    extend: {
      colors: {
        primary: {
          50: '#F6F4FC',
          100: '#EDE9F8',
          200: '#DDD6F1',
          300: '#C4B8E6',
          400: '#A396D8',
          500: '#8478C9',
          600: '#6F63B5',
          700: '#5B509C',
          800: '#4B4380',
          900: '#3A3464',
        },
        accent: {
          50: '#FEF7F3',
          100: '#FDEBE3',
          200: '#FBD5C5',
          300: '#F8B79D',
          400: '#F7926B',
          500: '#F27B4D',
          600: '#DE6433',
        },
        ink: {
          300: '#A7A7B8',
          400: '#8E8EA3',
          500: '#6B6B80',
          700: '#3A3A4A',
          900: '#111111',
        },
        success: '#4CAF8E',
        warning: '#F2B84B',
        danger: '#E5646A',
        surface: '#FFFFFF',
        line: '#EEE9F8',
      },
      fontFamily: {
        sans: ['var(--font-jakarta)', 'var(--font-arabic)', 'system-ui', 'sans-serif'],
        arabic: ['var(--font-arabic)', 'var(--font-jakarta)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '16px',
        '2xl': '20px',
        '3xl': '24px',
        '4xl': '28px',
        '5xl': '36px',
      },
      boxShadow: {
        card: '0 10px 40px rgba(111, 99, 181, 0.08)',
        soft: '0 6px 24px rgba(111, 99, 181, 0.10)',
        lift: '0 18px 44px rgba(111, 99, 181, 0.16)',
        pill: '0 8px 20px rgba(17, 17, 17, 0.18)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pop: {
          '0%': { opacity: '0', transform: 'scale(.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(.9)', opacity: '.7' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .45s cubic-bezier(.22,1,.36,1) both',
        'fade-in': 'fade-in .35s ease both',
        pop: 'pop .25s cubic-bezier(.22,1,.36,1) both',
        'pulse-ring': 'pulse-ring 1.8s ease-out infinite',
        'slide-in': 'slide-in .35s cubic-bezier(.22,1,.36,1) both',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
