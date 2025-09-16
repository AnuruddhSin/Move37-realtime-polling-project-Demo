const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password', 10);
  let alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      name: 'Alice',
      email: 'alice@example.com',
      passwordHash,
      role: 'ADMIN'
    }
  });

  const poll = await prisma.poll.upsert({
    where: { id: 1 },
    update: {},
    create: {
      question: 'Which is your favorite color?',
      isPublished: true,
      isClosed: false,
      publishAt: new Date(),
      creator: { connect: { id: alice.id } },
      options: {
        create: [
          { text: 'Red' },
          { text: 'Green' },
          { text: 'Blue' }
        ]
      }
    }
  });

  console.log('Seeded:', { aliceId: alice.id, pollId: poll.id });
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });