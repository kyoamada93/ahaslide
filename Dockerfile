FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# Data goes to DATA_DIR, else the Railway volume (RAILWAY_VOLUME_MOUNT_PATH), else /app/data.
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
