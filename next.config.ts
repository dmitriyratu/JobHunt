import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse reads uploaded documents; pdfjs-dist counts the pages of the ones
  // this app typesets. Both resolve files relative to themselves at runtime —
  // pdf.js loads its worker that way — which bundling breaks.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  /**
   * Ship the Tectonic engine and its primed TeX cache with the two routes that
   * typeset.
   *
   * Tracing works by following imports, and it cannot follow a spawn: nothing
   * in the source mentions vendor/tectonic, so without this the binary is left
   * behind and the deployed function reports that no engine is installed.
   *
   * Both routes are listed because both compile — the editor's preview through
   * /api/compile-latex, and the page-fitting search inside /api/tailor-resume,
   * which measures a document by building it. Naming only the first is how you
   * get an app whose preview works and whose one-page target silently does
   * nothing.
   *
   * scripts/fetch-tectonic.mjs puts the files there, on Linux builds only.
   */
  outputFileTracingIncludes: {
    "/api/compile-latex": ["./vendor/tectonic/**/*"],
    "/api/tailor-resume": ["./vendor/tectonic/**/*"],
  },
  async redirects() {
    return [
      // Usage became a modal in the header; keep old links/bookmarks working
      // instead of 404ing.
      { source: "/usage", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
