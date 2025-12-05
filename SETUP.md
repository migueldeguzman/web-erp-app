# Vesla ERP - Setup Guide

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+ (or use Docker)
- Git

## Quick Start with Docker (Recommended)

1. Clone the repository:
```bash
git clone https://github.com/vesla-erp/vesla-erp.git
cd vesla-erp
```

2. Start all services:
```bash
docker-compose up -d
```

3. Run database migrations:
```bash
docker-compose exec backend npx prisma migrate dev
```

4. Create a seed user (optional):
```bash
docker-compose exec backend npx prisma db seed
```

5. Access the application:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- API Health: http://localhost:3000/health

## Manual Setup (Without Docker)

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

4. Update `.env` with your database credentials:
```env
DATABASE_URL="postgresql://username:password@localhost:5432/vesla_erp?schema=public"
JWT_SECRET=your-super-secret-jwt-key
PORT=3000
```

5. Run database migrations:
```bash
npx prisma migrate dev
```

6. Generate Prisma Client:
```bash
npx prisma generate
```

7. Start the backend server:
```bash
npm run dev
```

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

4. Update `.env`:
```env
VITE_API_URL=http://localhost:3000/api
```

5. Start the frontend server:
```bash
npm run dev
```

## Database Setup

### PostgreSQL Installation

**Windows:**
1. Download PostgreSQL from https://www.postgresql.org/download/windows/
2. Run the installer
3. Set a password for the postgres user
4. Create a new database named `vesla_erp`

**Mac:**
```bash
brew install postgresql@15
brew services start postgresql@15
createdb vesla_erp
```

**Linux:**
```bash
sudo apt-get install postgresql
sudo -u postgres createdb vesla_erp
```

### Running Migrations

```bash
cd backend
npx prisma migrate dev
```

### Viewing Database

Use Prisma Studio to view and edit data:
```bash
cd backend
npx prisma studio
```

## Creating Your First User

### Using the API

Send a POST request to `http://localhost:3000/api/auth/register`:

```json
{
  "email": "admin@veslaerp.com",
  "password": "securepassword123",
  "firstName": "Admin",
  "lastName": "User",
  "role": "ADMIN"
}
```

### Using cURL

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@veslaerp.com",
    "password": "securepassword123",
    "firstName": "Admin",
    "lastName": "User",
    "role": "ADMIN"
  }'
```

## Testing the API

### Health Check
```bash
curl http://localhost:3000/health
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@veslaerp.com",
    "password": "securepassword123"
  }'
```

## Project Structure

```
vesla-erp/
├── backend/              # Express + TypeScript API
│   ├── src/
│   │   ├── controllers/  # Request handlers
│   │   ├── routes/       # API routes
│   │   ├── middleware/   # Auth, error handling
│   │   ├── services/     # Business logic
│   │   └── utils/        # Helper functions
│   ├── prisma/           # Database schema
│   └── package.json
│
├── frontend/             # React + TypeScript app
│   ├── src/
│   │   ├── components/   # Reusable components
│   │   ├── pages/        # Page components
│   │   ├── services/     # API calls
│   │   ├── stores/       # State management
│   │   └── utils/        # Helper functions
│   └── package.json
│
└── docker-compose.yml    # Docker configuration
```

## Available Scripts

### Root Directory
- `npm run dev` - Start both backend and frontend
- `npm run backend` - Start backend only
- `npm run frontend` - Start frontend only

### Backend
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:migrate` - Run migrations
- `npm run prisma:studio` - Open Prisma Studio

### Frontend
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Troubleshooting

### Database Connection Issues

1. Check PostgreSQL is running:
```bash
# Windows
services.msc
# Look for PostgreSQL service

# Mac/Linux
ps aux | grep postgres
```

2. Verify DATABASE_URL in `.env`
3. Check firewall settings for port 5432

### Port Already in Use

Change ports in:
- `backend/.env` - PORT variable
- `frontend/.env` - Update VITE_API_URL
- `docker-compose.yml` - ports section

### Prisma Migration Errors

Reset database (WARNING: deletes all data):
```bash
cd backend
npx prisma migrate reset
```

## Security Notes

- Change JWT_SECRET in production
- Use strong passwords
- Enable SSL for PostgreSQL in production
- Set appropriate CORS_ORIGIN
- Never commit `.env` files

## Next Steps

1. Implement invoice creation logic
2. Implement payment processing
3. Implement journal voucher system
4. Add role-based permissions
5. Implement reporting features
6. Add data export functionality

## Support

For issues, please contact the development team or create an issue in the repository.
