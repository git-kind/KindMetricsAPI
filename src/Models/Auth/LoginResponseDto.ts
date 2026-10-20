export interface LoginUserDto {
  guid: string;
  email: string;
  name: string;
  platformAdmin?: boolean;
}

export interface LoginResponseDto {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: LoginUserDto;
}
