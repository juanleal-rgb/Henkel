#!/bin/sh
echo "Running database migrations..."
npx prisma db push --skip-generate
echo "Starting server..."
exec npx next start
