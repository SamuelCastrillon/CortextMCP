import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './modules/panel/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        tertiary: {
          DEFAULT: '#ffb68b',
          foreground: '#522300',
          container: '#783600',
          'on-container': '#ffa267',
        },
        surface: {
          DEFAULT: 'hsl(var(--background))',
          bright: '#3b3741',
          container: {
            lowest: '#100d15',
            low: '#1d1a23',
            DEFAULT: '#211e27',
            high: '#2c2831',
            highest: '#37333c',
          },
          variant: '#37333c',
        },
        'on-surface': {
          DEFAULT: '#e7e0ec',
          variant: '#ccc3d6',
        },
        outline: {
          DEFAULT: '#958e9f',
          variant: '#4a4453',
        },
        error: {
          DEFAULT: '#ffb4ab',
          container: '#93000a',
        },
      },
      borderRadius: {
        none: '0',
        DEFAULT: '0',
        sm: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
      },
    },
  },
  plugins: [],
};

export default config;
