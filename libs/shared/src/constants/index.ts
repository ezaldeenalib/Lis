export const DEFAULT_PERMISSIONS = [
  { action: 'manage', subject: 'all', description: 'Full access to everything' },

  { action: 'create', subject: 'patient', description: 'Create patients' },
  { action: 'read', subject: 'patient', description: 'View patients' },
  { action: 'update', subject: 'patient', description: 'Update patients' },
  { action: 'delete', subject: 'patient', description: 'Delete patients' },

  { action: 'create', subject: 'order', description: 'Create orders' },
  { action: 'read', subject: 'order', description: 'View orders' },
  { action: 'update', subject: 'order', description: 'Update orders' },
  { action: 'delete', subject: 'order', description: 'Cancel/delete orders' },

  { action: 'create', subject: 'sample', description: 'Register samples' },
  { action: 'read', subject: 'sample', description: 'View samples' },
  { action: 'update', subject: 'sample', description: 'Update sample status' },

  { action: 'create', subject: 'result', description: 'Enter test results' },
  { action: 'read', subject: 'result', description: 'View test results' },
  { action: 'validate', subject: 'result', description: 'Validate test results' },

  { action: 'manage', subject: 'user', description: 'Manage lab users' },
  { action: 'manage', subject: 'labService', description: 'Manage lab services/tests' },
  { action: 'manage', subject: 'panel', description: 'Manage panels' },
  { action: 'manage', subject: 'analyzer', description: 'Manage analyzers' },
  { action: 'manage', subject: 'report', description: 'Manage reports' },
  { action: 'manage', subject: 'settings', description: 'Manage lab settings' },
  { action: 'read', subject: 'auditLog', description: 'View audit logs' },
  { action: 'read', subject: 'dashboard', description: 'View dashboard' },
] as const;

export const DEFAULT_ROLES = {
  LAB_ADMIN: {
    name: 'LabAdmin',
    description: 'Laboratory administrator with full access',
    permissions: ['manage:all'],
  },
  TECHNICIAN: {
    name: 'Technician',
    description: 'Lab technician who processes samples and enters results',
    permissions: [
      'read:patient', 'read:order', 'read:sample', 'update:sample',
      'create:result', 'read:result', 'read:dashboard',
    ],
  },
  SPECIALIST: {
    name: 'Specialist',
    description: 'Doctor/specialist who validates results',
    permissions: [
      'read:patient', 'read:order', 'read:sample',
      'read:result', 'validate:result', 'read:dashboard',
    ],
  },
  RECEPTIONIST: {
    name: 'Receptionist',
    description: 'Front-desk staff handling patient registration and orders',
    permissions: [
      'create:patient', 'read:patient', 'update:patient',
      'create:order', 'read:order', 'create:sample', 'read:sample',
      'read:dashboard',
    ],
  },
} as const;
