# Use official Deno image
FROM denoland/deno:2.6.9

# Set working directory
WORKDIR /app

# Copy dependency files first for better caching
COPY deno.json .

# Copy source files
COPY main.ts .
COPY main_test.ts .

# Cache dependencies
RUN deno cache main.ts

# Expose WebSocket port
EXPOSE 4000

# Run the server
CMD ["deno", "run", "--allow-net", "main.ts"]
