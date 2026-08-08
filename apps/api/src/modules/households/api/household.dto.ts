import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsISO4217CurrencyCode,
  IsInt,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { UserDto } from '../../../identity/api/me.dto';

export class HouseholdDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 120, example: 'Household Alpha' })
  name!: string;

  @ApiProperty({ type: String, example: 'America/New_York' })
  timezone!: string;

  @ApiProperty({ type: String, minLength: 3, maxLength: 3, example: 'USD' })
  currency!: string;

  @ApiProperty({ type: 'integer', minimum: 1 })
  version!: number;
}

export class MembershipAccessDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, enum: ['OWNER', 'MEMBER'] })
  role!: 'OWNER' | 'MEMBER';

  @ApiProperty({ type: String, enum: ['ACTIVE'] })
  status!: 'ACTIVE';
}

export class HouseholdListItemDto {
  @ApiProperty({ type: () => HouseholdDto })
  household!: HouseholdDto;

  @ApiProperty({ type: () => MembershipAccessDto })
  membership!: MembershipAccessDto;
}

export class MemberDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  household_id!: string;

  @ApiProperty({ type: () => UserDto })
  user!: UserDto;

  @ApiProperty({ type: String, enum: ['OWNER', 'MEMBER'] })
  role!: 'OWNER' | 'MEMBER';

  @ApiProperty({ type: String, enum: ['ACTIVE', 'LEFT', 'REMOVED'] })
  status!: 'ACTIVE' | 'LEFT' | 'REMOVED';

  @ApiProperty({ type: String, format: 'date-time' })
  joined_at!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  left_at!: string | null;

  @ApiProperty({ type: 'integer', minimum: 1 })
  version!: number;
}

export class CreateHouseholdRequestDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 120, example: 'Household Alpha' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  name!: string;

  @ApiProperty({ type: String, example: 'America/New_York' })
  @IsString()
  @IsTimeZone()
  timezone!: string;

  @ApiProperty({ type: String, minLength: 3, maxLength: 3, example: 'USD' })
  @IsString()
  @IsISO4217CurrencyCode()
  currency!: string;
}

export class UpdateHouseholdRequestDto {
  @ApiProperty({ type: 'integer', minimum: 1, example: 1 })
  @IsInt()
  @Min(1)
  expected_version!: number;

  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  name?: string;

  @ApiPropertyOptional({ type: String, example: 'America/Chicago' })
  @IsOptional()
  @IsString()
  @IsTimeZone()
  timezone?: string;
}

export class CreateInvitationRequestDto {
  @ApiPropertyOptional({ type: String, format: 'email', nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  invited_email?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 168, default: 24 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  expires_in_hours?: number;
}

export class InvitationDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  household_id!: string;

  @ApiProperty({ type: String, enum: ['PENDING'] })
  status!: 'PENDING';

  @ApiProperty({ type: String, format: 'email', nullable: true })
  invited_email!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  expires_at!: string;

  @ApiProperty({
    type: String,
    description: 'Single-use opaque token returned only by invitation creation',
    minLength: 32,
  })
  token!: string;
}

export class TransferOwnershipRequestDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  target_member_id!: string;
}

export class OwnershipTransferResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  household_id!: string;

  @ApiProperty({ type: () => MemberDto })
  previous_owner!: MemberDto;

  @ApiProperty({ type: () => MemberDto })
  new_owner!: MemberDto;
}
