FROM node:20-slim

# Instal dependensi sistem yang dibutuhkan untuk Prisma, Python 3, OpenCV, dan MediaPipe
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    postgresql-client \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Salin package.json dan package-lock.json terlebih dahulu
COPY package*.json ./

# Instal semua dependensi Node.js
RUN npm ci

# Salin requirements.txt terlebih dahulu untuk caching layer
COPY requirements.txt ./

# Instal dependensi Python
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Salin folder prisma untuk melakukan generate client
COPY prisma ./prisma
RUN npx prisma generate

# Salin sisa kode aplikasi
COPY . .

# Berikan izin eksekusi pada script entrypoint
RUN chmod +x docker-entrypoint.sh

# Port default aplikasi Express
EXPOSE 3000

# Set environment variable default untuk Python
ENV PYTHON_PATH=python3

# Set entrypoint script
ENTRYPOINT ["./docker-entrypoint.sh"]
