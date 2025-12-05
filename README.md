# Vesla ERP - Financial ERP Web Application

A modern, secure web-based ERP system for financial accounting and operations management.

## Features

- **Invoice Management** - Create, track, and manage invoices
- **Payment Processing** - Record and reconcile payments
- **Journal Vouchers** - Double-entry bookkeeping system
- **Multi-company Support** - Manage multiple entities
- **Secure Authentication** - JWT-based auth with role-based access control
- **Audit Trail** - Complete transaction history

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for fast development
- TailwindCSS for styling
- React Router for navigation
- Axios for API calls

### Backend
- Node.js with Express
- TypeScript
- PostgreSQL database
- Prisma ORM
- JWT authentication
- bcrypt for password hashing

## Project Structure

```
vesla-erp/
├── backend/           # Express + TypeScript API
│   ├── src/
│   │   ├── controllers/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── services/
│   │   └── utils/
│   ├── prisma/
│   └── package.json
│
├── frontend/          # React + TypeScript app
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── hooks/
│   │   └── utils/
│   └── package.json
│
└── docker-compose.yml
```

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL 14+
- Git

### Installation

1. Clone the repository
```bash
git clone https://github.com/vesla-erp/vesla-erp.git
cd vesla-erp
```

2. Install backend dependencies
```bash
cd backend
npm install
```

3. Install frontend dependencies
```bash
cd ../frontend
npm install
```

4. Set up environment variables
```bash
# Backend (.env)
DATABASE_URL="postgresql://user:password@localhost:5432/vesla_erp"
JWT_SECRET="your-secret-key"
PORT=3000

# Frontend (.env)
VITE_API_URL=http://localhost:3000/api
```

5. Run database migrations
```bash
cd backend
npx prisma migrate dev
```

6. Start development servers
```bash
# Backend (from backend/)
npm run dev

# Frontend (from frontend/)
npm run dev
```

## Development

- Backend runs on `http://localhost:3000`
- Frontend runs on `http://localhost:5173`
- PostgreSQL runs on `localhost:5432`

## Database Schema

Core accounting tables following double-entry bookkeeping principles:
- `accounts` - Chart of accounts
- `transactions` - Journal entries (immutable)
- `transaction_lines` - Individual debits/credits
- `invoices` - Sales invoices
- `payments` - Payment records
- `companies` - Multi-company support
- `users` - User management

## Security Features

- JWT token-based authentication
- Password hashing with bcrypt
- Role-based access control (RBAC)
- SQL injection protection via Prisma ORM
- CORS configuration
- Environment variable management
- Audit logging

## License

Private - All rights reserved

## Contact

Vesla ERP Team
