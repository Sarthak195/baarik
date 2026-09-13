/**
 * Tailwind v4 ships its entire configuration in CSS — see `src/app/globals.css`.
 * There is no `tailwind.config.js` in this project and there should not be one: two
 * places to define a colour is how a design system drifts.
 *
 * @type {import('postcss-load-config').Config}
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
