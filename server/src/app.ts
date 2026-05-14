import express from 'express';
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

const app = express();

app.use(requestLogger);
app.use(express.json());
app.use(cookieParser());

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/apartments', apartmentsRoutes);
app.use('/api/v1/tenants', tenantsRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/tickets', ticketsRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/bookings', bookingsRoutes);

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

export default app;
