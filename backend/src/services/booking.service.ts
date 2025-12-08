import { PrismaClient, Prisma, BookingStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { InvoiceService } from './invoice.service';

export interface BookingAddOnInput {
  addonName: string;
  dailyRate: number;
  quantity?: number;
}

export interface CreateBookingInput {
  companyId: string;
  vehicleId: string;
  customerId: string;
  startDate: Date;
  endDate: Date;
  notes?: string;
  userId: string;  // User creating the booking
  // Additional fields from rent-a-car-mobile
  pickupLocation?: string;
  dropoffLocation?: string;
  paymentMethod?: string;
  termsAccepted?: boolean;
  addOns?: BookingAddOnInput[];
}

export class BookingService {
  private invoiceService: InvoiceService;

  constructor(private prisma: PrismaClient) {
    this.invoiceService = new InvoiceService(prisma);
  }

  /**
   * Calculate rental rate for a given period
   * Formula: (Number of 30-day periods * monthly rate) + (remaining days * daily rate)
   */
  private calculateRate(
    startDate: Date,
    endDate: Date,
    dailyRate: Decimal,
    monthlyRate: Decimal
  ): {
    totalDays: number;
    monthlyPeriods: number;
    remainingDays: number;
    totalAmount: Decimal;
  } {
    // Calculate total days
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = end.getTime() - start.getTime();
    const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Calculate monthly periods (30 days each)
    const monthlyPeriods = Math.floor(totalDays / 30);
    const remainingDays = totalDays % 30;

    // Calculate total amount
    const monthlyTotal = new Decimal(monthlyPeriods).times(monthlyRate);
    const dailyTotal = new Decimal(remainingDays).times(dailyRate);
    const totalAmount = monthlyTotal.plus(dailyTotal);

    return {
      totalDays,
      monthlyPeriods,
      remainingDays,
      totalAmount,
    };
  }

  /**
   * Generate sequential booking number
   * Format: BK-YYYY-NNNN
   */
  private async generateBookingNumber(
    tx: Prisma.TransactionClient,
    companyId: string,
    maxRetries: number = 5
  ): Promise<string> {
    const year = new Date().getFullYear();
    let attempt = 0;
    let lastError: any;

    while (attempt < maxRetries) {
      try {
        const result = await tx.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*) as count
          FROM bookings
          WHERE "companyId" = ${companyId}
            AND "bookingNumber" LIKE ${`BK-${year}-%`}
          FOR UPDATE
        `;

        const count = Number(result[0].count);
        const newNumber = `BK-${year}-${String(count + 1).padStart(4, '0')}`;

        // Verify the number doesn't exist
        const existing = await tx.booking.findFirst({
          where: {
            companyId,
            bookingNumber: newNumber,
          },
        });

        if (existing) {
          attempt++;
          lastError = new Error(`Booking number ${newNumber} already exists`);
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
          continue;
        }

        return newNumber;
      } catch (error: any) {
        lastError = error;
        attempt++;

        if (error.code === 'P2034' || error.message?.includes('deadlock')) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
          continue;
        }

        throw error;
      }
    }

    throw new Error(
      `Failed to generate booking number after ${maxRetries} attempts. Last error: ${lastError?.message}`
    );
  }

  /**
   * Create a new booking
   */
  async createBooking(data: CreateBookingInput) {
    return await this.prisma.$transaction(
      async (tx) => {
        // Get vehicle details
        const vehicle = await tx.vehicle.findUnique({
          where: { id: data.vehicleId },
        });

        if (!vehicle) {
          throw new Error('Vehicle not found');
        }

        if (vehicle.status !== 'AVAILABLE') {
          throw new Error(`Vehicle is not available (status: ${vehicle.status})`);
        }

        // Verify customer exists
        const customer = await tx.customer.findUnique({
          where: { id: data.customerId },
        });

        if (!customer || customer.companyId !== data.companyId) {
          throw new Error('Customer not found or does not belong to this company');
        }

        // Check vehicle availability for the period
        const conflictingBookings = await tx.booking.findMany({
          where: {
            vehicleId: data.vehicleId,
            status: {
              in: ['PENDING', 'CONFIRMED', 'ACTIVE'],
            },
            OR: [
              {
                AND: [
                  { startDate: { lte: data.startDate } },
                  { endDate: { gte: data.startDate } },
                ],
              },
              {
                AND: [
                  { startDate: { lte: data.endDate } },
                  { endDate: { gte: data.endDate } },
                ],
              },
              {
                AND: [
                  { startDate: { gte: data.startDate } },
                  { endDate: { lte: data.endDate } },
                ],
              },
            ],
          },
        });

        if (conflictingBookings.length > 0) {
          throw new Error('Vehicle is already booked for this period');
        }

        // Calculate rental rate
        const rateCalculation = this.calculateRate(
          data.startDate,
          data.endDate,
          vehicle.dailyRate,
          vehicle.monthlyRate
        );

        // Generate booking number
        const bookingNumber = await this.generateBookingNumber(tx, data.companyId);

        // Create booking
        const booking = await tx.booking.create({
          data: {
            companyId: data.companyId,
            vehicleId: data.vehicleId,
            customerId: data.customerId,
            bookingNumber,
            startDate: data.startDate,
            endDate: data.endDate,
            totalDays: rateCalculation.totalDays,
            monthlyPeriods: rateCalculation.monthlyPeriods,
            remainingDays: rateCalculation.remainingDays,
            dailyRate: vehicle.dailyRate,
            weeklyRate: vehicle.weeklyRate,
            monthlyRate: vehicle.monthlyRate,
            totalAmount: rateCalculation.totalAmount,
            status: BookingStatus.PENDING,
            notes: data.notes,
            pickupLocation: data.pickupLocation,
            dropoffLocation: data.dropoffLocation,
            paymentMethod: data.paymentMethod,
            termsAccepted: data.termsAccepted || false,
          },
        });

        // Create add-ons if provided
        if (data.addOns && data.addOns.length > 0) {
          const addOns = data.addOns.map((addon) => {
            const quantity = addon.quantity || rateCalculation.totalDays;
            const totalAmount = new Decimal(addon.dailyRate).times(quantity);
            return {
              bookingId: booking.id,
              addonName: addon.addonName,
              dailyRate: new Decimal(addon.dailyRate),
              quantity,
              totalAmount,
            };
          });

          await tx.bookingAddOn.createMany({
            data: addOns,
          });
        }

        // Mark vehicle as booked
        await tx.vehicle.update({
          where: { id: data.vehicleId },
          data: { isBooked: true },
        });

        return await tx.booking.findUnique({
          where: { id: booking.id },
          include: {
            vehicle: true,
            customer: true,
            addOns: true,
            company: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10000,
      }
    );
  }

  /**
   * Confirm booking and generate invoice
   */
  async confirmBooking(
    bookingId: string,
    userId: string,
    accountIds: {
      receivableAccountId: string;
      revenueAccountId: string;
    }
  ) {
    return await this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          vehicle: true,
          customer: true,
        },
      });

      if (!booking) {
        throw new Error('Booking not found');
      }

      if (booking.status !== BookingStatus.PENDING) {
        throw new Error(`Cannot confirm booking with status: ${booking.status}`);
      }

      // Generate invoice for the booking
      const invoiceResult = await this.invoiceService.createInvoice({
        companyId: booking.companyId,
        customerId: booking.customerId,
        invoiceDate: new Date(),
        dueDate: booking.startDate, // Due on pickup date
        items: [
          {
            description: `Vehicle Rental: ${booking.vehicle.make} ${booking.vehicle.model} ${booking.vehicle.year} (${booking.vehicle.plateNumber})`,
            quantity: 1,
            unitPrice: booking.totalAmount.toString(),
          },
          ...(booking.monthlyPeriods > 0
            ? [
                {
                  description: `  - ${booking.monthlyPeriods} month${booking.monthlyPeriods > 1 ? 's' : ''} @ AED ${booking.monthlyRate}/month`,
                  quantity: 0,
                  unitPrice: '0',
                },
              ]
            : []),
          ...(booking.remainingDays > 0
            ? [
                {
                  description: `  - ${booking.remainingDays} day${booking.remainingDays > 1 ? 's' : ''} @ AED ${booking.dailyRate}/day`,
                  quantity: 0,
                  unitPrice: '0',
                },
              ]
            : []),
        ],
        notes: `Booking: ${booking.bookingNumber}\nPeriod: ${booking.startDate.toISOString().split('T')[0]} to ${booking.endDate.toISOString().split('T')[0]}\nTotal Days: ${booking.totalDays}`,
        createdById: userId,
        revenueAccountId: accountIds.revenueAccountId,
        receivableAccountId: accountIds.receivableAccountId,
      });

      // Update booking with invoice reference and status
      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          invoiceId: invoiceResult.invoice!.id,
          status: BookingStatus.CONFIRMED,
        },
        include: {
          vehicle: true,
          customer: true,
          invoice: true,
        },
      });

      // Update vehicle status
      await tx.vehicle.update({
        where: { id: booking.vehicleId },
        data: { status: 'RENTED' },
      });

      return updatedBooking;
    });
  }

  /**
   * Get booking by ID
   */
  async getBookingById(bookingId: string) {
    return await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        vehicle: true,
        customer: true,
        invoice: {
          include: {
            items: true,
          },
        },
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
   * List bookings with filters
   */
  async listBookings(params: {
    companyId: string;
    customerId?: string;
    vehicleId?: string;
    status?: BookingStatus;
    page?: number;
    limit?: number;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const skip = (page - 1) * limit;

    const where: Prisma.BookingWhereInput = {
      companyId: params.companyId,
      ...(params.customerId && { customerId: params.customerId }),
      ...(params.vehicleId && { vehicleId: params.vehicleId }),
      ...(params.status && { status: params.status }),
    };

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        include: {
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              plateNumber: true,
            },
          },
          customer: {
            select: {
              id: true,
              code: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      bookings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
