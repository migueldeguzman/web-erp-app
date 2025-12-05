-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'RENTED', 'MAINTENANCE', 'RETIRED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "color" TEXT,
    "dailyRate" DECIMAL(15,2) NOT NULL,
    "monthlyRate" DECIMAL(15,2) NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "imageUrl" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "bookingNumber" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalDays" INTEGER NOT NULL,
    "monthlyPeriods" INTEGER NOT NULL,
    "remainingDays" INTEGER NOT NULL,
    "dailyRate" DECIMAL(15,2) NOT NULL,
    "monthlyRate" DECIMAL(15,2) NOT NULL,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plateNumber_key" ON "vehicles"("plateNumber");

-- CreateIndex
CREATE INDEX "vehicles_companyId_status_idx" ON "vehicles"("companyId", "status");

-- CreateIndex
CREATE INDEX "vehicles_make_model_year_idx" ON "vehicles"("make", "model", "year");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_invoiceId_key" ON "bookings"("invoiceId");

-- CreateIndex
CREATE INDEX "bookings_vehicleId_startDate_endDate_idx" ON "bookings"("vehicleId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "bookings_customerId_idx" ON "bookings"("customerId");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_companyId_bookingNumber_key" ON "bookings"("companyId", "bookingNumber");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
