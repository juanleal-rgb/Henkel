#!/bin/sh
echo "Running database migrations..."
npx prisma db push --skip-generate --config prisma/prisma.config.ts
echo "Starting server..."
exec npx next start
