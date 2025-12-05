import { PrismaClient, VehicleStatus } from '@prisma/client';

export class VehicleService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get all available vehicles for a company
   */
  async getAvailableVehicles(companyId: string) {
    return await this.prisma.vehicle.findMany({
      where: {
        companyId,
        isActive: true,
        status: VehicleStatus.AVAILABLE,
      },
      orderBy: [
        { make: 'asc' },
        { model: 'asc' },
        { year: 'desc' },
      ],
    });
  }

  /**
   * Get vehicle by ID
   */
  async getVehicleById(vehicleId: string) {
    return await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: {
        company: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Check if vehicle is available for a given period
   */
  async checkAvailability(
    vehicleId: string,
    startDate: Date,
    endDate: Date
  ): Promise<boolean> {
    // Find any overlapping bookings
    const conflictingBookings = await this.prisma.booking.findMany({
      where: {
        vehicleId,
        status: {
          in: ['PENDING', 'CONFIRMED', 'ACTIVE'],
        },
        OR: [
          // New booking starts during existing booking
          {
            AND: [
              { startDate: { lte: startDate } },
              { endDate: { gte: startDate } },
            ],
          },
          // New booking ends during existing booking
          {
            AND: [
              { startDate: { lte: endDate } },
              { endDate: { gte: endDate } },
            ],
          },
          // New booking completely overlaps existing booking
          {
            AND: [
              { startDate: { gte: startDate } },
              { endDate: { lte: endDate } },
            ],
          },
        ],
      },
    });

    return conflictingBookings.length === 0;
  }

  /**
   * Get all vehicles (admin)
   */
  async getAllVehicles(companyId: string, filters?: {
    status?: VehicleStatus;
    make?: string;
    model?: string;
  }) {
    return await this.prisma.vehicle.findMany({
      where: {
        companyId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.make && { make: { contains: filters.make, mode: 'insensitive' } }),
        ...(filters?.model && { model: { contains: filters.model, mode: 'insensitive' } }),
      },
      orderBy: [
        { make: 'asc' },
        { model: 'asc' },
        { year: 'desc' },
      ],
    });
  }
}
