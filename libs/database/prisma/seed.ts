import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  seedCatalogTestsFromJson,
  DEFAULT_CATALOG_JSON_ROW_COUNT,
} from './catalog/seed-catalog-tests';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create permissions
  const permissionData = [
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
    { action: 'manage', subject: 'labService', description: 'Manage lab services' },
    { action: 'manage', subject: 'panel', description: 'Manage panels' },
    { action: 'manage', subject: 'analyzer', description: 'Manage analyzers' },
    { action: 'manage', subject: 'report', description: 'Manage reports' },
    { action: 'manage', subject: 'settings', description: 'Manage lab settings' },
    { action: 'read', subject: 'auditLog', description: 'View audit logs' },
    { action: 'send', subject: 'whatsapp', description: 'Send lab results via WhatsApp Web' },
    { action: 'read', subject: 'whatsappLog', description: 'View WhatsApp send logs' },
    { action: 'read', subject: 'dashboard', description: 'View dashboard' },
    { action: 'create', subject: 'invoice', description: 'Create invoices' },
    { action: 'read', subject: 'invoice', description: 'View invoices' },
    { action: 'update', subject: 'invoice', description: 'Update invoices' },
    { action: 'delete', subject: 'invoice', description: 'Delete invoices' },
  ];

  for (const perm of permissionData) {
    await prisma.permission.upsert({
      where: { action_subject: { action: perm.action, subject: perm.subject } },
      update: {},
      create: perm,
    });
  }
  console.log(`✅ Created ${permissionData.length} permissions`);

  // 2. Create platform super admin
  const hashedPassword = await bcrypt.hash('admin123', 12);
  await prisma.platformUser.upsert({
    where: { email: 'superadmin@lis.com' },
    update: {},
    create: {
      email: 'superadmin@lis.com',
      password: hashedPassword,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
    },
  });
  console.log('✅ Created platform super admin (superadmin@lis.com / admin123)');

  // 3. Create a demo laboratory
  const lab = await prisma.laboratory.upsert({
    where: { slug: 'demo-lab' },
    update: {},
    create: {
      name: 'Demo Laboratory',
      slug: 'demo-lab',
      address: '123 Medical Street, Health City',
      phone: '+1-555-0100',
      email: 'info@demolab.com',
      subscriptionPlan: 'PROFESSIONAL',
      subscriptionEnd: new Date('2027-12-31'),
    },
  });
  console.log(`✅ Created demo laboratory: ${lab.name}`);

  // 4. Create roles for the demo lab
  const allPermissions = await prisma.permission.findMany();
  const permMap = new Map(allPermissions.map((p) => [`${p.action}:${p.subject}`, p.id]));

  const roleDefinitions = [
    {
      name: 'LabAdmin',
      description: 'Laboratory administrator with full access',
      permissions: ['manage:all'],
    },
    {
      name: 'Technician',
      description: 'Lab technician who processes samples and enters results',
      permissions: [
        'read:patient', 'read:order', 'read:sample', 'update:sample',
        'create:result', 'read:result', 'read:dashboard', 'send:whatsapp',
      ],
    },
    {
      name: 'Specialist',
      description: 'Doctor/specialist who validates results',
      permissions: [
        'read:patient', 'read:order', 'read:sample',
        'read:result', 'validate:result', 'read:dashboard', 'send:whatsapp',
      ],
    },
    {
      name: 'Receptionist',
      description: 'Front-desk staff handling patient registration and orders',
      permissions: [
        'create:patient', 'read:patient', 'update:patient',
        'create:order', 'read:order', 'create:sample', 'read:sample',
        'create:invoice', 'read:invoice',
        'read:dashboard', 'send:whatsapp',
      ],
    },
  ];

  const roles: Record<string, string> = {};

  for (const roleDef of roleDefinitions) {
    const role = await prisma.role.upsert({
      where: { name_laboratoryId: { name: roleDef.name, laboratoryId: lab.id } },
      update: {},
      create: {
        name: roleDef.name,
        description: roleDef.description,
        isSystem: true,
        laboratoryId: lab.id,
      },
    });
    roles[roleDef.name] = role.id;

    // Clear existing permissions and re-create
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const permIds = roleDef.permissions
      .map((pk) => permMap.get(pk))
      .filter(Boolean) as string[];
    if (permIds.length) {
      await prisma.rolePermission.createMany({
        data: permIds.map((pid) => ({ roleId: role.id, permissionId: pid })),
      });
    }
  }
  console.log('✅ Created roles: LabAdmin, Technician, Specialist, Receptionist');

  // 5. Create demo users
  const demoUsers = [
    { email: 'admin@demolab.com', firstName: 'Lab', lastName: 'Admin', role: 'LabAdmin' },
    { email: 'tech@demolab.com', firstName: 'John', lastName: 'Technician', role: 'Technician' },
    { email: 'doctor@demolab.com', firstName: 'Dr. Sarah', lastName: 'Specialist', role: 'Specialist' },
    { email: 'reception@demolab.com', firstName: 'Mary', lastName: 'Reception', role: 'Receptionist' },
  ];

  for (const u of demoUsers) {
    await prisma.user.upsert({
      where: { email_laboratoryId: { email: u.email, laboratoryId: lab.id } },
      update: {},
      create: {
        email: u.email,
        password: hashedPassword,
        firstName: u.firstName,
        lastName: u.lastName,
        roleId: roles[u.role],
        laboratoryId: lab.id,
      },
    });
  }
  console.log('✅ Created demo users (all passwords: admin123)');

  // 6. Global medical catalog only (`catalog_tests`). Labs activate tests via the UI — no `lab_services` bulk seed.
  const catalog = await seedCatalogTestsFromJson(prisma);
  console.log(
    `✅ catalog_tests: ${catalog.seeded} newly inserted (${DEFAULT_CATALOG_JSON_ROW_COUNT} rows in JSON definition)`,
  );

  // 7. Create demo patients
  const patients = [
    { mrn: 'P-001', firstName: 'Ahmed', lastName: 'Hassan', gender: 'MALE' as const, phone: '+1-555-0201' },
    { mrn: 'P-002', firstName: 'Fatima', lastName: 'Ali', gender: 'FEMALE' as const, phone: '+1-555-0202' },
    { mrn: 'P-003', firstName: 'Mohammed', lastName: 'Omar', gender: 'MALE' as const, phone: '+1-555-0203' },
  ];

  for (const pat of patients) {
    await prisma.patient.upsert({
      where: { mrn_laboratoryId: { mrn: pat.mrn, laboratoryId: lab.id } },
      update: {},
      create: { ...pat, laboratoryId: lab.id },
    });
  }
  console.log(`✅ Created ${patients.length} demo patients`);

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📋 Login credentials:');
  console.log('  Platform: superadmin@lis.com / admin123');
  console.log('  Lab Admin: admin@demolab.com / admin123');
  console.log('  Technician: tech@demolab.com / admin123');
  console.log('  Specialist: doctor@demolab.com / admin123');
  console.log('  Reception: reception@demolab.com / admin123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
