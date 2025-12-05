import { PrismaClient, Prisma, TransactionType, TransactionStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface TransactionLineInput {
  accountId: string;
  debit: number | string | Decimal;
  credit: number | string | Decimal;
  description?: string;
}

export interface CreateJournalEntryInput {
  companyId: string;
  date: Date;
  description: string;
  reference?: string;
  lines: TransactionLineInput[];
  createdById: string;
}

export interface PostTransactionInput {
  transactionId: string;
  userId: string;
}

export interface VoidTransactionInput {
  transactionId: string;
  userId: string;
  reason: string;
}

export class TransactionService {
  constructor(private prisma: PrismaClient) {}

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
   * Validates that debits equal credits for a set of transaction lines
   * @throws Error if transaction is unbalanced
   */
  private validateBalance(lines: TransactionLineInput[], userId?: string): { debit: Decimal; credit: Decimal } {
    const totals = lines.reduce(
      (acc, line) => ({
        debit: acc.debit.plus(new Decimal(line.debit.toString())),
        credit: acc.credit.plus(new Decimal(line.credit.toString())),
      }),
      { debit: new Decimal(0), credit: new Decimal(0) }
    );

    if (!totals.debit.equals(totals.credit)) {
      // Log validation failure if userId provided
      if (userId) {
        this.prisma.auditLog.create({
          data: {
            userId: userId,
            action: 'CREATE',
            entity: 'Transaction',
            entityId: 'validation_failed',
            newValue: {
              success: false,
              reason: 'unbalanced_transaction',
              debitTotal: totals.debit.toString(),
              creditTotal: totals.credit.toString(),
              difference: totals.debit.minus(totals.credit).toString(),
            },
          },
        }).catch(() => {}); // Don't fail if audit log fails
      }

      throw new Error(
        `Transaction must balance. Debits: ${totals.debit.toString()}, Credits: ${totals.credit.toString()}`
      );
    }

    return totals;
  }

  /**
   * Validates that each line has either debit OR credit (not both, not neither)
   * Also validates decimal precision
   * @throws Error if line is invalid
   */
  private validateLines(lines: TransactionLineInput[]): void {
    lines.forEach((line, index) => {
      const debit = new Decimal(line.debit.toString());
      const credit = new Decimal(line.credit.toString());

      // Validate decimal precision
      if (!debit.equals(0)) {
        this.validateDecimalPrecision(debit, `Line ${index + 1} debit`);
      }
      if (!credit.equals(0)) {
        this.validateDecimalPrecision(credit, `Line ${index + 1} credit`);
      }

      // Check that both debit and credit are not zero
      if (debit.equals(0) && credit.equals(0)) {
        throw new Error(`Line ${index + 1}: Must have either debit or credit amount`);
      }

      // Check that both debit and credit are not set
      if (!debit.equals(0) && !credit.equals(0)) {
        throw new Error(`Line ${index + 1}: Cannot have both debit and credit. Use one only.`);
      }

      // Check for negative amounts
      if (debit.lessThan(0) || credit.lessThan(0)) {
        throw new Error(`Line ${index + 1}: Amounts cannot be negative`);
      }
    });
  }

  /**
   * Generates sequential transaction number for company and year
   * Format: PREFIX-YYYY-NNNN (e.g., JV-2025-0001)
   * Uses SELECT FOR UPDATE to prevent race conditions
   */
  private async generateTransactionNumber(
    tx: Prisma.TransactionClient,
    companyId: string,
    prefix: string,
    maxRetries: number = 5
  ): Promise<string> {
    const year = new Date().getFullYear();
    let attempt = 0;
    let lastError: any;

    while (attempt < maxRetries) {
      try {
        // Use raw SQL with FOR UPDATE to lock the rows being counted
        // This prevents other transactions from reading the same count
        const result = await tx.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*) as count
          FROM transactions
          WHERE "companyId" = ${companyId}
            AND number LIKE ${`${prefix}-${year}-%`}
          FOR UPDATE
        `;

        const count = Number(result[0].count);
        const newNumber = `${prefix}-${year}-${String(count + 1).padStart(4, '0')}`;

        // Verify the number doesn't exist (double-check)
        const existing = await tx.transaction.findFirst({
          where: {
            companyId,
            number: newNumber,
          },
        });

        if (existing) {
          // If it exists, increment and retry
          attempt++;
          lastError = new Error(`Transaction number ${newNumber} already exists`);
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
      `Failed to generate transaction number after ${maxRetries} attempts. Last error: ${lastError?.message}`
    );
  }

  /**
   * Creates a journal voucher (manual journal entry)
   * Uses Prisma transaction with SERIALIZABLE isolation to ensure atomicity
   */
  async createJournalEntry(data: CreateJournalEntryInput) {
    // Validate lines
    this.validateLines(data.lines);

    // Validate balance (pass userId for audit logging)
    const totals = this.validateBalance(data.lines, data.createdById);

    return await this.prisma.$transaction(
      async (tx) => {
        // Verify all accounts exist and belong to the company
      const accountIds = data.lines.map((line) => line.accountId);
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

      // Generate transaction number
      const number = await this.generateTransactionNumber(tx, data.companyId, 'JV');

      // Create transaction header
      const transaction = await tx.transaction.create({
        data: {
          companyId: data.companyId,
          type: TransactionType.JOURNAL_VOUCHER,
          status: TransactionStatus.DRAFT,
          number,
          date: data.date,
          description: data.description,
          reference: data.reference,
          createdById: data.createdById,
        },
      });

      // Create transaction lines
      const lines = await Promise.all(
        data.lines.map((line, index) =>
          tx.transactionLine.create({
            data: {
              transactionId: transaction.id,
              accountId: line.accountId,
              debit: new Decimal(line.debit.toString()),
              credit: new Decimal(line.credit.toString()),
              description: line.description,
              lineNumber: index + 1,
            },
          })
        )
      );

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId: data.createdById,
          action: 'CREATE',
          entity: 'Transaction',
          entityId: transaction.id,
          newValue: {
            type: transaction.type,
            number: transaction.number,
            totalDebit: totals.debit.toString(),
            totalCredit: totals.credit.toString(),
            lineCount: lines.length,
          },
        },
      });

      return {
        transaction,
        lines,
        totals: {
          debit: totals.debit.toString(),
          credit: totals.credit.toString(),
        },
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000, // 5 seconds max wait
      timeout: 10000, // 10 seconds timeout
    }
  );
  }

  /**
   * Posts a draft transaction (makes it permanent and immutable)
   * @throws Error if transaction is not in DRAFT status
   * Uses SERIALIZABLE isolation to ensure data consistency
   */
  async postTransaction(input: PostTransactionInput) {
    return await this.prisma.$transaction(
      async (tx) => {
      // Get transaction with lines
      const transaction = await tx.transaction.findUnique({
        where: { id: input.transactionId },
        include: { lines: true },
      });

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status !== TransactionStatus.DRAFT) {
        // Log failed post attempt
        await tx.auditLog.create({
          data: {
            userId: input.userId,
            action: 'POST_TRANSACTION',
            entity: 'Transaction',
            entityId: input.transactionId,
            newValue: {
              success: false,
              reason: 'invalid_status',
              currentStatus: transaction.status,
              transactionNumber: transaction.number,
            },
          },
        });
        throw new Error(`Cannot post transaction with status: ${transaction.status}`);
      }

      // Re-validate balance before posting (safety check)
      const lineInputs: TransactionLineInput[] = transaction.lines.map((line) => ({
        accountId: line.accountId,
        debit: line.debit,
        credit: line.credit,
        description: line.description || undefined,
      }));

      this.validateLines(lineInputs);
      this.validateBalance(lineInputs);

      // Update status to POSTED
      const posted = await tx.transaction.update({
        where: { id: input.transactionId },
        data: {
          status: TransactionStatus.POSTED,
          postedAt: new Date(),
        },
        include: {
          lines: {
            include: {
              account: {
                select: {
                  code: true,
                  name: true,
                  type: true,
                },
              },
            },
          },
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId: input.userId,
          action: 'POST_TRANSACTION',
          entity: 'Transaction',
          entityId: input.transactionId,
          oldValue: { status: TransactionStatus.DRAFT },
          newValue: { status: TransactionStatus.POSTED, postedAt: posted.postedAt },
        },
      });

      return posted;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 10000,
    }
  );
  }

  /**
   * Voids a posted transaction by creating a reversal entry
   * Original transaction status is changed to VOID
   * A new transaction is created with reversed debits/credits
   * Uses SERIALIZABLE isolation to ensure data consistency
   */
  async voidTransaction(input: VoidTransactionInput) {
    return await this.prisma.$transaction(
      async (tx) => {
      // Get original transaction with lines
      const original = await tx.transaction.findUnique({
        where: { id: input.transactionId },
        include: {
          lines: true,
          company: { select: { id: true } },
        },
      });

      if (!original) {
        throw new Error('Transaction not found');
      }

      if (original.status !== TransactionStatus.POSTED) {
        // Log failed void attempt
        await tx.auditLog.create({
          data: {
            userId: input.userId,
            action: 'VOID_TRANSACTION',
            entity: 'Transaction',
            entityId: input.transactionId,
            newValue: {
              success: false,
              reason: 'not_posted',
              currentStatus: original.status,
              transactionNumber: original.number,
            },
          },
        });
        throw new Error(`Cannot void transaction with status: ${original.status}`);
      }

      // Mark original as VOID
      const voided = await tx.transaction.update({
        where: { id: input.transactionId },
        data: { status: TransactionStatus.VOID },
      });

      // Create reversal transaction with opposite debits/credits
      const reversalNumber = await this.generateTransactionNumber(
        tx,
        original.companyId,
        'JV'
      );

      const reversal = await tx.transaction.create({
        data: {
          companyId: original.companyId,
          type: TransactionType.JOURNAL_VOUCHER,
          status: TransactionStatus.POSTED,
          number: reversalNumber,
          date: new Date(),
          description: `REVERSAL: ${original.description || ''} (Void: ${original.number})`,
          reference: `VOID-${original.number}`,
          createdById: input.userId,
          postedAt: new Date(),
        },
      });

      // Create reversed lines (swap debit/credit)
      await Promise.all(
        original.lines.map((line) =>
          tx.transactionLine.create({
            data: {
              transactionId: reversal.id,
              accountId: line.accountId,
              debit: line.credit, // Swap!
              credit: line.debit, // Swap!
              description: `Reversal of ${original.number} - ${line.description || ''}`,
              lineNumber: line.lineNumber,
            },
          })
        )
      );

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId: input.userId,
          action: 'VOID_TRANSACTION',
          entity: 'Transaction',
          entityId: input.transactionId,
          oldValue: { status: TransactionStatus.POSTED, number: original.number },
          newValue: {
            status: TransactionStatus.VOID,
            reason: input.reason,
            reversalNumber: reversalNumber,
          },
        },
      });

      return {
        voided,
        reversal: await tx.transaction.findUnique({
          where: { id: reversal.id },
          include: { lines: true },
        }),
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
   * Gets transaction with full details
   */
  async getTransactionById(transactionId: string) {
    return await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        lines: {
          include: {
            account: {
              select: {
                id: true,
                code: true,
                name: true,
                type: true,
                subType: true,
              },
            },
          },
          orderBy: { lineNumber: 'asc' },
        },
        company: {
          select: {
            id: true,
            code: true,
            name: true,
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
   * Lists transactions for a company with pagination
   */
  async listTransactions(params: {
    companyId: string;
    type?: TransactionType;
    status?: TransactionStatus;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const skip = (page - 1) * limit;

    const where: Prisma.TransactionWhereInput = {
      companyId: params.companyId,
      ...(params.type && { type: params.type }),
      ...(params.status && { status: params.status }),
      ...(params.startDate &&
        params.endDate && {
          date: {
            gte: params.startDate,
            lte: params.endDate,
          },
        }),
    };

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: {
          lines: {
            include: {
              account: {
                select: {
                  code: true,
                  name: true,
                  type: true,
                },
              },
            },
          },
          createdBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Calculates account balance up to a specific date
   * Balance calculation depends on account type:
   * - Assets & Expenses: balance = debit - credit (normal debit balance)
   * - Liabilities, Equity & Revenue: balance = credit - debit (normal credit balance)
   */
  async getAccountBalance(accountId: string, upToDate?: Date) {
    // Get account type to determine balance calculation
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { type: true, code: true, name: true },
    });

    if (!account) {
      throw new Error('Account not found');
    }

    const where: Prisma.TransactionLineWhereInput = {
      accountId,
      transaction: {
        status: TransactionStatus.POSTED,
        ...(upToDate && { date: { lte: upToDate } }),
      },
    };

    const lines = await this.prisma.transactionLine.findMany({
      where,
      select: {
        debit: true,
        credit: true,
      },
    });

    const totals = lines.reduce(
      (acc, line) => ({
        debit: acc.debit.plus(line.debit),
        credit: acc.credit.plus(line.credit),
      }),
      { debit: new Decimal(0), credit: new Decimal(0) }
    );

    // Calculate balance based on account type
    // Assets and Expenses have normal debit balances (DR - CR)
    // Liabilities, Equity, and Revenue have normal credit balances (CR - DR)
    const balance = ['ASSET', 'EXPENSE'].includes(account.type)
      ? totals.debit.minus(totals.credit)
      : totals.credit.minus(totals.debit);

    return {
      accountType: account.type,
      accountCode: account.code,
      accountName: account.name,
      debit: totals.debit.toString(),
      credit: totals.credit.toString(),
      balance: balance.toString(),
    };
  }
}
