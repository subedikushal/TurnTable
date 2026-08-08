import { ApiProperty } from '@nestjs/swagger';

export class LiveHealthDto {
  @ApiProperty({ type: String, example: 'ok' })
  status!: 'ok';
}

export class ReadyChecksDto {
  @ApiProperty({ type: String, example: 'up' })
  database!: 'up';

  @ApiProperty({ type: String, example: 'up' })
  migrations!: 'up';

  @ApiProperty({ type: String, example: 'up' })
  redis!: 'up';
}

export class ReadyHealthDto extends LiveHealthDto {
  @ApiProperty({ type: () => ReadyChecksDto })
  checks!: ReadyChecksDto;
}

export class BuildHealthDto {
  @ApiProperty({ type: String, example: '0.0.0-local' })
  version!: string;

  @ApiProperty({ type: String, example: 'unknown' })
  commit!: string;

  @ApiProperty({ type: String, example: 'v24.14.0' })
  runtime!: string;

  @ApiProperty({ type: String, example: 'local' })
  environment!: string;
}
