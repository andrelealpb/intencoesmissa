import { Prisma } from '@prisma/client';
import { ReminderService } from './reminder.service';
import type { MessageProvider } from './message-provider';

// Provider fake — conta envios sem tocar em rede.
function fakeProvider(): MessageProvider & { sent: string[] } {
  const sent: string[] = [];
  return {
    name: 'fake',
    sent,
    async sendText(target, message) {
      sent.push(`${target.to}:${message.slice(0, 12)}`);
    },
  };
}

const PARISH = {
  id: 'p1',
  slug: 'paroquia',
  parishName: 'Paroquia Teste',
  zapiInstanceId: 'inst',
  zapiToken: 'tok',
  zapiClientToken: null,
  settings: {
    reminderEveHour: 18,
    reminderSameDayHoursBefore: 3,
    reminderGroupSummaryDaysBefore: 3,
  },
};

// Uma escala publicada para a missa de 2026-07-12 10:00.
function assignmentRows(over: Record<string, unknown> = {}) {
  return [
    {
      id: 'a1',
      occurrence: {
        id: 'o1',
        date: new Date('2026-07-12T00:00:00.000Z'),
        time: '10:00',
      },
      team: { id: 't1', name: 'Coroinhas', whatsappGroupId: 'grp1' },
      function: { name: 'Cruz' },
      member: { id: 'm1', fullName: 'Ana Maria', phone: '11999990000' },
      ...over,
    },
  ];
}

// Mock Prisma com um índice único (kind, targetKey) simulado no reminderLog.
function mockPrisma(assignments: unknown[]) {
  const logKeys = new Set<string>();
  const create = jest.fn(async ({ data }: { data: any }) => {
    const key = `${data.kind}|${data.targetKey}`;
    if (logKeys.has(key)) {
      throw new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '5.x',
      });
    }
    logKeys.add(key);
    return { id: `log:${key}` };
  });
  return {
    _logKeys: logKeys,
    parish: { findMany: jest.fn().mockResolvedValue([PARISH]) },
    assignment: { findMany: jest.fn().mockResolvedValue(assignments) },
    reminderLog: { create, update: jest.fn().mockResolvedValue({}) },
  } as any;
}

// 2026-07-09 09:00 em SP → 3 dias antes da missa → só GROUP_SUMMARY.
const GROUP_NOW = () => new Date('2026-07-09T12:00:00.000Z');

describe('ReminderService', () => {
  it('idempotência: reprocessar o mesmo tick NÃO reenvia', async () => {
    const prisma = mockPrisma(assignmentRows());
    const provider = fakeProvider();
    const service = new ReminderService(prisma, provider, 'https://portal', GROUP_NOW);

    await service.checkAndRemind();
    await service.checkAndRemind(); // mesmo tick de novo

    // Só 1 envio no total (o 2º create colide em P2002 → pula).
    expect(provider.sent).toHaveLength(1);
    expect(prisma.reminderLog.create).toHaveBeenCalledTimes(2);
  });

  it('grava o ReminderLog antes de enviar (claim-then-send)', async () => {
    const prisma = mockPrisma(assignmentRows());
    const provider = fakeProvider();
    const service = new ReminderService(prisma, provider, 'https://portal', GROUP_NOW);

    await service.checkAndRemind();

    expect(prisma.reminderLog.create).toHaveBeenCalledTimes(1);
    const arg = prisma.reminderLog.create.mock.calls[0][0].data;
    expect(arg.kind).toBe('GROUP_SUMMARY');
    expect(arg.targetKey).toBe('t1:2026-07-12');
  });

  it('degradação graciosa: falha de envio rebaixa o log e não trava', async () => {
    const prisma = mockPrisma(assignmentRows());
    const provider = fakeProvider();
    provider.sendText = jest.fn().mockRejectedValue(new Error('z-api 500'));
    const service = new ReminderService(prisma, provider, 'https://portal', GROUP_NOW);

    await expect(service.checkAndRemind()).resolves.toBeUndefined();
    // O log foi rebaixado (success=false) e o tick concluiu.
    expect(prisma.reminderLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ success: false }) }),
    );
  });

  it('sem grupo de WhatsApp → resumo é pulado SEM registrar (retenta depois)', async () => {
    const prisma = mockPrisma(
      assignmentRows({ team: { id: 't1', name: 'Coroinhas', whatsappGroupId: null } }),
    );
    const provider = fakeProvider();
    const service = new ReminderService(prisma, provider, 'https://portal', GROUP_NOW);

    await service.checkAndRemind();

    expect(provider.sent).toHaveLength(0);
    expect(prisma.reminderLog.create).not.toHaveBeenCalled();
  });

  it('só paróquias com remindersEnabled entram na query (gate R1)', async () => {
    const prisma = mockPrisma(assignmentRows());
    const provider = fakeProvider();
    const service = new ReminderService(prisma, provider, 'https://portal', GROUP_NOW);

    await service.checkAndRemind();

    const where = prisma.parish.findMany.mock.calls[0][0].where;
    expect(where.settings).toEqual({ remindersEnabled: true });
  });

  it('só busca assignments PUBLICADOS e não recusados/cancelados', async () => {
    const prisma = mockPrisma(assignmentRows());
    const provider = fakeProvider();
    const service = new ReminderService(prisma, provider, 'https://portal', GROUP_NOW);

    await service.checkAndRemind();

    const where = prisma.assignment.findMany.mock.calls[0][0].where;
    expect(where.publishedAt).toEqual({ not: null });
    expect(where.status.notIn).toEqual(
      expect.arrayContaining(['DECLINED', 'CANCELLED']),
    );
  });
});
