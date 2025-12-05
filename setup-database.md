# Database Setup Guide for Vesla ERP

Your application is running but needs a PostgreSQL database connection. Here are the fastest options:

## Option 1: Neon (Recommended - 5 minutes)

1. Go to https://neon.tech
2. Click "Sign Up" (free, no credit card required)
3. Create a new project named "vesla-erp"
4. Copy the connection string (it will look like: `postgresql://username:password@host.neon.tech/dbname?sslmode=require`)
5. Update `backend/.env` - replace the DATABASE_URL line with your connection string
6. Run migrations:
   ```bash
   cd backend
   npx prisma migrate deploy
   ```

## Option 2: Supabase (Also Free)

1. Go to https://supabase.com
2. Sign up and create a new project
3. Go to Project Settings > Database
4. Copy the "Connection string" under "Connection pooling"
5. Update `backend/.env` with your connection string
6. Run migrations:
   ```bash
   cd backend
   npx prisma migrate deploy
   ```

## Option 3: Railway (Free Tier)

1. Go to https://railway.app
2. Sign up with GitHub
3. Click "New Project" > "Provision PostgreSQL"
4. Click on the PostgreSQL service > "Connect" tab
5. Copy the "Postgres Connection URL"
6. Update `backend/.env` with your connection string
7. Run migrations:
   ```bash
   cd backend
   npx prisma migrate deploy
   ```

## Option 4: Install PostgreSQL Locally

1. Download from https://www.postgresql.org/download/windows/
2. Install PostgreSQL 15 or 16
3. Remember the password you set during installation
4. After installation, update `backend/.env`:
   ```
   DATABASE_URL="postgresql://postgres:your_password@localhost:5432/vesla_erp?schema=public"
   ```
5. Create the database:
   ```bash
   createdb vesla_erp
   ```
6. Run migrations:
   ```bash
   cd backend
   npx prisma migrate dev
   ```

## Current Status

✅ Frontend: http://localhost:5173
✅ Backend: http://localhost:3000
❌ Database: Needs setup (choose one option above)

Once you complete any of the options above, the backend will automatically connect to the database and you'll be ready to use the application!
