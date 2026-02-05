FROM node:20-alpine

WORKDIR /app

# Kopiera package files
COPY package*.json ./

# Installera dependencies
RUN npm install

# Kopiera källkod
COPY . .

# Generera Prisma client och skapa databas
RUN npx prisma generate
RUN npx prisma db push

# Seeda databas
RUN npm run db:seed

# Bygg TypeScript
RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
