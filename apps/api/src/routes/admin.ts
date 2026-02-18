import bcrypt from 'bcryptjs';
import express, { Response } from 'express';
import { z } from 'zod';
import { adminResetPasswordBodySchema, createUserBodySchema, updateUserRoleSchema } from '@dashio/shared';
import { requireAuth, requirePermission, RequestWithUser } from '../middleware/auth';
import { RefreshToken } from '../models/RefreshToken';
import { User } from '../models/User';
import { AuditLog, logAudit } from '../models/AuditLog';
import { AppError } from '../middleware/errorHandler';
import { isDbConnected } from '../config/db';
import { PERMISSIONS, resolvePermissions } from '../config/permissions';
import { ScheduledReport } from '../models/ScheduledReport';
import { Customer } from '../models/Customer';
import { Event } from '../models/Event';

const router = express.Router();
const permissionEnum = z.enum(PERMISSIONS);

const createUserAdminSchema = createUserBodySchema.extend({
  permissions: z.array(permissionEnum).default([]),
});

const updateUserPermissionsSchema = z.object({
  permissions: z.array(permissionEnum).max(50),
});

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  userId: z.string().optional(),
  action: z.string().trim().optional(),
  q: z.string().trim().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const reportScheduleBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  frequency: z.enum(['weekly', 'monthly']),
  emails: z.array(z.string().email()).default([]),
  enabled: z.boolean().default(true),
});

const reportScheduleUpdateSchema = reportScheduleBodySchema.partial();

router.use(requireAuth);

function ensureDbConnected(): void {
  if (!isDbConnected()) throw new AppError(503, 'Database unavailable.');
}

function nextRunAt(frequency: 'weekly' | 'monthly', from = new Date()): Date {
  const ms = frequency === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  return new Date(from.getTime() + ms);
}

function auditContext(req: RequestWithUser): { ip?: string; userAgent?: string } {
  return {
    ip: req.ip || undefined,
    userAgent: req.get('user-agent') || undefined,
  };
}

function buildAuditFilter(input: z.infer<typeof auditQuerySchema>): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (input.userId) filter.userId = input.userId;
  if (input.action) filter.action = input.action;
  if (input.from || input.to) {
    filter.createdAt = {
      ...(input.from ? { $gte: new Date(input.from) } : {}),
      ...(input.to ? { $lte: new Date(input.to) } : {}),
    };
  }
  if (input.q) {
    filter.$or = [
      { action: { $regex: input.q, $options: 'i' } },
      { 'meta.email': { $regex: input.q, $options: 'i' } },
      { 'meta.targetUserId': { $regex: input.q, $options: 'i' } },
    ];
  }
  return filter;
}

router.post('/users', requirePermission('admin.users.write'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const parsed = createUserAdminSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0]?.message || 'Validation failed');
  const { email, password, name, role, permissions } = parsed.data;

  const existing = await User.findOne({ email });
  if (existing) throw new AppError(409, 'Email already registered');

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    email,
    passwordHash,
    name,
    role: role ?? 'viewer',
    permissions: role === 'admin' ? [] : permissions,
  });

  if (req.user) {
    await logAudit({
      userId: req.user.id,
      action: 'admin.user.create',
      meta: { targetUserId: user._id.toString(), email, role: user.role },
      after: { permissions: user.permissions },
      ...auditContext(req),
    });
  }
  res.status(201).json({
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: resolvePermissions(user.role, user.permissions),
      createdAt: user.createdAt,
    },
  });
});

router.get('/users', requirePermission('admin.users.read'), async (_req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const users = await User.find({}, 'email name role permissions createdAt').sort({ createdAt: -1 }).lean();
  res.json({
    items: users.map((u) => ({
      ...u,
      permissions: resolvePermissions(u.role, u.permissions),
    })),
  });
});

router.patch('/users/:id/role', requirePermission('admin.users.write'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const { id } = req.params;
  if (!req.user) throw new AppError(401, 'Authentication required');
  if (req.user.id === id) throw new AppError(400, 'You cannot change your own role');

  const parsed = updateUserRoleSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0]?.message || 'Invalid role');
  const before = await User.findById(id).lean();
  const role = parsed.data.role;
  const user = await User.findByIdAndUpdate(
    id,
    { role, ...(role === 'admin' ? { permissions: [] } : {}) },
    { new: true, projection: 'email name role permissions createdAt' }
  ).lean();
  if (!user) throw new AppError(404, 'User not found');

  await logAudit({
    userId: req.user.id,
    action: 'admin.user.updateRole',
    meta: { targetUserId: id, role },
    before,
    after: user,
    ...auditContext(req),
  });

  res.json({
    user: {
      ...user,
      permissions: resolvePermissions(user.role, user.permissions),
    },
  });
});

router.patch('/users/:id/permissions', requirePermission('admin.users.write'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const { id } = req.params;
  if (!req.user) throw new AppError(401, 'Authentication required');
  if (req.user.id === id) throw new AppError(400, 'You cannot change your own permissions');

  const parsed = updateUserPermissionsSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0]?.message || 'Invalid permissions');

  const before = await User.findById(id).lean();
  if (!before) throw new AppError(404, 'User not found');
  if (before.role === 'admin') throw new AppError(400, 'Admin users do not require explicit permissions');

  const user = await User.findByIdAndUpdate(
    id,
    { permissions: parsed.data.permissions },
    { new: true, projection: 'email name role permissions createdAt' }
  ).lean();
  if (!user) throw new AppError(404, 'User not found');

  await logAudit({
    userId: req.user.id,
    action: 'admin.user.updatePermissions',
    meta: { targetUserId: id },
    before: { permissions: before.permissions },
    after: { permissions: user.permissions },
    ...auditContext(req),
  });

  res.json({
    user: {
      ...user,
      permissions: resolvePermissions(user.role, user.permissions),
    },
  });
});

router.patch('/users/:id/password', requirePermission('admin.users.write'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const { id } = req.params;
  const parsed = adminResetPasswordBodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0]?.message || 'Validation failed');
  const { newPassword } = parsed.data;
  const user = await User.findById(id);
  if (!user) throw new AppError(404, 'User not found');
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await User.updateOne({ _id: id }, { passwordHash });
  if (req.user) {
    await logAudit({
      userId: req.user.id,
      action: 'admin.user.resetPassword',
      meta: { targetUserId: id, email: user.email },
      ...auditContext(req),
    });
  }
  res.json({ ok: true });
});

router.delete('/users/:id', requirePermission('admin.users.write'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const { id } = req.params;
  if (!req.user) throw new AppError(401, 'Authentication required');
  if (req.user.id === id) throw new AppError(400, 'You cannot delete your own account');

  const user = await User.findByIdAndDelete(id).lean();
  if (!user) throw new AppError(404, 'User not found');
  await RefreshToken.deleteMany({ userId: id });
  await logAudit({
    userId: req.user.id,
    action: 'admin.user.delete',
    meta: { targetUserId: id, email: user.email },
    before: user,
    after: { deleted: true },
    ...auditContext(req),
  });
  res.json({ ok: true });
});

router.get('/audit', requirePermission('admin.audit.read'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const parsed = auditQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0]?.message || 'Invalid query');
  const filter = buildAuditFilter(parsed.data);

  const items = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(parsed.data.limit).lean();
  res.json({ items });
});

router.get('/audit/export', requirePermission('admin.audit.read'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const parsed = auditQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0]?.message || 'Invalid query');
  const filter = buildAuditFilter(parsed.data);

  const items = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(parsed.data.limit).lean();
  const headers = ['time', 'action', 'userId', 'ip', 'userAgent', 'meta'];
  const escape = (v: unknown): string => {
    if (v == null) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = items.map((item) => [
    new Date(item.createdAt).toISOString(),
    item.action,
    item.userId?.toString() ?? '',
    item.ip ?? '',
    item.userAgent ?? '',
    JSON.stringify(item.meta ?? {}),
  ]);
  const csv = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.map(escape).join(','))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
  res.send(csv);
});

router.get('/reports/schedules', requirePermission('reports.manage'), async (_req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const items = await ScheduledReport.find().sort({ createdAt: -1 }).lean();
  res.json({ items });
});

router.post('/reports/schedules', requirePermission('reports.manage'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const parsed = reportScheduleBodySchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0]?.message || 'Invalid body');
  const schedule = await ScheduledReport.create({
    ...parsed.data,
    nextRunAt: nextRunAt(parsed.data.frequency),
  });
  if (req.user) {
    await logAudit({
      userId: req.user.id,
      action: 'reports.schedule.create',
      meta: { scheduleId: schedule._id.toString() },
      after: schedule.toObject(),
      ...auditContext(req),
    });
  }
  res.status(201).json({ schedule });
});

router.patch('/reports/schedules/:id', requirePermission('reports.manage'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const parsed = reportScheduleUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0]?.message || 'Invalid body');
  const before = await ScheduledReport.findById(req.params.id).lean();
  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.frequency) {
    updates.nextRunAt = nextRunAt(parsed.data.frequency);
  }
  const schedule = await ScheduledReport.findByIdAndUpdate(req.params.id, updates, { new: true }).lean();
  if (!schedule) throw new AppError(404, 'Schedule not found');
  if (req.user) {
    await logAudit({
      userId: req.user.id,
      action: 'reports.schedule.update',
      meta: { scheduleId: req.params.id },
      before,
      after: schedule,
      ...auditContext(req),
    });
  }
  res.json({ schedule });
});

router.delete('/reports/schedules/:id', requirePermission('reports.manage'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const schedule = await ScheduledReport.findByIdAndDelete(req.params.id).lean();
  if (!schedule) throw new AppError(404, 'Schedule not found');
  if (req.user) {
    await logAudit({
      userId: req.user.id,
      action: 'reports.schedule.delete',
      meta: { scheduleId: req.params.id },
      before: schedule,
      after: { deleted: true },
      ...auditContext(req),
    });
  }
  res.json({ ok: true });
});

router.post('/reports/run-due', requirePermission('reports.manage'), async (req: RequestWithUser, res: Response) => {
  ensureDbConnected();
  const now = new Date();
  const due = await ScheduledReport.find({ enabled: true, nextRunAt: { $lte: now } }).lean();
  const results: Array<Record<string, unknown>> = [];

  for (const schedule of due) {
    const days = schedule.frequency === 'weekly' ? 7 : 30;
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const to = now;
    const [newCustomers, churned, activity] = await Promise.all([
      Customer.countDocuments({ createdAt: { $gte: from, $lte: to } }),
      Event.countDocuments({ type: 'churn', timestamp: { $gte: from, $lte: to } }),
      Event.countDocuments({ type: { $ne: 'churn' }, timestamp: { $gte: from, $lte: to } }),
    ]);
    const summary = {
      period: { from: from.toISOString(), to: to.toISOString() },
      newCustomers,
      churned,
      activity,
    };
    await ScheduledReport.updateOne(
      { _id: schedule._id },
      { lastRunAt: now, nextRunAt: nextRunAt(schedule.frequency, now) }
    );
    if (req.user) {
      await logAudit({
        userId: req.user.id,
        action: 'reports.run',
        meta: { scheduleId: schedule._id.toString(), recipients: schedule.emails.length },
        after: summary,
        ...auditContext(req),
      });
    }
    results.push({
      scheduleId: schedule._id.toString(),
      name: schedule.name,
      recipients: schedule.emails,
      summary,
    });
  }

  res.json({ ok: true, ran: results.length, items: results });
});

export default router;
