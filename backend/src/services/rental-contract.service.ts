import { PrismaClient, RentalContract, RentalContractStatus, Prisma } from '@prisma/client';
import prisma from '../config/database';
import vehicleLockingService from './vehicle-locking.service';
import companySettingsService from './company-settings.service';
import { AuditContext } from '../types/audit';

export class RentalContractService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  /**
   * Generate unique rental contract number
   * Format: PREFIX-YYMMDD-NNNNN (e.g., RASMLY-251211-00001)
   */
  private async generateContractNumber(
    companyId: string,
    tx: Prisma.TransactionClient
  ): Promise<string> {
    const prefix = await companySettingsService.getContractPrefix(companyId);
    const today = new Date();
    const dateStr = today.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD

    // Count existing contracts for today
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const count = await tx.rentalContract.count({
      where: {
        companyId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    const sequence = String(count + 1).padStart(5, '0');
    return `${prefix}${dateStr}${sequence}`;
  }

  /**
   * Create rental contract from booking (sales agent approval)
   */
  async createFromBooking(
    bookingId: string,
    approvedById: string,
    vehicleId?: string, // Optional: change assigned vehicle
    auditContext?: AuditContext
  ): Promise<RentalContract> {
    return await this.prisma.$transaction(
      async (tx) => {
        // Fetch booking with all related data
        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          include: {
            customer: true,
            vehicle: true,
            company: true,
            addOns: true,
          },
        });

        if (!booking) {
          throw new Error('Booking not found');
        }

        if (booking.status !== 'PENDING') {
          throw new Error(`Cannot approve booking with status: ${booking.status}`);
        }

        // Determine final vehicle (sales agent can override)
        const finalVehicleId = vehicleId || booking.assignedVehicleId || booking.vehicleId;

        // Fetch final vehicle details
        const finalVehicle = await tx.vehicle.findUnique({
          where: { id: finalVehicleId },
        });

        if (!finalVehicle) {
          throw new Error('Vehicle not found');
        }

        // Check if final vehicle is available (if changed from original)
        if (finalVehicleId !== booking.vehicleId) {
          const isAvailable = await vehicleLockingService.isVehicleAvailable(finalVehicleId);
          if (!isAvailable) {
            throw new Error(`Vehicle ${finalVehicle.plateNumber} is not available`);
          }

          // Release old vehicle if it was temp locked
          if (booking.vehicleId) {
            await tx.vehicle.update({
              where: { id: booking.vehicleId },
              data: {
                lockStatus: 'AVAILABLE',
                tempLockedUntil: null,
                isBooked: false,
              },
            });
          }
        }

        // Generate contract number
        const contractNumber = await this.generateContractNumber(booking.companyId, tx);

        // Calculate pricing (including add-ons)
        const addOnsTotal = booking.addOns.reduce(
          (sum, addon) => sum + Number(addon.totalAmount),
          0
        );
        const rentAmount = Number(booking.totalAmount) + addOnsTotal;
        const taxAmount = rentAmount * 0.05; // 5% VAT
        const totalCharges = rentAmount + taxAmount;

        // Create rental contract
        const contract = await tx.rentalContract.create({
          data: {
            companyId: booking.companyId,
            contractNumber,
            bookingId: booking.id,
            customerId: booking.customerId,
            vehicleId: finalVehicleId,
            status: RentalContractStatus.APPROVED,
            branch: 'RAS AL KHOR', // TODO: Get from company/user settings
            startDate: booking.startDate,
            endDate: booking.endDate,

            // Vehicle snapshot
            vehicleMake: finalVehicle.make,
            vehicleModel: finalVehicle.model,
            vehicleYear: finalVehicle.year,
            vehiclePlateNumber: finalVehicle.plateNumber,
            vehicleColor: finalVehicle.color || 'N/A',

            // Pricing
            rentAmount: new Prisma.Decimal(rentAmount),
            scdwAmount: new Prisma.Decimal(0), // TODO: Get from add-ons
            taxAmount: new Prisma.Decimal(taxAmount),
            totalCharges: new Prisma.Decimal(totalCharges),
            depositAmount: new Prisma.Decimal(0), // TODO: Calculate deposit
            receivedAmount: new Prisma.Decimal(0),
            balanceAmount: new Prisma.Decimal(totalCharges),

            // Customer snapshot
            customerName: booking.customer.name,
            customerNationality: booking.customer.nationality,
            customerPassportNo: booking.customer.passportNumber || booking.customer.emiratesId,
            customerLicenseNo: booking.customer.licenseNumber,
            customerMobile: booking.customer.mobileNumber,
            customerEmail: booking.customer.email,
            customerAddress: booking.customer.address,

            // Driver (same as customer by default)
            driverName: booking.customer.name,
            driverNationality: booking.customer.nationality,
            driverPassportNo: booking.customer.passportNumber || booking.customer.emiratesId,
            driverLicenseNo: booking.customer.licenseNumber,

            // Contract terms
            insuranceType: 'Basic', // TODO: Get from add-ons
            termsAccepted: booking.termsAccepted,

            // Audit
            approvedById,
            approvedAt: new Date(),
          },
          include: {
            customer: true,
            vehicle: true,
            booking: true,
          },
        });

        // Update booking
        await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: 'APPROVED',
            rentalContractId: contract.id,
            rentalContractNumber: contractNumber,
            assignedVehicleId: finalVehicleId,
          },
        });

        // Permanently lock the vehicle
        await tx.vehicle.update({
          where: { id: finalVehicleId },
          data: {
            lockStatus: 'LOCKED',
            tempLockedUntil: null,
            isBooked: true,
          },
        });

        // TODO: Log audit
        // TODO: Send notification

        return contract;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      }
    );
  }

  /**
   * Get rental contract by ID
   */
  async getById(id: string) {
    return await this.prisma.rentalContract.findUnique({
      where: { id },
      include: {
        customer: true,
        vehicle: true,
        booking: {
          include: {
            addOns: true,
          },
        },
        invoice: true,
      },
    });
  }

  /**
   * Get rental contract by contract number
   */
  async getByContractNumber(companyId: string, contractNumber: string) {
    return await this.prisma.rentalContract.findUnique({
      where: {
        companyId_contractNumber: {
          companyId,
          contractNumber,
        },
      },
      include: {
        customer: true,
        vehicle: true,
        booking: {
          include: {
            addOns: true,
          },
        },
        invoice: true,
      },
    });
  }

  /**
   * List rental contracts with pagination and filters
   */
  async list(
    companyId: string,
    page: number = 1,
    limit: number = 20,
    filters?: {
      status?: RentalContractStatus;
      customerId?: string;
      vehicleId?: string;
      startDate?: Date;
      endDate?: Date;
      search?: string;
    }
  ) {
    const skip = (page - 1) * limit;

    const where: any = { companyId };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.customerId) {
      where.customerId = filters.customerId;
    }

    if (filters?.vehicleId) {
      where.vehicleId = filters.vehicleId;
    }

    if (filters?.startDate || filters?.endDate) {
      where.startDate = {};
      if (filters.startDate) {
        where.startDate.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.startDate.lte = filters.endDate;
      }
    }

    if (filters?.search) {
      where.OR = [
        { contractNumber: { contains: filters.search, mode: 'insensitive' } },
        { customerName: { contains: filters.search, mode: 'insensitive' } },
        { vehiclePlateNumber: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [contracts, total] = await Promise.all([
      this.prisma.rentalContract.findMany({
        where,
        skip,
        take: limit,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              mobileNumber: true,
            },
          },
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              plateNumber: true,
              color: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.rentalContract.count({ where }),
    ]);

    return {
      contracts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update contract status (for vehicle pickup/return)
   */
  async updateStatus(
    id: string,
    status: RentalContractStatus,
    auditContext?: AuditContext
  ): Promise<RentalContract> {
    return await this.prisma.$transaction(async (tx) => {
      const contract = await tx.rentalContract.findUnique({
        where: { id },
      });

      if (!contract) {
        throw new Error('Rental contract not found');
      }

      // Validate status transitions
      if (status === RentalContractStatus.ACTIVE && contract.status !== RentalContractStatus.APPROVED) {
        throw new Error('Can only activate approved contracts');
      }

      if (status === RentalContractStatus.COMPLETED && contract.status !== RentalContractStatus.ACTIVE) {
        throw new Error('Can only complete active contracts');
      }

      // Update contract
      const updated = await tx.rentalContract.update({
        where: { id },
        data: { status },
      });

      // Update vehicle lock status
      if (status === RentalContractStatus.ACTIVE) {
        // Vehicle picked up
        await tx.vehicle.update({
          where: { id: contract.vehicleId },
          data: { lockStatus: 'RENTED' },
        });
      } else if (status === RentalContractStatus.COMPLETED) {
        // Vehicle returned
        await tx.vehicle.update({
          where: { id: contract.vehicleId },
          data: {
            lockStatus: 'AVAILABLE',
            isBooked: false,
          },
        });
      }

      return updated;
    });
  }

  /**
   * Record vehicle pickup
   */
  async recordPickup(
    id: string,
    data: {
      outKm: number;
      outFuel: string;
      outDate?: Date;
    }
  ): Promise<RentalContract> {
    return await this.prisma.rentalContract.update({
      where: { id },
      data: {
        outKm: data.outKm,
        outFuel: data.outFuel,
        outDate: data.outDate || new Date(),
        status: RentalContractStatus.ACTIVE,
      },
    });
  }

  /**
   * Record vehicle return
   */
  async recordReturn(
    id: string,
    data: {
      inKm: number;
      inFuel: string;
      inDate?: Date;
      additionalCharges?: {
        fuel?: number;
        mileage?: number;
        fines?: number;
        damage?: number;
        other?: number;
      };
    }
  ): Promise<RentalContract> {
    return await this.prisma.$transaction(async (tx) => {
      const contract = await tx.rentalContract.findUnique({
        where: { id },
      });

      if (!contract) {
        throw new Error('Rental contract not found');
      }

      // Calculate additional charges
      const charges = data.additionalCharges || {};
      const totalAdditional =
        (charges.fuel || 0) +
        (charges.mileage || 0) +
        (charges.fines || 0) +
        (charges.damage || 0) +
        (charges.other || 0);

      const newTotalCharges = Number(contract.totalCharges) + totalAdditional;
      const newBalanceAmount = newTotalCharges - Number(contract.receivedAmount);

      // Update contract
      const updated = await tx.rentalContract.update({
        where: { id },
        data: {
          inKm: data.inKm,
          inFuel: data.inFuel,
          inDate: data.inDate || new Date(),
          status: RentalContractStatus.COMPLETED,
          fuelCharges: new Prisma.Decimal(charges.fuel || 0),
          mileageCharges: new Prisma.Decimal(charges.mileage || 0),
          finesCharges: new Prisma.Decimal(charges.fines || 0),
          damageCharges: new Prisma.Decimal(charges.damage || 0),
          otherCharges: new Prisma.Decimal(charges.other || 0),
          totalCharges: new Prisma.Decimal(newTotalCharges),
          balanceAmount: new Prisma.Decimal(newBalanceAmount),
        },
      });

      // Release vehicle
      await tx.vehicle.update({
        where: { id: contract.vehicleId },
        data: {
          lockStatus: 'AVAILABLE',
          isBooked: false,
        },
      });

      return updated;
    });
  }

  /**
   * Cancel rental contract (before pickup)
   */
  async cancel(id: string, reason?: string, auditContext?: AuditContext): Promise<RentalContract> {
    return await this.prisma.$transaction(async (tx) => {
      const contract = await tx.rentalContract.findUnique({
        where: { id },
        include: { booking: true },
      });

      if (!contract) {
        throw new Error('Rental contract not found');
      }

      if (contract.status === RentalContractStatus.ACTIVE) {
        throw new Error('Cannot cancel active contract (vehicle already picked up)');
      }

      if (contract.status === RentalContractStatus.COMPLETED) {
        throw new Error('Cannot cancel completed contract');
      }

      // Update contract
      const updated = await tx.rentalContract.update({
        where: { id },
        data: {
          status: RentalContractStatus.CANCELLED,
          notes: contract.notes
            ? `${contract.notes}\n\nCancelled: ${reason || 'No reason provided'}`
            : `Cancelled: ${reason || 'No reason provided'}`,
        },
      });

      // Update booking
      if (contract.bookingId) {
        await tx.booking.update({
          where: { id: contract.bookingId },
          data: { status: 'CANCELLED' },
        });
      }

      // Release vehicle
      await tx.vehicle.update({
        where: { id: contract.vehicleId },
        data: {
          lockStatus: 'AVAILABLE',
          tempLockedUntil: null,
          isBooked: false,
        },
      });

      return updated;
    });
  }
}

export default new RentalContractService();
