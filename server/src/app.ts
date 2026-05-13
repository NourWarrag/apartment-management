import express from 'express';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes';
import apartmentsRoutes from './routes/apartments.routes';
import tenantsRoutes from './routes/tenants.routes';
import dashboardRoutes from './routes/dashboard.routes';
import paymentsRoutes from './routes/payments.routes';

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/apartments', apartmentsRoutes);
app.use('/api/v1/tenants', tenantsRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/payments', paymentsRoutes);

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default app;
