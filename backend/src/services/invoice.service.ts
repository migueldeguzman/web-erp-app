import { PrismaClient, Prisma, InvoiceStatus, TransactionType, TransactionStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { TransactionService } from './transaction.service';

export interface InvoiceItemInput {
  description: string;
  quantity: number | string | Decimal;
  unitPrice: number | string | Decimal;
}

export interface CreateInvoiceInput {
  companyId: string;
  customerId: string;
  invoiceDate: Date;
  dueDate: Date;
  items: InvoiceItemInput[];
  taxRate?: number; // Percentage (e.g., 5 for 5%)
  notes?: string;
  createdById: string;
  // Accounting configuration
  revenueAccountId: string; // Account to credit for revenue
  receivableAccountId: string; // Account to debit for accounts receivable
  taxAccountId?: string; // Account to credit for tax (if applicable)
}

export interface PostInvoiceInput {
  invoiceId: string;
  userId: string;
  // Account IDs for journal entry
  receivableAccountId: string;
  revenueAccountId: string;
  taxAccountId?: string;
}

export interface RecordPaymentInput {
  invoiceId: string;
  amount: number | string | Decimal;
  paymentDate: Date;
  method: string;
  reference?: string;
  userId: string;
  // Accounting configuration
  cashAccountId: string; // Account to debit (cash/bank)
  receivableAccountId: string; // Account to credit (A/R)
}

export class InvoiceService {
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
   * Generates sequential invoice number for company and year
   * Format: INV-YYYY-NNNN
   * Uses SELECT FOR UPDATE to prevent race conditions
   */
  private async generateInvoiceNumber(
    tx: Prisma.TransactionClient,
    companyId: string,
    maxRetries: number = 5
  ): Promise<string> {
    const year = new Date().getFullYear();
    let attempt = 0;
    let lastError: any;

    while (attempt < maxRetries) {
      try {
        // Use raw SQL with FOR UPDATE to lock the rows being counted
        const result = await tx.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*) as count
          FROM invoices
          WHERE "companyId" = ${companyId}
            AND "invoiceNumber" LIKE ${`INV-${year}-%`}
          FOR UPDATE
        `;

        const count = Number(result[0].count);
        const newNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`;

        // Verify the number doesn't exist (double-check)
        const existing = await tx.invoice.findFirst({
          where: {
            companyId,
            invoiceNumber: newNumber,
          },
        });

        if (existing) {
          // If it exists, increment and retry
          attempt++;
          lastError = new Error(`Invoice number ${newNumber} already exists`);
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
      `Failed to generate invoice number after ${maxRetries} attempts. Last error: ${lastError?.message}`
    );
  }

  /**
   * Creates an invoice in DRAFT status
   * Does NOT create journal entry yet (only when posted)
   */
  async createInvoice(data: CreateInvoiceInput) {
    if (data.items.length === 0) {
      // Log failed creation attempt
      await this.prisma.auditLog.create({
        data: {
          userId: data.createdById,
          action: 'CREATE',
          entity: 'Invoice',
          entityId: 'validation_failed',
          newValue: {
            success: false,
            reason: 'no_items',
            companyId: data.companyId,
            customerId: data.customerId,
          },
        },
      });
      throw new Error('Invoice must have at least one item');
    }

    // Validate tax account requirement
    const taxRate = data.taxRate || 0;
    if (taxRate > 0 && !data.taxAccountId) {
      // Log failed creation attempt
      await this.prisma.auditLog.create({
        data: {
          userId: data.createdById,
          action: 'CREATE',
          entity: 'Invoice',
          entityId: 'validation_failed',
          newValue: {
            success: false,
            reason: 'missing_tax_account',
            companyId: data.companyId,
            customerId: data.customerId,
            taxRate: taxRate,
          },
        },
      });
      throw new Error('Tax account ID is required when tax rate is specified');
    }

    return await this.prisma.$transaction(
      async (tx) => {
        // Verify customer exists and belongs to company
      const customer = await tx.customer.findUnique({
        where: { id: data.customerId },
      });

      if (!customer || customer.companyId !== data.companyId) {
        throw new Error('Customer not found or does not belong to this company');
      }

      // Verify accounts exist and belong to company
      const accountIds = [
        data.revenueAccountId,
        data.receivableAccountId,
        ...(data.taxAccountId ? [data.taxAccountId] : []),
      ];

      const accounts = await tx.account.findMany({
        where: {
          id: { in: accountIds },
          companyId: data.companyId,
          isActive: true,
        },
      });

      if (accounts.length !== accountIds.length) {
        throw new Error('One or more accounts not found or inactive');
      }

      // Calculate line item amounts
      const itemsWithAmounts = data.items.map((item, index) => {
        const quantity = new Decimal(item.quantity.toString());
        const unitPrice = new Decimal(item.unitPrice.toString());

        // Validate decimal precision
        this.validateDecimalPrecision(quantity, `Item ${index + 1} quantity`);
        this.validateDecimalPrecision(unitPrice, `Item ${index + 1} unit price`);

        const amount = quantity.times(unitPrice);
        this.validateDecimalPrecision(amount, `Item ${index + 1} amount`);

        return {
          ...item,
          quantity,
          unitPrice,
          amount,
          lineNumber: index + 1,
        };
      });

      // Calculate totals
      const subtotal = itemsWithAmounts.reduce(
        (sum, item) => sum.plus(item.amount),
        new Decimal(0)
      );

      // Use taxRate declared at line 83
      const taxAmount = subtotal.times(taxRate).dividedBy(100);
      const totalAmount = subtotal.plus(taxAmount);

      // Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber(tx, data.companyId);

      // Create DRAFT transaction (will be posted when invoice is posted)
      const transactionNumber = `INV-TXN-${invoiceNumber}`;
      const transaction = await tx.transaction.create({
        data: {
          companyId: data.companyId,
          type: TransactionType.INVOICE,
          status: TransactionStatus.DRAFT,
          number: transactionNumber,
          date: data.invoiceDate,
          description: `Invoice ${invoiceNumber}`,
          createdById: data.createdById,
        },
      });

      // Create invoice
      const invoice = await tx.invoice.create({
        data: {
          companyId: data.companyId,
          customerId: data.customerId,
          transactionId: transaction.id,
          invoiceNumber,
          invoiceDate: data.invoiceDate,
          dueDate: data.dueDate,
          status: InvoiceStatus.DRAFT,
          subtotal,
          taxAmount,
          totalAmount,
          paidAmount: new Decimal(0),
          balanceAmount: totalAmount,
          notes: data.notes,
          createdById: data.createdById,
        },
      });

      // Create invoice items
      await Promise.all(
        itemsWithAmounts.map((item) =>
          tx.invoiceItem.create({
            data: {
              invoiceId: invoice.id,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              amount: item.amount,
              lineNumber: item.lineNumber,
            },
          })
        )
      );

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId: data.createdById,
          action: 'CREATE',
          entity: 'Invoice',
          entityId: invoice.id,
          newValue: {
            invoiceNumber: invoice.invoiceNumber,
            customerId: customer.id,
            customerName: customer.name,
            totalAmount: totalAmount.toString(),
            status: InvoiceStatus.DRAFT,
          },
        },
      });

      return {
        invoice: await tx.invoice.findUnique({
          where: { id: invoice.id },
          include: {
            items: { orderBy: { lineNumber: 'asc' } },
            customer: true,
            company: { select: { id: true, code: true, name: true } },
          },
        }),
        transaction,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 10000,
    }
  );
  }

  /**
   * Posts an invoice - creates the journal entry
   * Debit: Accounts Receivable
   * Credit: Revenue
   * Credit: Tax Payable (if applicable)
   */
  async postInvoice(input: PostInvoiceInput) {
    return await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: input.invoiceId },
        include: {
          transaction: true,
          items: true,
          customer: true,
        },
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (invoice.status !== InvoiceStatus.DRAFT) {
        // Log failed post attempt
        await tx.auditLog.create({
          data: {
            userId: input.userId,
            action: 'POST_TRANSACTION',
            entity: 'Invoice',
            entityId: input.invoiceId,
            newValue: {
              success: false,
              reason: 'invalid_status',
              currentStatus: invoice.status,
              invoiceNumber: invoice.invoiceNumber,
            },
          },
        });
        throw new Error(`Cannot post invoice with status: ${invoice.status}`);
      }

      // Build account IDs list and validate tax account requirement
      const accountIds = [
        input.receivableAccountId,
        input.revenueAccountId,
      ];

      // If invoice has tax, taxAccountId is REQUIRED
      if (invoice.taxAmount.greaterThan(0)) {
        if (!input.taxAccountId) {
          throw new Error(
            `Tax account ID is required for invoice ${invoice.invoiceNumber} with tax amount ${invoice.taxAmount}`
          );
        }
        accountIds.push(input.taxAccountId);
      }

      // Verify all accounts exist and belong to same company
      const accounts = await tx.account.findMany({
        where: {
          id: { in: accountIds },
          companyId: invoice.companyId,
          isActive: true,
        },
      });

      if (accounts.length !== accountIds.length) {
        throw new Error('One or more accounts not found or inactive');
      }

      // Create transaction lines for the journal entry
      let lineNumber = 1;

      // Line 1: Debit Accounts Receivable (Asset increases)
      await tx.transactionLine.create({
        data: {
          transactionId: invoice.transactionId,
          accountId: input.receivableAccountId,
          debit: invoice.totalAmount,
          credit: new Decimal(0),
          description: `Invoice ${invoice.invoiceNumber} - ${invoice.customer.name}`,
          lineNumber: lineNumber++,
        },
      });

      // Line 2: Credit Revenue (Revenue increases)
      await tx.transactionLine.create({
        data: {
          transactionId: invoice.transactionId,
          accountId: input.revenueAccountId,
          debit: new Decimal(0),
          credit: invoice.subtotal,
          description: `Invoice ${invoice.invoiceNumber} - Sales Revenue`,
          lineNumber: lineNumber++,
        },
      });

      // Line 3: Credit Tax Payable (if applicable)
      if (invoice.taxAmount.greaterThan(0) && input.taxAccountId) {
        await tx.transactionLine.create({
          data: {
            transactionId: invoice.transactionId,
            accountId: input.taxAccountId,
            debit: new Decimal(0),
            credit: invoice.taxAmount,
            description: `Invoice ${invoice.invoiceNumber} - VAT`,
            lineNumber: lineNumber++,
          },
        });
      }

      // Update invoice status
      await tx.invoice.update({
        where: { id: input.invoiceId },
        data: { status: InvoiceStatus.SENT },
      });

      // Post the associated transaction (will validate that debits = credits)
      await this.transactionService.postTransaction({
        transactionId: invoice.transactionId,
        userId: input.userId,
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId: input.userId,
          action: 'POST_TRANSACTION',
          entity: 'Invoice',
          entityId: input.invoiceId,
          oldValue: { status: InvoiceStatus.DRAFT },
          newValue: {
            status: InvoiceStatus.SENT,
            invoiceNumber: invoice.invoiceNumber,
            accountingEntry: {
              debit: invoice.totalAmount.toString(),
              credit: invoice.totalAmount.toString(),
            },
          },
        },
      });

      return await tx.invoice.findUnique({
        where: { id: input.invoiceId },
        include: {
          items: { orderBy: { lineNumber: 'asc' } },
          customer: true,
          transaction: { include: { lines: { include: { account: true } } } },
        },
      });
    });
  }

  /**
   * Gets invoice with all details
   */
  async getInvoiceById(invoiceId: string) {
    return await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: { orderBy: { lineNumber: 'asc' } },
        customer: true,
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
        payments: {
          select: {
            id: true,
            paymentNumber: true,
            amount: true,
            paymentDate: true,
            method: true,
            status: true,
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
   * Lists invoices with filters and pagination
   */
  async listInvoices(params: {
    companyId: string;
    customerId?: string;
    status?: InvoiceStatus;
    startDate?: Date;
    endDate?: Date;
    overdue?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {
      companyId: params.companyId,
      ...(params.customerId && { customerId: params.customerId }),
      ...(params.status && { status: params.status }),
      ...(params.startDate &&
        params.endDate && {
          invoiceDate: {
            gte: params.startDate,
            lte: params.endDate,
          },
        }),
      ...(params.overdue && {
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
        dueDate: { lt: new Date() },
      }),
    };

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          customer: { select: { id: true, code: true, name: true } },
          items: { select: { id: true } }, // Just count
          _count: { select: { payments: true } },
        },
        orderBy: { invoiceDate: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      invoices,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Updates invoice status based on payment amount
   */
  async updateInvoiceStatus(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    let newStatus = invoice.status;

    if (invoice.paidAmount.equals(0)) {
      // Check if overdue
      if (new Date() > invoice.dueDate) {
        newStatus = InvoiceStatus.OVERDUE;
      }
    } else if (invoice.paidAmount.gte(invoice.totalAmount)) {
      newStatus = InvoiceStatus.PAID;
    } else {
      newStatus = InvoiceStatus.PARTIALLY_PAID;
    }

    if (newStatus !== invoice.status) {
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: newStatus },
      });
    }

    return newStatus;
  }

  /**
   * Voids an invoice (and its associated transaction)
   */
  async voidInvoice(invoiceId: string, userId: string, reason: string) {
    return await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { payments: true },
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (invoice.status === InvoiceStatus.VOID) {
        // Log failed void attempt
        await tx.auditLog.create({
          data: {
            userId: userId,
            action: 'VOID_TRANSACTION',
            entity: 'Invoice',
            entityId: invoiceId,
            newValue: {
              success: false,
              reason: 'already_voided',
              invoiceNumber: invoice.invoiceNumber,
            },
          },
        });
        throw new Error('Invoice is already voided');
      }

      // Check if invoice has payments
      if (invoice.paidAmount.greaterThan(0)) {
        // Log failed void attempt
        await tx.auditLog.create({
          data: {
            userId: userId,
            action: 'VOID_TRANSACTION',
            entity: 'Invoice',
            entityId: invoiceId,
            newValue: {
              success: false,
              reason: 'has_payments',
              invoiceNumber: invoice.invoiceNumber,
              paidAmount: invoice.paidAmount.toString(),
            },
          },
        });
        throw new Error('Cannot void invoice with payments. Reverse payments first.');
      }

      // Update invoice status
      const voided = await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: InvoiceStatus.VOID },
      });

      // Get transaction to check status
      const transaction = await tx.transaction.findUnique({
        where: { id: invoice.transactionId },
      });

      // Void associated transaction if it was posted
      if (transaction?.status === TransactionStatus.POSTED) {
        await this.transactionService.voidTransaction({
          transactionId: invoice.transactionId,
          userId,
          reason: `Invoice voided: ${reason}`,
        });
      } else {
        // Just update draft transaction to void
        await tx.transaction.update({
          where: { id: invoice.transactionId },
          data: { status: TransactionStatus.VOID },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          userId,
          action: 'VOID_TRANSACTION',
          entity: 'Invoice',
          entityId: invoiceId,
          oldValue: { status: invoice.status },
          newValue: { status: InvoiceStatus.VOID, reason },
        },
      });

      return voided;
    });
  }
}
