import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting ReachInbox Database Seed...');

  // 1. Create or update Demo User
  const user = await prisma.user.upsert({
    where: { email: 'alex.morgan@reachinbox.ai' },
    update: {},
    create: {
      email: 'alex.morgan@reachinbox.ai',
      name: 'Alex Morgan',
      googleId: 'google-seed-user-12345',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250',
    },
  });

  console.log(`👤 User created/verified: ${user.name} (${user.email})`);

  // 2. Default Sender
  await prisma.emailSender.upsert({
    where: { id: `default-sender-${user.id}` },
    update: {},
    create: {
      id: `default-sender-${user.id}`,
      userId: user.id,
      email: user.email,
      name: user.name,
      provider: 'ethereal',
      isActive: true,
    },
  });

  // 3. Email Campaign
  const campaign = await prisma.emailCampaign.upsert({
    where: { id: `seed-campaign-${user.id}` },
    update: {},
    create: {
      id: `seed-campaign-${user.id}`,
      userId: user.id,
      name: 'Q4 High-Growth SaaS Outreach',
      subject: 'Question regarding your email dispatch infrastructure',
      body: '<p>Hi there,<br><br>I noticed your recent announcement and wanted to connect regarding your email delivery pipeline.<br><br>Best regards,<br>Alex Morgan</p>',
      totalRecipients: 6,
      startTime: new Date(Date.now() - 3600000), // 1 hour ago
      delayBetweenEmails: 2000,
      hourlyLimit: 200,
      status: 'PROCESSING',
    },
  });

  console.log(`📋 Campaign created: ${campaign.name}`);

  // 4. Clean previous seed emails
  await prisma.email.deleteMany({
    where: {
      userId: user.id,
      idempotencyKey: { startsWith: 'seed-email-' },
    },
  });

  const now = Date.now();

  // Create Sent Emails with Ethereal preview links
  const sentEmailsData = [
    {
      id: 'seed-email-sent-1',
      recipientEmail: 'elena.rostova@fintech-core.com',
      subject: 'Question regarding your email dispatch infrastructure',
      body: '<p>Hi Elena, saw the new FinTech Core launch! How are you handling dispatch concurrency?</p>',
      scheduledAt: new Date(now - 1800000),
      sentAt: new Date(now - 1795000),
      status: 'SENT' as any,
      messageId: '<01a7b8e9-44d2-4321-a123-556677889901@ethereal.email>',
      previewUrl: 'https://ethereal.email/message/WaQKMgKddxQDoou...preview1',
      idempotencyKey: 'seed-email-sent-1',
    },
    {
      id: 'seed-email-sent-2',
      recipientEmail: 'david.kim@quantumleap.tech',
      subject: 'Question regarding your email dispatch infrastructure',
      body: '<p>Hi David, congratulations on QuantumLeap Series B funding!</p>',
      scheduledAt: new Date(now - 1200000),
      sentAt: new Date(now - 1194000),
      status: 'SENT' as any,
      messageId: '<02b8c9f0-55e3-5432-b234-667788990012@ethereal.email>',
      previewUrl: 'https://ethereal.email/message/WaQKMgKddxQDoou...preview2',
      idempotencyKey: 'seed-email-sent-2',
    },
    {
      id: 'seed-email-sent-3',
      recipientEmail: 'sarah.connor@cyberdyne.io',
      subject: 'Question regarding your email dispatch infrastructure',
      body: '<p>Hi Sarah, would love to share how ReachInbox manages persistent BullMQ email pipelines.</p>',
      scheduledAt: new Date(now - 600000),
      sentAt: new Date(now - 597000),
      status: 'SENT' as any,
      messageId: '<03c9d0a1-66f4-6543-c345-778899001123@ethereal.email>',
      previewUrl: 'https://ethereal.email/message/WaQKMgKddxQDoou...preview3',
      idempotencyKey: 'seed-email-sent-3',
    },
  ];

  for (const item of sentEmailsData) {
    await prisma.email.create({
      data: {
        id: item.id,
        userId: user.id,
        campaignId: campaign.id,
        senderEmail: user.email,
        recipientEmail: item.recipientEmail,
        subject: item.subject,
        body: item.body,
        scheduledAt: item.scheduledAt,
        sentAt: item.sentAt,
        status: item.status,
        messageId: item.messageId,
        previewUrl: item.previewUrl,
        idempotencyKey: item.idempotencyKey,
      },
    });
  }

  // Create Scheduled Future Emails
  const scheduledEmailsData = [
    {
      id: 'seed-email-sched-1',
      recipientEmail: 'alex.chen@cloudscale.ai',
      subject: 'Question regarding your email dispatch infrastructure',
      body: '<p>Hi Alex, hope all is well at CloudScale AI.</p>',
      scheduledAt: new Date(now + 1800000), // +30 mins
      status: 'SCHEDULED' as any,
      idempotencyKey: 'seed-email-sched-1',
    },
    {
      id: 'seed-email-sched-2',
      recipientEmail: 'priya.patel@hypergrowth.co',
      subject: 'Question regarding your email dispatch infrastructure',
      body: '<p>Hi Priya, reaching out regarding high-throughput cold email delivery.</p>',
      scheduledAt: new Date(now + 3600000), // +1 hour
      status: 'SCHEDULED' as any,
      idempotencyKey: 'seed-email-sched-2',
    },
  ];

  for (const item of scheduledEmailsData) {
    await prisma.email.create({
      data: {
        id: item.id,
        userId: user.id,
        campaignId: campaign.id,
        senderEmail: user.email,
        recipientEmail: item.recipientEmail,
        subject: item.subject,
        body: item.body,
        scheduledAt: item.scheduledAt,
        status: item.status,
        idempotencyKey: item.idempotencyKey,
      },
    });
  }

  // Create Failed Email with retry capability
  await prisma.email.create({
    data: {
      id: 'seed-email-failed-1',
      userId: user.id,
      campaignId: campaign.id,
      senderEmail: user.email,
      recipientEmail: 'marcus.vance@databridge.net',
      subject: 'Question regarding your email dispatch infrastructure',
      body: '<p>Hi Marcus, wanted to check in regarding your SMTP pipeline.</p>',
      scheduledAt: new Date(now - 2400000),
      status: 'FAILED' as any,
      failureReason: 'SMTP Connection timeout: Host mx.databridge.net was unreachable on port 587 after 3 attempts',
      retryCount: 1,
      idempotencyKey: 'seed-email-failed-1',
    },
  });

  // Seed Slack Integration
  await prisma.slackIntegration.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      accessToken: 'xoxb-mock-reachinbox-sample-token',
      teamId: 'T08ABCD1234',
      teamName: 'ReachInbox Growth Ops',
      channelId: 'C08EFGH5678',
      channelName: 'outreach-alerts',
      connectedAt: new Date(),
    },
  });

  console.log('✅ Seed completed successfully! Seeded: 3 Sent, 2 Scheduled, 1 Failed email, and Slack integration.');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
