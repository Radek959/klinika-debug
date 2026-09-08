import { Controller, Get, Header } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { ADMIN_PAGE_HTML } from "./admin-page.html";

/**
 * Serwuje samodzielną stronę panelu prowadzącego pod `/admin`. Celowo NIE
 * jest częścią `apps/web` (SPA uczestnika) ani jej routingu — panel nie jest
 * linkowany z nawigacji produktu i nie jest w żaden sposób osiągalny dla
 * uczestnika, który nie zna tego adresu (AGENTS.md).
 */
@ApiExcludeController()
@Controller("admin")
export class AdminViewController {
  @Get()
  @Header("Content-Type", "text/html; charset=utf-8")
  getPage(): string {
    return ADMIN_PAGE_HTML;
  }
}
