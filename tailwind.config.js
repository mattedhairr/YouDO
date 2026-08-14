/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        'base': 'var(--bg-base)',
        'surface': 'var(--bg-surface)',
        'elevated': 'var(--bg-elevated)',
        
        'primary': 'var(--primary)',
        'primary-soft': 'var(--primary-soft)',
        'primary-glow': 'var(--primary-glow)',
        'on-primary': 'var(--on-primary)',
        
        'secondary': 'var(--secondary)',
        'secondary-soft': 'var(--secondary-soft)',
        
        'accent': 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-soft': 'var(--accent-soft)',
        
        'success': 'var(--success)',
        'success-soft': 'var(--success-soft)',
        
        'warning': 'var(--warning)',
        
        'error': 'var(--error)',
        'error-soft': 'var(--error-soft)',
        'on-accent': 'var(--on-accent)',
        'border': 'var(--border)',
        'border-subtle': 'var(--border-subtle)',
      },
      textColor: {
        'content': {
          'primary': 'var(--text-primary)',
          'secondary': 'var(--text-secondary)',
          'muted': 'var(--text-muted)',
        }
      },
      borderColor: {
        DEFAULT: 'var(--border)',
        'subtle': 'var(--border-subtle)',
      },
      boxShadow: {
        'card': 'var(--shadow-card)',
        'elevated': 'var(--shadow-elevated)',
      }
    },
  },
  plugins: [],
};
