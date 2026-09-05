import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  live() {
    return {
      status: "ok",
      service: "klinika-debug-api"
    };
  }

  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: "ok",
      database: "ok"
    };
  }
}
