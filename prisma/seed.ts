import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const demoPrizes = [
  { name: 'Birra Gratis', emoji: '🍺', probability: 50, description: 'Una birra omaggio' },
  { name: 'Riprova', emoji: '😢', probability: 50, description: 'Riprova la prossima volta' }
];

async function main() {
  const store = await prisma.store.upsert({
    where: { slug: 'bar-giorgio' },
    update: {},
    create: {
      name: 'Bar da Giorgio',
      slug: 'bar-giorgio',
      email: 'bar@giorgio.it',
      active: true
    }
  });

  await prisma.campaign.upsert({
    where: {
      storeId_slug: {
        storeId: store.id,
        slug: 'birra-gratis'
      }
    },
    update: {},
    create: {
      storeId: store.id,
      name: 'Birra Gratis',
      slug: 'birra-gratis',
      description: 'Gratta e vinci una birra gratis!',
      prizes: demoPrizes,
      active: true,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2026-12-31'),
      maxPlaysPerUser: 1
    }
  });

  console.log('Seed completato: store bar-giorgio, campagna birra-gratis');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
