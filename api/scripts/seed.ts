import path from 'path';
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: path.resolve(__dirname, '../.env') });

import mongoose from 'mongoose';
import { Customer } from '../src/models/Customer';
import { Event } from '../src/models/Event';
import { Note } from '../src/models/Note';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dashio';

const FIRST_NAMES = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Quinn', 'Reese', 'Dakota', 'Skyler', 'Parker', 'Cameron', 'Jamie'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Wilson', 'Anderson', 'Thomas', 'Lee', 'Walker'];
const EVENT_TYPES = ['signup', 'purchase', 'login', 'activity'] as const;

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(from: Date, to: Date) {
  return new Date(from.getTime() + Math.random() * (to.getTime() - from.getTime()));
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  const customers: { id: mongoose.Types.ObjectId; signupDate: Date; isChurned: boolean }[] = [];
  const existingEmails = new Set<string>();

  console.log('Creating 2000 customers...');
  for (let i = 0; i < 2000; i++) {
    let email: string;
    do {
      email = `user${i + 1}+${randomInt(1, 999)}@example.com`;
    } while (existingEmails.has(email));
    existingEmails.add(email);

    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    const status = i < 1600 ? 'active' : 'churned';
    const signupDate = randomDate(oneYearAgo, now);

    const c = await Customer.create({
      name,
      email,
      status,
      segment: pick(['enterprise', 'smb', 'startup', '']),
      createdAt: signupDate,
      updatedAt: signupDate,
    });

    customers.push({ id: c._id, signupDate, isChurned: status === 'churned' });
  }

  console.log('Creating events over the past year...');
  const eventDocs: Array<{ customerId: mongoose.Types.ObjectId; type: string; timestamp: Date }> = [];
  for (const { id: customerId, signupDate, isChurned } of customers) {
    const numEvents = randomInt(2, isChurned ? 15 : 40);
    eventDocs.push({ customerId, type: 'signup', timestamp: signupDate });
    for (let e = 0; e < numEvents - 1; e++) {
      const type = pick(EVENT_TYPES);
      const timestamp = randomDate(signupDate, isChurned ? new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) : now);
      eventDocs.push({ customerId, type, timestamp });
    }
    if (isChurned) {
      const churnDate = randomDate(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000), now);
      eventDocs.push({ customerId, type: 'churn', timestamp: churnDate });
    }
  }
  for (let i = 0; i < eventDocs.length; i += 2000) {
    await Event.insertMany(eventDocs.slice(i, i + 2000));
  }

  console.log('Adding sample notes...');
  const noteSamples = [
    'Follow-up call scheduled.',
    'Interested in enterprise plan.',
    'Support ticket resolved.',
    'Renewal due next quarter.',
  ];
  for (let i = 0; i < 400; i++) {
    const c = customers[randomInt(0, customers.length - 1)];
    await Note.create({
      customerId: c.id,
      content: pick(noteSamples),
    });
  }

  console.log('Seed complete: 2000 customers, events over 1 year, sample notes.');
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
