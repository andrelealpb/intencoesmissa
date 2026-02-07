import { PrismaClient } from '@prisma/client';
import PgBoss from 'pg-boss';
import { DispatchService } from './dispatch.service';
import { StorageService } from './storage.service';
import { EmailService } from './email.service';

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();
  console.log('Prisma connected');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const boss = new PgBoss(databaseUrl);

  const storageService = new StorageService();
  const emailService = new EmailService();
  const dispatchService = new DispatchService(prisma, storageService, emailService);

  await boss.start();
  console.log('PgBoss started');

  await boss.schedule('check-dispatches', '* * * * *');
  console.log('Scheduled check-dispatches job every 1 minute');

  await boss.work('check-dispatches', async () => {
    console.log(`[${new Date().toISOString()}] Running check-dispatches job`);
    try {
      await dispatchService.checkAndDispatch();
    } catch (error) {
      console.error('Error in check-dispatches job:', error);
      throw error;
    }
  });

  console.log('Worker started, checking dispatches every minute');

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    try {
      await boss.stop({ graceful: true, timeout: 10000 });
      console.log('PgBoss stopped');
      await prisma.$disconnect();
      console.log('Prisma disconnected');
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('Worker failed to start:', error);
  process.exit(1);
});
