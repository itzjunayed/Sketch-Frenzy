FROM node:22-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

COPY package*.json ./

RUN npm ci && npm audit fix --force

# Copy source code BEFORE building
COPY . .

RUN npm run build

EXPOSE 5000

CMD ["npm", "start"]
