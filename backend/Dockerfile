FROM node:20-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Kopiera package files
COPY package*.json ./

# Installera dependencies
RUN npm install

# Kopiera källkod
COPY . .

# Byt till PostgreSQL (schema.prisma har sqlite för lokal utveckling)
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma

# Generera Prisma client
RUN npx prisma generate

# Bygg TypeScript
RUN npm run build

# Skapa startup-skript som initierar DB vid uppstart
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'npx prisma db push --skip-generate' >> /app/start.sh && \
    echo 'npx tsx prisma/seed-if-empty.ts' >> /app/start.sh && \
    echo 'node dist/index.js' >> /app/start.sh && \
    chmod +x /app/start.sh

EXPOSE 3001

CMD ["sh", "/app/start.sh"]
