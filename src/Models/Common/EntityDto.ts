export interface EntityRecordDto {
  guid?: string;
  name?: string;
  description?: string | null;
  config?: Record<string, unknown>;
  code?: string;
  timezone?: string;
  locale?: 'es' | 'en';
}

export interface EntityCreateRequestDto {
  name: string;
  description?: string;
  config?: Record<string, unknown>;
}

export type EntityUpdateRequestDto = Partial<EntityCreateRequestDto>;
