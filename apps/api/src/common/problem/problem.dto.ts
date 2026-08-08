import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProblemErrorDto {
  @ApiPropertyOptional({ type: String })
  field?: string;

  @ApiProperty({ type: String })
  reason!: string;
}

export class ProblemDetailsDto {
  @ApiProperty({ type: String, example: 'https://api.turntable.example/problems/validation-error' })
  type!: string;

  @ApiProperty({ type: String, example: 'Request validation failed' })
  title!: string;

  @ApiProperty({ type: Number, example: 422 })
  status!: number;

  @ApiProperty({ type: String, example: 'VALIDATION_ERROR' })
  code!: string;

  @ApiPropertyOptional({ type: String })
  detail?: string;

  @ApiProperty({ type: String })
  trace_id!: string;

  @ApiPropertyOptional({ type: () => [ProblemErrorDto] })
  errors?: ProblemErrorDto[];
}
