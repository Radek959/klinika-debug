import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { MedicalTestsListResponse } from "@klinika/api-contracts";
import { PrismaService } from "../common/prisma/prisma.service";
import { WorkshopConfigService } from "../workshop-config/workshop-config.service";
import type { MedicalTestListQueryDto } from "./dto/medical-test-list-query.dto";
import { toMedicalTestCatalogItem } from "./tests-catalog.mapper";

@Injectable()
export class TestsCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workshopConfig: WorkshopConfigService
  ) {}

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

    // WORKSHOP CONTROLLED DEFECT (ORDER_PRIORITY_MAPPING): `catalogFlag` is
    // the only signal the participant frontend gets about the globally
    // configured controlled bug — a plain, deliberately opaque boolean, read
    // fresh on every catalog request (no F5 needed once the trainer flips it
    // in /admin), never the bug name or the rest of the admin config. Keep
    // the public field name/description (here and in
    // `MedicalTestsListResponseDto`) generic — no "priority", "workshop",
    // "trainer" or "controlled bug" wording — so DevTools/OpenAPI inspection
    // doesn't hint at the mechanism. The actual (wrong) priority mapping
    // happens in apps/web/src/orders/NewOrderPage.tsx and orderFormState.ts;
    // this backend endpoint and `POST /api/v1/orders` stay fully correct.
    const controlledBug = await this.workshopConfig.getControlledBug();

    return {
      items: items.map(toMedicalTestCatalogItem),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
      catalogFlag: controlledBug === "ORDER_PRIORITY_MAPPING"
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
