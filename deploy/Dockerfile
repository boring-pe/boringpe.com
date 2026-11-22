# The Boring Portal on your own server. Build from the repository root:
#   docker build -f deploy/Dockerfile -t boring-portal .
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# No DATABASE_URL here, so the build skips migrations; the container runs them on start.
RUN npx next build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
RUN useradd --system --uid 1001 portal
COPY --from=build --chown=portal /app /app
USER portal
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/portal/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node scripts/migrate.mjs && npx next start -p 3000"]
