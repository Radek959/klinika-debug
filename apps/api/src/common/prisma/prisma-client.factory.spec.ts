import { createPrismaMariaDbConfig } from "./prisma-client.factory";

describe("Prisma client factory", () => {
  it("parsuje DATABASE_URL i ustawia mały pool połączeń", () => {
    const config = createPrismaMariaDbConfig(
      "mysql://klinika:p%40ss%2Fword@mysql.example.test:3307/klinika_debug"
    );

    expect(config).toEqual({
      host: "mysql.example.test",
      port: 3307,
      user: "klinika",
      password: "p@ss/word",
      database: "klinika_debug",
      connectionLimit: 2
    });
  });

  it("używa domyślnego portu MySQL, gdy DATABASE_URL nie zawiera portu", () => {
    const config = createPrismaMariaDbConfig(
      "mysql://klinika:sekret@mysql.example.test/klinika_debug"
    );

    expect(config.port).toBe(3306);
  });
});
