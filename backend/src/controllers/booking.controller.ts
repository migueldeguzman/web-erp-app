import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { BookingService } from '../services/booking.service';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();
const bookingService = new BookingService(prisma);

/**
 * Create a new booking
 */
export const createBooking = async (req: AuthRequest, res: Response) => {
  try {
    const {
      companyId,
      vehicleId,
      customerId,
      startDate,
      endDate,
      notes,
    } = req.body;

    // Validation
    if (!companyId || !vehicleId || !customerId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: companyId, vehicleId, customerId, startDate, endDate',
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format',
      });
    }

    if (start >= end) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date',
      });
    }

    const booking = await bookingService.createBooking({
      companyId,
      vehicleId,
      customerId,
      startDate: start,
      endDate: end,
      notes,
      userId: req.user!.id,
    });

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: booking,
    });
  } catch (error: any) {
    console.error('Error creating booking:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create booking',
    });
  }
};

/**
 * Confirm booking and generate invoice
 */
export const confirmBooking = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { receivableAccountId, revenueAccountId } = req.body;

    if (!receivableAccountId || !revenueAccountId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: receivableAccountId, revenueAccountId',
      });
    }

    const booking = await bookingService.confirmBooking(
      id,
      req.user!.id,
      {
        receivableAccountId,
        revenueAccountId,
      }
    );

    res.json({
      success: true,
      message: 'Booking confirmed and invoice generated',
      data: booking,
    });
  } catch (error: any) {
    console.error('Error confirming booking:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to confirm booking',
    });
  }
};

/**
 * Get booking by ID
 */
export const getBookingById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const booking = await bookingService.getBookingById(id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    res.json({
      success: true,
      data: booking,
    });
  } catch (error: any) {
    console.error('Error fetching booking:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch booking',
    });
  }
};

/**
 * List bookings with filters
 */
export const listBookings = async (req: AuthRequest, res: Response) => {
  try {
    const {
      companyId,
      customerId,
      vehicleId,
      status,
      page,
      limit,
    } = req.query;

    if (!companyId || typeof companyId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required',
      });
    }

    const params: any = {
      companyId,
    };

    if (customerId) params.customerId = customerId as string;
    if (vehicleId) params.vehicleId = vehicleId as string;
    if (status) params.status = status;
    if (page) params.page = parseInt(page as string, 10);
    if (limit) params.limit = parseInt(limit as string, 10);

    const result = await bookingService.listBookings(params);

    res.json({
      success: true,
      data: result.bookings,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error('Error listing bookings:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to list bookings',
    });
  }
};
