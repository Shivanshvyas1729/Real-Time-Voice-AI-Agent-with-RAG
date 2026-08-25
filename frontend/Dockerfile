# Multi-stage build for React/Vite frontend

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build arguments for environment variables
# Use relative path since frontend and backend are on same ALB
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_PIPECAT_ENDPOINT=/stream/connect

# Set environment variables for build
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_PIPECAT_ENDPOINT=$VITE_PIPECAT_ENDPOINT

# Build the application
RUN npm run build

# Stage 2: Production server
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

