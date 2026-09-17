const { z } = require('zod');

const USER_ROLE_ENUM = z.enum([
  'branch_manager',
  'hub_manager',
  'senior_manager',
  'admin',
]);

const VOLTAGE_LEVEL_ENUM = z.enum(['MV', 'LV']);

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  role: USER_ROLE_ENUM,
});

const userCreateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format'),
  role: USER_ROLE_ENUM,
  password: z.string().min(6, 'Password must be at least 6 characters'),
  branch: z.string().optional(),
  hubId: z.string().nullable().optional(),
});

const userUpdateSchema = z
  .object({
    name: z.string().min(1, 'Name is required').optional(),
    email: z.string().email('Invalid email format').optional(),
    role: USER_ROLE_ENUM.optional(),
    branch: z.string().nullable().optional(),
    hubId: z.string().nullable().optional(),
    password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  })
  .strict();

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

const progressEntrySchema = z.object({
  entryDate: z.string().refine((v) => !isNaN(Date.parse(v)), 'Invalid entryDate'),
  locationId: z.string().min(1).optional(),
  scopeId: z.string().min(1, 'scopeId is required'),
  completedKm: z.number().gte(0, 'completedKm must be >= 0'),
  lineId: z.string().min(1, 'lineId is required'),
  voltageLevel: VOLTAGE_LEVEL_ENUM,
  transformerId: z.string().min(1, 'transformerId is required'),
  progressPct: z.number().gte(0, 'progressPct must be >= 0').lte(100, 'progressPct must be <= 100'),
  transformersInstalled: z.number().int().gte(0, 'transformersInstalled must be >= 0'),
  transformersTerminated: z.number().int().gte(0, 'transformersTerminated must be >= 0'),
  transformersTested: z.number().int().gte(0, 'transformersTested must be >= 0'),
  transformersCommissioned: z.number().int().gte(0, 'transformersCommissioned must be >= 0'),
});

const progressEntryUpdateSchema = z
  .object({
    entryDate: z
      .string()
      .refine((v) => !isNaN(Date.parse(v)), 'Invalid entryDate')
      .optional(),
    locationId: z.string().min(1).optional(),
    scopeId: z.string().min(1).optional(),
    completedKm: z.number().gte(0, 'completedKm must be >= 0').optional(),
    lineId: z.string().min(1, 'lineId is required').optional(),
    voltageLevel: VOLTAGE_LEVEL_ENUM.optional(),
    transformerId: z.string().min(1, 'transformerId is required').optional(),
    progressPct: z.number().gte(0, 'progressPct must be >= 0').lte(100, 'progressPct must be <= 100').optional(),
    transformersInstalled: z.number().int().gte(0, 'transformersInstalled must be >= 0').optional(),
    transformersTerminated: z.number().int().gte(0, 'transformersTerminated must be >= 0').optional(),
    transformersTested: z.number().int().gte(0, 'transformersTested must be >= 0').optional(),
    transformersCommissioned: z
      .number()
      .int()
      .gte(0, 'transformersCommissioned must be >= 0')
      .optional(),
  })
  .strict();

const rejectSchema = z.object({
  comments: z.string().min(1, 'Rejection comments are required'),
});

function validate(schema) {
  return function (req, res, next) {
    try {
      const parsed = schema.parse(req.body);
      req.validated = parsed;
      next();
    } catch (err) {
      if (err && err.issues) {
        const errors = err.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        }));
        return res.status(422).json({ error: 'Validation failed', errors });
      }
      return res.status(422).json({ error: 'Validation failed', details: String(err) });
    }
  };
}

module.exports = {
  loginSchema,
  userCreateSchema,
  userUpdateSchema,
  resetPasswordSchema,
  progressEntrySchema,
  progressEntryUpdateSchema,
  rejectSchema,
  USER_ROLE_ENUM,
  VOLTAGE_LEVEL_ENUM,
  validate,
};
