# The LaTeX compile service. See DEPLOY.md.
#
# Two stages, and the first one exists entirely to make the second one's cache
# warm: Tectonic downloads the TeX files a document needs on first use, so an
# image without a primed cache spends its first real compile pulling a bundle
# over the network — a minute at best, a timeout at worst, and it would happen
# again after every deploy.

FROM debian:bookworm-slim AS engine

ARG TECTONIC_VERSION=0.15.0
ENV TECTONIC_CACHE_DIR=/opt/tectonic-cache

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# The musl build is statically linked, so it runs on this glibc image with no
# runtime dependencies of its own — which is what keeps the final stage down to
# Node plus one file.
RUN curl -fsSL -o /tmp/tectonic.tar.gz \
      "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-musl.tar.gz" \
 && tar xzf /tmp/tectonic.tar.gz -C /usr/local/bin tectonic \
 && rm /tmp/tectonic.tar.gz \
 && tectonic --version

# The side-effect build. Everything the real preamble loads is fetched here and
# left in TECTONIC_CACHE_DIR, which is copied into the runtime image below.
COPY warm.tex /tmp/warm/warm.tex
RUN cd /tmp/warm && tectonic -X compile --untrusted -r 0 --outfmt pdf warm.tex \
 && test -f /tmp/warm/warm.pdf \
 && rm -rf /tmp/warm \
 && du -sh "$TECTONIC_CACHE_DIR"

FROM node:22-slim

ENV NODE_ENV=production \
    TECTONIC_CACHE_DIR=/opt/tectonic-cache \
    PORT=8080

COPY --from=engine /usr/local/bin/tectonic /usr/local/bin/tectonic
COPY --from=engine /opt/tectonic-cache /opt/tectonic-cache
COPY server.mjs /app/server.mjs

# The cache is read at compile time and written to when a document wants a file
# the warm build never asked for, so it belongs to the user the server runs as.
RUN chown -R node:node /opt/tectonic-cache
USER node

WORKDIR /app
EXPOSE 8080
CMD ["node", "server.mjs"]
