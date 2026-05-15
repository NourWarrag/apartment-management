import { PrismaClient } from '@prisma/client';
import { getContextUserId } from './requestContext';

const prismaBase = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

// Models that have createdBy/updatedBy audit fields. Attachment, AuditLog, SystemSettings do not.
const AUDIT_MODELS = new Set(['User', 'Apartment', 'Tenant', 'Booking', 'Payment', 'MaintenanceTicket', 'Building']);

function buildExtendedClient(base: typeof prismaBase) {
  return base.$extends({
    name: 'audit-soft-delete',
    query: {
      $allModels: {
        async create({ args, query, model }: { args: any; query: (args: any) => Promise<any>; model: string }) {
          const userId = getContextUserId();
          if (AUDIT_MODELS.has(model) && args.data && typeof args.data === 'object' && !Array.isArray(args.data)) {
            args.data.createdBy = userId;
            args.data.updatedBy = userId;
          }
          return query(args);
        },
        async update({ args, query, model }: { args: any; query: (args: any) => Promise<any>; model: string }) {
          const userId = getContextUserId();
          if (AUDIT_MODELS.has(model) && args.data && typeof args.data === 'object') {
            args.data.updatedBy = userId;
          }
          return query(args);
        },
        async createMany({ args, query, model }: { args: any; query: (args: any) => Promise<any>; model: string }) {
          const userId = getContextUserId();
          if (AUDIT_MODELS.has(model) && Array.isArray(args.data)) {
            args.data = args.data.map((d: Record<string, unknown>) => ({
              ...d, createdBy: userId, updatedBy: userId,
            }));
          }
          return query(args);
        },
      },

      user: {
        async delete({ args }: { args: any }) {
          return base.user.update({
            where: args.where,
            data: { deletedAt: new Date(), deletedBy: getContextUserId() },
          });
        },
        async deleteMany({ args }: { args: any }) {
          return base.user.updateMany({
            where: args.where,
            data: { deletedAt: new Date(), deletedBy: getContextUserId() },
          });
        },
        async findMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async count({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findFirst({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findUnique({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          const result = await query(args);
          if (result?.deletedAt != null) return null;
          return result;
        },
      },

      tenant: {
        async delete({ args }: { args: any }) {
          return base.tenant.update({
            where: args.where,
            data: { deletedAt: new Date(), deletedBy: getContextUserId() },
          });
        },
        async deleteMany({ args }: { args: any }) {
          return base.tenant.updateMany({
            where: args.where,
            data: { deletedAt: new Date(), deletedBy: getContextUserId() },
          });
        },
        async findMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async count({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findFirst({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findUnique({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          const result = await query(args);
          if (result?.deletedAt != null) return null;
          return result;
        },
      },

      apartment: {
        async delete({ args }: { args: any }) {
          return base.apartment.update({
            where: args.where,
            data: { deletedAt: new Date(), deletedBy: getContextUserId() },
          });
        },
        async deleteMany({ args }: { args: any }) {
          return base.apartment.updateMany({
            where: args.where,
            data: { deletedAt: new Date(), deletedBy: getContextUserId() },
          });
        },
        async findMany({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async count({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findFirst({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          args.where = { ...args.where, deletedAt: null };
          return query(args);
        },
        async findUnique({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
          const result = await query(args);
          if (result?.deletedAt != null) return null;
          return result;
        },
      },
    },
  });
}

type ExtendedPrisma = ReturnType<typeof buildExtendedClient>;

const globalForPrisma = globalThis as unknown as { prisma?: ExtendedPrisma };

export const prisma: ExtendedPrisma =
  globalForPrisma.prisma ?? buildExtendedClient(prismaBase);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
