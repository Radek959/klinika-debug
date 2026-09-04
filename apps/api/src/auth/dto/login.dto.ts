import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({
    example: "staff.demo",
    description: "Login syntetycznego konta personelu."
  })
  @IsString({ message: "Login jest wymagany." })
  login!: string;

  @ApiProperty({
    example: "HasloTestowe123!",
    description: "Hasło syntetycznego konta personelu."
  })
  @IsString({ message: "Hasło jest wymagane." })
  @MinLength(1, { message: "Hasło jest wymagane." })
  password!: string;
}
