/*
  Warnings:

  - The values [CONFIRMED,ACTIVE,COMPLETED] on the enum `BookingStatus` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[rentalContractId]` on the table `bookings` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code]` on the table `customers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email]` on the table `customers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[emiratesId]` on the table `customers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[passportNumber]` on the table `customers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[vin]` on the table `vehicles` will be added. If there are existing duplicate values, this will fail.
  - Made the column `email` on table `customers` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "VehicleLockStatus" AS ENUM ('AVAILABLE', 'TEMP_BOOKED', 'LOCKED', 'RENTED');

-- CreateEnum
CREATE TYPE "IssuePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "IssueType" AS ENUM ('BUG', 'FEATURE_REQUEST', 'SUPPORT', 'SECURITY', 'PERFORMANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "RentalContractStatus" AS ENUM ('DRAFT', 'APPROVED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- AlterEnum
BEGIN;
CREATE TYPE "BookingStatus_new" AS ENUM ('PENDING', 'APPROVED', 'CANCELLED');
ALTER TABLE "bookings" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "bookings" ALTER COLUMN "status" TYPE "BookingStatus_new" USING ("status"::text::"BookingStatus_new");
ALTER TYPE "BookingStatus" RENAME TO "BookingStatus_old";
ALTER TYPE "BookingStatus_new" RENAME TO "BookingStatus";
DROP TYPE "BookingStatus_old";
ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- DropForeignKey
ALTER TABLE "customers" DROP CONSTRAINT "customers_companyId_fkey";

-- DropIndex
DROP INDEX "customers_companyId_code_key";

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "assignedVehicleId" TEXT,
ADD COLUMN     "dropoffLocation" TEXT,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "pickupLocation" TEXT,
ADD COLUMN     "rentalContractId" TEXT,
ADD COLUMN     "rentalContractNumber" TEXT,
ADD COLUMN     "termsAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weeklyRate" DECIMAL(15,2),
ALTER COLUMN "monthlyPeriods" SET DEFAULT 0,
ALTER COLUMN "remainingDays" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "bankProvider" TEXT,
ADD COLUMN     "cardHolderName" TEXT,
ADD COLUMN     "cardLast4" TEXT,
ADD COLUMN     "cardType" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "driversLicenseCountry" TEXT,
ADD COLUMN     "emiratesId" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "isTourist" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kycVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kycVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "licenseExpiry" TIMESTAMP(3),
ADD COLUMN     "licenseNumber" TEXT,
ADD COLUMN     "mobileNumber" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "passportCountry" TEXT,
ADD COLUMN     "passportNumber" TEXT,
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "role" TEXT DEFAULT 'CUSTOMER',
ALTER COLUMN "companyId" DROP NOT NULL,
ALTER COLUMN "email" SET NOT NULL;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "category" TEXT,
ADD COLUMN     "fuelType" TEXT,
ADD COLUMN     "isBooked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lockStatus" "VehicleLockStatus" NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN     "mileage" INTEGER DEFAULT 0,
ADD COLUMN     "seats" INTEGER,
ADD COLUMN     "tempLockedUntil" TIMESTAMP(3),
ADD COLUMN     "transmission" TEXT,
ADD COLUMN     "vin" TEXT,
ADD COLUMN     "weeklyRate" DECIMAL(15,2);

-- CreateTable
CREATE TABLE "booking_addons" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "addonName" TEXT NOT NULL,
    "dailyRate" DECIMAL(15,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "IssueType" NOT NULL,
    "priority" "IssuePriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "reportedById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "environment" TEXT,
    "affectedUrl" TEXT,
    "stackTrace" TEXT,
    "browserInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_comments" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_contracts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "status" "RentalContractStatus" NOT NULL DEFAULT 'DRAFT',
    "branch" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "vehicleMake" TEXT NOT NULL,
    "vehicleModel" TEXT NOT NULL,
    "vehicleYear" INTEGER NOT NULL,
    "vehiclePlateNumber" TEXT NOT NULL,
    "vehicleColor" TEXT,
    "outKm" INTEGER,
    "outFuel" TEXT,
    "outDate" TIMESTAMP(3),
    "expectedInDate" TIMESTAMP(3),
    "inKm" INTEGER,
    "inFuel" TEXT,
    "inDate" TIMESTAMP(3),
    "rentAmount" DECIMAL(15,2) NOT NULL,
    "scdwAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalCharges" DECIMAL(15,2) NOT NULL,
    "depositAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "receivedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "balanceAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "fuelCharges" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "mileageCharges" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "finesCharges" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "damageCharges" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "otherCharges" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "customerName" TEXT NOT NULL,
    "customerNationality" TEXT,
    "customerPassportNo" TEXT,
    "customerLicenseNo" TEXT,
    "customerMobile" TEXT,
    "customerEmail" TEXT,
    "customerAddress" TEXT,
    "driverName" TEXT,
    "driverNationality" TEXT,
    "driverPassportNo" TEXT,
    "driverLicenseNo" TEXT,
    "insuranceType" TEXT,
    "termsAccepted" BOOLEAN NOT NULL DEFAULT false,
    "pdfUrl" TEXT,
    "printedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tempLockDurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "allowOverbooking" BOOLEAN NOT NULL DEFAULT false,
    "autoAssignVehicle" BOOLEAN NOT NULL DEFAULT true,
    "sendBookingNotifications" BOOLEAN NOT NULL DEFAULT true,
    "sendContractNotifications" BOOLEAN NOT NULL DEFAULT true,
    "sendLockExpiryNotifications" BOOLEAN NOT NULL DEFAULT true,
    "notificationEmail" TEXT,
    "notificationPhone" TEXT,
    "contractPrefix" TEXT NOT NULL DEFAULT 'RASMLY',
    "requireDepositForBooking" BOOLEAN NOT NULL DEFAULT true,
    "defaultDepositAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "enableAutoRelease" BOOLEAN NOT NULL DEFAULT true,
    "autoReleaseCheckInterval" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_addons_bookingId_idx" ON "booking_addons"("bookingId");

-- CreateIndex
CREATE INDEX "issues_status_priority_idx" ON "issues"("status", "priority");

-- CreateIndex
CREATE INDEX "issues_reportedById_idx" ON "issues"("reportedById");

-- CreateIndex
CREATE INDEX "issues_assignedToId_idx" ON "issues"("assignedToId");

-- CreateIndex
CREATE INDEX "issues_type_idx" ON "issues"("type");

-- CreateIndex
CREATE INDEX "issues_createdAt_idx" ON "issues"("createdAt");

-- CreateIndex
CREATE INDEX "issue_comments_issueId_createdAt_idx" ON "issue_comments"("issueId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "rental_contracts_bookingId_key" ON "rental_contracts"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "rental_contracts_invoiceId_key" ON "rental_contracts"("invoiceId");

-- CreateIndex
CREATE INDEX "rental_contracts_companyId_status_idx" ON "rental_contracts"("companyId", "status");

-- CreateIndex
CREATE INDEX "rental_contracts_customerId_idx" ON "rental_contracts"("customerId");

-- CreateIndex
CREATE INDEX "rental_contracts_vehicleId_idx" ON "rental_contracts"("vehicleId");

-- CreateIndex
CREATE INDEX "rental_contracts_startDate_endDate_idx" ON "rental_contracts"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "rental_contracts_companyId_contractNumber_key" ON "rental_contracts"("companyId", "contractNumber");

-- CreateIndex
CREATE UNIQUE INDEX "company_settings_companyId_key" ON "company_settings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_rentalContractId_key" ON "bookings"("rentalContractId");

-- CreateIndex
CREATE INDEX "bookings_lockedUntil_idx" ON "bookings"("lockedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_emiratesId_key" ON "customers"("emiratesId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_passportNumber_key" ON "customers"("passportNumber");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_emiratesId_idx" ON "customers"("emiratesId");

-- CreateIndex
CREATE INDEX "customers_passportNumber_idx" ON "customers"("passportNumber");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_vin_key" ON "vehicles"("vin");

-- CreateIndex
CREATE INDEX "vehicles_status_isBooked_idx" ON "vehicles"("status", "isBooked");

-- CreateIndex
CREATE INDEX "vehicles_lockStatus_tempLockedUntil_idx" ON "vehicles"("lockStatus", "tempLockedUntil");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_rentalContractId_fkey" FOREIGN KEY ("rentalContractId") REFERENCES "rental_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_addons" ADD CONSTRAINT "booking_addons_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
