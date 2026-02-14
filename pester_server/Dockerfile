# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy dependency files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy source files
COPY index.js .

# Expose WebSocket port
EXPOSE 4000

# Run the server
CMD ["node", "index.js"]
