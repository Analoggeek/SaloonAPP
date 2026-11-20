import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "noir-live-app-entry",
      transformIndexHtml: {
        order: "pre",
        handler(html) {
          return html
            .replace('href="./public/favicon.svg"', 'href="/favicon.svg"')
            .replace('src="./public/favicon.svg"', 'src="/favicon.svg"')
            .replace(
              "<!-- live-app-head -->",
              '<link rel="manifest" href="/app.webmanifest">',
            )
            .replace(
              "<!-- live-app-entry -->",
              '<script type="module" src="/src/main.jsx"></script>',
            );
        },
      },
    },
  ],
});
