import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PAGINATION } from '../../common/constants';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetSessionQueryDto {
  @ApiPropertyOptional({
    description: `Number of events to return per page. Min: 1, Max: ${PAGINATION.MAX_LIMIT}. Default: ${PAGINATION.DEFAULT_LIMIT}.`,
    minimum: 1,
    maximum: PAGINATION.MAX_LIMIT,
    default: PAGINATION.DEFAULT_LIMIT,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer.' })
  @Min(1, { message: 'limit must be at least 1.' })
  @Max(PAGINATION.MAX_LIMIT, {
    message: `limit must not exceed ${PAGINATION.MAX_LIMIT}.`,
  })
  limit: number = PAGINATION.DEFAULT_LIMIT;

  @ApiPropertyOptional({
    description: `Number of events to skip (zero-based). Default: ${PAGINATION.DEFAULT_OFFSET}.`,
    minimum: 0,
    default: PAGINATION.DEFAULT_OFFSET,
    example: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'offset must be an integer.' })
  @Min(0, { message: 'offset must be 0 or greater.' })
  offset: number = PAGINATION.DEFAULT_OFFSET;
}
