import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const make = (windowMs, max, message) =>
  rateLimit({
    windowMs, limit: env.isTest ? 10000 : max, standardHeaders: true, legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message } },
  });

export const authLimiter = make(15 * 60 * 1000, 30, 'Too many attempts. Please try again in 15 minutes.');
export const writeLimiter = make(60 * 1000, 60, 'Too many requests. Please slow down.');
export const apiLimiter = make(60 * 1000, 300, 'Too many requests. Please slow down.');
