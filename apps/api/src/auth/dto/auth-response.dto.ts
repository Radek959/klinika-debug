import { ApiProperty } from "@nestjs/swagger";

class WorkspaceDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: "Klinika Pokazowa" })
  name!: string;

  @ApiProperty({ example: "klinika-pokazowa" })
  slug!: string;
}

class UserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: "staff.demo" })
  login!: string;

  @ApiProperty({ example: "Personel pokazowy" })
  displayName!: string;

  @ApiProperty({ example: "STAFF" })
  role!: "STAFF";

  @ApiProperty({ type: WorkspaceDto })
  workspace!: WorkspaceDto;
}

export class LoginResponseDto {
  @ApiProperty({ description: "Token sesji do nagłówka Authorization: Bearer." })
  token!: string;

  @ApiProperty({ description: "Czas wygaśnięcia sesji w UTC." })
  expiresAt!: string;

  @ApiProperty({ type: UserDto })
  user!: UserDto;
}

export class MeResponseDto {
  @ApiProperty({ type: UserDto })
  user!: UserDto;
}
