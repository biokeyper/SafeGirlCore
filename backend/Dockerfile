# Dockerfile for SafeGirl Backend
# This tells Docker how to build and run the Node.js backend

# ========== BUILD STAGE ==========
FROM node:20-alpine AS builder

# Set working directory inside container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# ========== RUNTIME STAGE ==========
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY . .

# Expose port 3001 (tells Docker this container listens on 3001)
EXPOSE 3001

# Set environment to development (for nodemon hot reload)
ENV NODE_ENV=development

# Health check - Docker will periodically check if server is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Command to run when container starts
# Use 'dev' script which runs nodemon for auto-restart on file changes
CMD ["npm", "run", "dev"]
