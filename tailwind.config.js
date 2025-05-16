/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // Enables dark mode using a class (ion-palette-dark)
  content: [
    './src/**/*.{html,ts}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          500: '#3B82F6', // Blue for light mode
          600: '#2563EB', // Darker blue for dark mode
        },
        accent: {
          500: '#10B981', // Green for light mode
          600: '#059669', // Darker green for dark mode
        },
      },
    },
  },
  plugins: [],
};
