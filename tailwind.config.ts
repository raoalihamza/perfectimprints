import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './sanity/*.{ts,tsx}',
    './sanity/{actions,components,schemas}/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1.5rem',
        lg: '2rem',
      },
      screens: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1440px',
      },
    },
    extend: {
      colors: {
        brand: {
          red: '#E11F1E',
          ink: '#231F20',
          green: '#16A34A',
          white: '#FFFFFF',
        },
        text: {
          primary: '#1A1A1A',
          muted: '#666666',
        },
        border: {
          DEFAULT: '#E5E5E5',
        },
        bg: {
          soft: '#F5F5F5',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        base: ['1rem', { lineHeight: '1.6' }],
      },
      borderRadius: {
        DEFAULT: '6px',
        lg: '8px',
      },
      maxWidth: {
        prose: '70ch',
      },
    },
  },
  plugins: [],
};

export default config;
