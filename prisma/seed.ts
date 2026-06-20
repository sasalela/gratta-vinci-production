import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

async function main() {
  const store = await prisma.store.upsert({
    where: { slug: 'bar-giorgio' },
    update: {},
    create: {
      name: 'Bar da Giorgio',
      slug: 'bar-giorgio',
      email: 'bar@giorgio.it',
      primaryColor: '#667eea',
      secondaryColor: '#764ba2',
      subscriptionExpiresAt: new Date('2026-12-31'),
      active: true
    }
  });

  await prisma.user.upsert({
    where: { email: 'bar@giorgio.it' },
    update: {
      storeId: store.id,
      active: true
    },
    create: {
      email: 'bar@giorgio.it',
      passwordHash: hashPassword('password123'),
      name: 'Bar da Giorgio',
      role: 'store_owner',
      storeId: store.id,
      active: true
    }
  });

  const campaign = await prisma.campaign.upsert({
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
      prizes: [],
      gameType: 'scratch_card',
      customerFields: [
        { key: 'name', label: 'Nome', required: true, enabled: true },
        { key: 'email', label: 'Email', required: true, enabled: true },
        { key: 'phone', label: 'Telefono', required: false, enabled: true },
        { key: 'marketingConsent', label: 'Consenso marketing', required: false, enabled: true }
      ],
      playLimitMode: 'per_campaign',
      loseMessage: 'Nessun premio questa volta.',
      voucherValidityDays: 15,
      active: true,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2026-12-31'),
      maxPlaysPerUser: 1
    }
  });

  await prisma.prize.upsert({
    where: { id: 'demo-prize-birra-gratis' },
    update: {
      campaignId: campaign.id,
      name: 'Birra Gratis',
      emoji: '🍺',
      description: 'Una birra omaggio',
      winProbability: 50,
      totalQuantity: 10,
      active: true
    },
    create: {
      id: 'demo-prize-birra-gratis',
      campaignId: campaign.id,
      name: 'Birra Gratis',
      emoji: '🍺',
      description: 'Una birra omaggio',
      winProbability: 50,
      totalQuantity: 10,
      remainingQuantity: 10,
      active: true
    }
  });

  console.log('Seed completato: store bar-giorgio, utente negozio, campagna e premi demo');
  console.log('Login negozio demo: bar@giorgio.it / password123');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
