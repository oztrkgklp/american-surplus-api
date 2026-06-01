# Stage 1: Build application and download browser
FROM ghcr.io/puppeteer/puppeteer:24 AS build

# Set working directory
WORKDIR /src

# Copy config and lock files
COPY package*.json tsconfig*.json ./

# Use root for installing and browser setup
USER root

# Install dependencies
RUN npm install

# Install browser for puppeteer (required for runtime)
RUN npx puppeteer browsers install chrome

# Copy rest of the codebase
COPY . .

# Build app
RUN npm run build

# Stage 2: Final runtime image
FROM ghcr.io/puppeteer/puppeteer:24

# Set working directory
WORKDIR /src

# Copy built artifacts and config
COPY --from=build /src/dist ./dist
COPY --from=build /src/package*.json ./
COPY --from=build /src/tsconfig*.json ./

# Copy the downloaded Chromium browser
COPY --from=build /home/pptruser/.cache/puppeteer /home/pptruser/.cache/puppeteer

# Install only production deps
RUN npm ci

# ARG + ENV
ARG ENVIRONMENT
ENV NODE_ENV=${ENVIRONMENT}

# Use root to create user and fix permissions
USER root

# Create group/user
RUN addgroup --gid 1005 american-surplus && \
    adduser --uid 1005 --ingroup american-surplus --home /home/american-surplus-user --disabled-password american-surplus-user

# Prepare log directory
RUN mkdir -p /src/logs && chown -R american-surplus-user:american-surplus /src/logs

# Prepare cert directory
RUN mkdir -p /var/www/html/
COPY certs/DigiCertGlobalRootCA.crt.pem /var/www/html
RUN chown -R american-surplus-user:american-surplus /var/www/html/

# Make sure puppeteer cache has the right perms
RUN mkdir -p /home/american-surplus-user/.cache/puppeteer && \
    cp -r /home/pptruser/.cache/puppeteer/* /home/american-surplus-user/.cache/puppeteer/ && \
    chown -R american-surplus-user:american-surplus /home/american-surplus-user/.cache

# Switch to non-root user
USER american-surplus-user

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "dist/index.js"]