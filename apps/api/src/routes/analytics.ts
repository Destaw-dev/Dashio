import express, { Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requirePermission, RequestWithUser } from '../middleware/auth';
import { Customer } from '../models/Customer';
import { Event } from '../models/Event';
import { AppError } from '../middleware/errorHandler';
import { isDbConnected } from '../config/db';
import { AlertRule } from '../models/AlertRule';
import { AlertEvent } from '../models/AlertEvent';
import { logAudit } from '../models/AuditLog';

const router = express.Router();

const alertRuleBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(['churn_spike', 'activity_drop']),
  thresholdPct: z.coerce.number().min(1).max(1000),
  windowDays: z.coerce.number().int().min(1).max(90).default(7),
  enabled: z.boolean().default(true),
});

const alertRuleUpdateSchema = alertRuleBodySchema.partial();

router.use(requireAuth);

function ensureDbConnected(): void {
  if (!isDbConnected()) throw new AppError(503, 'Database unavailable.');
}

function auditContext(req: RequestWithUser): { ip?: string; userAgent?: string } {
  return {
    ip: req.ip || undefined,
    userAgent: req.get('user-agent') || undefined,
  };
}

function parseDateRange(req: Request): { from: Date; to: Date } {
  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const from = req.query.from ? new Date(req.query.from as string) : oneYearAgo;
  const to = req.query.to ? new Date(req.query.to as string) : now;
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
    throw new AppError(400, 'Invalid date range: use from and to as ISO dates');
  }
  return { from, to };
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

router.get('/kpis', requirePermission('analytics.read'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const { from, to } = parseDateRange(req);

  const [total, active, newInPeriod, churnedInPeriod] = await Promise.all([
    Customer.countDocuments(),
    Customer.countDocuments({ status: 'active' }),
    Customer.countDocuments({ createdAt: { $gte: from, $lte: to } }),
    Event.countDocuments({ type: 'churn', timestamp: { $gte: from, $lte: to } }),
  ]);

  res.json({
    totalCustomers: total,
    activeCustomers: active,
    newInPeriod,
    churnedInPeriod,
    from: from.toISOString(),
    to: to.toISOString(),
  });
});

router.get('/new-customers', requirePermission('analytics.read'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const { from, to } = parseDateRange(req);
  const groupBy = (req.query.groupBy as string) || 'month';

  const format: Record<string, string> = {
    day: '%Y-%m-%d',
    week: '%Y-%W',
    month: '%Y-%m',
  };
  const fmt = format[groupBy] || format.month;

  const result = await Customer.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: { $dateToString: { format: fmt, date: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json({
    series: result.map((r) => ({ date: r._id, count: r.count })),
    from: from.toISOString(),
    to: to.toISOString(),
  });
});

router.get('/activity-trend', requirePermission('analytics.read'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const { from, to } = parseDateRange(req);
  const groupBy = (req.query.groupBy as string) || 'month';

  const format: Record<string, string> = {
    day: '%Y-%m-%d',
    week: '%Y-%W',
    month: '%Y-%m',
  };
  const fmt = format[groupBy] || format.month;

  const result = await Event.aggregate([
    { $match: { timestamp: { $gte: from, $lte: to }, type: { $ne: 'churn' } } },
    {
      $group: {
        _id: { $dateToString: { format: fmt, date: '$timestamp' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json({
    series: result.map((r) => ({ date: r._id, count: r.count })),
    from: from.toISOString(),
    to: to.toISOString(),
  });
});

router.get('/churn', requirePermission('analytics.read'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const { from, to } = parseDateRange(req);
  const groupBy = (req.query.groupBy as string) || 'month';

  const format: Record<string, string> = {
    day: '%Y-%m-%d',
    week: '%Y-%W',
    month: '%Y-%m',
  };
  const fmt = format[groupBy] || format.month;

  const result = await Event.aggregate([
    { $match: { type: 'churn', timestamp: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: { $dateToString: { format: fmt, date: '$timestamp' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json({
    series: result.map((r) => ({ date: r._id, count: r.count })),
    from: from.toISOString(),
    to: to.toISOString(),
  });
});

router.get('/cohort-retention', requirePermission('analytics.read'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const { from, to } = parseDateRange(req);
  const horizon = Math.min(24, Math.max(1, Number(req.query.horizonMonths ?? 12)));

  const cohorts = await Customer.aggregate<{ _id: string; size: number; customers: string[] }>([
    { $match: { createdAt: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
        size: { $sum: 1 },
        customers: { $push: '$_id' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const now = new Date();
  const series = await Promise.all(
    cohorts.map(async (cohort) => {
      const [year, month] = cohort._id.split('-').map(Number);
      const cohortStart = new Date(Date.UTC(year, month - 1, 1));
      const retention = [];

      for (let offset = 0; offset < horizon; offset += 1) {
        const periodStart = addMonths(cohortStart, offset);
        const periodEnd = addMonths(cohortStart, offset + 1);
        if (periodStart > now) break;

        let retained = cohort.size;
        if (offset > 0) {
          const activeCustomers = await Event.distinct('customerId', {
            customerId: { $in: cohort.customers },
            type: { $ne: 'churn' },
            timestamp: { $gte: periodStart, $lt: periodEnd },
          });
          retained = activeCustomers.length;
        }

        retention.push({
          month: monthKey(periodStart),
          monthOffset: offset,
          retained,
          retentionRate: cohort.size > 0 ? Number(((retained / cohort.size) * 100).toFixed(1)) : 0,
        });
      }

      return {
        cohort: cohort._id,
        size: cohort.size,
        retention,
      };
    })
  );

  res.json({ from: from.toISOString(), to: to.toISOString(), horizonMonths: horizon, series });
});

router.get('/alerts/rules', requirePermission('alerts.manage'), async (_req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const items = await AlertRule.find().sort({ createdAt: -1 }).lean();
  res.json({ items });
});

router.post('/alerts/rules', requirePermission('alerts.manage'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const parsed = alertRuleBodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0]?.message || 'Invalid body');

  const rule = await AlertRule.create(parsed.data);
  if (req.user) {
    await logAudit({
      userId: req.user.id,
      action: 'alerts.rule.create',
      meta: { ruleId: rule._id.toString(), type: rule.type },
      after: rule.toObject(),
      ...auditContext(req),
    });
  }
  res.status(201).json({ rule });
});

router.patch('/alerts/rules/:id', requirePermission('alerts.manage'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const parsed = alertRuleUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0]?.message || 'Invalid body');
  const before = await AlertRule.findById(req.params.id).lean();
  const rule = await AlertRule.findByIdAndUpdate(req.params.id, parsed.data, { new: true }).lean();
  if (!rule) throw new AppError(404, 'Rule not found');
  if (req.user) {
    await logAudit({
      userId: req.user.id,
      action: 'alerts.rule.update',
      meta: { ruleId: req.params.id },
      before,
      after: rule,
      ...auditContext(req),
    });
  }
  res.json({ rule });
});

router.delete('/alerts/rules/:id', requirePermission('alerts.manage'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const rule = await AlertRule.findByIdAndDelete(req.params.id).lean();
  if (!rule) throw new AppError(404, 'Rule not found');
  if (req.user) {
    await logAudit({
      userId: req.user.id,
      action: 'alerts.rule.delete',
      meta: { ruleId: req.params.id },
      before: rule,
      after: { deleted: true },
      ...auditContext(req),
    });
  }
  res.json({ ok: true });
});

router.get('/alerts/events', requirePermission('alerts.manage'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
  const items = await AlertEvent.find().sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ items });
});

router.post('/alerts/evaluate', requirePermission('alerts.manage'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const now = new Date();
  const rules = await AlertRule.find({ enabled: true }).lean();
  const triggered: Array<{ ruleId: string; type: string; message: string }> = [];

  for (const rule of rules) {
    const currentStart = new Date(now.getTime() - rule.windowDays * 24 * 60 * 60 * 1000);
    const previousStart = new Date(currentStart.getTime() - rule.windowDays * 24 * 60 * 60 * 1000);
    const previousEnd = currentStart;

    if (rule.type === 'churn_spike') {
      const [current, previous] = await Promise.all([
        Event.countDocuments({ type: 'churn', timestamp: { $gte: currentStart, $lt: now } }),
        Event.countDocuments({ type: 'churn', timestamp: { $gte: previousStart, $lt: previousEnd } }),
      ]);
      const changePct = previous === 0 ? (current > 0 ? 100 : 0) : ((current - previous) / previous) * 100;
      if (changePct >= rule.thresholdPct) {
        const message = `Churn spike detected: ${changePct.toFixed(1)}% vs previous window`;
        await AlertEvent.create({
          ruleId: rule._id,
          type: rule.type,
          message,
          metrics: { current, previous, changePct: Number(changePct.toFixed(2)), windowDays: rule.windowDays },
        });
        await AlertRule.updateOne({ _id: rule._id }, { lastTriggeredAt: now });
        triggered.push({ ruleId: rule._id.toString(), type: rule.type, message });
      }
    }

    if (rule.type === 'activity_drop') {
      const [current, previous] = await Promise.all([
        Event.countDocuments({ type: { $ne: 'churn' }, timestamp: { $gte: currentStart, $lt: now } }),
        Event.countDocuments({ type: { $ne: 'churn' }, timestamp: { $gte: previousStart, $lt: previousEnd } }),
      ]);
      const dropPct = previous === 0 ? 0 : ((previous - current) / previous) * 100;
      if (dropPct >= rule.thresholdPct) {
        const message = `Activity drop detected: ${dropPct.toFixed(1)}% vs previous window`;
        await AlertEvent.create({
          ruleId: rule._id,
          type: rule.type,
          message,
          metrics: { current, previous, dropPct: Number(dropPct.toFixed(2)), windowDays: rule.windowDays },
        });
        await AlertRule.updateOne({ _id: rule._id }, { lastTriggeredAt: now });
        triggered.push({ ruleId: rule._id.toString(), type: rule.type, message });
      }
    }
  }

  if (req.user) {
    await logAudit({
      userId: req.user.id,
      action: 'alerts.evaluate',
      meta: { rulesChecked: rules.length, triggered: triggered.length },
      after: triggered,
      ...auditContext(req),
    });
  }

  res.json({ ok: true, rulesChecked: rules.length, triggered });
});

export default router;
