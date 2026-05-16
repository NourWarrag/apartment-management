import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import { requestLogger } from './middleware/requestLogger.middleware';
import { errorHandler } from './middleware/errorHandler.middleware';
import authRoutes from './routes/auth.routes';
import apartmentsRoutes from './routes/apartments.routes';
import tenantsRoutes from './routes/tenants.routes';
import dashboardRoutes from './routes/dashboard.routes';
import paymentsRoutes from './routes/payments.routes';
import ticketsRoutes from './routes/tickets.routes';
import usersRoutes from './routes/users.routes';
import bookingsRoutes from './routes/bookings.routes';
import buildingsRoutes from './routes/buildings.routes';
import accountingRoutes from './routes/accounting.routes';
import reportsRoutes from './routes/reports.routes';
import settingsRoutes from './routes/settings.routes';
import configRoutes from './routes/config.routes';
import { requireFeature } from './middleware/requireFeature';
import { FeatureFlag } from '@hotel/shared';

const app = express();

app.use(requestLogger);
app.use(express.json());
app.use(cookieParser());

app.use('/api/v1/config', configRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/apartments', apartmentsRoutes);
app.use('/api/v1/tenants', tenantsRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/payments', requireFeature(FeatureFlag.PAYMENTS), paymentsRoutes);
app.use('/api/v1/tickets', requireFeature(FeatureFlag.TICKETS), ticketsRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/bookings', requireFeature(FeatureFlag.BOOKINGS), bookingsRoutes);
app.use('/api/v1/buildings', buildingsRoutes);
app.use('/api/v1/reports', requireFeature(FeatureFlag.REPORTS), reportsRoutes);
app.use('/api/v1/accounting', requireFeature(FeatureFlag.ACCOUNTING), accountingRoutes);
app.use('/api/v1/settings', settingsRoutes);

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/files', express.static(path.resolve(process.env.STORAGE_PATH ?? './uploads')));

app.use(errorHandler);

export default app;
