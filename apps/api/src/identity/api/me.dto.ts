import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, example: 'Alex Rivera' })
  display_name!: string;

  @ApiPropertyOptional({ type: String, format: 'email', nullable: true })
  email!: string | null;
}

export class MembershipSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  household_id!: string;

  @ApiProperty({ type: String, enum: ['OWNER', 'MEMBER'] })
  role!: 'OWNER' | 'MEMBER';

  @ApiProperty({ type: String, enum: ['ACTIVE', 'LEFT', 'REMOVED'] })
  status!: 'ACTIVE' | 'LEFT' | 'REMOVED';
}

export class MeResponseDto {
  @ApiProperty({ type: () => UserDto })
  user!: UserDto;

  @ApiProperty({ type: () => [MembershipSummaryDto] })
  memberships!: MembershipSummaryDto[];
}
