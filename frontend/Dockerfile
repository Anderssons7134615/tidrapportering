FROM node:20-alpine as builder

WORKDIR /app

# Kopiera package files
COPY package*.json ./

# Installera dependencies
RUN npm install

# Kopiera källkod
COPY . .

# Bygg
RUN npm run build

# Production stage
FROM nginx:alpine

# Kopiera nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Kopiera byggda filer
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
