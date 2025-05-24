FROM node:17-slim

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

EXPOSE 4000

# Run the app
CMD ["node", "index.js"]