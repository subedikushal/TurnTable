import { Inject, Injectable } from '@nestjs/common';
import type { AuthPrincipal } from '../domain/auth-principal';
import type { MeResponseDto } from '../api/me.dto';
import { UserRepository } from '../infra/user.repository';

@Injectable()
export class CurrentUserService {
  constructor(@Inject(UserRepository) private readonly users: UserRepository) {}

  getCurrentUser(principal: AuthPrincipal): Promise<MeResponseDto> {
    return this.users.resolve(principal);
  }
}
