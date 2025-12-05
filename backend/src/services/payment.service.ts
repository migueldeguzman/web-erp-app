import { PrismaClient, Prisma, PaymentStatus, PaymentMethod, TransactionType, TransactionStatus, InvoiceStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { TransactionService } from './transaction.service';

export interface CreatePaymentInput {
  companyId: string;
  customerId?: string;
  invoiceId?: string;
  paymentDate: Date;
  amount: number | string | Decimal;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
  createdById: string;
  // Accounting configuration
  cashAccountId: string; // Account to debit (Cash/Bank)
  receivableAccountId: string; // Account to credit (A/R)
}

export interface PostPaymentInput {
  paymentId: string;
  userId: string;
  // Account IDs for journal entry
  cashAccountId: string; // Bank or Cash account to debit
  receivableAccountId: string; // A/R account to credit
}

export class PaymentService {
  private transactionService: TransactionService;

  constructor(private prisma: PrismaClient) {
    this.transactionService = new TransactionService(prisma);
  }

  /**
   * Validates decimal precision for database constraints
   * @throws Error if value exceeds Decimal(15,2) constraints
   */
  private validateDecimalPrecision(value: number | string | Decimal, fieldName: string): void {
    const decimal = new Decimal(value.toString());
    const str = decimal.toFixed();

    // Remove negative sign and decimal point for digit counting
    const digitsOnly = str.replace(/[.-]/g, '');

    // Check total digits
    if (digitsOnly.length > 15) {
      throw new Error(`${fieldName} exceeds maximum precision (15 total digits)`);
    }

    // Check decimal places
    const parts = str.split('.');
    if (parts.length > 1 && parts[1].length > 2) {
      throw new Error(`${fieldName} exceeds maximum decimal places (2 decimal places)`);
    }
  }

  /**
   * Generates sequential payment number
   * Format: BP-YYYY-NNNN (Bank Payment) or CP-YYYY-NNNN (Cash Payment)
   * Uses SELECT FOR UPDATE to prevent race conditions
   */
  private async generatePaymentNumber(
    tx: Prisma.TransactionClient,
    companyId: string,
    method: PaymentMethod,
    maxRetries: number = 5
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = method === PaymentMethod.CASH ? 'CP' : 'BP';
    let attempt = 0;
    let lastError: any;

    while (attempt < maxRetries) {
      try {
        // Use raw SQL with FOR UPDATE to lock the rows being counted
        const result = await tx.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*) as count
          FROM payments
          WHERE "companyId" = ${companyId}
            AND "paymentNumber" LIKE ${`${prefix}-${year}-%`}
          FOR UPDATE
        `;

        const count = Number(result[0].count);
        const newNumber = `${prefix}-${year}-${String(count + 1).padStart(4, '0')}`;

        // Verify the number doesn't exist (double-check)
        const existing = await tx.payment.findFirst({
          where: {
            companyId,
            paymentNumber: newNumber,
          },
        });

        if (existing) {
          // If it exists, increment and retry
          attempt++;
          lastError = new Error(`Payment number ${newNumber} already exists`);
          // Add exponential backoff delay
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
          continue;
        }

        return newNumber;
      } catch (error: any) {
        lastError = error;
        attempt++;

        // Check if it's a lock timeout or deadlock error
        if (error.code === 'P2034' || error.message?.includes('deadlock')) {
          // Add exponential backoff delay before retry
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
          continue;
        }

        // For other errors, throw immediately
        throw error;
      }
    }

    // If we've exhausted all retries, throw the last error
    throw new Error(
      `Failed to generate payment number after ${maxRetries} attempts. Last error: ${lastError?.message}`
    );
  }

  /**
   * Creates a payment in DRAFT status
   */
  async createPayment(data: CreatePaymentInput) {
    return await this.prisma.$transaction(async (tx) => {
      // Verify accounts exist and belong to company
      const accounts = await tx.account.findMany({
        where: {
          id: { in: [data.cashAccountId, data.receivableAccountId] },
          companyId: data.companyId,
          isActive: true,
        },
      });

      if (accounts.length !== 2) {
        throw new Error('One or more accounts not found or inactive');
      }

      // If linked to invoice, verify invoice exists and update paid amount
      let invoice;
      if (data.invoiceId) {
        invoice = await tx.invoice.findUnique({
          where: { id: data.invoiceId },
        });

        if (!invoice) {
          throw new Error('Invoice not found');
        }

        if (invoice.companyId !== data.companyId) {
          throw new Error('Invoice does not belong to this company');
        }

        if (invoice.status === InvoiceStatus.VOID) {
          // Log failed creation attempt
          await tx.auditLog.create({
            data: {
              userId: data.createdById,
              action: 'CREATE',
              entity: 'Payment',
              entityId: 'validation_failed',
              newValue: {
                success: false,
                reason: 'invoice_voided',
                invoiceId: data.invoiceId,
                invoiceNumber: invoice.invoiceNumber,
              },
            },
          });
          throw new Error('Cannot apply payment to voided invoice');
        }

        // Check if payment amount exceeds outstanding balance
        const amount = new Decimal(data.amount.toString());
        this.validateDecimalPrecision(amount, 'Payment amount');
        if (amount.greaterThan(invoice.balanceAmount)) {
          // Log failed creation attempt
          await tx.auditLog.create({
            data: {
              userId: data.createdById,
              action: 'CREATE',
              entity: 'Payment',
              entityId: 'validation_failed',
              newValue: {
                success: false,
                reason: 'amount_exceeds_balance',
                invoiceId: data.invoiceId,
                invoiceNumber: invoice.invoiceNumber,
                paymentAmount: amount.toString(),
                invoiceBalance: invoice.balanceAmount.toString(),
              },
            },
          });
          throw new Error(
            `Payment amount (${amount}) exceeds invoice balance (${invoice.balanceAmount})`
          );
        }
      }

      // Verify customer if provided
      if (data.customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: data.customerId },
        });

        if (!customer || customer.companyId !== data.companyId) {
          throw new Error('Customer not found or does not belong to this company');
        }
      }

      // Generate payment number
      const paymentNumber = await this.generatePaymentNumber(tx, data.companyId, data.method);

      // Create DRAFT transaction
      const transactionNumber = `PAY-TXN-${paymentNumber}`;
      const transaction = await tx.transaction.create({
        data: {
          companyId: data.companyId,
          type: TransactionType.PAYMENT,
          status: TransactionStatus.DRAFT,
          number: transactionNumber,
          date: data.paymentDate,
          description: `Payment ${paymentNumber}${invoice ? ` for Invoice ${invoice.invoiceNumber}` : ''}`,
          reference: data.reference,
          createdById: data.createdById,
        },
      });

      // Create payment
      const payment = await tx.payment.create({
        data: {
          companyId: data.companyId,
          customerId: data.customerId,
          invoiceId: data.invoiceId,
          transactionId: transaction.id,
          paymentNumber,
          paymentDate: data.paymentDate,
          amount: new Decimal(data.amount.toString()),
          method: data.method,
          status: PaymentStatus.DRAFT,
          reference: data.reference,
          notes: data.notes,
          createdById: data.createdById,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: data.createdById,
          action: 'CREATE',
          entity: 'Payment',
          entityId: payment.id,
          newValue: {
            paymentNumber: payment.paymentNumber,
            amount: payment.amount.toString(),
            invoiceId: data.invoiceId,
            status: PaymentStatus.DRAFT,
          },
        },
      });

      return {
        payment: await tx.payment.findUnique({
          where: { id: payment.id },
          include: {
            customer: true,
            invoice: { select: { id: true, invoiceNumber: true, totalAmount: true, balanceAmount: true } },
            company: { select: { id: true, code: true, name: true } },
          },
        }),
        transaction,
      };
    });
  }

  /**
   * Posts a payment - creates the journal entry and updates invoice
   * Debit: Cash/Bank Account
   * Credit: Accounts Receivable
   */
  async postPayment(input: PostPaymentInput) {
    return await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: input.paymentId },
        include: {
          transaction: { include: { lines: true } },
          invoice: true,
          customer: true,
        },
      });

      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.status !== PaymentStatus.DRAFT) {
        // Log failed post attempt
        await tx.auditLog.create({
          data: {
            userId: input.userId,
            action: 'POST_TRANSACTION',
            entity: 'Payment',
            entityId: input.paymentId,
            newValue: {
              success: false,
              reason: 'invalid_status',
              currentStatus: payment.status,
              paymentNumber: payment.paymentNumber,
            },
          },
        });
        throw new Error(`Cannot post payment with status: ${payment.status}`);
      }

      // Verify accounts exist and belong to same company
      const accounts = await tx.account.findMany({
        where: {
          id: { in: [input.cashAccountId, input.receivableAccountId] },
          companyId: payment.companyId,
          isActive: true,
        },
      });

      if (accounts.length !== 2) {
        throw new Error('One or more accounts not found or inactive');
      }

      // Create transaction lines for the journal entry
      let lineNumber = 1;

      // Line 1: Debit Cash/Bank Account (Asset increases)
      await tx.transactionLine.create({
        data: {
          transactionId: payment.transactionId,
          accountId: input.cashAccountId,
          debit: payment.amount,
          credit: new Decimal(0),
          description: `Payment ${payment.paymentNumber}${payment.customer ? ` - ${payment.customer.name}` : ''}${payment.invoice ? ` for Invoice ${payment.invoice.invoiceNumber}` : ''}`,
          lineNumber: lineNumber++,
        },
      });

      // Line 2: Credit Accounts Receivable (Asset decreases)
      await tx.transactionLine.create({
        data: {
          transactionId: payment.transactionId,
          accountId: input.receivableAccountId,
          debit: new Decimal(0),
          credit: payment.amount,
          description: `Payment ${payment.paymentNumber}${payment.invoice ? ` - Invoice ${payment.invoice.invoiceNumber}` : ''}`,
          lineNumber: lineNumber++,
        },
      });

      // Update payment status
      await tx.payment.update({
        where: { id: input.paymentId },
        data: { status: PaymentStatus.POSTED },
      });

      // Post the associated transaction (will validate that debits = credits)
      await this.transactionService.postTransaction({
        transactionId: payment.transactionId,
        userId: input.userId,
      });

      // If linked to invoice, update invoice paid amount and status
      if (payment.invoiceId && payment.invoice) {
        const newPaidAmount = payment.invoice.paidAmount.plus(payment.amount);
        const newBalanceAmount = payment.invoice.totalAmount.minus(newPaidAmount);

        let newStatus = payment.invoice.status;
        if (newPaidAmount.gte(payment.invoice.totalAmount)) {
          newStatus = InvoiceStatus.PAID;
        } else if (newPaidAmount.greaterThan(0)) {
          newStatus = InvoiceStatus.PARTIALLY_PAID;
        }

        await tx.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            paidAmount: newPaidAmount,
            balanceAmount: newBalanceAmount,
            status: newStatus,
          },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: input.userId,
          action: 'POST_TRANSACTION',
          entity: 'Payment',
          entityId: input.paymentId,
          oldValue: { status: PaymentStatus.DRAFT },
          newValue: {
            status: PaymentStatus.POSTED,
            paymentNumber: payment.paymentNumber,
            accountingEntry: {
              debit: payment.amount.toString(),
              credit: payment.amount.toString(),
            },
          },
        },
      });

      return await tx.payment.findUnique({
        where: { id: input.paymentId },
        include: {
          customer: true,
          invoice: true,
          transaction: { include: { lines: { include: { account: true } } } },
        },
      });
    });
  }

  /**
   * Gets payment with all details
   */
  async getPaymentById(paymentId: string) {
    return await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        customer: true,
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            paidAmount: true,
            balanceAmount: true,
            status: true,
          },
        },
        company: { select: { id: true, code: true, name: true } },
        transaction: {
          include: {
            lines: {
              include: {
                account: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    type: true,
                  },
                },
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Lists payments with filters and pagination
   */
  async listPayments(params: {
    companyId: string;
    customerId?: string;
    invoiceId?: string;
    status?: PaymentStatus;
    method?: PaymentMethod;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {
      companyId: params.companyId,
      ...(params.customerId && { customerId: params.customerId }),
      ...(params.invoiceId && { invoiceId: params.invoiceId }),
      ...(params.status && { status: params.status }),
      ...(params.method && { method: params.method }),
      ...(params.startDate &&
        params.endDate && {
          paymentDate: {
            gte: params.startDate,
            lte: params.endDate,
          },
        }),
    };

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          customer: { select: { id: true, code: true, name: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
        },
        orderBy: { paymentDate: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Voids a payment (and its associated transaction)
   */
  async voidPayment(paymentId: string, userId: string, reason: string) {
    return await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { transaction: true, invoice: true },
      });

      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.status === PaymentStatus.VOID) {
        // Log failed void attempt
        await tx.auditLog.create({
          data: {
            userId: userId,
            action: 'VOID_TRANSACTION',
            entity: 'Payment',
            entityId: paymentId,
            newValue: {
              success: false,
              reason: 'already_voided',
              paymentNumber: payment.paymentNumber,
            },
          },
        });
        throw new Error('Payment is already voided');
      }

      if (payment.status !== PaymentStatus.POSTED) {
        // Log failed void attempt
        await tx.auditLog.create({
          data: {
            userId: userId,
            action: 'VOID_TRANSACTION',
            entity: 'Payment',
            entityId: paymentId,
            newValue: {
              success: false,
              reason: 'not_posted',
              currentStatus: payment.status,
              paymentNumber: payment.paymentNumber,
            },
          },
        });
        throw new Error('Only posted payments can be voided');
      }

      // Update payment status
      const voided = await tx.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.VOID },
      });

      // Void associated transaction
      await this.transactionService.voidTransaction({
        transactionId: payment.transactionId,
        userId,
        reason: `Payment voided: ${reason}`,
      });

      // If linked to invoice, reverse the paid amount
      if (payment.invoiceId && payment.invoice) {
        const newPaidAmount = payment.invoice.paidAmount.minus(payment.amount);
        const newBalanceAmount = payment.invoice.totalAmount.minus(newPaidAmount);

        let newStatus = payment.invoice.status;
        if (newPaidAmount.equals(0)) {
          newStatus = InvoiceStatus.SENT;
        } else if (newPaidAmount.lessThan(payment.invoice.totalAmount)) {
          newStatus = InvoiceStatus.PARTIALLY_PAID;
        }

        await tx.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            paidAmount: newPaidAmount,
            balanceAmount: newBalanceAmount,
            status: newStatus,
          },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          userId,
          action: 'VOID_TRANSACTION',
          entity: 'Payment',
          entityId: paymentId,
          oldValue: { status: payment.status },
          newValue: { status: PaymentStatus.VOID, reason },
        },
      });

      return voided;
    });
  }
}
