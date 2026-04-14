# Stage 1: Build the React frontend
FROM node:20-alpine AS client-builder
WORKDIR /app/client

COPY client/package.json client/package-lock.json* ./
RUN npm install

COPY client/ ./
RUN npm run build

# Stage 2: Build the Node.js backend
FROM node:20-alpine AS server-builder
WORKDIR /app/server

COPY server/package.json server/package-lock.json* ./
RUN npm install

COPY server/ ./
RUN npm run build

# Stage 3: Production image
FROM node:20-alpine AS production
WORKDIR /app

# Copy server build
COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=server-builder /app/server/node_modules ./server/node_modules
COPY --from=server-builder /app/server/package.json ./server/package.json
COPY --from=server-builder /app/server/prisma ./server/prisma

# Copy client build into the server's expected static path
COPY --from=client-builder /app/client/dist ./client/dist

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Run migrations then server
CMD ["sh", "-c", "cd server && npx prisma migrate deploy && node dist/index.js"]
