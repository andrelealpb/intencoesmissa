import { PrismaClient, IntentionGroup, DispatchScope, DispatchStatus, RequestStatus } from '@prisma/client';
import { StorageService } from './storage.service';
import { EmailService } from './email.service';
import { PdfService } from './pdf.service';

export class DispatchService {
  private pdfService: PdfService;

  constructor(
    private prisma: PrismaClient,
    private storageService: StorageService,
    private emailService: EmailService,
  ) {
    this.pdfService = new PdfService();
  }

  async checkAndDispatch(): Promise<void> {
    const now = new Date();
    const spNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const currentHHmm = spNow.toTimeString().slice(0, 5); // "HH:mm"

    console.log(`[Dispatch] Current time in Sao Paulo: ${currentHHmm}`);

    const parishes = await this.prisma.parish.findMany({
      include: {
        settings: true,
      },
    });

    let totalBatchesCreated = 0;
    let totalFailed = 0;

    for (const parish of parishes) {
      if (!parish.settings) {
        continue;
      }

      const dispatchTime = parish.settings.dispatchTime;
      if (currentHHmm !== dispatchTime) {
        continue;
      }

      console.log(`[Dispatch] Processing parish: ${parish.parishName} (${parish.id})`);

      try {
        const result = await this.processParish(parish, spNow);
        totalBatchesCreated += result.created;
        totalFailed += result.failed;
      } catch (error) {
        console.error(`[Dispatch] Error processing parish ${parish.id}:`, error);
        totalFailed++;
      }
    }

    console.log(`[Dispatch] Completed. Batches created: ${totalBatchesCreated}, Failed: ${totalFailed}`);
  }

  private async processParish(
    parish: any,
    spNow: Date,
  ): Promise<{ created: number; failed: number }> {
    const settings = parish.settings;
    const todayStr = this.formatDateYYYYMMDD(spNow);
    const todayDate = new Date(todayStr + 'T00:00:00.000Z');

    let created = 0;
    let failed = 0;

    if (settings.dispatchScope === DispatchScope.PER_MASS) {
      // Get all distinct mass times for today that have pending intentions
      const pendingIntentions = await this.prisma.requestIntention.findMany({
        where: {
          dispatchedAt: null,
          request: {
            parishId: parish.id,
            status: RequestStatus.SUBMITTED,
            massDate: todayDate,
          },
        },
        include: {
          request: true,
        },
      });

      // Group by mass time
      const massTimesSet = new Set<string>();
      for (const intention of pendingIntentions) {
        massTimesSet.add(intention.request.massTime);
      }

      for (const massTime of massTimesSet) {
        // Check if a SENT batch already exists for this parish+date+time
        const existingBatch = await this.prisma.dispatchBatch.findFirst({
          where: {
            parishId: parish.id,
            massDate: todayDate,
            massTime: massTime,
            status: DispatchStatus.SENT,
          },
        });

        if (existingBatch) {
          console.log(`[Dispatch] Batch already exists for ${parish.parishName} ${todayStr} ${massTime}`);
          continue;
        }

        const result = await this.createBatch(parish, todayDate, massTime, DispatchScope.PER_MASS);
        if (result.success) {
          created++;
        } else {
          failed++;
        }
      }
    } else {
      // PER_DAY: check if a SENT batch already exists for this parish+date (massTime null)
      const existingBatch = await this.prisma.dispatchBatch.findFirst({
        where: {
          parishId: parish.id,
          massDate: todayDate,
          massTime: null,
          status: DispatchStatus.SENT,
        },
      });

      if (existingBatch) {
        console.log(`[Dispatch] Daily batch already exists for ${parish.parishName} ${todayStr}`);
        return { created, failed };
      }

      // Check if there are any pending intentions for today
      const pendingCount = await this.prisma.requestIntention.count({
        where: {
          dispatchedAt: null,
          request: {
            parishId: parish.id,
            status: RequestStatus.SUBMITTED,
            massDate: todayDate,
          },
        },
      });

      if (pendingCount === 0) {
        console.log(`[Dispatch] No pending intentions for ${parish.parishName} ${todayStr}`);
        return { created, failed };
      }

      const result = await this.createBatch(parish, todayDate, null, DispatchScope.PER_DAY);
      if (result.success) {
        created++;
      } else {
        failed++;
      }
    }

    return { created, failed };
  }

  private async createBatch(
    parish: any,
    massDate: Date,
    massTime: string | null,
    scope: DispatchScope,
  ): Promise<{ success: boolean }> {
    const dateStr = this.formatDateYYYYMMDD(massDate);
    const timeStr = massTime ? massTime.replace(':', '') : 'consolidado';

    try {
      // Fetch all pending intentions
      const whereClause: any = {
        dispatchedAt: null,
        request: {
          parishId: parish.id,
          status: RequestStatus.SUBMITTED,
          massDate: massDate,
        },
      };

      if (massTime !== null) {
        whereClause.request.massTime = massTime;
      }

      const intentions = await this.prisma.requestIntention.findMany({
        where: whereClause,
        include: {
          request: true,
          intentionType: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      if (intentions.length === 0) {
        console.log(`[Dispatch] No intentions found for batch ${parish.parishName} ${dateStr} ${timeStr}`);
        return { success: true };
      }

      // Check if parish has dispatch emails configured
      if (!parish.dispatchEmails || parish.dispatchEmails.length === 0) {
        await this.prisma.dispatchBatch.create({
          data: {
            parishId: parish.id,
            scope: scope,
            massDate: massDate,
            massTime: massTime,
            pdfStorageKey: '',
            sentToEmails: [],
            sentAt: new Date(),
            status: DispatchStatus.FAILED,
            errorMessage: 'No dispatch emails configured',
          },
        });
        console.error(`[Dispatch] No dispatch emails configured for parish ${parish.parishName}`);
        return { success: false };
      }

      // Group intentions by group
      const grouped: Record<string, typeof intentions> = {
        [IntentionGroup.SUFRAGIO]: [],
        [IntentionGroup.SUPLICAS]: [],
        [IntentionGroup.ACAO_DE_GRACAS]: [],
      };

      for (const intention of intentions) {
        const group = intention.group;
        if (grouped[group]) {
          grouped[group].push(intention);
        }
      }

      // Try to get logo buffer if parish has a logo stored
      let logoBuffer: Buffer | null = null;
      if (parish.logoStorageKey) {
        try {
          logoBuffer = await this.storageService.download(parish.logoStorageKey);
        } catch (error) {
          console.warn(`[Dispatch] Could not download logo for parish ${parish.parishName}:`, error);
        }
      }

      // Generate PDF
      const pdfData = {
        parishName: parish.parishName,
        massDate: dateStr,
        massTime: massTime,
        logoBuffer: logoBuffer,
        intentions: grouped,
      };

      const pdfBuffer = await this.pdfService.generatePdf(pdfData);

      // Upload PDF to storage
      const storageKey = `dispatches/${parish.id}/${dateStr.replace(/-/g, '')}/${timeStr}.pdf`;
      await this.storageService.upload(storageKey, pdfBuffer, 'application/pdf');

      // Send email with PDF attachment
      const formattedDate = this.formatDateDDMMYYYY(massDate);
      const subject = massTime
        ? `Intenções da Missa - ${parish.parishName} - ${formattedDate} ${massTime}`
        : `Intenções da Missa - ${parish.parishName} - ${formattedDate} (Consolidado)`;

      const pdfFilename = massTime
        ? `intencoes_${dateStr.replace(/-/g, '')}_${massTime.replace(':', '')}.pdf`
        : `intencoes_${dateStr.replace(/-/g, '')}_consolidado.pdf`;

      await this.emailService.sendDispatchEmail(
        parish.dispatchEmails,
        subject,
        pdfBuffer,
        pdfFilename,
      );

      // Create DispatchBatch record with SENT status
      const batch = await this.prisma.dispatchBatch.create({
        data: {
          parishId: parish.id,
          scope: scope,
          massDate: massDate,
          massTime: massTime,
          pdfStorageKey: storageKey,
          sentToEmails: parish.dispatchEmails,
          sentAt: new Date(),
          status: DispatchStatus.SENT,
        },
      });

      // Update all RequestIntention records: set dispatchedAt and dispatchBatchId
      const intentionIds = intentions.map((i) => i.id);
      await this.prisma.requestIntention.updateMany({
        where: {
          id: { in: intentionIds },
        },
        data: {
          dispatchedAt: new Date(),
          dispatchBatchId: batch.id,
        },
      });

      console.log(
        `[Dispatch] Successfully dispatched batch for ${parish.parishName} ${dateStr} ${timeStr} (${intentions.length} intentions)`,
      );
      return { success: true };
    } catch (error: any) {
      console.error(`[Dispatch] Error creating batch for ${parish.parishName} ${dateStr} ${timeStr}:`, error);

      // Create batch with FAILED status
      try {
        await this.prisma.dispatchBatch.create({
          data: {
            parishId: parish.id,
            scope: scope,
            massDate: massDate,
            massTime: massTime,
            pdfStorageKey: '',
            sentToEmails: [],
            sentAt: new Date(),
            status: DispatchStatus.FAILED,
            errorMessage: error.message || 'Unknown error',
          },
        });
      } catch (dbError) {
        console.error(`[Dispatch] Failed to record error batch:`, dbError);
      }

      return { success: false };
    }
  }

  private formatDateYYYYMMDD(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatDateDDMMYYYY(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${day}/${month}/${year}`;
  }
}
