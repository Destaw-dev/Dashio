import express, { Response } from 'express';
import { z } from 'zod';
import { customersExportQuerySchema, customersQuerySchema, noteBodySchema, updateCustomerBodySchema } from '@dashio/shared';
import { requireAuth, requirePermission, RequestWithUser } from '../middleware/auth';
import { Customer } from '../models/Customer';
import { AppError } from '../middleware/errorHandler';
import { isDbConnected } from '../config/db';
import { Event } from '../models/Event';
import { Note } from '../models/Note';
import { logAudit } from '../models/AuditLog';
import { SavedView } from '../models/SavedView';
import { CustomerSegment } from '../models/CustomerSegment';

const router = express.Router();

const customerListQuerySchema = customersQuerySchema.extend({
  segmentId: z.string().optional(),
});

const customerExportQuerySchema = customersExportQuerySchema.extend({
  segmentId: z.string().optional(),
});

const bulkActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('updateStatus'),
    ids: z.array(z.string().min(1)).min(1).max(500),
    status: z.enum(['active', 'churned']),
  }),
  z.object({
    action: z.literal('updateSegment'),
    ids: z.array(z.string().min(1)).min(1).max(500),
    segment: z.string().trim().max(100).optional(),
  }),
  z.object({
    action: z.literal('delete'),
    ids: z.array(z.string().min(1)).min(1).max(500),
  }),
]);

const savedViewBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  config: z.object({
    q: z.string().trim().optional(),
    status: z.enum(['active', 'churned']).optional(),
    sortBy: z.enum(['name', 'createdAt']).optional(),
    order: z.enum(['asc', 'desc']).optional(),
    segmentId: z.string().optional(),
  }).default({}),
});

const segmentBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  rules: z.object({
    status: z.enum(['active', 'churned']).optional(),
    segmentEquals: z.string().trim().max(100).optional(),
    createdAfter: z.string().datetime().optional(),
    createdBefore: z.string().datetime().optional(),
    inactivityDaysGte: z.coerce.number().int().min(1).max(3650).optional(),
  }).default({}),
});

router.use(requireAuth);

function ensureDbConnected(): void {
  if (!isDbConnected()) {
    throw new AppError(503, 'Database unavailable.');
  }
}

function buildSearchFilter(q?: string, status?: 'active' | 'churned'): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
    ];
  }
  if (status) {
    filter.status = status;
  }
  return filter;
}

function combineFilters(...filters: Array<Record<string, unknown>>): Record<string, unknown> {
  const nonEmpty = filters.filter((f) => Object.keys(f).length > 0);
  if (!nonEmpty.length) return {};
  if (nonEmpty.length === 1) return nonEmpty[0];
  return { $and: nonEmpty };
}

function getAuditContext(req: RequestWithUser): { ip?: string; userAgent?: string } {
  return {
    ip: req.ip || undefined,
    userAgent: req.get('user-agent') || undefined,
  };
}

async function getSegmentFilter(segmentId: string, userId: string): Promise<Record<string, unknown>> {
  const segment = await CustomerSegment.findOne({ _id: segmentId, userId }).lean();
  if (!segment) {
    throw new AppError(404, 'Segment not found');
  }

  const rules = segment.rules ?? {};
  const filter: Record<string, unknown> = {};

  if (rules.status) {
    filter.status = rules.status;
  }
  if (rules.segmentEquals) {
    filter.segment = rules.segmentEquals;
  }
  if (rules.createdAfter || rules.createdBefore) {
    filter.createdAt = {
      ...(rules.createdAfter ? { $gte: new Date(rules.createdAfter) } : {}),
      ...(rules.createdBefore ? { $lte: new Date(rules.createdBefore) } : {}),
    };
  }
  if (rules.inactivityDaysGte) {
    const cutoff = new Date(Date.now() - rules.inactivityDaysGte * 24 * 60 * 60 * 1000);
    const activeSinceCutoff = await Event.distinct('customerId', { timestamp: { $gte: cutoff } });
    filter._id = { $nin: activeSinceCutoff };
  }

  return filter;
}

router.get('/views', requirePermission('customers.read'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  if (!req.user) throw new AppError(401, 'Authentication required');
  const items = await SavedView.find({ userId: req.user.id, type: 'customers' }).sort({ createdAt: -1 }).lean();
  res.json({ items });
});

router.post('/views', requirePermission('customers.write'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  if (!req.user) throw new AppError(401, 'Authentication required');
  const parsed = savedViewBodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0]?.message || 'Invalid body');

  const view = await SavedView.create({
    userId: req.user.id,
    name: parsed.data.name,
    type: 'customers',
    config: parsed.data.config,
  });

  await logAudit({
    userId: req.user.id,
    action: 'customers.view.create',
    meta: { viewId: view._id.toString(), name: view.name },
    after: { config: view.config },
    ...getAuditContext(req),
  });

  res.status(201).json({ view });
});

router.delete('/views/:viewId', requirePermission('customers.write'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  if (!req.user) throw new AppError(401, 'Authentication required');
  const { viewId } = req.params;
  const view = await SavedView.findOneAndDelete({ _id: viewId, userId: req.user.id, type: 'customers' }).lean();
  if (!view) throw new AppError(404, 'Saved view not found');

  await logAudit({
    userId: req.user.id,
    action: 'customers.view.delete',
    meta: { viewId },
    before: { name: view.name, config: view.config },
    ...getAuditContext(req),
  });

  res.json({ ok: true });
});

router.get('/segments', requirePermission('customers.read'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  if (!req.user) throw new AppError(401, 'Authentication required');
  const items = await CustomerSegment.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
  res.json({ items });
});

router.post('/segments', requirePermission('customers.write'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  if (!req.user) throw new AppError(401, 'Authentication required');
  const parsed = segmentBodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0]?.message || 'Invalid body');

  const segment = await CustomerSegment.create({
    userId: req.user.id,
    name: parsed.data.name,
    rules: {
      ...parsed.data.rules,
      ...(parsed.data.rules.createdAfter ? { createdAfter: new Date(parsed.data.rules.createdAfter) } : {}),
      ...(parsed.data.rules.createdBefore ? { createdBefore: new Date(parsed.data.rules.createdBefore) } : {}),
    },
  });

  await logAudit({
    userId: req.user.id,
    action: 'customers.segment.create',
    meta: { segmentId: segment._id.toString(), name: segment.name },
    after: { rules: segment.rules },
    ...getAuditContext(req),
  });

  res.status(201).json({ segment });
});

router.delete('/segments/:segmentId', requirePermission('customers.write'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  if (!req.user) throw new AppError(401, 'Authentication required');
  const { segmentId } = req.params;
  const segment = await CustomerSegment.findOneAndDelete({ _id: segmentId, userId: req.user.id }).lean();
  if (!segment) throw new AppError(404, 'Segment not found');

  await logAudit({
    userId: req.user.id,
    action: 'customers.segment.delete',
    meta: { segmentId },
    before: { name: segment.name, rules: segment.rules },
    ...getAuditContext(req),
  });

  res.json({ ok: true });
});

router.get('/segments/:segmentId/preview', requirePermission('customers.read'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  if (!req.user) throw new AppError(401, 'Authentication required');
  const filter = await getSegmentFilter(req.params.segmentId, req.user.id);
  const count = await Customer.countDocuments(filter);
  res.json({ count });
});

router.get('/', requirePermission('customers.read'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  if (!req.user) throw new AppError(401, 'Authentication required');

  const parsed = customerListQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0]?.message || 'Invalid query');
  const { page, limit, q, status, sortBy, order, segmentId } = parsed.data;

  const baseFilter = buildSearchFilter(q, status);
  const segmentFilter = segmentId ? await getSegmentFilter(segmentId, req.user.id) : {};
  const filter = combineFilters(baseFilter, segmentFilter);

  const sort: Record<string, 1 | -1> = { [sortBy]: order === 'asc' ? 1 : -1 };
  const [total, items] = await Promise.all([
    Customer.countDocuments(filter),
    Customer.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
  ]);

  res.json({ items, total, page, limit });
});

router.post('/bulk', requirePermission('customers.write'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  if (!req.user) throw new AppError(401, 'Authentication required');

  const parsed = bulkActionSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0]?.message || 'Invalid body');

  const { action, ids } = parsed.data;
  let affected = 0;

  if (action === 'updateStatus') {
    const before = await Customer.find({ _id: { $in: ids } }, 'status').lean();
    const result = await Customer.updateMany({ _id: { $in: ids } }, { status: parsed.data.status });
    affected = result.modifiedCount;
    await logAudit({
      userId: req.user.id,
      action: 'customers.bulk.updateStatus',
      meta: { idsCount: ids.length, status: parsed.data.status },
      before,
      after: { status: parsed.data.status, modifiedCount: result.modifiedCount },
      ...getAuditContext(req),
    });
  } else if (action === 'updateSegment') {
    const before = await Customer.find({ _id: { $in: ids } }, 'segment').lean();
    const result = await Customer.updateMany({ _id: { $in: ids } }, { segment: parsed.data.segment || undefined });
    affected = result.modifiedCount;
    await logAudit({
      userId: req.user.id,
      action: 'customers.bulk.updateSegment',
      meta: { idsCount: ids.length, segment: parsed.data.segment || null },
      before,
      after: { segment: parsed.data.segment || null, modifiedCount: result.modifiedCount },
      ...getAuditContext(req),
    });
  } else {
    const customers = await Customer.find({ _id: { $in: ids } }).lean();
    const objectIds = customers.map((c) => c._id);
    await Promise.all([
      Note.deleteMany({ customerId: { $in: objectIds } }),
      Event.deleteMany({ customerId: { $in: objectIds } }),
      Customer.deleteMany({ _id: { $in: ids } }),
    ]);
    affected = customers.length;
    await logAudit({
      userId: req.user.id,
      action: 'customers.bulk.delete',
      meta: { idsCount: ids.length },
      before: customers.map((c) => ({ id: c._id, email: c.email, status: c.status })),
      after: { deletedCount: customers.length },
      ...getAuditContext(req),
    });
  }

  res.json({ ok: true, affected });
});

// CSV export – must be before /:id
router.get('/export', requirePermission('customers.read'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  if (!req.user) throw new AppError(401, 'Authentication required');

  const parsed = customerExportQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0]?.message || 'Invalid query');
  const { q, status, sortBy, order, limit, segmentId } = parsed.data;

  const baseFilter = buildSearchFilter(q, status);
  const segmentFilter = segmentId ? await getSegmentFilter(segmentId, req.user.id) : {};
  const filter = combineFilters(baseFilter, segmentFilter);
  const sort: Record<string, 1 | -1> = { [sortBy]: order === 'asc' ? 1 : -1 };
  const items = await Customer.find(filter).sort(sort).limit(limit).lean();

  const headers = ['id', 'name', 'email', 'status', 'segment', 'createdAt'];
  const escape = (v: unknown): string => {
    if (v == null) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const getVal = (c: Record<string, unknown>, h: string): unknown =>
    h === 'id' ? c._id : h === 'createdAt' && c.createdAt ? new Date(c.createdAt as Date).toISOString() : c[h];
  const csvRows = [headers.join(','), ...items.map((c) => headers.map((h) => escape(getVal(c as Record<string, unknown>, h))).join(','))];
  const csv = '\uFEFF' + csvRows.join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
  res.send(csv);
});

// Get single customer with basic health score
router.get('/:id', requirePermission('customers.read'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const { id } = req.params;
  const customer = await Customer.findById(id).lean();
  if (!customer) throw new AppError(404, 'Customer not found');

  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const [recentEventsCount, lastEvent] = await Promise.all([
    Event.countDocuments({ customerId: customer._id, timestamp: { $gte: ninetyDaysAgo } }),
    Event.findOne({ customerId: customer._id }).sort({ timestamp: -1 }).lean(),
  ]);

  let healthScore = 50;
  if (customer.status === 'churned') {
    healthScore = 10;
  } else {
    const recencyBoost =
      lastEvent && lastEvent.timestamp
        ? Math.max(0, 40 - (now.getTime() - lastEvent.timestamp.getTime()) / (7 * 24 * 60 * 60 * 1000) * 10)
        : 0;
    const activityBoost = Math.min(40, recentEventsCount * 2);
    healthScore = Math.round(20 + recencyBoost + activityBoost);
    if (healthScore > 100) healthScore = 100;
  }

  res.json({ customer, healthScore, lastEventAt: lastEvent?.timestamp ?? null });
});

router.patch('/:id', requirePermission('customers.write'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const { id } = req.params;
  const parsed = updateCustomerBodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0]?.message || 'Invalid body');
  const updates = parsed.data;
  const before = await Customer.findById(id).lean();
  const customer = await Customer.findByIdAndUpdate(id, updates, { new: true }).lean();
  if (!customer) throw new AppError(404, 'Customer not found');
  if (req.user) {
    await logAudit({
      userId: req.user.id,
      action: 'customer.update',
      meta: { customerId: id, fields: Object.keys(updates) },
      before,
      after: customer,
      ...getAuditContext(req),
    });
  }
  res.json({ customer });
});

router.delete('/:id', requirePermission('customers.write'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const { id } = req.params;
  const customer = await Customer.findById(id).lean();
  if (!customer) throw new AppError(404, 'Customer not found');
  await Promise.all([
    Note.deleteMany({ customerId: customer._id }),
    Event.deleteMany({ customerId: customer._id }),
  ]);
  await Customer.deleteOne({ _id: id });
  if (req.user) {
    await logAudit({
      userId: req.user.id,
      action: 'customer.delete',
      meta: { customerId: id, email: customer.email },
      before: customer,
      after: { deleted: true },
      ...getAuditContext(req),
    });
  }
  res.status(204).send();
});

router.get('/:id/activity', requirePermission('customers.read'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const { id } = req.params;
  const rawLimit = Number(req.query.limit ?? 50);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 200) {
    throw new AppError(400, 'Invalid limit: use an integer between 1 and 200');
  }

  const customer = await Customer.findById(id).lean();
  if (!customer) throw new AppError(404, 'Customer not found');

  const events = await Event.find({ customerId: customer._id }).sort({ timestamp: -1 }).limit(rawLimit).lean();
  res.json({ items: events });
});

router.get('/:id/notes', requirePermission('customers.read'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const { id } = req.params;
  const customer = await Customer.findById(id).lean();
  if (!customer) throw new AppError(404, 'Customer not found');

  const notes = await Note.find({ customerId: customer._id }).sort({ createdAt: -1 }).lean();
  res.json({ items: notes });
});

router.post('/:id/notes', requirePermission('customers.write'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const { id } = req.params;
  const customer = await Customer.findById(id).lean();
  if (!customer) throw new AppError(404, 'Customer not found');

  const parsed = noteBodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0]?.message || 'Invalid note');

  const note = await Note.create({ customerId: customer._id, content: parsed.data.content });
  if (req.user) {
    await logAudit({
      userId: req.user.id,
      action: 'customer.note.create',
      meta: { customerId: customer._id.toString(), noteId: note._id.toString() },
      after: note.toObject(),
      ...getAuditContext(req),
    });
  }
  res.status(201).json({ note });
});

router.patch('/:id/notes/:noteId', requirePermission('customers.write'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const { id, noteId } = req.params;
  const customer = await Customer.findById(id).lean();
  if (!customer) throw new AppError(404, 'Customer not found');

  const parsed = noteBodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0]?.message || 'Invalid note');

  const before = await Note.findOne({ _id: noteId, customerId: customer._id }).lean();
  const note = await Note.findOneAndUpdate(
    { _id: noteId, customerId: customer._id },
    { content: parsed.data.content },
    { new: true }
  ).lean();
  if (!note) throw new AppError(404, 'Note not found');

  if (req.user) {
    await logAudit({
      userId: req.user.id,
      action: 'customer.note.update',
      meta: { customerId: customer._id.toString(), noteId },
      before,
      after: note,
      ...getAuditContext(req),
    });
  }
  res.json({ note });
});

router.delete('/:id/notes/:noteId', requirePermission('customers.write'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const { id, noteId } = req.params;
  const customer = await Customer.findById(id).lean();
  if (!customer) throw new AppError(404, 'Customer not found');

  const before = await Note.findOne({ _id: noteId, customerId: customer._id }).lean();
  const result = await Note.deleteOne({ _id: noteId, customerId: customer._id });
  if (result.deletedCount === 0) throw new AppError(404, 'Note not found');

  if (req.user) {
    await logAudit({
      userId: req.user.id,
      action: 'customer.note.delete',
      meta: { customerId: customer._id.toString(), noteId },
      before,
      after: { deleted: true },
      ...getAuditContext(req),
    });
  }
  res.status(204).send();
});

export default router;
