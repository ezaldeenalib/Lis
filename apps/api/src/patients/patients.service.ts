import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { Gender, Prisma } from '@prisma/client';

export interface CheckPhoneResult {
  exists: boolean;
  patient?: {
    id: string;
    mrn: string;
    firstName: string;
    lastName: string;
    phone: string | null;
  };
}

@Injectable()
export class PatientsService {
  constructor(private prisma: TenantPrismaService) {}

  /** Auto-generate next sequential MRN for a given lab */
  private async generateMrn(labId: string): Promise<string> {
    const count = await this.prisma.patient.count({ where: { laboratoryId: labId } });
    const seq = String(count + 1).padStart(5, '0');
    const candidate = `P-${seq}`;
    // Ensure uniqueness (race-condition guard)
    const existing = await this.prisma.patient.findFirst({
      where: { mrn: candidate, laboratoryId: labId },
    });
    if (existing) {
      const seq2 = String(count + 2).padStart(5, '0');
      return `P-${seq2}`;
    }
    return candidate;
  }

  /** Check if a phone number belongs to an existing patient */
  async checkPhone(phone: string): Promise<CheckPhoneResult> {
    if (!phone?.trim()) return { exists: false };
    const patient = await this.prisma.patient.findFirst({
      where: { phone: phone.trim() },
      select: { id: true, mrn: true, firstName: true, lastName: true, phone: true },
    });
    return { exists: !!patient, patient: patient ?? undefined };
  }

  async list(query: { page?: number; limit?: number; search?: string }) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const where = query.search
      ? {
          OR: [
            { firstName: { contains: query.search, mode: 'insensitive' as const } },
            { lastName: { contains: query.search, mode: 'insensitive' as const } },
            { mrn: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.patient.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(data: CreatePatientDto, laboratoryId: string | undefined) {
    const labId = laboratoryId ?? this.prisma.getTenantId();
    if (!labId) {
      throw new BadRequestException(
        'Laboratory context is required. Please login with a laboratory account.',
      );
    }

    // Auto-generate MRN if not provided
    const mrn = data.mrn?.trim() || (await this.generateMrn(labId));

    try {
      return await this.prisma.patient.create({
        data: {
          mrn,
          firstName: data.firstName,
          lastName: data.lastName,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
          gender: data.gender as Gender | undefined,
          phone: data.phone,
          email: data.email,
          address: data.address,
          nationalId: data.nationalId,
          laboratoryId: labId,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`A patient with MRN "${data.mrn}" already exists.`);
      }
      throw err;
    }
  }

  async findById(id: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    return patient;
  }

  async update(id: string, data: UpdatePatientDto) {
    await this.findById(id);
    return this.prisma.patient.update({
      where: { id },
      data: {
        mrn: data.mrn,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        gender: data.gender as Gender | undefined,
        phone: data.phone,
        email: data.email,
        address: data.address,
        nationalId: data.nationalId,
      },
    });
  }

  async delete(id: string) {
    await this.findById(id);
    return this.prisma.patient.delete({
      where: { id },
    });
  }
}
