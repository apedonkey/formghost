FROM node:20-alpine

WORKDIR /app

# Copy package files first (cached layer)
COPY package*.json ./

# Install dependencies (cached unless package.json changes)
RUN npm ci --only=production

# Copy app files
COPY . .

EXPOSE 8080

CMD ["node", "server.js"]
