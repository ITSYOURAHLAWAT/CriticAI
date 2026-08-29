# ══════════════════════════════════════════════════════════════════════════════
# Stage 1: Build — Node 20 Alpine
# ══════════════════════════════════════════════════════════════════════════════
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (Docker cache layer optimisation)
COPY package.json package-lock.json ./

# Install dependencies (clean install for reproducibility)
RUN npm ci --silent

# Copy source and build
COPY . .

# Point the frontend at relative paths so it works behind nginx proxy
ENV VITE_API_BASE_URL=""

RUN npm run build

# ══════════════════════════════════════════════════════════════════════════════
# Stage 2: Serve — nginx Alpine (tiny final image ~25MB)
# ══════════════════════════════════════════════════════════════════════════════
FROM nginx:1.27-alpine AS production

# Remove default nginx page
RUN rm -rf /usr/share/nginx/html/*

# Copy built React app from Stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy our custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost/index.html || exit 1

CMD ["nginx", "-g", "daemon off;"]
