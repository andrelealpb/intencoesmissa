import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import { IntentionGroup } from '@prisma/client';

interface IntentionItem {
  id: string;
  group: IntentionGroup;
  deceasedName: string | null;
  familyNames: string | null;
  complement: string | null;
  notes: string | null;
  intentionType: {
    name: string;
    group: IntentionGroup;
  };
}

interface NoticeItem {
  subject: string;
  description: string;
}

interface PdfData {
  parishName: string;
  massDate: string; // YYYY-MM-DD
  massTime: string | null;
  logoBuffer: Buffer | null;
  intentions: Record<string, IntentionItem[]>;
  notices?: NoticeItem[];
}

const GROUP_LABELS: Record<string, string> = {
  [IntentionGroup.SUFRAGIO]: 'Sufr\u00e1gio',
  [IntentionGroup.SUPLICAS]: 'S\u00faplicas',
  [IntentionGroup.ACAO_DE_GRACAS]: 'A\u00e7\u00e3o de Gra\u00e7as',
};

const GROUP_ORDER: IntentionGroup[] = [
  IntentionGroup.SUFRAGIO,
  IntentionGroup.SUPLICAS,
  IntentionGroup.ACAO_DE_GRACAS,
];

export class PdfService {
  async generatePdf(data: PdfData): Promise<Buffer> {
    // Calculate total line count to decide font size and capping
    let totalLines = 0;
    const groupCounts: Record<string, number> = {};

    for (const group of GROUP_ORDER) {
      const items = data.intentions[group] || [];
      if (items.length > 0) {
        totalLines += 2; // section title + spacing
        totalLines += items.length;
        groupCounts[group] = items.length;
      }
    }

    // Header lines (parish name, date, title, separator)
    totalLines += 6;

    let fontSize = 11;
    let maxItemsPerSection = Infinity;

    if (totalLines > 45) {
      fontSize = 9;
      maxItemsPerSection = 15;
    } else if (totalLines > 35) {
      fontSize = 10;
    }

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      bufferPages: true,
    });

    const passThrough = new PassThrough();
    const chunks: Buffer[] = [];

    passThrough.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.pipe(passThrough);

    // ── Header ──────────────────────────────────────────

    let headerY = 50;

    // Logo
    if (data.logoBuffer) {
      try {
        doc.image(data.logoBuffer, 50, headerY, { width: 50, height: 50 });
      } catch (error) {
        console.warn('[PDF] Could not render logo image:', error);
      }
    }

    // Parish name centered
    doc.font('Helvetica-Bold').fontSize(14);
    doc.text(data.parishName, 50, headerY, {
      align: 'center',
      width: 495,
    });
    headerY = doc.y + 10;

    // Date and time line
    const formattedDate = this.formatDateBR(data.massDate);
    const dateTimeLine = data.massTime
      ? `Data: ${formattedDate}  Hor\u00e1rio: ${data.massTime}`
      : `Data: ${formattedDate} (Consolidado)`;

    doc.font('Helvetica').fontSize(fontSize);
    doc.text(dateTimeLine, 50, headerY, {
      align: 'center',
      width: 495,
    });
    headerY = doc.y + 8;

    // Title
    doc.font('Helvetica-Bold').fontSize(12);
    doc.text('Inten\u00e7\u00f5es da Santa Missa', 50, headerY, {
      align: 'center',
      width: 495,
    });
    headerY = doc.y + 8;

    // Horizontal line separator
    doc.moveTo(50, headerY).lineTo(545, headerY).lineWidth(1).stroke();
    headerY += 12;

    doc.y = headerY;

    // ── Intention Groups ────────────────────────────────

    for (const group of GROUP_ORDER) {
      const items = data.intentions[group] || [];
      if (items.length === 0) {
        continue;
      }

      const label = GROUP_LABELS[group];
      const displayCount = items.length;

      // Section title with count
      doc.font('Helvetica-Bold').fontSize(fontSize);
      doc.text(`${label} (${displayCount})`, 50, doc.y, { width: 495 });
      doc.moveDown(0.3);

      // Determine items to display
      const displayItems = maxItemsPerSection < items.length
        ? items.slice(0, maxItemsPerSection)
        : items;
      const hiddenCount = items.length - displayItems.length;

      doc.font('Helvetica').fontSize(fontSize);

      for (const item of displayItems) {
        if (doc.y > 750) {
          // Safety: stop adding items if near page bottom
          break;
        }

        const bulletText = this.formatIntentionBullet(item);
        doc.text(`  \u2022 ${bulletText}`, 60, doc.y, { width: 475 });
        doc.moveDown(0.15);
      }

      if (hiddenCount > 0) {
        doc.font('Helvetica-Oblique').fontSize(fontSize - 1);
        doc.text(`  (+${hiddenCount} n\u00e3o exibidas)`, 60, doc.y, { width: 475 });
        doc.font('Helvetica').fontSize(fontSize);
      }

      doc.moveDown(0.5);
    }

    // ── Notices (Avisos) ────────────────────────────────

    if (data.notices && data.notices.length > 0 && doc.y < 740) {
      doc.fillColor('black');
      doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).stroke();
      doc.moveDown(0.4);

      doc.font('Helvetica-Bold').fontSize(fontSize);
      doc.text('Avisos', 50, doc.y, { width: 495 });
      doc.moveDown(0.3);

      doc.font('Helvetica').fontSize(fontSize - 1);
      for (const notice of data.notices) {
        if (doc.y > 760) break;
        doc.font('Helvetica-Bold').fontSize(fontSize - 1);
        doc.text(`${notice.subject}:`, 60, doc.y, { width: 475, continued: true });
        doc.font('Helvetica').fontSize(fontSize - 1);
        const descText = notice.description.length > 200
          ? notice.description.substring(0, 197) + '...'
          : notice.description;
        doc.text(` ${descText}`, { width: 475 });
        doc.moveDown(0.2);
      }
    }

    // ── Footer ──────────────────────────────────────────

    const now = new Date();
    const spNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const footerDate = this.formatDateTimeBR(spNow);

    doc.fillColor('gray');
    doc.font('Helvetica').fontSize(8);
    doc.text(`Gerado em ${footerDate}`, 50, 790, {
      align: 'center',
      width: 495,
    });

    // ── Finalize ────────────────────────────────────────

    doc.end();

    return new Promise<Buffer>((resolve, reject) => {
      passThrough.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      passThrough.on('error', reject);
    });
  }

  private formatIntentionBullet(item: IntentionItem): string {
    const typeName = item.intentionType.name;
    const parts: string[] = [typeName];

    if (item.group === IntentionGroup.SUFRAGIO) {
      if (item.deceasedName) {
        parts.push(item.deceasedName);
      }
      if (item.familyNames) {
        parts.push(item.familyNames);
      }
      if (item.notes) {
        parts.push(item.notes);
      }
    } else {
      // SUPLICAS or ACAO_DE_GRACAS
      if (item.complement) {
        parts.push(item.complement);
      }
    }

    let text = parts.join(' - ');
    if (text.length > 80) {
      text = text.substring(0, 77) + '...';
    }
    return text;
  }

  private formatDateBR(dateStr: string): string {
    // dateStr is YYYY-MM-DD
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  }

  private formatDateTimeBR(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }
}
