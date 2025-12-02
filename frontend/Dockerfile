FROM oven/bun:1 AS build
WORKDIR /app

COPY frontend/package.json frontend/bun.lock ./
COPY frontend/ ./

ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=${VITE_API_URL}

RUN bun install --frozen-lockfile
RUN bun run build

FROM nginx:alpine
WORKDIR /usr/share/nginx/html

RUN rm -rf ./*
COPY --from=build /app/dist ./
COPY infra/nginx-frontend.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
