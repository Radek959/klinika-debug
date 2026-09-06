import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { MedicalTestsListResponse } from "@klinika/api-contracts";
import { PrismaService } from "../common/prisma/prisma.service";
import type { MedicalTestListQueryDto } from "./dto/medical-test-list-query.dto";
import { toMedicalTestCatalogItem } from "./tests-catalog.mapper";

@Injectable()
export class TestsCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: MedicalTestListQueryDto): Promise<MedicalTestsListResponse> {
    const where = this.buildWhere(query);
    const orderBy = this.buildOrderBy(query);
    const skip = (query.page - 1) * query.pageSize;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.medicalTest.findMany({
        where,
        orderBy,
        skip,
        take: query.pageSize,
        include: {
          parameters: { orderBy: [{ displayOrder: "asc" }, { code: "asc" }] },
          requiredFields: { orderBy: [{ displayOrder: "asc" }, { code: "asc" }] }
        }
      }),
      this.prisma.medicalTest.count({ where })
    ]);

    return {
      items: items.map(toMedicalTestCatalogItem),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize)
    };
  }

  private buildWhere(
    query: MedicalTestListQueryDto
  ): Prisma.MedicalTestWhereInput {
    const search = query.search?.trim();

    return {
      ...(query.active ? { active: query.active === "true" } : {}),
      ...(query.materialType ? { materialType: query.materialType } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search } },
              { name: { contains: search } },
              { description: { contains: search } }
            ]
          }
        : {})
    };
  }

  private buildOrderBy(
    query: MedicalTestListQueryDto
  ): Prisma.MedicalTestOrderByWithRelationInput[] {
    return [
      { [query.sort]: query.order },
      query.sort === "code" ? { id: "asc" } : { code: "asc" }
    ];
  }
}
