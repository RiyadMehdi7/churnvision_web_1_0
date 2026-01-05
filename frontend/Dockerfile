FROM oven/bun:1 AS build
WORKDIR /app

COPY frontend/package.json ./
COPY frontend/ ./

ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}

# Clean any copied node_modules/lockfiles and do fresh install
RUN rm -rf node_modules bun.lock bun.lockb package-lock.json && bun install

RUN bun run build

FROM nginx:alpine
WORKDIR /usr/share/nginx/html

# Create non-root user for security
RUN addgroup -g 1000 -S appgroup && \
    adduser -u 1000 -S appuser -G appgroup

RUN rm -rf ./*
COPY --from=build /app/dist ./
COPY infra/nginx-frontend.conf /etc/nginx/conf.d/default.conf

# Adjust permissions for non-root nginx
RUN chown -R appuser:appgroup /usr/share/nginx/html && \
    chown -R appuser:appgroup /var/cache/nginx && \
    chown -R appuser:appgroup /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R appuser:appgroup /var/run/nginx.pid

# Switch to non-root user
USER appuser

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
