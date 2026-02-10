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
    const currentMinutes = spNow.getHours() * 60 + spNow.getMinutes();
    const todayStr = this.formatDateYYYYMMDD(spNow);
    const todayDate = new Date(todayStr + 'T00:00:00.000Z');
    const weekday = spNow.getDay();

    console.log(`[Dispatch] Current time in Sao Paulo: ${spNow.toTimeString().slice(0, 5)}`);

    const parishes = await this.prisma.parish.findMany({
      include: {
        settings: true,
        massSchedules: { where: { isActive: true } },
        massExceptions: { where: { date: todayDate, isActive: true } },
      },
    });

    let totalBatchesCreated = 0;
    let totalFailed = 0;

    for (const parish of parishes) {
      if (!parish.settings) continue;

      const minutesBefore = parish.settings.dispatchMinutesBefore ?? 30;

      // Determine today's masses for this parish
      let massTimes: string[];
      if (parish.massExceptions.length > 0) {
        massTimes = parish.massExceptions.map((e: any) => e.time);
      } else {
        massTimes = parish.massSchedules
          .filter((s: any) => s.weekday === weekday)
          .map((s: any) => s.time);
      }

      // Check each mass: dispatch if current time = massTime - minutesBefore
      for (const massTime of massTimes) {
        const [h, m] = massTime.split(':').map(Number);
        const massMinutes = h * 60 + m;
        const dispatchAt = massMinutes - minutesBefore;

        if (currentMinutes !== dispatchAt) continue;

        console.log(`[Dispatch] Time to dispatch for ${parish.parishName} mass at ${massTime}`);

        try {
          const result = await this.processParishMass(parish, todayDate, massTime);
          if (result.success) totalBatchesCreated++;
          else totalFailed++;
        } catch (error) {
          console.error(`[Dispatch] Error processing parish ${parish.id} mass ${massTime}:`, error);
          totalFailed++;
        }
      }
    }

    console.log(`[Dispatch] Completed. Batches created: ${totalBatchesCreated}, Failed: ${totalFailed}`);
  }

  private async processParishMass(
    parish: any,
    massDate: Date,
    massTime: string,
  ): Promise<{ success: boolean }> {
    // Check if already dispatched
    const existingBatch = await this.prisma.dispatchBatch.findFirst({
      where: {
        parishId: parish.id,
        massDate,
        massTime,
        status: DispatchStatus.SENT,
      },
    });

    if (existingBatch) {
      console.log(`[Dispatch] Batch already exists for ${parish.parishName} ${massTime}`);
      return { success: true };
    }

    return this.createBatch(parish, massDate, massTime, DispatchScope.PER_MASS);
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
        console.log(`[Dispatch] No intentions for ${parish.parishName} ${dateStr} ${timeStr}. Closing mass.`);
        // Create SENT batch with no PDF to "close" the mass (block new intentions)
        await this.prisma.dispatchBatch.create({
          data: {
            parishId: parish.id,
            scope: scope,
            massDate: massDate,
            massTime: massTime,
            pdfStorageKey: '',
            sentToEmails: parish.dispatchEmails || [],
            sentAt: new Date(),
            status: DispatchStatus.SENT,
          },
        });
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
