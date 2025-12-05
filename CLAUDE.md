# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vesla ERP is a modern financial ERP web application for accounting and operations management. It implements double-entry bookkeeping with multi-company support, invoice management, payment processing, and comprehensive audit trails.

**Key Capabilities:**
- Double-entry accounting system with immutable transaction ledger
- Multi-company and multi-entity support
- Invoice and payment tracking with reconciliation
- JWT-based authentication with role-based access control (RBAC)
- Complete audit trail for all financial transactions

**GitHub Repository:** https://github.com/migueldeguzman/web-erp-app.git

---

## Version Control

**Git Commands:**
```bash
# Check status
git status

# Stage changes
git add .

# Commit changes
git commit -m "Description of changes"

# Push to GitHub
git push

# View commit history
git log --oneline -5
```

## Architecture

### Monorepo Structure

This is an npm workspace monorepo with two main packages:

```
web-erp-app/
├── backend/          # Express + TypeScript + Prisma API
├── frontend/         # React + TypeScript + Vite SPA
├── package.json      # Root workspace configuration
└── docker-compose.yml
```

### Backend Architecture (backend/)

**Tech Stack:**
- Node.js with Express
- TypeScript
- PostgreSQL database
- Prisma ORM
- JWT authentication with bcrypt

**Key Structure:**
- `src/index.ts` - Main server entry with route registration, security middleware (helmet, CORS, rate limiting, XSS sanitization)
- `src/config/database.ts` - Prisma client singleton with connection management
- `src/controllers/` - HTTP request handlers, thin layer delegating to services
- `src/services/` - Business logic layer (TransactionService, InvoiceService, PaymentService, AuditService)
- `src/routes/` - Express route definitions (auth, company, account, invoice, payment, transaction)
- `src/middleware/` - Auth middleware (authenticate, authorize), validation middleware, request context, error handling
- `src/utils/` - JWT and password utilities
- `prisma/schema.prisma` - Database schema definition

**Layered Architecture:**
1. **Routes** → Define endpoints and apply middleware (auth, validation)
2. **Controllers** → Parse requests, validate inputs, call services, format responses
3. **Services** → Business logic, transaction orchestration, validation, audit logging
4. **Prisma Client** → Database access layer

**API Routes:**
- `/api/auth` - Authentication endpoints (rate limited: 5 login attempts per 15 min)
- `/api/companies` - Company management
- `/api/accounts` - Chart of accounts
- `/api/invoices` - Invoice management
- `/api/payments` - Payment processing
- `/api/transactions` - Journal vouchers and general ledger

**Security Layers (src/index.ts):**
- `helmet` - Security headers (CSP, HSTS)
- `cors` - Cross-origin resource sharing
- `rateLimit` - 100 requests per 15 min general, 5 per 15 min for auth
- `mongoSanitize` - NoSQL injection prevention
- Custom XSS sanitization middleware using `isomorphic-dompurify`
- Request size limits (10kb for JSON/urlencoded)

### Frontend Architecture (frontend/)

**Tech Stack:**
- React 18 with TypeScript
- Vite for build tooling
- TailwindCSS for styling
- React Router for navigation
- Axios for API communication
- Zustand for state management (with persist middleware)

**Key Structure:**
- `src/App.tsx` - Main router with protected route logic
- `src/components/Layout.tsx` - Main layout wrapper with navigation
- `src/pages/` - Page components (Dashboard, Invoices, Payments, Transactions, Login)
- `src/stores/authStore.ts` - Zustand store for authentication state (persisted to localStorage)
- `src/services/api.ts` - Axios instance with auth interceptors
- `src/services/authService.ts` - Authentication API calls

**Authentication Flow:**
1. User logs in via `LoginPage` → calls `authService.login()`
2. Backend returns JWT token + user data
3. Token stored in Zustand store (persisted to localStorage as 'auth-storage')
4. `api.ts` request interceptor adds `Authorization: Bearer <token>` to all requests
5. Response interceptor handles 401 errors by logging out and redirecting to login
6. `App.tsx` checks `isAuthenticated` from store to protect routes

### Database Schema (Prisma)

**Core Accounting Models:**

1. **Transaction** (transactions table)
   - Immutable journal entries
   - Types: JOURNAL_VOUCHER, INVOICE, PAYMENT, RECEIPT, CONTRA, ADJUSTMENT
   - Status: DRAFT → POSTED → VOID
   - Each transaction has multiple TransactionLine entries

2. **TransactionLine** (transaction_lines table)
   - Individual debit/credit entries
   - Must balance (total debits = total credits)
   - Links to Account via accountId

3. **Account** (accounts table)
   - Chart of accounts with hierarchy (parentId self-reference)
   - Types: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
   - SubTypes: CASH, BANK, ACCOUNTS_RECEIVABLE, SALARIES_PAYABLE, etc.
   - Company-specific with unique code per company

4. **Invoice** (invoices table)
   - Links to Transaction (one-to-one via transactionId)
   - Tracks invoice status: DRAFT → SENT → PARTIALLY_PAID → PAID → OVERDUE → VOID
   - Has InvoiceItem children for line items
   - Calculates paidAmount and balanceAmount

5. **Payment** (payments table)
   - Links to Transaction (one-to-one via transactionId)
   - Can reference Invoice for payment application
   - Methods: CASH, BANK_TRANSFER, CHEQUE, CREDIT_CARD
   - Status: DRAFT → POSTED → RECONCILED → VOID

6. **Company** (companies table)
   - Multi-entity support
   - All financial records scoped to companyId

7. **User** (users table)
   - Roles: ADMIN, ACCOUNTANT, MANAGER, VIEWER
   - Authentication via email/password (bcrypt hashed)
   - Tracks created records for audit trail

8. **AuditLog** (audit_logs table)
   - Complete audit trail with before/after values (JSON)
   - Actions: CREATE, UPDATE, DELETE, LOGIN, LOGOUT, POST_TRANSACTION, VOID_TRANSACTION

9. **TokenBlacklist** (token_blacklist table)
   - JWT token revocation for logout and user deactivation
   - Automatic cleanup of expired tokens (runs hourly via `auth.middleware.ts`)

**Key Relationships:**
- Transaction ←1:1→ Invoice (invoice posting creates transaction)
- Transaction ←1:1→ Payment (payment posting creates transaction)
- Transaction ←1:N→ TransactionLine (double-entry lines)
- Company ←1:N→ Account, Invoice, Payment, Transaction
- User tracks all created records via createdById

## Common Development Commands

### Root Level (runs both frontend and backend)

```bash
npm install          # Install dependencies for all workspaces
npm run dev          # Start both backend and frontend concurrently
npm run build        # Build both workspaces
npm run backend      # Start backend only
npm run frontend     # Start frontend only
```

### Backend Commands

```bash
cd backend
npm run dev                  # Start dev server with hot reload (tsx watch)
npm run build                # Compile TypeScript to dist/
npm start                    # Run compiled code from dist/

# Prisma commands
npm run prisma:generate      # Generate Prisma client
npm run prisma:migrate       # Run database migrations
npm run prisma:studio        # Open Prisma Studio GUI
npx prisma migrate dev --name <migration_name>  # Create new migration
npx prisma migrate deploy    # Apply migrations (production)
npx prisma migrate reset     # Reset database (DESTRUCTIVE)
```

### Frontend Commands

```bash
cd frontend
npm run dev          # Start Vite dev server (http://localhost:5173)
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

## Environment Setup

### Backend (.env)

Required variables (see `backend/.env.example`):

```bash
DATABASE_URL="postgresql://username:password@localhost:5432/vesla_erp?schema=public"
PORT=3000
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5173
```

### Frontend (.env)

Required variables (see `frontend/.env.example`):

```bash
VITE_API_URL=http://localhost:3000/api
```

## Development Workflow

### First Time Setup

1. Install dependencies:
   ```bash
   npm install  # Installs both workspaces
   ```

2. Set up environment files:
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   # Edit .env files with actual credentials
   ```

3. Set up PostgreSQL database:
   ```bash
   # Create database
   createdb vesla_erp

   # Run migrations
   cd backend
   npx prisma migrate dev
   ```

4. Generate Prisma client:
   ```bash
   cd backend
   npm run prisma:generate
   ```

5. Start development servers:
   ```bash
   # From root directory
   npm run dev
   ```

### Adding New Features

**Backend:**
1. Define models in `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name <feature_name>`
3. Create service in `src/services/<feature>.service.ts` (business logic)
4. Create controller in `src/controllers/<feature>.controller.ts` (HTTP handlers)
5. Create routes in `src/routes/<feature>.routes.ts` (endpoint definitions + validation)
6. Register routes in `src/index.ts`

**Frontend:**
1. Create page component in `src/pages/<Feature>Page.tsx`
2. Add route to `src/App.tsx`
3. Create API service calls in `src/services/<feature>Service.ts`
4. Update navigation in `src/components/Layout.tsx`

### Database Changes

Always use Prisma migrations (NEVER edit database directly):

```bash
cd backend

# Create migration after schema changes
npx prisma migrate dev --name add_new_feature

# Apply pending migrations (production)
npx prisma migrate deploy

# Reset database (DESTRUCTIVE - deletes all data)
npx prisma migrate reset

# View/edit database with GUI
npm run prisma:studio

# Generate Prisma client after schema changes
npm run prisma:generate
```

**Migration Workflow:**
1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name <descriptive_name>`
3. Prisma generates SQL migration in `prisma/migrations/`
4. Review generated SQL before committing
5. Run `npx prisma generate` to update TypeScript types
6. Restart backend dev server to pick up new types

## Important Architectural Notes

### Service Layer Pattern

Business logic lives in service classes (TransactionService, InvoiceService, PaymentService):

**TransactionService** (`services/transaction.service.ts`):
- `createJournalEntry()` - Creates draft journal vouchers with validation
- `postTransaction()` - Posts drafts to make them immutable
- `voidTransaction()` - Voids posted transactions by creating reversal entries
- `validateBalance()` - Ensures debits = credits
- `validateLines()` - Ensures each line has debit XOR credit (not both, not neither)
- `validateDecimalPrecision()` - Ensures amounts fit Decimal(15,2) constraints
- `generateTransactionNumber()` - Sequential numbering per company per year (uses SELECT FOR UPDATE to prevent race conditions)
- `getAccountBalance()` - Calculates running balance based on account type

**InvoiceService** (`services/invoice.service.ts`):
- `createInvoice()` - Creates draft invoice with items, validates customer and accounts
- `postInvoice()` - Posts invoice and creates journal entry (DR: A/R, CR: Revenue + Tax)
- `voidInvoice()` - Voids invoice if no payments exist
- `updateInvoiceStatus()` - Auto-updates status based on payments (SENT → PARTIALLY_PAID → PAID → OVERDUE)
- `generateInvoiceNumber()` - Sequential numbering (uses SELECT FOR UPDATE)
- Invoice posting creates Transaction with lines for A/R, Revenue, and Tax (if applicable)

**PaymentService** (`services/payment.service.ts`):
- Records payments against invoices
- Creates journal entries: DR: Cash/Bank, CR: A/R
- Updates invoice paid amounts and status

**AuditService** (`services/audit.service.ts`):
- Logs all CREATE, UPDATE, DELETE, LOGIN, LOGOUT, POST_TRANSACTION, VOID_TRANSACTION actions
- Stores before/after values as JSON for full audit trail

**Key Pattern:**
- Services use Prisma transactions (`this.prisma.$transaction()`) for atomicity with SERIALIZABLE isolation level
- Controllers are thin - they validate inputs and delegate to services
- Services return Prisma models with includes for related data

### Validation Middleware

**ValidationMiddleware** (`middleware/validation.middleware.ts`):
- Uses `express-validator` for input validation
- Provides reusable validation chains for common patterns:
  - `validateCreateTransaction()` - Validates journal entries, ensures balance
  - `validateCreateInvoice()` - Validates invoices with items and date logic
  - `validateCreatePayment()` - Validates payment amounts and methods
  - `validateLogin()` / `validateRegister()` - Auth input validation
  - `validatePagination()` - Query param validation (page/limit)
  - `validateDateRange()` - Start/end date validation
- Custom validators:
  - `isValidUUID()` - UUID format validation
  - `isValidDecimalPrecision()` - Ensures Decimal(15,2) constraints
- Applied in route definitions BEFORE controller handlers

### Request Context Middleware

**RequestContextMiddleware** (`middleware/request-context.middleware.ts`):
- Generates unique `requestId` for request correlation
- Extracts IP address (handles proxies via X-Forwarded-For, X-Real-IP headers)
- Extracts User-Agent header
- Attaches `auditContext` to request object for use in audit logs
- Adds `X-Request-Id` header to responses for client-side correlation
- Applied early in middleware chain (after body parsers, before route handlers)

### Double-Entry Bookkeeping

Every financial transaction must balance:
- Sum of debits = Sum of credits
- Enforced in `TransactionService.validateBalance()` (application-level, not DB constraint)
- Transaction records are immutable once POSTED
- Use VOID status instead of deleting posted transactions
- Voiding creates a reversal entry with swapped debits/credits

**Transaction Line Rules** (enforced by `validateLines()`):
- Each line must have either debit OR credit (not both, not neither)
- Amounts cannot be negative
- Each line must reference an active account in the same company
- Amounts must fit Decimal(15,2) precision (15 total digits, 2 decimal places)

**Account Balance Calculation:**
- Assets & Expenses: Balance = Debit - Credit (normal debit balance)
- Liabilities, Equity & Revenue: Balance = Credit - Debit (normal credit balance)

### Authentication Flow

1. Backend `auth.middleware.ts` exports two middleware functions:
   - `authenticate` - Validates JWT token from `Authorization: Bearer <token>` header
     - Checks token signature and expiration
     - Checks token blacklist for revoked tokens
     - Verifies user exists and is active
     - Auto-blacklists token if user is deactivated
   - `authorize(...roles)` - Checks user role against allowed roles

2. Token Blacklist System:
   - Tokens are blacklisted on logout or user deactivation
   - Automatic hourly cleanup of expired tokens (runs in `auth.middleware.ts`)
   - Prevents use of old tokens after logout or account changes

3. Frontend `api.ts` interceptors:
   - Request interceptor: Adds token from Zustand store to all requests
   - Response interceptor: Handles 401 by logging out and redirecting

4. Protected routes in `App.tsx`:
   - Check `isAuthenticated` from `useAuthStore()`
   - Redirect to `/login` if not authenticated

### State Management

- **Global state**: Zustand store (`authStore.ts`)
- **Server state**: Consider using @tanstack/react-query (already installed) for API data caching
- **Local state**: React useState/useReducer

### Multi-Company Support

All financial entities (Account, Transaction, Invoice, Payment) are scoped to `companyId`:
- Users can access multiple companies
- API should filter by companyId in queries
- Unique constraints are typically `[companyId, code]` or `[companyId, number]`

### Transaction Numbering

Document numbers follow pattern: `PREFIX-YYYY-NNNN` (4-digit zero-padded):
- Journal Vouchers: `JV-2025-0001`
- Invoices: `INV-2025-0001`
- Payments: `BP-2025-0001` (Bank Payment) or similar

**Implementation:**
- Sequential numbering per company per year
- Generated in service layer during Prisma transaction for concurrency safety
- Uses raw SQL with `SELECT FOR UPDATE` to prevent race conditions
- Exponential backoff retry logic (up to 5 attempts) for deadlock handling
- `TransactionService.generateTransactionNumber()` - Locks rows, counts existing, generates new number
- `InvoiceService.generateInvoiceNumber()` - Similar pattern for invoices
- Number generation MUST occur within `this.prisma.$transaction()` with SERIALIZABLE isolation

**Pattern:**
```typescript
const result = await tx.$queryRaw<{ count: bigint }[]>`
  SELECT COUNT(*) as count
  FROM transactions
  WHERE "companyId" = ${companyId}
    AND number LIKE ${`${prefix}-${year}-%`}
  FOR UPDATE
`;
const count = Number(result[0].count);
return `${prefix}-${year}-${String(count + 1).padStart(4, '0')}`;
```

### Audit Logging Strategy

Every significant action is logged to the `audit_logs` table via `AuditService`:

**What gets logged:**
- All CREATE, UPDATE, DELETE operations on financial entities
- POST_TRANSACTION and VOID_TRANSACTION actions
- LOGIN and LOGOUT events
- Failed validation attempts (e.g., unbalanced transactions, invalid status transitions)

**Audit log structure:**
- `userId` - Who performed the action
- `action` - What type of action (enum: CREATE, UPDATE, DELETE, etc.)
- `entity` - What table/model (e.g., "Transaction", "Invoice", "Payment")
- `entityId` - Which record (UUID or "validation_failed")
- `oldValue` - JSON snapshot before change
- `newValue` - JSON snapshot after change (or error details)
- `ipAddress` & `userAgent` - Request context (captured by `request-context.middleware.ts`)

**Request Context Flow:**
1. `requestContext` middleware (applied in `src/index.ts` after body parsers)
2. Extracts IP, User-Agent, generates requestId
3. Attaches to `req.auditContext`
4. Controllers pass context to services
5. Services include context in audit log entries

**Key Services with Audit Logging:**
- `TransactionService` - Logs validation failures, post/void actions
- `InvoiceService` - Logs creation, posting, voiding, and failed attempts
- `PaymentService` - Logs payment recording and reconciliation
- `AuthService` - Logs login/logout events

## Debugging Tips

### Backend Issues

1. **Check database connection:**
   ```bash
   # Test PostgreSQL connection
   psql -U username -d vesla_erp

   # Check backend logs for connection errors
   npm run dev --workspace=backend
   ```

2. **Prisma Client errors:**
   ```bash
   # Regenerate client
   cd backend
   npm run prisma:generate

   # Check for pending migrations
   npx prisma migrate status
   ```

3. **View API logs:**
   - Backend uses `morgan` middleware for request logging
   - Check terminal for HTTP method, path, status code, response time
   - Add `console.log()` in services for debugging business logic

4. **Inspect database state:**
   ```bash
   npm run prisma:studio
   # Opens GUI at http://localhost:5555
   ```

5. **Test API endpoints:**
   ```bash
   # Health check
   curl http://localhost:3000/health

   # Login (get token)
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"password"}'

   # Use token in subsequent requests
   curl http://localhost:3000/api/companies \
     -H "Authorization: Bearer <token>"
   ```

### Frontend Issues

1. **Check API connection:**
   - Verify `VITE_API_URL` in `frontend/.env`
   - Check browser console for CORS errors
   - Check Network tab for failed requests

2. **Auth issues:**
   - Check localStorage for 'auth-storage' key
   - Clear localStorage if token is invalid: `localStorage.clear()`
   - Check `api.ts` interceptors are working

3. **State not updating:**
   - Check Zustand store usage: `useAuthStore()` hook
   - Verify store actions are called (e.g., `login()`, `logout()`)

### Common Error Messages

- `"Transaction must balance"` - Debit total ≠ Credit total in transaction lines
- `"Cannot post transaction with status: POSTED"` - Transaction already posted (immutable)
- `"One or more accounts not found or inactive"` - Account doesn't exist or belongs to different company
- `"Invoice must have at least one item"` - Invoice created without line items
- `"Cannot void invoice with payments"` - Must reverse payments before voiding invoice
- `"Tax account ID is required when tax rate is specified"` - Missing taxAccountId for invoices with tax
- `"Failed to generate transaction number after 5 attempts"` - Race condition or deadlock (usually resolves on retry)
- `"Token has been revoked"` - Token was blacklisted (logout or user deactivation)

## Code Style and Conventions

### TypeScript
- TypeScript strict mode enabled
- Use Prisma's generated types (import from `@prisma/client`)
- Use `Decimal` type from `@prisma/client/runtime/library` for currency amounts
- Use `AuthRequest` interface (extends `RequestWithContext`) in authenticated routes

### Backend Patterns
- **Controllers** - Thin layer, parse request → call service → format response
- **Services** - Business logic, use `this.prisma.$transaction()` for atomicity with SERIALIZABLE isolation
- **Error Handling** - Throw errors from services, caught by centralized `error.middleware.ts`
- **Validation** - Use validation middleware chains from `validation.middleware.ts` in route definitions
- **Audit Logs** - Log success AND failed attempts (with reason in newValue)
- **Concurrency** - Use SELECT FOR UPDATE for number generation, exponential backoff for retries

### Frontend Patterns
- Functional components with hooks (no class components)
- Zustand for global state (auth) with persist middleware
- Consider React Query for server state caching (already installed)
- Axios interceptors handle auth token and 401 responses globally

### Naming Conventions
- Models: PascalCase (e.g., `Transaction`, `InvoiceItem`)
- Tables: snake_case (e.g., `transactions`, `invoice_items`) via `@@map()`
- Functions: camelCase (e.g., `createInvoice`, `postTransaction`)
- Constants: UPPER_SNAKE_CASE for enums
- Files: kebab-case (e.g., `auth.middleware.ts`, `invoice.service.ts`)

## Security Considerations

- Never commit `.env` files (in `.gitignore`)
- JWT secret must be strong in production (minimum 32 characters)
- Passwords hashed with bcrypt (10 rounds)
- SQL injection prevented by Prisma parameterized queries
- XSS prevention via React's automatic escaping + `isomorphic-dompurify` sanitization
- CORS configured to allow specific origins only (set via `CORS_ORIGIN` env var)
- Rate limiting on all API endpoints (100 req/15min general, 5 req/15min auth)
- Token blacklist for logout and user deactivation
- Request context middleware captures IP and User-Agent for audit trails

## Related Projects

This ERP application is part of the larger Vesla Audit project, which includes:
- `node-downloader/` - Web scrapers for Vesla CRS document downloads
- `driver-efficiency/` - Driver performance analysis tools
- `salaries-payable/` - Payables reconciliation scripts
- `vrc-commission/` - VRC commission processing system
- `inventory-review/` - Vehicle ledger analysis tools
- `intercompany/` - Intercompany transaction matching

See parent `CLAUDE.md` for details on these tools.
