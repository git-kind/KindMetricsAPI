export interface UserResponseDto {
  guid: string;
  email: string;
  name: string;
  companyGuid?: string;
  platformAdmin?: boolean;
}
