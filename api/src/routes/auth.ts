import bcrypt from 'bcryptjs';
import cookie from 'cookie';
import crypto from 'crypto';
import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { changePasswordBodySchema, loginBodySchema, registerBodySchema, updateProfileBodySchema } from '@dashio/shared';
import { AppError } from '../middleware/errorHandler';
import { requireAuth, RequestWithUser } from '../middleware/auth';
import { RefreshToken } from '../models/RefreshToken';
import { User } from '../models/User';
import { logAudit } from '../models/AuditLog';
import { JWT_SECRET } from '../config/auth';
import { resolvePermissions } from '../config/permissions';

const router = express.Router();
const ACCESS_EXPIRY = '15m';
const REFRESH_EXPIRY_DAYS = 7;
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
};
const ACCESS_COOKIE = { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 };
const REFRESH_COOKIE = { ...COOKIE_OPTIONS, maxAge: REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000 };

function setAuthCookies(res: Response, userId: string, role: string, refreshTokenValue: string): void {
  const accessToken = jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: ACCESS_EXPIRY });
  res.setHeader('Set-Cookie', [
    cookie.serialize('token', accessToken, ACCESS_COOKIE),
    cookie.serialize('refresh_token', refreshTokenValue, REFRESH_COOKIE),
  ]);
}

router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.errors[0]?.message || 'Validation failed');
  }
  const { email, password, name } = parsed.data;

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError(409, 'Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ email, passwordHash, name, role: 'viewer' });

  const refreshTokenValue = crypto.randomBytes(32).toString('hex');
  await RefreshToken.create({
    userId: user._id,
    token: refreshTokenValue,
    expiresAt: new Date(Date.now() + REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
  });

  setAuthCookies(res, user._id.toString(), user.role, refreshTokenValue);

  // Audit: new user registration
  await logAudit({
    userId: user._id.toString(),
    action: 'auth.register',
    meta: { email },
  });

  res.status(201).json({
    user: { id: user._id, email: user.email, name: user.name, role: user.role, permissions: resolvePermissions(user.role, user.permissions) },
  });
});

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.errors[0]?.message || 'Validation failed');
  }
  const { email, password } = parsed.data;

  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, 'Invalid email or password');
  }

  const refreshTokenValue = crypto.randomBytes(32).toString('hex');
  await RefreshToken.create({
    userId: user._id,
    token: refreshTokenValue,
    expiresAt: new Date(Date.now() + REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
  });

  setAuthCookies(res, user._id.toString(), user.role, refreshTokenValue);

  // Audit: successful login
  await logAudit({
    userId: user._id.toString(),
    action: 'auth.login',
    meta: { email },
  });

  res.json({
    user: { id: user._id, email: user.email, name: user.name, role: user.role, permissions: resolvePermissions(user.role, user.permissions) },
  });
});

router.post('/logout', async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refresh_token;
  if (refreshToken) {
    await RefreshToken.deleteOne({ token: refreshToken });
  }
  res.setHeader('Set-Cookie', [
    cookie.serialize('token', '', { ...COOKIE_OPTIONS, maxAge: 0 }),
    cookie.serialize('refresh_token', '', { ...COOKIE_OPTIONS, maxAge: 0 }),
  ]);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req: RequestWithUser, res: Response) => {
  res.json({ user: req.user });
});

router.patch('/profile', requireAuth, async (req: RequestWithUser, res: Response) => {
  const parsed = updateProfileBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.errors[0]?.message || 'Validation failed');
  }
  if (!req.user) throw new AppError(401, 'Authentication required');
  const { name } = parsed.data;
  const user = await User.findByIdAndUpdate(
    req.user.id,
    { ...(name !== undefined && { name }) },
    { new: true, projection: 'email name role' }
  ).lean();
  if (!user) throw new AppError(404, 'User not found');
  res.json({ user: { id: user._id, email: user.email, name: user.name, role: user.role, permissions: resolvePermissions(user.role, user.permissions) } });
});

router.patch('/password', requireAuth, async (req: RequestWithUser, res: Response) => {
  const parsed = changePasswordBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.errors[0]?.message || 'Validation failed');
  }
  const { currentPassword, newPassword } = parsed.data;
  if (!req.user) throw new AppError(401, 'Authentication required');

  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!user) throw new AppError(404, 'User not found');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError(401, 'Current password is incorrect');
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await User.updateOne({ _id: req.user.id }, { passwordHash });

  await logAudit({
    userId: req.user.id,
    action: 'auth.changePassword',
    meta: {},
  });

  res.json({ ok: true });
});

router.post('/refresh', async (req: Request, res: Response) => {
  const refreshTokenValue = req.cookies?.refresh_token;
  if (!refreshTokenValue) {
    throw new AppError(401, 'Refresh token required');
  }
  const stored = await RefreshToken.findOne({ token: refreshTokenValue }).populate<{ userId: import('../models/User').IUser }>('userId');
  if (!stored || stored.expiresAt < new Date()) {
    if (stored) await RefreshToken.deleteOne({ _id: stored._id });
    throw new AppError(401, 'Invalid or expired refresh token');
  }
  const user = stored.userId as import('../models/User').IUser;
  if (!user) {
    await RefreshToken.deleteOne({ _id: stored._id });
    throw new AppError(401, 'User not found');
  }
  const newRefresh = crypto.randomBytes(32).toString('hex');
  await RefreshToken.updateOne(
    { _id: stored._id },
    { token: newRefresh, expiresAt: new Date(Date.now() + REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000) }
  );
  setAuthCookies(res, user._id.toString(), user.role, newRefresh);
  res.json({ user: { id: user._id, email: user.email, name: user.name, role: user.role, permissions: resolvePermissions(user.role, user.permissions) } });
});

export default router;
