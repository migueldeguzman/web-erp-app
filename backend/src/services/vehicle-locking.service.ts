import { PrismaClient, VehicleLockStatus, BookingStatus } from '@prisma/client';
import prisma from '../config/database';
import companySettingsService from './company-settings.service';

export class VehicleLockingService {
  private prisma: PrismaClient;
  private autoReleaseInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.prisma = prisma;
  }

  /**
   * Temporarily lock a vehicle for booking
   */
  async tempLockVehicle(
    vehicleId: string,
    companyId: string,
    durationMinutes?: number
  ): Promise<void> {
    // Get temp lock duration from settings if not provided
    const duration = durationMinutes ||
      await companySettingsService.getTempLockDuration(companyId);

    const lockedUntil = new Date();
    lockedUntil.setMinutes(lockedUntil.getMinutes() + duration);

    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        lockStatus: VehicleLockStatus.TEMP_BOOKED,
        tempLockedUntil: lockedUntil,
        isBooked: true,
      },
    });
  }

  /**
   * Permanently lock a vehicle (rental contract approved)
   */
  async permanentLockVehicle(vehicleId: string): Promise<void> {
    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        lockStatus: VehicleLockStatus.LOCKED,
        tempLockedUntil: null, // Clear temp lock
        isBooked: true,
      },
    });
  }

  /**
   * Mark vehicle as rented (vehicle picked up)
   */
  async markAsRented(vehicleId: string): Promise<void> {
    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        lockStatus: VehicleLockStatus.RENTED,
        isBooked: true,
      },
    });
  }

  /**
   * Release a vehicle (booking cancelled or vehicle returned)
   */
  async releaseVehicle(vehicleId: string): Promise<void> {
    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        lockStatus: VehicleLockStatus.AVAILABLE,
        tempLockedUntil: null,
        isBooked: false,
      },
    });
  }

  /**
   * Check if vehicle is available for booking
   */
  async isVehicleAvailable(vehicleId: string): Promise<boolean> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { lockStatus: true, tempLockedUntil: true },
    });

    if (!vehicle) {
      return false;
    }

    // If temp locked but expired, it's available
    if (
      vehicle.lockStatus === VehicleLockStatus.TEMP_BOOKED &&
      vehicle.tempLockedUntil &&
      vehicle.tempLockedUntil < new Date()
    ) {
      return true;
    }

    return vehicle.lockStatus === VehicleLockStatus.AVAILABLE;
  }

  /**
   * Get available vehicles of a specific type
   */
  async getAvailableVehicles(
    companyId: string,
    make?: string,
    model?: string,
    category?: string
  ) {
    const where: any = {
      companyId,
      isActive: true,
      OR: [
        { lockStatus: VehicleLockStatus.AVAILABLE },
        {
          lockStatus: VehicleLockStatus.TEMP_BOOKED,
          tempLockedUntil: { lt: new Date() }, // Expired temp locks
        },
      ],
    };

    if (make) where.make = make;
    if (model) where.model = model;
    if (category) where.category = category;

    return await this.prisma.vehicle.findMany({
      where,
      orderBy: { plateNumber: 'asc' },
    });
  }

  /**
   * Auto-assign an available vehicle of the requested type
   */
  async autoAssignVehicle(
    companyId: string,
    make: string,
    model: string,
    category?: string
  ): Promise<string | null> {
    const availableVehicles = await this.getAvailableVehicles(
      companyId,
      make,
      model,
      category
    );

    if (availableVehicles.length === 0) {
      return null;
    }

    // Return the first available vehicle
    return availableVehicles[0].id;
  }

  /**
   * Auto-release expired temp locks
   * This should be called periodically (e.g., every 5 minutes)
   */
  async autoReleaseExpiredLocks(): Promise<number> {
    try {
      console.log('[Auto-Release] Checking for expired temp locks...');

      const now = new Date();

      // Find all bookings with expired temp locks
      const expiredBookings = await this.prisma.booking.findMany({
        where: {
          status: BookingStatus.PENDING,
          lockedUntil: { lt: now },
        },
        include: {
          vehicle: true,
          company: true,
        },
      });

      console.log(`[Auto-Release] Found ${expiredBookings.length} expired bookings`);

      let releasedCount = 0;

      for (const booking of expiredBookings) {
        try {
          await this.prisma.$transaction(async (tx) => {
            // Cancel the booking
            await tx.booking.update({
              where: { id: booking.id },
              data: {
                status: BookingStatus.CANCELLED,
                notes: booking.notes
                  ? `${booking.notes}\n\nAuto-cancelled: Temp lock expired at ${now.toISOString()}`
                  : `Auto-cancelled: Temp lock expired at ${now.toISOString()}`,
              },
            });

            // Release the vehicle
            await tx.vehicle.update({
              where: { id: booking.vehicleId },
              data: {
                lockStatus: VehicleLockStatus.AVAILABLE,
                tempLockedUntil: null,
                isBooked: false,
              },
            });

            releasedCount++;
            console.log(
              `[Auto-Release] Released vehicle ${booking.vehicle.plateNumber} from booking ${booking.bookingNumber}`
            );

            // TODO: Send notification to customer about expiry
          });
        } catch (error) {
          console.error(
            `[Auto-Release] Failed to release booking ${booking.bookingNumber}:`,
            error
          );
        }
      }

      console.log(`[Auto-Release] Released ${releasedCount} vehicles`);
      return releasedCount;
    } catch (error) {
      console.error('[Auto-Release] Error during auto-release:', error);
      return 0;
    }
  }

  /**
   * Start auto-release background job
   */
  async startAutoReleaseJob(companyId?: string): Promise<void> {
    // If already running, stop it first
    if (this.autoReleaseInterval) {
      this.stopAutoReleaseJob();
    }

    // Get check interval from settings (or use default 5 minutes)
    const intervalMinutes = companyId
      ? await companySettingsService.getAutoReleaseInterval(companyId)
      : 5;

    console.log(
      `[Auto-Release] Starting background job (interval: ${intervalMinutes} minutes)`
    );

    // Run immediately on start
    await this.autoReleaseExpiredLocks();

    // Then run periodically
    this.autoReleaseInterval = setInterval(
      () => this.autoReleaseExpiredLocks(),
      intervalMinutes * 60 * 1000 // Convert minutes to milliseconds
    );
  }

  /**
   * Stop auto-release background job
   */
  stopAutoReleaseJob(): void {
    if (this.autoReleaseInterval) {
      clearInterval(this.autoReleaseInterval);
      this.autoReleaseInterval = null;
      console.log('[Auto-Release] Background job stopped');
    }
  }

  /**
   * Extend temp lock for a booking
   */
  async extendTempLock(
    bookingId: string,
    additionalMinutes: number
  ): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { lockedUntil: true, vehicleId: true },
    });

    if (!booking || !booking.lockedUntil) {
      throw new Error('Booking not found or not temp locked');
    }

    const newLockedUntil = new Date(booking.lockedUntil);
    newLockedUntil.setMinutes(newLockedUntil.getMinutes() + additionalMinutes);

    await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id: bookingId },
        data: { lockedUntil: newLockedUntil },
      }),
      this.prisma.vehicle.update({
        where: { id: booking.vehicleId },
        data: { tempLockedUntil: newLockedUntil },
      }),
    ]);
  }
}

export default new VehicleLockingService();
