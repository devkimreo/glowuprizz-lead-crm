FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile=false
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile=false
COPY --from=build /app/dist ./dist
COPY src/schema.sql ./dist/schema.sql
COPY public ./public
COPY openapi.json ./openapi.json
USER node
EXPOSE 3000
CMD ["sh", "-c", "node dist/migrate.js && node dist/seed.js && node dist/server.js"]
