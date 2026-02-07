import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...\n');

  // ─── 1. Parish ──────────────────────────────────────────
  console.log('Creating parish...');
  const parish = await prisma.parish.upsert({
    where: { slug: 'santanna-sao-joaquim' },
    update: {},
    create: {
      slug: 'santanna-sao-joaquim',
      parishName: "Paróquia Sant'Anna e São Joaquim",
      dispatchEmails: ['padre@example.com', 'secretaria@example.com'],
      addressJson: {
        street: 'Rua da Matriz',
        number: '100',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zip: '01000-000',
      },
      phonesJson: [
        { label: 'Secretaria', number: '(11) 3333-4444' },
        { label: 'Padre', number: '(11) 99999-8888' },
      ],
    },
  });
  console.log(`  Parish created: ${parish.parishName} (${parish.id})`);

  // ─── 2. Parish Settings ─────────────────────────────────
  console.log('Creating parish settings...');
  const settings = await prisma.parishSettings.upsert({
    where: { parishId: parish.id },
    update: {},
    create: {
      parishId: parish.id,
      maxIntentionsPerRequest: 3,
      dispatchTime: '18:00',
      dispatchScope: 'PER_MASS',
    },
  });
  console.log(`  Settings created: maxIntentions=${settings.maxIntentionsPerRequest}, dispatchTime=${settings.dispatchTime}, scope=${settings.dispatchScope}`);

  // ─── 3. Mass Schedules ──────────────────────────────────
  console.log('Creating mass schedules...');
  const schedules = [
    { weekday: 0, time: '08:00' },
    { weekday: 0, time: '10:00' },
    { weekday: 0, time: '18:00' },
    { weekday: 3, time: '19:00' },
    { weekday: 5, time: '19:00' },
    { weekday: 6, time: '18:00' },
  ];

  for (const schedule of schedules) {
    const existing = await prisma.massSchedule.findFirst({
      where: {
        parishId: parish.id,
        weekday: schedule.weekday,
        time: schedule.time,
      },
    });

    if (!existing) {
      await prisma.massSchedule.create({
        data: {
          parishId: parish.id,
          weekday: schedule.weekday,
          time: schedule.time,
        },
      });
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    console.log(`  Schedule: ${dayNames[schedule.weekday]} (${schedule.weekday}) at ${schedule.time}`);
  }

  // ─── 4. Intention Types ─────────────────────────────────
  console.log('Creating intention types...');

  const intentionTypesData = [
    // SUFRAGIO
    { group: 'SUFRAGIO' as const, name: '7º Dia', requiresDeceasedName: true, opensOptionalNotes: true, requiresFamilyNames: false, requiresComplement: false },
    { group: 'SUFRAGIO' as const, name: '30º Dia', requiresDeceasedName: true, opensOptionalNotes: true, requiresFamilyNames: false, requiresComplement: false },
    { group: 'SUFRAGIO' as const, name: '1 Ano', requiresDeceasedName: true, opensOptionalNotes: true, requiresFamilyNames: false, requiresComplement: false },
    { group: 'SUFRAGIO' as const, name: 'Falecidos das Famílias', requiresDeceasedName: false, opensOptionalNotes: false, requiresFamilyNames: true, requiresComplement: false },
    { group: 'SUFRAGIO' as const, name: 'Outras Datas', requiresDeceasedName: true, opensOptionalNotes: true, requiresFamilyNames: false, requiresComplement: false },
    // SUPLICAS
    { group: 'SUPLICAS' as const, name: 'Saúde', requiresDeceasedName: false, opensOptionalNotes: false, requiresFamilyNames: false, requiresComplement: true },
    { group: 'SUPLICAS' as const, name: 'Emprego', requiresDeceasedName: false, opensOptionalNotes: false, requiresFamilyNames: false, requiresComplement: true },
    { group: 'SUPLICAS' as const, name: 'Família', requiresDeceasedName: false, opensOptionalNotes: false, requiresFamilyNames: false, requiresComplement: true },
    { group: 'SUPLICAS' as const, name: 'Vocações', requiresDeceasedName: false, opensOptionalNotes: false, requiresFamilyNames: false, requiresComplement: false },
    { group: 'SUPLICAS' as const, name: 'Paz no Mundo', requiresDeceasedName: false, opensOptionalNotes: false, requiresFamilyNames: false, requiresComplement: false },
    // ACAO_DE_GRACAS
    { group: 'ACAO_DE_GRACAS' as const, name: 'Aniversário', requiresDeceasedName: false, opensOptionalNotes: false, requiresFamilyNames: false, requiresComplement: true },
    { group: 'ACAO_DE_GRACAS' as const, name: 'Casamento', requiresDeceasedName: false, opensOptionalNotes: false, requiresFamilyNames: false, requiresComplement: true },
    { group: 'ACAO_DE_GRACAS' as const, name: 'Conquista', requiresDeceasedName: false, opensOptionalNotes: false, requiresFamilyNames: false, requiresComplement: true },
    { group: 'ACAO_DE_GRACAS' as const, name: 'Graça Alcançada', requiresDeceasedName: false, opensOptionalNotes: false, requiresFamilyNames: false, requiresComplement: false },
  ];

  const createdIntentionTypes: Record<string, string> = {};

  for (const typeData of intentionTypesData) {
    const existing = await prisma.intentionType.findFirst({
      where: {
        parishId: parish.id,
        group: typeData.group,
        name: typeData.name,
      },
    });

    let intentionType;
    if (existing) {
      intentionType = existing;
    } else {
      intentionType = await prisma.intentionType.create({
        data: {
          parishId: parish.id,
          group: typeData.group,
          name: typeData.name,
          requiresDeceasedName: typeData.requiresDeceasedName,
          requiresFamilyNames: typeData.requiresFamilyNames,
          opensOptionalNotes: typeData.opensOptionalNotes,
          requiresComplement: typeData.requiresComplement,
        },
      });
    }

    createdIntentionTypes[`${typeData.group}:${typeData.name}`] = intentionType.id;
    console.log(`  IntentionType: [${typeData.group}] ${typeData.name}`);
  }

  // ─── 5. Emoluments ──────────────────────────────────────
  console.log('Creating emoluments...');

  // DEFAULT scope emolument
  const existingDefault = await prisma.emolument.findFirst({
    where: { parishId: parish.id, scope: 'DEFAULT' },
  });
  if (!existingDefault) {
    await prisma.emolument.create({
      data: {
        parishId: parish.id,
        scope: 'DEFAULT',
        suggestedValue: 20.0,
      },
    });
  }
  console.log('  Emolument: DEFAULT scope -> R$ 20.00');

  // GROUP SUFRAGIO emolument
  const existingSufragio = await prisma.emolument.findFirst({
    where: { parishId: parish.id, scope: 'GROUP', group: 'SUFRAGIO' },
  });
  if (!existingSufragio) {
    await prisma.emolument.create({
      data: {
        parishId: parish.id,
        scope: 'GROUP',
        group: 'SUFRAGIO',
        suggestedValue: 30.0,
      },
    });
  }
  console.log('  Emolument: GROUP SUFRAGIO -> R$ 30.00');

  // GROUP SUPLICAS emolument
  const existingSuplicas = await prisma.emolument.findFirst({
    where: { parishId: parish.id, scope: 'GROUP', group: 'SUPLICAS' },
  });
  if (!existingSuplicas) {
    await prisma.emolument.create({
      data: {
        parishId: parish.id,
        scope: 'GROUP',
        group: 'SUPLICAS',
        suggestedValue: 15.0,
      },
    });
  }
  console.log('  Emolument: GROUP SUPLICAS -> R$ 15.00');

  // ─── 6. Super Admin User ───────────────────────────────
  console.log('Creating super admin user...');
  const superAdminPassword = await bcrypt.hash('Admin@123', 10);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@missas.com' },
    update: {},
    create: {
      email: 'superadmin@missas.com',
      passwordHash: superAdminPassword,
      role: 'SUPER_ADMIN',
    },
  });
  console.log(`  Super Admin: ${superAdmin.email} (${superAdmin.id})`);

  // ─── 7. Parish Admin User ──────────────────────────────
  console.log('Creating parish admin user...');
  const parishAdminPassword = await bcrypt.hash('Admin@123', 10);
  const parishAdmin = await prisma.user.upsert({
    where: { email: 'admin@santanna.com' },
    update: {},
    create: {
      email: 'admin@santanna.com',
      passwordHash: parishAdminPassword,
      role: 'PARISH_ADMIN',
      parishId: parish.id,
    },
  });
  console.log(`  Parish Admin: ${parishAdmin.email} (${parishAdmin.id})`);

  console.log('\nSeed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
