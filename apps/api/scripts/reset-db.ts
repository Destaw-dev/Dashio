import path from 'path';
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: path.resolve(__dirname, '../.env') });

import mongoose from 'mongoose';
import { Customer } from '../src/models/Customer';
import { Event } from '../src/models/Event';
import { Note } from '../src/models/Note';
import { User } from '../src/models/User';
import { RefreshToken } from '../src/models/RefreshToken';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dashio';

async function reset() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  await Promise.all([
    Customer.deleteMany({}),
    Event.deleteMany({}),
    Note.deleteMany({}),
    RefreshToken.deleteMany({}),
  ]);
  console.log('Dropped Customer, Event, Note, RefreshToken collections. (User collection kept.)');

  await mongoose.disconnect();
  process.exit(0);
}

reset().catch((err) => {
  console.error(err);
  process.exit(1);
});
