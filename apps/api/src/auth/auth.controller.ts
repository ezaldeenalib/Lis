import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('api/v1/auth/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Laboratory user login' })
  async loginLabUser(@Body() dto: LoginDto) {
    return this.authService.loginLaboratoryUser(dto.email, dto.password);
  }

  @Public()
  @Post('platform/auth/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Platform user login' })
  async loginPlatformUser(@Body() dto: LoginDto) {
    return this.authService.loginPlatformUser(dto.email, dto.password);
  }
}
